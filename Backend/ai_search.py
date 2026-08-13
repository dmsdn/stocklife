"""
StoreFlow AI - AI 검색 (Claude API 연동)

원칙: Claude는 가격/재고/위치를 스스로 만들지 않는다.
      의도 파악 + 주어진 후보 안에서의 설명만 담당하고, 사실 데이터는 항상 DB에서 가져온다.
"""

import os
import re
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import anthropic

load_dotenv()

# 세션별 대화 기록 (인메모리 — 서버 재시작하면 초기화됨, 데모 단계에서는 충분)
SESSION_HISTORY: dict[str, list[dict]] = {}
MAX_HISTORY_TURNS = 6  # 너무 길어지면 토큰 낭비되니 최근 6턴만 유지

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
                "description": (
                    "검색에 쓸 구체적인 품목/브랜드 키워드. "
                    "'술'처럼 포괄적인 말이면, 그 상위어가 실제로 가리키는 구체적 품목들로 풀어서 나열해라 "
                    "(예: '술' -> ['맥주','와인','소주','막걸리'], "
                    "'탄산음료' -> ['콜라','사이다','탄산수'], "
                    "'문구' -> ['색연필','스케치북','크레파스','학용품']). "
                    "이미 구체적인 상품명이면 그대로 하나만 넣어라."
                ),
            },
            "budget": {
                "type": ["integer", "null"],
                "description": "예산(원). 언급 없으면 null",
            },
            "category_hints": {
                "type": "array",
                "items": {"type": "string"},
                "description": "참고용 대분류 추정 (검색 필터로는 안 씀, keywords가 비었을 때만 폴백으로 사용)",
            },
            "sort_by": {
                "type": ["string", "null"],
                "enum": ["price_desc", "price_asc", None],
                "description": "'가장 비싼', '제일 저렴한' 같은 정렬 요청이 있으면 price_desc/price_asc, 없으면 null",
            },
        },
        "required": ["intent_type", "keywords", "category_hints", "sort_by"],
    },
}

CATEGORY_LIST = [
    "신선식품-과일채소", "신선식품-정육수산", "가공식품-간편식", "음료", "주류",
    "생활용품-세제욕실", "주방용품", "가전", "의류패션잡화", "계절레저용품",
    "완구문구", "반려동물용품", "건강뷰티", "사무공구",
]

KNOWN_ADJ = ["프리미엄", "국산", "제철", "대용량", "실속형", "든든한", "가성비"]

GENERIC_TERM_EXPANSION = {
    "술": ["맥주", "와인", "소주", "막걸리"],
    "주류": ["맥주", "와인", "소주", "막걸리"],
    "탄산음료": ["콜라", "사이다", "탄산수"],
    "음료": ["주스", "우유", "두유", "이온음료", "커피"],
    "문구": ["색연필", "스케치북", "크레파스", "학용품 세트"],
    "완구": ["블록", "보드게임", "퍼즐", "캐릭터 인형"],
    "가전제품": ["에어프라이어", "전기밥솥", "청소기", "제습기", "공기청정기"],
}


def expand_generic_keywords(keywords: list[str]) -> list[str]:
    """Claude가 '술'처럼 포괄어를 그대로 냈을 때, 코드에서 한 번 더 구체 품목으로 풀어준다."""
    expanded = []
    for kw in keywords:
        if kw in GENERIC_TERM_EXPANSION:
            expanded.extend(GENERIC_TERM_EXPANSION[kw])
        else:
            expanded.append(kw)
    return expanded

STOPWORDS = ["어디있어", "어디있나요", "어디에있어", "찾아줘", "추천해줘", "알려줘",
             "있어", "있나요", "해줘", "주세요", "좀", "혹시"]


class SearchRequest(BaseModel):
    query: str
    session_id: str | None = None


def simple_keyword_split(query: str) -> list[str]:
    cleaned = query
    for sw in STOPWORDS:
        cleaned = cleaned.replace(sw, " ")
    tokens = [t.strip("?!., ") for t in cleaned.split()]
    return [t for t in tokens if t]


