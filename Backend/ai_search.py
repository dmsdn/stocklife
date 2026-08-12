"""
StoreFlow AI - AI 검색 (Claude API 연동)

원칙: Claude는 가격/재고/위치를 스스로 만들지 않는다.
      의도 파악 + 주어진 후보 안에서의 설명만 담당하고, 사실 데이터는 항상 DB에서 가져온다.
"""

import os
import re

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

KNOWN_ADJ = ["프리미엄", "국산", "제철", "대용량", "실속형", "든든한", "가성비"]

STOPWORDS = ["어디있어", "어디있나요", "어디에있어", "찾아줘", "추천해줘", "알려줘",
             "있어", "있나요", "해줘", "주세요", "좀", "혹시"]

def simple_keyword_split(query: str) -> list[str]:
    """AI 없이 쓰는 최소한의 키워드 추출: 공백으로 쪼개고 흔한 어미만 제거."""
    text = query
    for sw in STOPWORDS:
        text = text.replace(sw, " ")
    tokens = [t.strip("?!., ") for t in text.split()]
    return [t for t in tokens if t]

def extract_item_keyword(name: str, brand: str | None, unit: str | None) -> str | None:
    """상품명에서 브랜드/용량/수식어를 빼고 핵심 품목명만 뽑는다.
    예: '웰니스플러스 든든한 고무장갑(대) 3L' -> '고무장갑'"""
    text = name
    if brand:
        text = text.replace(brand, "")
    if unit:
        text = text.replace(unit, "")

    tokens = [t for t in text.split() if t not in KNOWN_ADJ]
    if not tokens:
        return None

    item = re.sub(r"\(.*?\)", "", tokens[0])  # 고무장갑(대) -> 고무장갑
    return item.strip() or None


class SearchRequest(BaseModel):
    query: str


def extract_intent(query: str) -> dict:
    system_prompt = (
        "너는 창고형 대형마트 StoreFlow AI의 의도 분석기다. "
        "고객 발화를 분석해서 extract_intent 도구를 반드시 호출해라. "
        f"category_hints는 반드시 다음 목록 중에서만 골라라: {', '.join(CATEGORY_LIST)}\n"
        "keywords에는 구체적인 상품명/품목명만 넣어라. "
        "'가성비', '저렴한', '좋은', '프리미엄', '싼' 같은 추상적인 수식어는 절대 keywords에 넣지 마라."
    )

    try:
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
                return {**block.input, "ai_available": True}
    except Exception as e:
        print(f"[AI Fallback] Intent 분석 실패: {e}")

    # Claude 실패 시: 문장을 단어 단위로 쪼개서 최소한의 키워드 검색이라도 되게 한다
    keywords = simple_keyword_split(query)
    return {
        "intent_type": "PRODUCT_SEARCH",
        "keywords": keywords if keywords else [query],
        "budget": None,
        "category_hints": [],
        "ai_available": False,
    }


def search_candidates(intent: dict, limit: int = 20) -> list[dict]:
    keywords = intent.get("keywords", [])
    keywords = [kw for kw in keywords if kw not in KNOWN_ADJ]  # 이 줄 추가: 수식어는 검색 키워드에서 제외
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


def generate_explanation(query: str, items: list[dict]) -> tuple[str, bool]:
    if not items:
        return "조건에 맞는 상품을 찾지 못했습니다. 다른 키워드로 다시 질문해 주세요.", True

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

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text, True
    except Exception as e:
        print(f"[AI Fallback] 설명 생성 실패: {e}")
        return "지금 AI 설명 생성에 문제가 있어 상품 목록만 보여드려요. 아래 목록을 확인해 주세요.", False


@router.post("/api/ai/search")
def ai_search(body: SearchRequest):
    intent = extract_intent(body.query)
    candidates = search_candidates(intent)

    if intent["intent_type"] == "BUDGET_RECOMMENDATION" and intent.get("budget"):
        items = build_budget_combo(candidates, intent["budget"])
    else:
        items = candidates[:5]

    explanation, explanation_ok = generate_explanation(body.query, items)
    total_price = sum(it["price_krw"] for it in items)

    return {
        "intent": intent,
        "items": items,
        "total_price": total_price,
        "explanation": explanation,
        "ai_available": intent.get("ai_available", True) and explanation_ok,
    }

# ============ 대체상품 추천 ============

def find_alternative_candidates(sku_id: int, limit: int = 5) -> tuple[dict | None, list[dict]]:
    with engine.connect() as conn:
        original = conn.execute(
            text("SELECT sku_id, name, category, price_krw, brand, unit FROM products WHERE sku_id = :sku_id"),
            {"sku_id": sku_id},
        ).mappings().first()

        if not original:
            return None, []

        item_keyword = extract_item_keyword(original["name"], original["brand"], original["unit"])
        price = original["price_krw"]

        # 같은 카테고리 + 핵심 품목명이 이름에 포함 + 가격대 0.5~1.8배 + 본인 제외
        query = """
            SELECT p.sku_id, p.name, p.category, p.price_krw,
                   COALESCE(AVG(r.rating), 0) AS avg_rating
            FROM products p
            LEFT JOIN reviews r ON p.sku_id = r.sku_id
            WHERE p.active = TRUE
              AND p.category = :category
              AND p.sku_id != :sku_id
              AND p.price_krw BETWEEN :price_min AND :price_max
        """
        params = {
            "category": original["category"], "sku_id": sku_id,
            "price_min": price * 0.5, "price_max": price * 1.8,
            "limit": limit,
        }
        if item_keyword:
            query += " AND p.name LIKE :item_kw"
            params["item_kw"] = f"%{item_keyword}%"

        query += " GROUP BY p.sku_id ORDER BY avg_rating DESC LIMIT :limit"

        rows = conn.execute(text(query), params).mappings().all()

    return dict(original), [dict(r) for r in rows]


def generate_alternative_explanation(original: dict, alternatives: list[dict]) -> str:
    if not alternatives:
        return f"'{original['name']}'와(과) 비슷한 가격대의 같은 카테고리 상품을 찾지 못했습니다."

    alt_text = "\n".join(
        f"- {a['name']} ({a['price_krw']}원, 평점 {round(a['avg_rating'], 1)})"
        for a in alternatives
    )

    prompt = (
        f"원래 찾던 상품: {original['name']} ({original['price_krw']}원)\n\n"
        f"이 상품이 없을 때 대신 살 수 있는 후보 목록:\n{alt_text}\n\n"
        f"아래 후보 목록에 있는 상품과 가격만 언급해서, 원래 상품과 비교했을 때 "
        f"각 대체 후보가 가격/평점 면에서 어떤 차이가 있는지 2~3문장으로 짧게 설명해라. "
        f"목록에 없는 상품을 지어내지 마라."
    )

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


@router.get("/api/products/{sku_id}/alternatives")
def get_alternatives(sku_id: int):
    original, alternatives = find_alternative_candidates(sku_id)

    if original is None:
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다")

    explanation = generate_alternative_explanation(original, alternatives)

    return {
        "original": original,
        "alternatives": alternatives,
        "explanation": explanation,
    }