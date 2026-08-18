"""
StoreFlow AI - 백엔드 HTTP 클라이언트

★ 이 파일이 생긴 이유 (2026-08-14 요구사항 정의서 반영) ★
그동안 ai_search.py / ai_agent_shop.py / main.py가 각자 SQLAlchemy engine으로
MySQL(storeflow_db)에 직접 접속해서 SELECT/INSERT를 했다. 요구사항 정의서의
역할 분담 원칙("백엔드 = 사실의 원본, 재고를 바꾸는 유일한 경로, 이벤트 기록도
백엔드")에 따라, ai-server는 더 이상 DB 커넥션을 직접 만들지 않는다.

상품 검색/조회/비교/대체상품, 장바구니 조회/변경, 주문(반복구매) 조회, 이벤트 기록까지
전부 이 모듈을 통해 Spring Boot REST API를 호출한다. ai-server 어디에도
create_engine이나 raw SQL이 남아있으면 안 된다 — 남아있다면 그건 아직 이관이
안 끝난 것이다.

인증 구분:
  - 상품 검색/조회/비교/대체상품: 공개 정보라 인증 없음 (쇼핑몰 검색창과 동일 API)
  - 장바구니/주문/이벤트: 사용자 개인 데이터라 두 가지 경로가 있다
      1) bearer_token이 있으면: 사용자 JWT를 그대로 실어 공개 /api/** 호출
         (프론트가 Agent를 직접 부르는 ai_agent_shop.py 경로)
      2) bearer_token이 없고 consumer_id/member_id만 있으면: 서버 대 서버 내부
         엔드포인트(/internal/**)를 X-Internal-Service-Key로 호출
         (Backend가 Agent를 부르는 agent_chat.py 경로)
"""

import os
import json
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv

load_dotenv()

BACKEND_BASE = os.environ.get("STOREFLOW_API_BASE", "http://localhost:8080")
INTERNAL_SERVICE_KEY = os.environ.get("INTERNAL_SERVICE_KEY", "")

TIMEOUT = 5.0


def _get(path: str, params: dict | None = None, headers: dict | None = None) -> dict:
    try:
        with httpx.Client(base_url=BACKEND_BASE, timeout=TIMEOUT) as http:
            resp = http.get(path, params=params, headers=headers)
        return _to_result(resp)
    except httpx.RequestError as e:
        return {"ok": False, "error": f"백엔드 연결 실패: {e}"}


def _post(path: str, json_body: dict | None = None, headers: dict | None = None) -> dict:
    try:
        with httpx.Client(base_url=BACKEND_BASE, timeout=TIMEOUT) as http:
            resp = http.post(path, json=json_body, headers=headers)
        return _to_result(resp)
    except httpx.RequestError as e:
        return {"ok": False, "error": f"백엔드 연결 실패: {e}"}


def _to_result(resp: httpx.Response) -> dict:
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


# ---------------------------------------------------------------------------
# 상품 검색 / 조회 / 비교 / 대체상품 (공개, 인증 불필요)
# ---------------------------------------------------------------------------

def search_products(
        keywords: list[str] | None = None,
        category_hints: list[str] | None = None,
        min_price: int | None = None,
        max_price: int | None = None,
        sort_by: str | None = None,
        limit: int = 20,
) -> dict:
    params = {"limit": limit}
    if keywords:
        params["keywords"] = keywords
    if category_hints:
        params["categoryHints"] = category_hints
    if min_price is not None:
        params["minPrice"] = min_price
    if max_price is not None:
        params["maxPrice"] = max_price
    if sort_by:
        params["sortBy"] = sort_by
    return _get("/api/products/search-advanced", params=params)


def get_products_by_skus(sku_ids: list[int]) -> dict:
    if not sku_ids:
        return {"ok": True, "status": 200, "data": []}
    return _get("/api/products/by-skus", params={"skuIds": sku_ids})


def get_product_detail(sku_id: int) -> dict:
    return _get(f"/api/products/{sku_id}")


def get_alternatives(sku_id: int) -> dict:
    return _get(f"/api/products/{sku_id}/alternatives/candidates")


# ---------------------------------------------------------------------------
# 이벤트 기록 (내부 전용 쓰기 - 백엔드가 유일한 창구)
# ---------------------------------------------------------------------------

def log_event(
        event_type: str,
        session_id: str,
        member_id: int | None = None,
        sku_id: int | None = None,
        location_id: str | None = None,
        payload: dict | None = None,
) -> dict:
    if not INTERNAL_SERVICE_KEY:
        # 검색 자체를 막으면 안 되므로, 키 미설정은 조용히 실패 처리하고 호출부가 무시하게 한다.
        return {"ok": False, "status": 501, "error": "INTERNAL_SERVICE_KEY 미설정"}

    headers = {"X-Internal-Service-Key": INTERNAL_SERVICE_KEY}
    body = {
        "eventType": event_type,
        "sessionId": session_id,
        "memberId": member_id,
        "skuId": sku_id,
        "locationId": location_id,
        "payloadJson": json.dumps(payload or {}, ensure_ascii=False),
    }
    return _post("/internal/events", json_body=body, headers=headers)


