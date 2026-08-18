"""
StoreFlow AI - 쇼핑 에이전트 (검색 -> 비교 -> 장바구니 / 반복구매 자동 담기)

★ 2026-08-14 요구사항 정의서 반영: DB 직접 접속 제거 ★
예전에는 compare_products가 SQLAlchemy engine으로 MySQL을 직접 재조회했다.
이제 상품 검색/비교/장바구니/반복구매 조회 전부 backend_client를 통해
Spring Boot REST API만 호출한다. 이 파일에는 DB 커넥션이 전혀 없다.

예: "우유 찾아서 제일 싼 거 2개 장바구니에 넣어줘"
    -> search_products(우유)로 백엔드 조회
    -> compare_products로 가격 정렬 (파이썬이 계산, Claude가 숫자 비교 안 함)
    -> add_to_cart로 실제 장바구니에 반영

예: "내가 항상 구매하는 휴지 장바구니에 담아줘"
    -> find_frequent_purchase(휴지)로 "휴지"가 이름에 들어간 상품 중
       사용자가 반복 구매(기본 2회 이상)한 상품과, 매번 산 평균 수량을 조회
    -> 결과에서 나온 sku_id/suggested_quantity로 바로 add_to_cart

설계 원칙 (기존 ai_agent_cart.py에서 유지):
  1) Claude는 DB에 직접 쓰지 않는다. 쓰기는 전부 Spring Boot API 호출로만 이루어진다.
  2) consumerId는 Claude가 정하지 않는다. 이 엔드포인트로 들어온 사용자 JWT를
     그대로 Spring Boot에 전달해서, 토큰 주인의 장바구니만 바뀌도록 강제한다.

추가된 원칙:
  3) "제일 싼 거", "가장 비싼 거" 같은 비교/정렬 판단은 Claude가 눈대중으로 하지 않는다.
     반드시 compare_products 도구를 호출하게 하고, 실제 정렬은 이 파일의 파이썬 코드가
     백엔드에서 다시 조회한 값으로 계산한다. Claude가 숫자를 잘못 읽어 엉뚱한 상품을
     담는 걸 막기 위함이다.
  4) search_products는 상품 사실 데이터(가격/카테고리/재고 상태)를 스스로 만들지 않고
     backend_client를 통해 백엔드(Spring Boot)에서만 가져온다.
  5) "내가 항상 사는 X" 같은 반복구매 판단도 Claude가 대화 기억에 의존해 지어내지
     않는다. 반드시 find_frequent_purchase를 호출해서 실제 주문 이력(백엔드
     /api(또는 internal)/orders/frequent) 집계 결과를 근거로 삼는다. 수량도 Claude가
     임의로 정하지 않고, 그 도구가 돌려준 suggested_quantity(과거 구매 평균)를
     기본값으로 쓴다.
"""

import os
import json

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from dotenv import load_dotenv
import anthropic

import backend_client

load_dotenv()

router = APIRouter()

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

MAX_TOOL_TURNS = 6  # search -> compare -> add까지 여러 스텝이라 cart 전용(4턴)보다 여유를 둠

# 반복구매로 인정할 최소 구매 횟수. 이 값 미만은 "항상 사는 상품"으로 보지 않는다.
DEFAULT_FREQUENT_MIN_COUNT = 2

CATEGORY_LIST = [
    "신선식품", "냉장·냉동식품", "가공식품", "음료·주류", "생활용품", "주방용품",
    "뷰티·헬스", "반려용품", "홈·가전", "의류·잡화", "스포츠·레저", "완구·문구",
]

