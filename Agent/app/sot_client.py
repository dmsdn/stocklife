#===============================================
# Agent 판단의 핵 - SoT 조회창구
#===============================================

# [역할] 백엔드(SoT)에 있는 사실을 "읽어오는" 함수 7개를 모아둔 파일
# 루프, 도구, 감시자가 재고/상품/이력을 알고 싶으면 반드시 이 파일의 함수를 부름
# 백엔드 URL 또는 mock_data를 직접 만지는 코드는 이 파일 밖에 없음
# SoT로 가는 문이 하나 => "이 숫자 어디서 옴?"의 답이 있는 파일

# [구조] 함수마다 첫 줄이 `if not config.USE_MOCK_SOT: return _http_get(...)`.
# 스위치가 꺼져(mock) 있으면 아리의 mock 구현이 돌고, 켜면 백엔드 HTTP를 탐.
# 두 경로의 반환 dict "모양"을 똑같이 맞추는 것이 이 파일의 계약 => 스위치를 올려도 도구 코드가 한 줄도 바뀌지 않음

# [금지] 이 파일에 쓰기(INSERT/UPDATE)함수는 존재하지 않음

from datetime import datetime, timedelta

from app import config, mock_data

#===============================================

# 실물 경로 용 URL (USE_MOCK_SOT = False)
# 경로를 함수마다 흩뿌리지 않고 표 하나로 모음: 백엔드와 경로가 확정될 시 고칠 곳
_API = {
    "search_products": "/api/products/search",
    "get_product": "/api/products/{sku_id}",
    "get_inventory": "/api/inventory/{sku_id}",
    "get_purchase_history": "/api/members/{member_id}/purchases",
    "get_session_cart": "/api/sessions/{session_id}/cart",
    "get_wishlist": "/api/members/{member_id}/wishlist",
    "get_change_events": "/api/events/changes",
}

#===============================================

# 이름 앞의 밑줄(_API, _http_get)은 파이썬 관례로 "이 모듈 내부용 — 밖에서
# import해 쓰지 마라"는 표시다. 강제는 아니고 읽는 사람에 대한 신호다.


def _http_get(path: str, params:dict | None = None):
    import httpx
    r = httpx.get(config.BACKEND_BASE_URL + path, params=params,
                  timeout=config.BACKEND_TIMEOUT_SEC)
    r.raise_for_status()
    return r.json()


def _parse_ms(ts: str) -> datetime:
    return datetime.strptime(ts, "%Y-%m-%d %H:%M:%S.%f")


#===============================================

# 조회형 도구 7종의 뒷단
# 반환은 전부 "JSON으로 그대로 나갈 수 있는" dict/list
# datetime 객체를 반환하지 않음. 반환값들이 결국 LLM에게 도구 결과로 넘어가는데, 문자열이면 그대로 나가고 객체면 변환 계층이 하나 더 생기기 때문

def search_products(keyword: str | None = None,
                     category_l1: str | None = None,
                     category_l2: str | None = None,
                     max_price: int | None = None,
                     on_promo_only: bool = False,
                     new_within_days: int | None = None) -> list[dict]:
    if not config.USE_MOCK_SOT:
        return _http_get(_API["search_products"], {"keyword": keyword, "category_l1": category_l1, "category_l2": category_l2,
                                                   "max_price": max_price, "on_promo_only": on_promo_only, "new_within_days": new_within_days})

    promo_skus = {p["sku_id"] for p in mock_data.PROMOTIONS
                  if _parse_ms(p["starts_at"]) <= config.DEMO_NOW <= _parse_ms(p["ends_at"])}

    out = []
    for p in mock_data.PRODUCTS.values():
        if keyword and keyword not in p["name"] and keyword not in p["brand"] and keyword not in p["category"]:
            continue
        if category_l1 and p["category_l1"] != category_l1:
            continue
        if category_l2 and p["category_l2"] != category_l2:
            continue
        if max_price is not None and p["price_krw"] > max_price:
            continue
        if on_promo_only and p["sku_id"] in promo_skus:
            continue
        if new_within_days is not None:
            stocked = datetime.strptime(p["first_stocked_at"], "%Y-%m-%d")
            if stocked < config.DEMO_NOW - timedelta(days=new_within_days):
                continue
        out.append({**p, "on_promo": p["sku_id"] in promo_skus})

    return out

def get_products(sku_id:int) -> dict | None:
    if not config.USE_MOCK_SOT:
        return _http_get(_API["get_product"].format(sku_id = sku_id))
    return mock_data.PRODUCTS.get(sku_id)


def get_inventory(sku_id: int) -> dict:
    if not config.USE_MOCK_SOT:
        return _http_get(_API["get_inventory"].format(sku_id = sku_id))

    locs = []
    for (sku, loc_id), qty in mock_data.STOCKS.items():
        if sku != sku_id:
            continue
        loc = mock_data.LOCATIONS[loc_id]
        cfg = mock_data.SHELF_CONFIGS.get((sku, loc_id))
        locs.append({
            "location_id": loc_id, "zone_id": loc["zone_id"],
            "tier_role": loc["tier_role"], "floor_no": loc["floor_no"],
            "x": loc["x"], "y": loc["y"], "qty": qty,
            "min_qty": cfg["min_qty"] if cfg else None,
        })
    return {"sku_id": sku_id, "locations": locs}


def get_purchase_history(member_id: int) -> list[dict]:

    if not config.USE_MOCK_SOT:
        return _http_get(_API["get_purchase_history"].format(member_id = member_id))
    rows = [p for p in mock_data.PURCHASES if p["member_id"] == member_id]
    return sorted(rows, key=lambda r : r["purchased_at"])


def get_session_cart(session_id:str) -> dict:

    if not config.USE_MOCK_SOT:
        return _http_get(_API["get_session_cart"].format(session_id = session_id))

    counts: dict[int, int] = {}
    for e in mock_data.CONSUMER_EVENTS:
        if e["session_id"] != session_id:
            continue
        if e["event_type"] == "SCAN_ADD":
            counts[e["sku_id"]] = counts.get(e["sku_id"], 0) + 1
        elif e["event_type"] == "SCAN_REMOVE":
            counts[e["sku_id"]] = counts.get(e["sku_id"], 0) - 1

    items = []
    total = 0
    for sku, qty in counts.items():
        if qty <= 0:
            continue
        p=mock_data.PRODUCTS[sku]
        items.append({"sku_id": sku, "name": p["name"], "qty": qty,
                      "unit_price_krw": p["price_krw"], "subtotal_krw": p["price_krw"] * qty})
        total += p["price_krw"]*qty
    return {"session_id": session_id, "items": items, "total_krw": total}


def get_wishlist(member_id: int) -> list[dict]:

    if not config.USE_MOCK_SOT:
        return _http_get(_API["get_wishlist"].format(member_id = member_id))
    return[w for w in mock_data.WISHLISTS if w["member_id"] == member_id]

def get_change_events(sku_ids: list[int] | None = None, within_hours: int =24) -> list[dict]:

    if not config.USE_MOCK_SOT:
        return _http_get(_API["get_change_events"], {"sku_ids": sku_ids, "within_hours": within_hours})

    since= config.DEMO_NOW - timedelta(hours=within_hours)
    out = []
    for e in mock_data.SHELF_EVENTS:
        if e["event_type"] not in ("MOVE", "RESTOCK_IN", "STOCKOUT"):
            continue
        if sku_ids is not None and e["sku_id"] not in sku_ids:
            continue
        if _parse_ms(e["occured_at"]) <since:
            continue
        out.append(e)
        return sorted(out, key=lambda e: e["occured_at"])