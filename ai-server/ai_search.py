"""
StoreFlow AI - AI 검색 (Claude API 연동)

★ 2026-08-14 요구사항 정의서 반영: DB 직접 접속 제거 ★
예전에는 이 파일이 SQLAlchemy engine으로 MySQL(storeflow_db)에 직접 SELECT/INSERT를
했다. 이제 상품 데이터 조회와 SEARCH 이벤트 기록은 전부 backend_client를 통해
Spring Boot REST API를 호출한다. 이 파일에는 create_engine이나 raw SQL이 없다.

원칙(그대로 유지):
- Claude는 가격/카테고리/상품 상태 같은 사실을 스스로 만들지 않는다.
- Claude는 자연어 의도 파악과, 백엔드가 조회해 준 후보에 대한 설명만 담당한다.
- 상품 사실 데이터는 항상 백엔드(Spring Boot -> MySQL)에서 가져온다.
"""

import os
import re
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
import anthropic

import backend_client


# ============================================================================
# 기본 설정
# ============================================================================

load_dotenv()

router = APIRouter()

# 세션별 대화 기록
# 데모 단계에서는 인메모리로 유지한다. 서버 재시작 시 초기화된다.
SESSION_HISTORY: dict[str, list[dict]] = {}
MAX_HISTORY_TURNS = 6

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5-20251001")


# ============================================================================
# Claude 의도 분석 Tool
# ============================================================================

INTENT_TOOL = {
    "name": "extract_intent",
    "description": "고객의 자연어 질의를 StoreFlow 상품 검색 조건으로 변환한다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "intent_type": {
                "type": "string",
                "enum": [
                    "PRODUCT_SEARCH",
                    "BUDGET_RECOMMENDATION",
                    "ALTERNATIVE_SEARCH",
                ],
                "description": (
                    "PRODUCT_SEARCH=특정 상품/품목 찾기, "
                    "BUDGET_RECOMMENDATION=예산 내 상품 추천, "
                    "ALTERNATIVE_SEARCH=대체상품 찾기"
                ),
            },
            "keywords": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "검색에 사용할 구체적인 상품명/품목명/브랜드 키워드. "
                    "'술'처럼 너무 포괄적인 말은 실제 품목으로 풀어서 작성한다. "
                    "예: 술 -> 맥주, 와인, 소주 / 탄산음료 -> 콜라, 사이다, 탄산수. "
                    "가성비, 저렴한, 좋은 같은 추상 수식어는 넣지 않는다."
                ),
            },
            "budget": {
                "type": ["integer", "null"],
                "description": "사용자가 제시한 총 예산(원). 없으면 null",
            },
            "category_hints": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "StoreFlow 대분류(category_l1) 후보. "
                    "반드시 제공된 대분류 목록 중에서만 선택한다."
                ),
            },
            "sort_by": {
                "type": ["string", "null"],
                "enum": ["price_desc", "price_asc", None],
                "description": (
                    "'가장 비싼', '비싼 순'이면 price_desc, "
                    "'가장 싼', '저렴한 순'이면 price_asc, 없으면 null"
                ),
            },
        },
        "required": [
            "intent_type",
            "keywords",
            "budget",
            "category_hints",
            "sort_by",
        ],
    },
}


# schema_v2 + products_seed_5000 기준 대분류 12개
CATEGORY_LIST = [
    "신선식품",
    "냉장·냉동식품",
    "가공식품",
    "음료·주류",
    "생활용품",
    "주방용품",
    "뷰티·헬스",
    "반려용품",
    "홈·가전",
    "의류·잡화",
    "스포츠·레저",
    "완구·문구",
]

KNOWN_ADJ = [
    "프리미엄",
    "국산",
    "제철",
    "대용량",
    "실속형",
    "든든한",
    "가성비",
    "저렴한",
    "싼",
    "좋은",
]

GENERIC_TERM_EXPANSION = {
    "술": ["맥주", "와인", "소주"],
    "주류": ["맥주", "와인", "소주"],
    "탄산음료": ["콜라", "사이다", "탄산수"],
    "음료": ["주스", "우유", "두유", "이온음료", "커피"],
    "문구": ["색연필", "스케치북", "크레파스", "학용품"],
    "완구": ["블록", "보드게임", "퍼즐", "인형"],
    "가전제품": ["에어프라이어", "전기밥솥", "청소기", "제습기", "공기청정기"],
}