# ---------------------------------------------------------------------------
# 도구 정의
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "search_products",
        "description": (
            "상품명/품목/브랜드로 StoreFlow 상품을 검색해서 후보 목록을 가져온다. "
            "'제일 싼 거'처럼 비교가 필요한 요청이라도, 비교 자체는 이 도구가 아니라 "
            "compare_products로 한다. 이 도구는 후보를 모으는 용도다. "
            "'내가 항상/자주 사는 X'처럼 과거 구매 이력을 근거로 담아야 하는 요청에는 "
            "이 도구 대신 find_frequent_purchase를 써라."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "keywords": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "검색할 구체적 상품명/품목명. 예: ['우유']. 추상적 수식어(가성비, 저렴한)는 넣지 않는다.",
                },
                "category_hints": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": f"대분류 후보 (다음 중에서만): {', '.join(CATEGORY_LIST)}. 모르면 빈 배열.",
                },
            },
            "required": ["keywords", "category_hints"],
        },
    },
    {
        "name": "compare_products",
        "description": (
            "search_products로 찾은 후보들 중 일부를 골라 가격순으로 비교한다. "
            "'제일 싼 거', '가장 비싼 거', 'N개 추천' 같은 요청에는 반드시 이 도구로 "
            "실제 정렬 결과를 확인한 뒤에 add_to_cart를 호출해라. 직접 눈대중으로 비교하지 마라."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_ids": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "비교할 sku_id 목록 (search_products 결과에서 가져온 값)",
                },
                "sort_by": {
                    "type": "string",
                    "enum": ["price_asc", "price_desc"],
                    "description": "price_asc=싼 순, price_desc=비싼 순",
                },
            },
            "required": ["sku_ids", "sort_by"],
        },
    },
    {
        "name": "find_frequent_purchase",
        "description": (
            "사용자의 과거 주문 이력에서 '반복해서 구매한 상품'을 찾는다. "
            "'내가 항상 사는 X', '맨날 사는 거', '저번에도 샀던 거 또 담아줘'처럼 "
            "과거 구매 패턴을 근거로 담아야 하는 요청에 사용한다. "
            "keyword를 주면 그 키워드가 이름에 포함된 상품만, 안 주면 전체 반복구매 상품을 "
            "purchase_count(구매 횟수) 내림차순으로 돌려준다. 결과의 각 항목에는 매번 몇 개씩 "
            "샀는지의 평균을 반올림한 suggested_quantity가 들어있으니, add_to_cart를 부를 때 "
            "quantity로 그대로 써라 (사용자가 다른 수량을 명시하지 않는 한)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "keyword": {
                    "type": ["string", "null"],
                    "description": "찾을 상품 키워드. 예: '휴지'. 특정 상품을 안 짚었으면 null.",
                },
                "min_count": {
                    "type": ["integer", "null"],
                    "description": "반복구매로 인정할 최소 구매 횟수. 모르면 null (기본 2회 적용).",
                },
            },
            "required": ["keyword", "min_count"],
        },
    },
    {
        "name": "add_to_cart",
        "description": "특정 상품을 사용자의 장바구니에 담는다. 이미 담겨 있으면 수량이 더해진다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_id": {"type": "integer", "description": "담을 상품의 sku_id. compare_products/search_products/find_frequent_purchase로 확인된 값만 사용"},
                "quantity": {"type": "integer", "description": "담을 수량. 언급 없으면 1 (단, find_frequent_purchase로 찾은 상품은 그 결과의 suggested_quantity를 우선 사용)"},
            },
            "required": ["sku_id", "quantity"],
        },
    },
    {
        "name": "update_cart_item",
        "description": "장바구니에 이미 담긴 항목의 수량이나 체크 상태를 변경한다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "cart_item_id": {"type": "integer", "description": "변경할 장바구니 항목 ID (get_cart로 먼저 조회)"},
                "quantity": {"type": ["integer", "null"]},
                "checked": {"type": ["boolean", "null"]},
            },
            "required": ["cart_item_id", "quantity", "checked"],
        },
    },
    {
        "name": "remove_from_cart",
        "description": "장바구니에서 특정 항목을 삭제한다. 사용자가 명확히 삭제/빼줘 라고 말했을 때만 호출.",
        "input_schema": {
            "type": "object",
            "properties": {"cart_item_id": {"type": "integer"}},
            "required": ["cart_item_id"],
        },
    },
    {
        "name": "get_cart",
        "description": "현재 사용자의 장바구니 전체 목록을 조회한다.",
        "input_schema": {"type": "object", "properties": {}},
    },
]

SYSTEM_PROMPT = (
    "너는 StoreFlow 쇼핑을 대신 도와주는 에이전트다. 검색, 가격 비교, 반복구매 조회, "
    "장바구니 조작을 도구 호출로 순서대로 수행해라.\n"
    "규칙:\n"
    "0. '내가 항상/자주/맨날 사는 X', '저번에 샀던 거 또' 같이 과거 구매 이력이 근거인 "
    "요청은 search_products가 아니라 find_frequent_purchase부터 호출해라. 결과가 비어 있으면 "
    "'반복 구매 이력이 없다'고 사용자에게 솔직히 말하고, 임의로 상품을 지어내 담지 마라. "
    "결과가 여러 개면 가장 purchase_count가 높은 것을 우선하되, 애매하면 사용자에게 어떤 걸 "
    "말하는지 되물어라.\n"
    "1. 상품을 찾아야 하면 search_products부터 호출해라. sku_id를 스스로 지어내지 마라.\n"
    "2. '제일 싼 거', '가장 비싼 거', '~중에 골라줘' 같은 비교/정렬이 필요한 요청은 "
    "반드시 compare_products를 호출해서 실제 정렬 결과를 받은 뒤에 판단해라. "
    "search_products 결과만 보고 네가 직접 가격을 비교해서 add_to_cart로 넘어가지 마라.\n"
    "3. 장바구니에 담기 전에 어떤 상품인지(sku_id) 명확하지 않으면 담지 말고 사용자에게 되물어라.\n"
    "4. cart_item_id가 필요한 수정/삭제인데 ID를 모르면 get_cart로 먼저 확인해라.\n"
    "5. 삭제나 큰 폭의 수량 변경은 실행 후 응답에서 무엇을 했는지 명확히 알려줘라.\n"
    "6. 모든 도구 호출이 끝나면, 실제 도구 결과에 있는 상품명/가격/수량만 근거로 "
    "2~3문장 한국어로 요약해라. 도구 결과에 없는 가격이나 상품을 지어내지 마라."
)


