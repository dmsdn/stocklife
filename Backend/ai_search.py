"""
StoreFlow AI - AI 검색 (Claude API 연동)

원칙: Claude는 가격/재고/위치를 스스로 만들지 않는다.
      의도 파악 + 주어진 후보 안에서의 설명만 담당하고, 사실 데이터는 항상 DB에서 가져온다.
"""

import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import anthropic

load_dotenv()

router = APIRouter()

DB_USER = "root"
DB_PASSWORD = "1234"
DB_HOST = "localhost"
DB_PORT = 3307
DB_NAME = "storeflow_db"

engine = create_engine(
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

INTENT_TOOL = {
    "name": "extract_intent",
    "description": "고객의 자연어 질의를 구조화된 검색 조건으로 변환한다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "intent_type": {
                "type": "string",
                "enum": ["PRODUCT_SEARCH", "BUDGET_RECOMMENDATION", "ALTERNATIVE_SEARCH"],
                "description": "PRODUCT_SEARCH=특정 상품 찾기, BUDGET_RECOMMENDATION=예산 내 조합 추천, ALTERNATIVE_SEARCH=대체상품 찾기",
            },
            "keywords": {
                "type": "array",
                "items": {"type": "string"},
                "description": "검색에 쓸 상품명 키워드",
            },
            "budget": {
                "type": ["integer", "null"],
                "description": "예산(원). 언급 없으면 null",
            },
            "category_hints": {
                "type": "array",
                "items": {"type": "string"},
                "description": "관련 카테고리 추정",
            },
        },
        "required": ["intent_type", "keywords", "category_hints"],
    },
}

CATEGORY_LIST = [
    "신선식품-과일채소", "신선식품-정육수산", "가공식품-간편식", "음료주류",
    "생활용품-세제욕실", "주방용품", "가전", "의류패션잡화", "계절레저용품",
    "완구문구", "반려동물용품", "건강뷰티", "사무공구",
]


class SearchRequest(BaseModel):
    query: str


def extract_intent(query: str) -> dict:
    system_prompt = (
        "너는 창고형 대형마트 StoreFlow AI의 의도 분석기다. "
        "고객 발화를 분석해서 extract_intent 도구를 반드시 호출해라. "
        f"category_hints는 반드시 다음 목록 중에서만 골라라: {', '.join(CATEGORY_LIST)}"
    )

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=500,
        system=system_prompt,
        tools=[INTENT_TOOL],
        tool_choice={"type": "tool", "name": "extract_intent"},
        messages=[{"role": "user", "content": query}],
    )

    for block in response.content:
        if block.type == "tool_use":
            return block.input

    raise HTTPException(status_code=500, detail="의도 분석에 실패했습니다")


def search_candidates(intent: dict, limit: int = 20) -> list[dict]:
    keywords = intent.get("keywords", [])
    categories = intent.get("category_hints", [])
    params = {"limit": limit}

    def run_query(where_extra: str, query_params: dict) -> list[dict]:
        query = f"""
            SELECT p.sku_id, p.name, p.category, p.price_krw,
                   COALESCE(AVG(r.rating), 0) AS avg_rating
            FROM products p
            LEFT JOIN reviews r ON p.sku_id = r.sku_id
            WHERE p.active = TRUE {where_extra}
            GROUP BY p.sku_id
            ORDER BY avg_rating DESC
            LIMIT :limit
        """
        with engine.connect() as conn:
            rows = conn.execute(text(query), query_params).mappings().all()
        return [dict(r) for r in rows]

    # 1) 키워드로 먼저 찾아본다 (구체적인 상품명 검색에 적합)
    if keywords:
        kw_params = dict(params)
        or_clauses = []
        for i, kw in enumerate(keywords):
            key = f"kw{i}"
            or_clauses.append(f"name LIKE :{key}")
            kw_params[key] = f"%{kw}%"
        results = run_query(" AND (" + " OR ".join(or_clauses) + ")", kw_params)
        if results:
            return results

    # 2) 키워드로 못 찾았거나 키워드가 없으면 카테고리로 찾는다 (예산추천처럼 상황형 질의에 적합)
    if categories:
        cat_params = dict(params)
        or_clauses = []
        for i, cat in enumerate(categories):
            key = f"cat{i}"
            or_clauses.append(f"category = :{key}")
            cat_params[key] = cat
        return run_query(" AND (" + " OR ".join(or_clauses) + ")", cat_params)

    return []


def build_budget_combo(candidates: list[dict], budget: int) -> list[dict]:
    """예산 안에서 조합을 만든다 (평점 높은 순으로 담다가 예산 넘기면 스킵하는 단순 그리디)."""
    combo = []
    total = 0
    for c in candidates:
        price = c["price_krw"]
        if total + price <= budget:
            combo.append(c)
            total += price
        if len(combo) >= 5:
            break
    return combo


def generate_explanation(query: str, items: list[dict]) -> str:
    """DB에서 가져온 후보 목록만 근거로 짧은 추천 설명을 생성한다."""
    if not items:
        return "조건에 맞는 상품을 찾지 못했습니다. 다른 키워드로 다시 질문해 주세요."

    items_text = "\n".join(
        f"- {it['name']} ({it['category']}, {it['price_krw']}원, 평점 {round(it['avg_rating'], 1)})"
        for it in items
    )

    prompt = (
        f'고객 질문: "{query}"\n\n'
        f"아래는 실제 DB에서 조회된 후보 상품 목록이다. 이 목록에 있는 상품과 가격만 언급하고, "
        f"목록에 없는 상품이나 가격을 지어내지 마라. 2~3문장으로 친근하게 추천 이유를 설명해라.\n\n"
        f"{items_text}"
    )

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


@router.post("/api/ai/search")
def ai_search(body: SearchRequest):
    intent = extract_intent(body.query)
    candidates = search_candidates(intent)

    if intent["intent_type"] == "BUDGET_RECOMMENDATION" and intent.get("budget"):
        items = build_budget_combo(candidates, intent["budget"])
    else:
        items = candidates[:5]

    explanation = generate_explanation(body.query, items)
    total_price = sum(it["price_krw"] for it in items)

    return {
        "intent": intent,
        "items": items,
        "total_price": total_price,
        "explanation": explanation,
    }