STOPWORDS = [
    "어디있어",
    "어디있나요",
    "어디에있어",
    "어디에",
    "찾아줘",
    "추천해줘",
    "알려줘",
    "있어",
    "있나요",
    "해줘",
    "주세요",
    "좀",
    "혹시",
]


# ============================================================================
# Request DTO
# ============================================================================

class SearchRequest(BaseModel):
    query: str
    session_id: str | None = None


# ============================================================================
# Claude 미사용/실패 시 fallback
# ============================================================================

def simple_keyword_split(query: str) -> list[str]:
    cleaned = query

    for sw in STOPWORDS:
        cleaned = cleaned.replace(sw, " ")

    tokens = [t.strip("?!.,()[]{}\"' ") for t in cleaned.split()]
    tokens = [t for t in tokens if t and t not in KNOWN_ADJ]

    return tokens


def expand_generic_keywords(keywords: list[str]) -> list[str]:
    """
    Claude가 포괄어를 그대로 반환했거나 Claude fallback이 동작했을 때
    일부 흔한 상위어를 검색 가능한 구체 품목으로 한 번 더 풀어준다.
    """
    expanded: list[str] = []

    for kw in keywords:
        if kw in GENERIC_TERM_EXPANSION:
            expanded.extend(GENERIC_TERM_EXPANSION[kw])
        else:
            expanded.append(kw)

    # 순서 유지 중복 제거
    return list(dict.fromkeys(expanded))


# ============================================================================
# Claude 의도 분석
# ============================================================================

