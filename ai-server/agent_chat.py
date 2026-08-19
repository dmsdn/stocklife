"""
StoreFlow AI - /agent/chat (Backend가 호출하는 진짜 진입점)

요구사항 25번 흐름: 프론트 -> 백엔드 /api/chat -> 여기(/agent/chat) -> 백엔드 -> 프론트
Backend가 세션 확인/이력 관리를 다 하고 나서 이 엔드포인트를 부르는 것이므로,
여기서는 세션을 몰라도 되고(sessionId는 로깅/컨텍스트용), 이력 저장도 안 한다
(Backend가 응답을 받아서 저장함). 여기 책임은 "message + history를 받아서
reply + actions를 돌려주는 것" 하나뿐이다.

★ 인증 구조가 이전(ai_agent_shop.py)과 다르다 ★
  - 이전: 프론트가 Agent를 직접 호출 -> 사용자 JWT를 그대로 Spring에 전달
  - 지금: Backend가 Agent를 서버 대 서버로 호출 -> Agent는 JWT를 못 받고 consumerId(숫자)만 받음
  - 그래서 장바구니 쓰기(add_to_cart 등)와 주문 이력 조회(find_frequent_purchase)는
    기존 공개 /api/cart, /api/orders(JWT 필수)를 못 쓰고, consumerId를 직접 실어
    보내는 내부 전용 엔드포인트가 필요하다.
    아래 _call_cart_api_internal()은 Spring에 POST /internal/cart 가 생겼다고 가정하고,
    _call_orders_api_internal()은 Spring에 GET /internal/orders/frequent 가 생겼다고
    가정하고 짠 것.
    ★ Spring 쪽에 이 내부 엔드포인트가 아직 없으면 이 파일의 해당 도구들은 501을 반환한다.
    (Backend 담당자와 협의 후 실제 엔드포인트/인증 방식 맞춰야 함)
  - 내부 엔드포인트는 사용자 JWT 대신 공유 비밀키(X-Internal-Service-Key) 헤더로 인증해서,
    외부에서 consumerId를 마음대로 지어내 남의 장바구니/구매이력을 건드리는 걸 막는다.
    (이 키는 Backend<->Agent만 아는 값이어야 하고, 프론트에 절대 노출되면 안 됨)
"""

import os
import json

import httpx
from fastapi import APIRouter
from pydantic import BaseModel
from dotenv import load_dotenv
import anthropic

from ai_agent_shop import (
    TOOLS as SHOP_TOOLS,
    _run_search_products,
    _run_compare_products,
    _run_recommend_by_preference,
    _run_get_product_metrics,
    _run_find_substitutes,
    DEFAULT_FREQUENT_MIN_COUNT,
)

load_dotenv()

router = APIRouter()

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

SPRING_API_BASE = os.environ.get("STOREFLOW_API_BASE", "http://localhost:8080")
INTERNAL_SERVICE_KEY = os.environ.get("INTERNAL_SERVICE_KEY", "")  # Backend와 공유하는 비밀키

MAX_TOOL_TURNS = 6

TOOLS = SHOP_TOOLS  # search_products / compare_products / find_frequent_purchase / add_to_cart / update_cart_item / remove_from_cart / get_cart 동일

# 프롬프트 캐싱: TOOLS 마지막 항목에 breakpoint를 찍으면, 그 앞까지(TOOLS 전체)가 캐싱 대상이 된다.
# TOOLS는 요청마다 내용이 똑같으므로 매번 새로 이 부분에 대한 입력 비용을 낼 필요가 없다.
if TOOLS:
    TOOLS = [dict(t) for t in TOOLS]  # 원본(ai_agent_shop.TOOLS) 리스트를 안 건드리게 얕은 복사
    TOOLS[-1] = {**TOOLS[-1], "cache_control": {"type": "ephemeral"}}

