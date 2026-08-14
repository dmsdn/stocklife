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
  - 그래서 장바구니 쓰기(add_to_cart 등)는 기존 공개 /api/cart(JWT 필수)를 못 쓰고,
    consumerId를 직접 실어 보내는 내부 전용 엔드포인트가 필요하다.
    아래 _call_cart_api_internal()은 Spring에 POST /internal/cart 가 생겼다고 가정하고 짠 것.
    ★ Spring 쪽에 이 내부 엔드포인트가 아직 없으면 이 파일의 장바구니 관련 도구는 501을 반환한다.
    (Backend 담당자와 협의 후 실제 엔드포인트/인증 방식 맞춰야 함)
  - 내부 엔드포인트는 사용자 JWT 대신 공유 비밀키(X-Internal-Service-Key) 헤더로 인증해서,
    외부에서 consumerId를 마음대로 지어내 남의 장바구니를 건드리는 걸 막는다.
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
)

load_dotenv()

router = APIRouter()

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

SPRING_API_BASE = os.environ.get("STOREFLOW_API_BASE", "http://localhost:8080")
INTERNAL_SERVICE_KEY = os.environ.get("INTERNAL_SERVICE_KEY", "")  # Backend와 공유하는 비밀키

MAX_TOOL_TURNS = 6

TOOLS = SHOP_TOOLS  # search_products / compare_products / add_to_cart / update_cart_item / remove_from_cart / get_cart 동일

SYSTEM_PROMPT = (
    "너는 StoreFlow 쇼핑과 대화를 함께 도와주는 에이전트다. 사용자와의 지난 대화(history)를 "
    "참고해서 문맥을 이해하고, 필요하면 검색/비교/장바구니 도구를 순서대로 호출해라.\n"
    "규칙:\n"
    "1. 상품을 찾아야 하면 search_products부터 호출해라. sku_id를 스스로 지어내지 마라.\n"
    "2. '제일 싼 거', '가장 비싼 거' 같은 비교/정렬은 반드시 compare_products로 실제 정렬 결과를 "
    "받은 뒤에 판단해라. 눈대중으로 비교해서 바로 add_to_cart로 넘어가지 마라.\n"
    "3. 장바구니에 담기 전에 어떤 상품인지(sku_id) 명확하지 않으면 담지 말고 되물어라.\n"
    "4. cart_item_id가 필요한 수정/삭제인데 모르면 get_cart로 먼저 확인해라.\n"
    "5. 도구 결과에 없는 가격/상품/재고를 지어내지 마라. 도구가 실패(ok=false)하면 "
    "사용자에게 실패 사실을 솔직하게 알려라.\n"
    "6. 순수 잡담/질문이면 도구를 안 써도 된다.\n"
    "모든 도구 호출이 끝나면 실제 결과만 근거로 2~3문장 한국어로 답해라."
)


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


def _dispatch_tool(name: str, tool_input: dict, consumer_id: int | None) -> dict:
    if name == "search_products":
        return _run_search_products(tool_input)
    if name == "compare_products":
        return _run_compare_products(tool_input)
    if name in ("add_to_cart", "update_cart_item", "remove_from_cart", "get_cart"):
        return _call_cart_api_internal(name, tool_input, consumer_id)
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
            system=SYSTEM_PROMPT,
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