def extract_intent(query: str, session_id: str) -> dict:
    system_prompt = (
        "너는 창고형 대형마트 StoreFlow의 상품 검색 의도 분석기다.\n"
        "반드시 extract_intent 도구를 호출해서 사용자의 요청을 구조화해라.\n\n"
        f"category_hints는 반드시 다음 대분류 중에서만 골라라:\n"
        f"{', '.join(CATEGORY_LIST)}\n\n"
        "규칙:\n"
        "1. keywords에는 실제 상품명, 품목명, 브랜드처럼 DB에서 검색할 수 있는 단어만 넣는다.\n"
        "2. '가성비', '저렴한', '좋은', '프리미엄', '싼' 같은 추상 표현은 keywords에 넣지 않는다.\n"
        "3. '술', '탄산음료'처럼 넓은 상위어는 가능한 구체 품목들로 풀어 쓴다.\n"
        "4. 사용자가 상품명을 직접 말하지 않고 목적만 말하면 필요한 구체 품목을 추론한다.\n"
        "   예: '캠핑 처음 가는데' -> 텐트, 랜턴, 침낭 등.\n"
        "5. 이전 대화가 있으면 앞선 조건을 유지하면서 새 조건을 추가해 해석한다.\n"
        "6. 가격/재고/위치/실제 상품 존재 여부는 추측하지 않는다. 그것은 백엔드 조회가 결정한다."
    )

    history = SESSION_HISTORY.get(session_id, [])
    messages = history + [{"role": "user", "content": query}]

    if client is not None:
        try:
            response = client.messages.create(
                model=CLAUDE_MODEL,
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
                    assistant_summary = (
                        f"(내부 판단: {json.dumps(block.input, ensure_ascii=False)})"
                    )
                    break

            if intent_result:
                new_history = messages + [
                    {"role": "assistant", "content": assistant_summary}
                ]
                SESSION_HISTORY[session_id] = new_history[-(MAX_HISTORY_TURNS * 2):]

                return {
                    **intent_result,
                    "ai_available": True,
                }

        except Exception as e:
            print(f"[AI Fallback] Intent 분석 실패: {e}")
    else:
        print("[AI Fallback] ANTHROPIC_API_KEY가 없어 규칙 기반 검색으로 동작합니다.")

    keywords = simple_keyword_split(query)

    return {
        "intent_type": "PRODUCT_SEARCH",
        "keywords": keywords if keywords else [query],
        "budget": None,
        "category_hints": [],
        "sort_by": None,
        "ai_available": False,
    }


# ============================================================================
# 백엔드 상품 조회 (구 DB 직접 조회를 대체)
# ============================================================================

def _normalize_product(item: dict) -> dict:
    """
    백엔드가 camelCase로 내려주는 필드를, 기존에 이 파일 곳곳에서 쓰던
    snake_case 키(sku_id, category_l1 ...)로 맞춰준다. 백엔드 응답 스키마가
    바뀌어도 이 함수 하나만 고치면 되도록 변환 지점을 한 곳에 모았다.
    """
    return {
        "sku_id": item.get("skuId"),
        "name": item.get("name"),
        "brand": item.get("brand"),
        "category_l1": item.get("category"),
        "category_l2": item.get("categoryL2"),
        "price_krw": item.get("priceKrw"),
        "unit": item.get("unit"),
        "spec_raw": item.get("specRaw"),
        "image_url": item.get("imageUrl"),
        "lifecycle_status": item.get("lifecycleStatus"),
    }


def search_candidates(intent: dict, limit: int = 20) -> list[dict]:
    """
    구 DB 직접 조회를 대체한다. 우선순위 로직(키워드 -> 카테고리 -> 가격만)은
    이제 백엔드(ProductSearchService.searchAdvanced)가 그대로 수행하고,
    여기서는 결과를 받아 필드 이름만 맞춰준다.
    """
    keywords = [
        kw.strip()
        for kw in intent.get("keywords", [])
        if kw and kw.strip() and kw.strip() not in KNOWN_ADJ
    ]
    categories = [
        cat.strip()
        for cat in intent.get("category_hints", [])
        if cat and cat.strip()
    ]

    result = backend_client.search_products(
        keywords=keywords or None,
        category_hints=categories or None,
        min_price=intent.get("min_price"),
        max_price=intent.get("max_price"),
        sort_by=intent.get("sort_by"),
        limit=limit,
    )

    if not result.get("ok"):
        print(f"[Backend] 상품 검색 실패: {result.get('error')}")
        return []

    items = result.get("data") or []
    return [_normalize_product(item) for item in items]


# ============================================================================
# 예산 추천
# ============================================================================

def build_budget_combo(candidates: list[dict], budget: int) -> list[dict]:
    """
    현재는 단순 greedy 조합.
    추후 optimize_bundle 솔버로 교체 가능한 자리.
    """
    combo = []
    total = 0

    # 예산 추천인데 정렬 요청이 없다면 싼 상품부터 넣는 편이 안정적이다.
    ordered = sorted(candidates, key=lambda item: item["price_krw"])

    for candidate in ordered:
        price = int(candidate["price_krw"])

        if total + price <= budget:
            combo.append(candidate)
            total += price

        if len(combo) >= 5:
            break

    return combo


# ============================================================================
# Claude 설명 생성
# ============================================================================

def generate_explanation(query: str, items: list[dict]) -> tuple[str, bool]:
    if not items:
        return (
            "조건에 맞는 상품을 찾지 못했습니다. 다른 상품명이나 품목으로 다시 질문해 주세요.",
            True,
        )

    items_text = "\n".join(
        (
            f"- SKU {item['sku_id']} | {item['name']} | "
            f"브랜드: {item['brand']} | "
            f"카테고리: {item['category_l1']} > {item['category_l2']} | "
            f"가격: {item['price_krw']}원"
        )
        for item in items
    )

    prompt = (
        f'고객 질문: "{query}"\n\n'
        "아래 목록은 실제 백엔드 조회 결과로 받은 상품이다.\n"
        "반드시 아래 목록에 존재하는 상품명, 브랜드, 카테고리, 가격만 사용해라.\n"
        "목록에 없는 상품, 가격, 재고 수량, 위치, 행사 정보를 절대 지어내지 마라.\n"
        "고객 질문에 맞는 상품을 2~3문장으로 짧고 자연스럽게 설명해라.\n\n"
        f"{items_text}"
    )

    if client is not None:
        try:
            response = client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}],
            )

            text_blocks = [
                block.text
                for block in response.content
                if getattr(block, "type", None) == "text"
            ]

            if text_blocks:
                return "".join(text_blocks), True

        except Exception as e:
            print(f"[AI Fallback] 설명 생성 실패: {e}")

    # API 키가 없거나 Claude 호출 실패 시에도 검색 결과는 정상 반환
    first = items[0]
    return (
        f"조건에 맞는 상품 {len(items)}개를 찾았습니다. "
        f"첫 번째 결과는 '{first['name']}'이며 가격은 {first['price_krw']}원입니다.",
        False,
    )


# ============================================================================
# SEARCH 이벤트 기록 (구 DB 직접 INSERT를 대체)
# ============================================================================