SYSTEM_PROMPT = (
    "너는 StoreFlow 쇼핑과 대화를 함께 도와주는 에이전트다. 사용자와의 지난 대화(history)를 "
    "참고해서 문맥을 이해하고, 필요하면 검색/비교/반복구매조회/장바구니 도구를 순서대로 호출해라.\n"
    "규칙:\n"
    "0. '내가 항상/자주/맨날 사는 X', '저번에 샀던 거 또' 같이 과거 구매 이력이 근거인 "
    "요청은 search_products가 아니라 find_frequent_purchase부터 호출해라. 결과가 비어 있으면 "
    "'반복 구매 이력이 없다'고 사용자에게 솔직히 말하고, 임의로 상품을 지어내 담지 마라. "
    "결과가 여러 개면 가장 purchase_count가 높은 것을 우선하되, 애매하면 사용자에게 어떤 걸 "
    "말하는지 되물어라.\n"
    "1. 상품을 찾아야 하면 search_products부터 호출해라. sku_id를 스스로 지어내지 마라.\n"
    "2. '제일 싼 거', '가장 비싼 거' 같은 비교/정렬은 반드시 compare_products로 실제 정렬 결과를 "
    "받은 뒤에 판단해라. 눈대중으로 비교해서 바로 add_to_cart로 넘어가지 마라.\n"
    "3. 장바구니에 담기 전에 어떤 상품인지(sku_id) 명확하지 않으면 담지 말고 되물어라.\n"
    "4. cart_item_id가 필요한 수정/삭제인데 모르면 get_cart로 먼저 확인해라.\n"
    "5. 도구 결과에 없는 가격/상품/재고를 지어내지 마라. 도구가 실패(ok=false)하면 "
    "사용자에게 실패 사실을 솔직하게 알려라.\n"
    "6. 순수 잡담/질문이면 도구를 안 써도 된다.\n"
    "7. '나한테 추천해줘', '내 취향에 맞는 거 있어?'처럼 막연한 개인화 추천 요청은 "
    "recommend_by_preference를 호출해라. 결과의 categories_used(회원이 많이 산 카테고리)와 "
    "items의 reason(신상/행사)을 근거로 이유를 함께 설명해라. items가 비어 있으면 note의 "
    "사유를 그대로 전달하고 상품을 지어내지 마라. 비회원(consumerId 없음)이면 로그인을 "
    "안내하고 이 도구를 부르지 마라.\n"
    "8. 상품의 최근 판매량/누적 판매량/담기/검색/조회/재구매율을 함께 묻거나 종합 비교를 "
    "요구하면 get_product_metrics를 사용해라. 상품명이면 search_products로 sku_id부터 확정한다. "
    "웹 평판은 이 Backend 지표에 없으므로 지어내지 마라.\n"
    "9. '대체상품 추천', '이거 대신 살 거', '품절인데 비슷한 거' 요청이면 상품명이 있을 때 "
    "search_products로 원래 sku_id를 확정한 뒤 find_substitutes를 호출해라. 결과에 없는 상품을 "
    "대체상품이라고 지어내지 말고, personalized/reasons/행사/가격/반응 지표를 근거로 설명해라.\n"
    "모든 도구 호출이 끝나면 실제 결과만 근거로 2~3문장 한국어로 답해라."
)

# system도 블록으로 만들어서 캐싱 breakpoint를 찍는다. SYSTEM_PROMPT 정의 이후에 만들어야 함.
SYSTEM_BLOCKS = [
    {
        "type": "text",
        "text": SYSTEM_PROMPT,
        "cache_control": {"type": "ephemeral"},
    }
]