# ---------------------------------------------------------------------------
# 장바구니 (사용자 JWT 경로 / 내부 경로 둘 다 지원)
# ---------------------------------------------------------------------------

def _auth_headers(bearer_token: str | None) -> dict:
    return {"Authorization": f"Bearer {bearer_token}"} if bearer_token else {}


def cart_action(action: str, tool_input: dict, bearer_token: str | None, consumer_id: int | None) -> dict:
    """bearer_token이 있으면 공개 /api/cart, 없으면 내부 /internal/cart(X-Internal-Service-Key)."""
    if bearer_token:
        return _cart_public(action, tool_input, bearer_token)
    return _cart_internal(action, tool_input, consumer_id)


def _cart_public(action: str, tool_input: dict, bearer_token: str) -> dict:
    headers = _auth_headers(bearer_token)
    if action == "get_cart":
        return _get("/api/cart", headers=headers)
    if action == "add_to_cart":
        return _post_cart("/api/cart", "POST", {
            "skuId": tool_input["sku_id"], "quantity": tool_input.get("quantity") or 1
        }, headers)
    if action == "update_cart_item":
        body = {}
        if tool_input.get("quantity") is not None:
            body["quantity"] = tool_input["quantity"]
        if tool_input.get("checked") is not None:
            body["checked"] = tool_input["checked"]
        return _post_cart(f"/api/cart/{tool_input['cart_item_id']}", "PATCH", body, headers)
    if action == "remove_from_cart":
        return _post_cart(f"/api/cart/{tool_input['cart_item_id']}", "DELETE", None, headers)
    return {"ok": False, "error": f"알 수 없는 액션: {action}"}


def _cart_internal(action: str, tool_input: dict, consumer_id: int | None) -> dict:
    if not consumer_id:
        return {"ok": False, "error": "비회원은 장바구니를 쓸 수 없습니다. 로그인이 필요해요."}
    if not INTERNAL_SERVICE_KEY:
        return {"ok": False, "status": 501, "error": "INTERNAL_SERVICE_KEY 미설정 - /internal/cart 연동 필요"}

    headers = {"X-Internal-Service-Key": INTERNAL_SERVICE_KEY}
    if action == "get_cart":
        return _get("/internal/cart", params={"consumerId": consumer_id}, headers=headers)
    if action == "add_to_cart":
        return _post_cart("/internal/cart", "POST", {
            "consumerId": consumer_id,
            "skuId": tool_input["sku_id"],
            "quantity": tool_input.get("quantity") or 1,
        }, headers)
    if action == "update_cart_item":
        body = {"consumerId": consumer_id}
        if tool_input.get("quantity") is not None:
            body["quantity"] = tool_input["quantity"]
        if tool_input.get("checked") is not None:
            body["checked"] = tool_input["checked"]
        return _post_cart(f"/internal/cart/{tool_input['cart_item_id']}", "PATCH", body, headers)
    if action == "remove_from_cart":
        return _post_cart(
            f"/internal/cart/{tool_input['cart_item_id']}", "DELETE", None, headers,
            params={"consumerId": consumer_id},
        )
    return {"ok": False, "error": f"알 수 없는 액션: {action}"}


def _post_cart(path: str, method: str, body: dict | None, headers: dict, params: dict | None = None) -> dict:
    try:
        with httpx.Client(base_url=BACKEND_BASE, timeout=TIMEOUT) as http:
            resp = http.request(method, path, json=body, headers=headers, params=params)
        return _to_result(resp)
    except httpx.RequestError as e:
        return {"ok": False, "error": f"장바구니 서버 연결 실패: {e}"}


# ---------------------------------------------------------------------------
# 주문 이력 / 반복구매 (사용자 JWT 경로 / 내부 경로 둘 다 지원)
# ---------------------------------------------------------------------------

def find_frequent_purchase(
        tool_input: dict, bearer_token: str | None, consumer_id: int | None
) -> dict:
    keyword = tool_input.get("keyword")
    min_count = tool_input.get("min_count")

    if bearer_token:
        params = {}
        if keyword:
            params["keyword"] = keyword
        if min_count:
            params["minCount"] = min_count
        return _get("/api/orders/frequent", params=params, headers=_auth_headers(bearer_token))

    if not consumer_id:
        return {"ok": False, "error": "비회원은 구매 이력을 조회할 수 없습니다. 로그인이 필요해요."}
    if not INTERNAL_SERVICE_KEY:
        return {"ok": False, "status": 501, "error": "INTERNAL_SERVICE_KEY 미설정 - /internal/orders/frequent 연동 필요"}

    params = {"consumerId": consumer_id}
    if keyword:
        params["keyword"] = keyword
    if min_count:
        params["minCount"] = min_count
    headers = {"X-Internal-Service-Key": INTERNAL_SERVICE_KEY}
    return _get("/internal/orders/frequent", params=params, headers=headers)