def log_search_event(session_id: str, query: str) -> None:
    """
    이제 이 함수는 DB에 직접 쓰지 않는다. backend_client.log_event()를 통해
    Spring Boot의 /internal/events(=이 테이블에 쓰는 유일한 문)를 호출만 한다.
    """
    result = backend_client.log_event(
        event_type="SEARCH",
        session_id=session_id,
        payload={"query": query},
    )
    if not result.get("ok"):
        # 검색 자체는 이벤트 기록 실패 때문에 죽이지 않는다.
        print(f"[Event Log] SEARCH 이벤트 기록 실패: {result.get('error')}")


# ============================================================================
# AI 검색 API
# ============================================================================

@router.post("/api/ai/search")
def ai_search(body: SearchRequest):
    query = body.query.strip()

    if not query:
        raise HTTPException(status_code=400, detail="검색어를 입력해 주세요.")

    session_id = body.session_id or f"sess-{uuid.uuid4().hex[:12]}"

    intent = extract_intent(query, session_id)

    intent["keywords"] = expand_generic_keywords(
        intent.get("keywords", [])
    )

    candidates = search_candidates(intent)

    if (
            intent.get("intent_type") == "BUDGET_RECOMMENDATION"
            and intent.get("budget")
    ):
        items = build_budget_combo(
            candidates,
            int(intent["budget"]),
        )
    else:
        items = candidates[:5]

    explanation, explanation_ok = generate_explanation(query, items)

    total_price = sum(
        int(item["price_krw"])
        for item in items
    )

    log_search_event(session_id, query)

    return {
        "session_id": session_id,
        "intent": intent,
        "items": items,
        "total_price": total_price,
        "explanation": explanation,
        "ai_available": (
                bool(intent.get("ai_available"))
                and explanation_ok
        ),
    }


# ============================================================================
# 대체상품 추천 (구 DB 직접 조회를 대체)
# ============================================================================

@router.get("/api/products/{sku_id}/alternatives")
def get_alternatives(sku_id: int):
    result = backend_client.get_alternatives(sku_id)

    if not result.get("ok"):
        status = result.get("status") or 502
        raise HTTPException(
            status_code=404 if status == 404 else 502,
            detail=result.get("error") or "대체상품 조회에 실패했습니다.",
        )

    data = result.get("data") or {}
    original = _normalize_product(data.get("original") or {})
    alternatives = [_normalize_product(a) for a in (data.get("alternatives") or [])]

    explanation, explanation_ok = generate_alternative_explanation(original, alternatives)

    return {
        "original": original,
        "alternatives": alternatives,
        "explanation": explanation,
        "ai_available": explanation_ok and client is not None,
    }


def generate_alternative_explanation(
        original: dict,
        alternatives: list[dict],
) -> tuple[str, bool]:
    if not alternatives:
        return (
            f"'{original['name']}'와 같은 소분류에서 비슷한 가격대의 대체상품을 찾지 못했습니다.",
            True,
        )

    alt_text = "\n".join(
        (
            f"- SKU {item['sku_id']} | {item['name']} | "
            f"브랜드: {item['brand']} | "
            f"{item['price_krw']}원 | "
            f"{item['category_l1']} > {item['category_l2']}"
        )
        for item in alternatives
    )

    prompt = (
        f"원래 상품: {original['name']} ({original['price_krw']}원)\n"
        f"카테고리: {original['category_l1']} > {original['category_l2']}\n\n"
        f"실제 대체 후보:\n{alt_text}\n\n"
        "위 후보에 있는 상품과 가격만 사용해서 "
        "원상품과 비교했을 때 어떤 대안인지 2~3문장으로 설명해라. "
        "재고, 위치, 행사, 평점은 제공되지 않았으므로 절대 지어내지 마라."
    )

    if client is not None:
        try:
            response = client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}],
            )

            text_blocks = [
                block.text
                for block in response.content
                if getattr(block, "type", None) == "text"
            ]

            if text_blocks:
                return "".join(text_blocks), True

        except Exception as e:
            print(f"[AI Fallback] 대체상품 설명 생성 실패: {e}")

    first = alternatives[0]
    return (
        f"대체 후보 {len(alternatives)}개를 찾았습니다. "
        f"가장 먼저 볼 상품은 '{first['name']}'이고 가격은 {first['price_krw']}원입니다.",
        False,
    )