class HistoryTurn(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class AgentChatRequest(BaseModel):
    sessionId: str
    consumerId: int | None = None
    message: str
    history: list[HistoryTurn] = []


class AgentChatResponse(BaseModel):
    reply: str
    actions: list[dict] = []


def _call_cart_api_internal(action: str, tool_input: dict, consumer_id: int | None) -> dict:
    """
    ★ Spring에 /internal/cart 가 아직 없으면 이 함수는 501을 돌려준다.
    실제로 붙이려면 Spring 쪽에 아래 계약을 지키는 내부 엔드포인트가 필요하다:
      - 인증: Authorization JWT 대신 X-Internal-Service-Key 헤더값을 고정 비밀키와 비교
      - body에 consumerId를 직접 받는다 (JWT에서 뽑지 않음)
    """
    if not consumer_id:
        return {"ok": False, "error": "비회원은 장바구니를 쓸 수 없습니다. 로그인이 필요해요."}

    if not INTERNAL_SERVICE_KEY:
        return {
            "ok": False,
            "status": 501,
            "error": "내부 서비스 키(INTERNAL_SERVICE_KEY) 미설정 - Backend와 협의 후 /internal/cart 연동 필요",
        }

    headers = {"X-Internal-Service-Key": INTERNAL_SERVICE_KEY}
    try:
        with httpx.Client(base_url=SPRING_API_BASE, timeout=5.0) as http:
            if action == "get_cart":
                resp = http.get("/internal/cart", headers=headers, params={"consumerId": consumer_id})
            elif action == "add_to_cart":
                resp = http.post(
                    "/internal/cart",
                    headers=headers,
                    json={
                        "consumerId": consumer_id,
                        "skuId": tool_input["sku_id"],
                        "quantity": tool_input.get("quantity") or 1,
                    },
                )
            elif action == "update_cart_item":
                body = {"consumerId": consumer_id}
                if tool_input.get("quantity") is not None:
                    body["quantity"] = tool_input["quantity"]
                if tool_input.get("checked") is not None:
                    body["checked"] = tool_input["checked"]
                resp = http.patch(
                    f"/internal/cart/{tool_input['cart_item_id']}", headers=headers, json=body
                )
            elif action == "remove_from_cart":
                resp = http.request(
                    "DELETE",
                    f"/internal/cart/{tool_input['cart_item_id']}",
                    headers=headers,
                    params={"consumerId": consumer_id},
                )
            else:
                return {"ok": False, "error": f"알 수 없는 액션: {action}"}

        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            return {"ok": False, "status": resp.status_code, "error": detail}

        try:
            data = resp.json()
        except Exception:
            data = None
        return {"ok": True, "status": resp.status_code, "data": data}

    except httpx.RequestError as e:
        return {"ok": False, "error": f"장바구니 서버 연결 실패: {e}"}


def _call_orders_api_internal(action: str, tool_input: dict, consumer_id: int | None) -> dict:
    """
    ★ Spring에 /internal/orders/frequent 가 아직 없으면 이 함수는 501을 돌려준다.
    (InternalOrderController.java가 그 계약을 구현한다: X-Internal-Service-Key 인증,
    consumerId/keyword/minCount를 쿼리 파라미터로 직접 받음)
    """
    if not consumer_id:
        return {"ok": False, "error": "비회원은 구매 이력을 조회할 수 없습니다. 로그인이 필요해요."}

    if not INTERNAL_SERVICE_KEY:
        return {
            "ok": False,
            "status": 501,
            "error": "내부 서비스 키(INTERNAL_SERVICE_KEY) 미설정 - Backend와 협의 후 /internal/orders/frequent 연동 필요",
        }

    headers = {"X-Internal-Service-Key": INTERNAL_SERVICE_KEY}
    try:
        with httpx.Client(base_url=SPRING_API_BASE, timeout=5.0) as http:
            if action == "find_frequent_purchase":
                params = {"consumerId": consumer_id}
                if tool_input.get("keyword"):
                    params["keyword"] = tool_input["keyword"]
                params["minCount"] = tool_input.get("min_count") or DEFAULT_FREQUENT_MIN_COUNT
                resp = http.get("/internal/orders/frequent", headers=headers, params=params)
            else:
                return {"ok": False, "error": f"알 수 없는 액션: {action}"}

        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            return {"ok": False, "status": resp.status_code, "error": detail}

        try:
            data = resp.json()
        except Exception:
            data = None
        return {"ok": True, "status": resp.status_code, "data": data}

    except httpx.RequestError as e:
        return {"ok": False, "error": f"주문 이력 서버 연결 실패: {e}"}


def _call_purchase_stats_unavailable(name: str) -> dict:
    """
    compare_purchase_popularity / get_popular_products는 백엔드 PurchaseController가
    @CurrentConsumer(Bearer JWT 필수)로만 열려 있고 /internal 대응 엔드포인트가 없다.
    이 /agent/chat 경로는 Backend가 서버 대 서버로 호출해서 JWT가 없으므로 이 두 도구는
    여기서는 쓸 수 없다 — ai_agent_shop.py(/api/ai/agent/shop, 프론트가 사용자 JWT를 직접
    실어 호출하는 경로)에서는 정상 동작한다.
    """
    return {
        "ok": False,
        "status": 501,
        "error": (
            f"{name}은(는) 이 채팅 경로에서 아직 지원되지 않습니다. "
            "판매량 비교는 로그인한 사용자가 /api/ai/agent/shop 경로로 물어봐야 합니다."
        ),
    }


def _dispatch_tool(name: str, tool_input: dict, consumer_id: int | None) -> dict:
    if name == "search_products":
        return _run_search_products(tool_input)
    if name == "compare_products":
        return _run_compare_products(tool_input)
    if name == "find_frequent_purchase":
        return _call_orders_api_internal(name, tool_input, consumer_id)
    if name in ("add_to_cart", "update_cart_item", "remove_from_cart", "get_cart"):
        return _call_cart_api_internal(name, tool_input, consumer_id)
    if name in ("compare_purchase_popularity", "get_popular_products"):
        return _call_purchase_stats_unavailable(name)
    if name == "get_product_metrics":
        return _run_get_product_metrics(tool_input)
    if name == "find_substitutes":
        return _run_find_substitutes(tool_input, bearer_token=None, consumer_id=consumer_id)
    if name == "recommend_by_preference":
        # get_top_categories는 /internal/purchases/top-categories(consumer_id + 서비스 키)로,
        # search_by_category는 공개 API라 이 경로(JWT 없음)에서도 그대로 동작한다.
        return _run_recommend_by_preference(tool_input, bearer_token=None, consumer_id=consumer_id)
    return {"ok": False, "error": f"알 수 없는 도구: {name}"}


@router.post("/agent/chat", response_model=AgentChatResponse)
def agent_chat(body: AgentChatRequest):
    messages = [{"role": h.role, "content": h.content} for h in body.history]
    messages.append({"role": "user", "content": body.message})

    actions_taken = []

    for _ in range(MAX_TOOL_TURNS):
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=600,
            system=SYSTEM_BLOCKS,
            tools=TOOLS,
            messages=messages,
        )

        tool_uses = [b for b in response.content if b.type == "tool_use"]

        if not tool_uses:
            final_text = "".join(b.text for b in response.content if b.type == "text")
            return AgentChatResponse(reply=final_text, actions=actions_taken)

        messages.append({"role": "assistant", "content": response.content})

        tool_results = []
        for tu in tool_uses:
            result = _dispatch_tool(tu.name, tu.input, body.consumerId)
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

    return AgentChatResponse(
        reply="요청 처리에 단계가 예상보다 많이 필요해서 중간에 멈췄어요. 확인해주세요.",
        actions=actions_taken,
    )