def extract_intent(query: str, session_id: str) -> dict:
    system_prompt = (
        "너는 창고형 대형마트 StoreFlow AI의 의도 분석기다. "
        "고객 발화를 분석해서 extract_intent 도구를 반드시 호출해라. "
        f"category_hints는 반드시 다음 목록 중에서만 골라라: {', '.join(CATEGORY_LIST)}\n"
        "keywords에는 구체적인 상품명/품목명만 넣어라. "
        "'가성비', '저렴한', '좋은', '프리미엄', '싼' 같은 추상적인 수식어는 절대 keywords에 넣지 마라. "
        "'술', '탄산음료', '문구' 처럼 포괄적인 상위어는 keywords에 그대로 넣지 말고 "
        "실제 구체적인 품목 이름들로 풀어서 여러 개 나열해라.\n"
        "고객이 상품명을 직접 말하지 않고 '손이 시린데', '캠핑 처음 가는데' 같은 상황/목적만 말하면, "
        "그 목적을 달성하는 데 필요한 구체적 상품들을 스스로 추론해서 keywords에 넣어라.\n"
        "이전 대화가 있으면, 이번 발화는 그 대화의 조건에 새 조건을 '추가'하는 것으로 해석해라 "
        "(예: 이전에 '캠핑용품 1만원 안에서'라고 했고 이번에 '더 가벼운 거'라고 하면, "
        "예산 조건은 유지한 채 가벼운 캠핑용품으로 좁혀라)."
    )

    history = SESSION_HISTORY.get(session_id, [])
    messages = history + [{"role": "user", "content": query}]

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            system=system_prompt,
            tools=[INTENT_TOOL],
            tool_choice={"type": "tool", "name": "extract_intent"},
            messages=messages,
        )

        intent_result = None
        assistant_summary = ""
        for block in response.content:
            if block.type == "tool_use":
                intent_result = block.input
                assistant_summary = f"(내부 판단: {json.dumps(block.input, ensure_ascii=False)})"

        if intent_result:
            # 이번 턴을 기록에 남기고, 너무 길어지면 오래된 것부터 자른다
            new_history = messages + [{"role": "assistant", "content": assistant_summary}]
            SESSION_HISTORY[session_id] = new_history[-(MAX_HISTORY_TURNS * 2):]
            return {**intent_result, "ai_available": True}
    except Exception as e:
        print(f"[AI Fallback] Intent 분석 실패: {e}")

    keywords = simple_keyword_split(query)
    return {
        "intent_type": "PRODUCT_SEARCH",
        "keywords": keywords if keywords else [query],
        "budget": None,
        "category_hints": [],
        "sort_by": None,
        "ai_available": False,
    }


def search_candidates(intent: dict, limit: int = 20) -> list[dict]:
    keywords = intent.get("keywords", [])
    keywords = [kw for kw in keywords if kw not in KNOWN_ADJ]
    categories = intent.get("category_hints", [])
    sort_by = intent.get("sort_by")

    order_clause = {
        "price_desc": "p.price_krw DESC",
        "price_asc": "p.price_krw ASC",
    }.get(sort_by, "avg_rating DESC")

    params = {"limit": limit}

    def run_query(where_extra: str, query_params: dict) -> list[dict]:
        query = f"""
            SELECT p.sku_id, p.name, p.category, p.price_krw,
                   COALESCE(AVG(r.rating), 0) AS avg_rating
            FROM products p
            LEFT JOIN reviews r ON p.sku_id = r.sku_id
            WHERE p.active = TRUE {where_extra}
            GROUP BY p.sku_id
            ORDER BY {order_clause}
            LIMIT :limit
        """
        with engine.connect() as conn:
            rows = conn.execute(text(query), query_params).mappings().all()
        return [dict(r) for r in rows]

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


def log_search_event(session_id: str, query: str):
    try:
        with engine.connect() as conn:
            conn.execute(
                text("""
                    INSERT INTO consumer_events
                        (event_type, occurred_at, session_id, meta)
                    VALUES
                        ('SEARCH', :occurred_at, :session_id, :meta)
                """),
                {
                    "occurred_at": datetime.utcnow(),
                    "session_id": session_id,
                    "meta": json.dumps({"query": query}, ensure_ascii=False),
                },
            )
            conn.commit()
    except Exception as e:
        print(f"[Event Log] SEARCH 이벤트 기록 실패: {e}")


@router.post("/api/ai/search")
def ai_search(body: SearchRequest):
    session_id = body.session_id or f"sess-{uuid.uuid4().hex[:12]}"

    intent = extract_intent(body.query, session_id)   # session_id 추가
    intent["keywords"] = expand_generic_keywords(intent.get("keywords", []))
    candidates = search_candidates(intent)

    if intent["intent_type"] == "BUDGET_RECOMMENDATION" and intent.get("budget"):
        items = build_budget_combo(candidates, intent["budget"])
    else:
        items = candidates[:5]

    explanation, explanation_ok = generate_explanation(body.query, items)
    total_price = sum(it["price_krw"] for it in items)

    log_search_event(session_id, body.query)

    return {
        "session_id": session_id,
        "intent": intent,
        "items": items,
        "total_price": total_price,
        "explanation": explanation,
        "ai_available": intent.get("ai_available", True) and explanation_ok,
    }


# ============ 대체상품 추천 ============

def extract_item_keyword(name: str, brand: str | None, unit: str | None) -> str | None:
    cleaned = name
    if brand:
        cleaned = cleaned.replace(brand, "")
    if unit:
        cleaned = cleaned.replace(unit, "")

    tokens = [t for t in cleaned.split() if t not in KNOWN_ADJ]
    if not tokens:
        return None

    item = re.sub(r"\(.*?\)", "", tokens[0])
    return item.strip() or None


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

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text
    except Exception as e:
        print(f"[AI Fallback] 대체상품 설명 생성 실패: {e}")
        return "지금 AI 설명 생성에 문제가 있어 후보 목록만 보여드려요."


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