class AgentRequest(BaseModel):
    message: str


def _run_search_products(tool_input: dict) -> dict:
    """backend_client를 통해 백엔드에서 검색한다. 가격/재고는 항상 백엔드에서만 가져온다."""
    result = backend_client.search_products(
        keywords=tool_input.get("keywords") or None,
        category_hints=tool_input.get("category_hints") or None,
        limit=20,
    )
    if not result.get("ok"):
        return {"ok": False, "error": result.get("error") or "상품 검색에 실패했습니다."}

    items = result.get("data") or []
    normalized = [
        {
            "sku_id": item.get("skuId"),
            "name": item.get("name"),
            "brand": item.get("brand"),
            "category_l1": item.get("category"),
            "category_l2": item.get("categoryL2"),
            "price_krw": item.get("priceKrw"),
            "unit": item.get("unit"),
        }
        for item in items
    ]
    return {"ok": True, "count": len(normalized), "items": normalized}


def _run_compare_products(tool_input: dict) -> dict:
    """
    비교는 Claude에게 맡기지 않는다. sku_id로 백엔드를 다시 조회해서
    파이썬이 직접 정렬한다 - Claude가 검색 결과 텍스트를 잘못 읽어
    다른 가격을 '제일 싼 거'로 착각하는 걸 막기 위함.
    """
    sku_ids = tool_input.get("sku_ids") or []
    sort_by = tool_input.get("sort_by", "price_asc")

    if not sku_ids:
        return {"ok": False, "error": "비교할 sku_id가 없습니다."}

    result = backend_client.get_products_by_skus(sku_ids)
    if not result.get("ok"):
        return {"ok": False, "error": result.get("error") or "상품 비교 조회에 실패했습니다."}

    items = [
        {
            "sku_id": item.get("skuId"),
            "name": item.get("name"),
            "brand": item.get("brand"),
            "price_krw": item.get("priceKrw"),
            "unit": item.get("unit"),
        }
        for item in (result.get("data") or [])
    ]

    reverse = sort_by == "price_desc"
    items.sort(key=lambda x: x["price_krw"], reverse=reverse)

    return {"ok": True, "sort_by": sort_by, "items": items}


def _dispatch_tool(name: str, tool_input: dict, bearer_token: str) -> dict:
    if name == "search_products":
        return _run_search_products(tool_input)
    if name == "compare_products":
        return _run_compare_products(tool_input)
    if name == "find_frequent_purchase":
        return backend_client.find_frequent_purchase(tool_input, bearer_token=bearer_token, consumer_id=None)
    if name in ("add_to_cart", "update_cart_item", "remove_from_cart", "get_cart"):
        return backend_client.cart_action(name, tool_input, bearer_token=bearer_token, consumer_id=None)
    return {"ok": False, "error": f"알 수 없는 도구: {name}"}


@router.post("/api/ai/agent/shop")
def agent_shop_action(
        body: AgentRequest,
        authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    bearer_token = authorization[len("Bearer "):]

    messages = [{"role": "user", "content": body.message}]
    actions_taken = []

    for _ in range(MAX_TOOL_TURNS):
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=600,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        )

        tool_uses = [b for b in response.content if b.type == "tool_use"]

        if not tool_uses:
            final_text = "".join(b.text for b in response.content if b.type == "text")
            return {"reply": final_text, "actions": actions_taken}

        messages.append({"role": "assistant", "content": response.content})

        tool_results = []
        for tu in tool_uses:
            result = _dispatch_tool(tu.name, tu.input, bearer_token)
            actions_taken.append({"tool": tu.name, "input": tu.input, "result": result})
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tu.id,
                    "content": json.dumps(result, ensure_ascii=False),
                    "is_error": not result.get("ok", False),
                }
            )
        messages.append({"role": "user", "content": tool_results})

    return {
        "reply": "요청 처리에 단계가 예상보다 많이 필요해서 중간에 멈췄어요. 확인해주세요.",
        "actions": actions_taken,
    }