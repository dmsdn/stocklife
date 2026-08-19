#===============================================
# Agent 판단 핵 - 액션형 도구 3종 실행부
#===============================================

# [역할] Agent가 "실제로 담기/수량변경/빼기"를 수행하는 파일
# DB가 아닌 백엔드 API를 부르고, 실제로 쓰기는 백엔드의 CartService가 함.
# 이 3종은 "회원전용"이므로 비회원은 consumer_id가 없어 부를 수 없고, 루프가 그런 세션에서는 도구 목록에서 빼거나 로그인 안내로 착지해야 함.

#===============================================

import os

from app import config

#===============================================

# 백엔드 내부 API 주소 및 비밀키
INTERNAL_SERVICE_KEY = os.environ.get("INTERNAL_SERVICE_KEY", "")
INTERNAL_CART_PATH = "/internal/cart"

# 현재 요청의 회원번호. 루프가 매 요청 시작 시 set_consumer_id()로 채움
# consumer_id는 **LLM이 정하면 안 되는 값**이다. 도구 스키마에 넣어두면  LLM이 9002 같은 남의 번호를 채워 넣을 수 있고, 그러면 남의 장바구니가 바뀜.
# 백엔드가 JWT로 확인해 넘겨준 값만 쓰도록, LLM의 손이 닿지 않는 경로로 전달 (definitions.py의 액션 3종 스키마에 consumer_id가 없는 이유)
_CURRENT_CONSUMER_ID: int | None = None

def set_consumer_id(consumer_id: int | None) -> None:
    global _CURRENT_CONSUMER_ID
    _CURRENT_CONSUMER_ID = consumer_id

def _require_member() -> tuple[int | None, dict | None]:
    if _CURRENT_CONSUMER_ID is None:
        return None, {"ok": False, "error": "not_a_member", "message": "로그인한 회원만 장바구니를 사용할 수 있습니다."}
    return _CURRENT_CONSUMER_ID, None

def _call(method: str, path: str, json_body: dict | None = None, params: dict | None = None) -> dict:
    if not INTERNAL_SERVICE_KEY:
        return {"ok": False, "error": "no_service_key",
                "message": "INTERNAL_SERVICE_KEY가 설정되지 않았습니다(.env 확인)."}

    import httpx

    try:
        r = httpx.request(
            method,
            config.BACKEND_BASE_URL + path,
            json = json_body,
            params = params,
            headers = {"X-Internal-Service-Key": INTERNAL_SERVICE_KEY},
            timeout = config.BACKEND_TIMEOUT_SEC,
        )
    except Exception as e:
        return {"ok": False, "error": type(e).__name__, "message": str(e)}

    if 200 <= r.status_code < 300:
        body = r.json() if r.content else None
        return {"ok": True, "status": r.status_code, "data": body}

    reason = {401: "internal_auth_failed",
              404: "not_found",
              400: "bad_request"}.get(r.status_code, "backend_error")
    return {"ok": False, "error": reason, "status": r.status_code, "message": r.text[:200]}

#===============================================

# 도구별 실행 함수

def _add_to_cart(sku_id: int, quantity: int = 1) -> dict:
    cid, err = _require_member()
    if err:
        return err
    return _call("POST", INTERNAL_CART_PATH,
                 json_body = {"consumerId": cid, "skuId": sku_id, "quantity": quantity})

def _update_cart_quantity(cart_item_id: int, quantity: int) -> dict:
    cid, err = _require_member()
    if err:
        return err
    return _call("PATCH", f"{INTERNAL_CART_PATH}/{cart_item_id}", json_body = {"consumerId": cid, "quantity": quantity})

def _remove_from_cart(cart_item_id: int) -> dict:
    cid, err = _require_member()
    if err:
        return err
    return _call("DELETE", f"{INTERNAL_CART_PATH}/{cart_item_id}", params={"consumerId": cid})

#===============================================

# 디스패치 테이블

REGISTRY = {
    "add_to_cart": _add_to_cart,
    "update_cart_quantity": _update_cart_quantity,
    "remove_from_cart": _remove_from_cart,
}

MUTATING_TOOLS = frozenset(REGISTRY)