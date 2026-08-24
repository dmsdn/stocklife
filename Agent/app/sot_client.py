#===============================================
# Agent 하네스 - SoT 조회창구
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
    "search_products":      "/api/products/search",
    "get_product":          "/api/products/{sku_id}",
    "get_products_by_skus": "/api/products/by-skus",
    "get_inventory":        "/api/products/{sku_id}/inventory",       # 구: /api/inventory/{sku_id}
    "get_purchase_history": "/api/members/{member_id}/purchases",     # ⚠ 백엔드 미확정
    "get_session_cart":     "/api/sessions/{session_id}/cart",        # ⚠ 백엔드 미확정
    "get_wishlist":         "/api/wishlist",                          # 구: /api/members/{id}/wishlist
    "get_change_events":    "/api/inventory/change-events",           # 구: /api/events/changes
    #
    "get_frequent":         "/internal/orders/frequent",              # 반복구매 집계(백엔드가 계산)
    "get_product_metrics":  "/internal/products/metrics",             # 30일 지표·재구매율
    "compare_popularity":   "/internal/purchases/compare",            # 상품 간 판매량 비교
    "get_popular":          "/internal/purchases/popular",            # ⚠ 백엔드에 아직 없음
    "get_alt_candidates":   "/api/products/{sku_id}/alternatives/candidates",  # 대체 후보(공개)
    "navigation_route":     "/api/navigation/route",                  # A* 경로 계산(POST·공개)
    "push_proactive":       "/internal/chat/proactive",               # 자발형 말풍선 전달
}

#===============================================

# 이름 앞의 밑줄(_API, _http_get)은 파이썬 관례로 "이 모듈 내부용 — 밖에서
# import해 쓰지 마라"는 표시다. 강제는 아니고 읽는 사람에 대한 신호다.

def _internal_headers() -> dict:
    """/internal/** 경로용 인증 헤더를 만든다.

    키는 tools/action.py와 같은 환경변수(INTERNAL_SERVICE_KEY)에서 읽는다 —
    백엔드 application.yml의 internal.service-key와 같은 값이어야 하며,
    다르면 백엔드가 401을 돌려준다. 함수 안에서 매번 읽는 이유: 모듈 상수로
    굳히면 .env 적재(env.load_env)보다 먼저 import됐을 때 빈 문자열로 얼어붙는다
    (08-20 트러블슈팅 'env 키 미적재'와 같은 계열의 함정을 구조로 회피).
    """
    import os
    return {"X-Internal-Service-Key": os.environ.get("INTERNAL_SERVICE_KEY", "")}


def _http_get(path: str, params: dict | None = None, headers: dict | None = None):
    import httpx
    r = httpx.get(config.BACKEND_BASE_URL + path, params=params, headers=headers,
                  timeout=config.BACKEND_TIMEOUT_SEC)
    r.raise_for_status() # 응답이 실패 코드 (4XX/5XX)면 예외를 던짐. 응답 객체가 스스로 가진 기능(메서드)
    # 실패는 실패로 터뜨려야 루프가 지어내지 않음
    return r.json() # 응답 본문 (JSON 텍스트)을 파이썬 dict/list로 변환해 돌려줌

def _http_post(path: str, json_body: dict, headers: dict | None = None):
    """조회·전달 성격의 POST. 지금 쓰는 곳은 둘 — 경로 계산(본문이 커서 POST)과
    자발형 말풍선 전달. _http_get과 짝을 이루는 최소한의 함수라 따로 뺐다.

    json=본문 으로 넘기면 httpx가 dict를 JSON 문자열로 바꾸고 Content-Type
    헤더까지 챙긴다 — json.dumps를 손으로 부를 필요가 없다.
    타임아웃을 config 값과 10초 중 큰 쪽으로 잡는 이유: A* 경로 계산은
    단순 조회보다 오래 걸릴 수 있는데, 조회 기준(3초)으로 끊으면 멀쩡한
    계산을 실패로 오판한다. max(a, b) = 둘 중 큰 값.
    """
    import httpx
    r = httpx.post(config.BACKEND_BASE_URL + path, json=json_body, headers=headers,
                   timeout=max(config.BACKEND_TIMEOUT_SEC, 10.0))
    r.raise_for_status()
    return r.json()

def _parse_ms(ts: str) -> datetime:
    # "14:04:12"는 문자열이라 빼기가 안 됨. datetime객체로 바꿔야 몇 초 차이인가를 계산할 수 있음
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
        if keyword and keyword not in p["name"] and keyword not in p["brand"] and keyword not in p["category_l2"]:
            continue
        if category_l1 and p["category_l1"] != category_l1:
            continue
        if category_l2 and p["category_l2"] != category_l2:
            continue
        if max_price is not None and p["price_krw"] > max_price:
            continue
        if on_promo_only and p["sku_id"] not in promo_skus:
            continue
        if new_within_days is not None:
            stocked = datetime.strptime(p["first_stocked_at"], "%Y-%m-%d")
            if stocked < config.DEMO_NOW - timedelta(days=new_within_days):
                continue
        out.append({**p, "on_promo": p["sku_id"] in promo_skus})

    return out

def get_product(sku_id: int) -> dict | None:
    if not config.USE_MOCK_SOT:
        return _http_get(_API["get_product"].format(sku_id=sku_id))
    return mock_data.PRODUCTS.get(sku_id)


def get_inventory(sku_id: int) -> dict:
    if not config.USE_MOCK_SOT:
        return _http_get(_API["get_inventory"].format(sku_id=sku_id))

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
        return _http_get(_API["get_purchase_history"].format(member_id=member_id))
    rows = [p for p in mock_data.PURCHASES if p["member_id"] == member_id]
    # sorted(목록, key=함수): key 함수가 돌려주는 값을 기준으로 정렬한 새 목록을 만듦. 원본은 그대로 유지
    # lambda r: r["purchased_at"]: 행 r을 받아 purchased_at 값을 돌려줌
    return sorted(rows, key=lambda r: r["purchased_at"])


def get_session_cart(session_id: str) -> dict:

    if not config.USE_MOCK_SOT:
        return _http_get(_API["get_session_cart"].format(session_id=session_id))

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
        p = mock_data.PRODUCTS[sku]
        items.append({"sku_id": sku, "name": p["name"], "qty": qty,
                      "unit_price_krw": p["price_krw"], "subtotal_krw": p["price_krw"] * qty})
        total += p["price_krw"] * qty
    return {"session_id": session_id, "items": items, "total_krw": total}


def get_wishlist(member_id: int) -> list[dict]:

    if not config.USE_MOCK_SOT:
        return _http_get(_API["get_wishlist"].format(member_id=member_id))
    return[w for w in mock_data.WISHLISTS if w["member_id"] == member_id]

def get_change_events(sku_ids: list[int] | None = None, within_hours: int = 24) -> list[dict]:

    if not config.USE_MOCK_SOT:
        return _http_get(_API["get_change_events"], {"sku_ids": sku_ids, "within_hours": within_hours})

    since = config.DEMO_NOW - timedelta(hours=within_hours)
    out = []
    for e in mock_data.SHELF_EVENTS:
        if e["event_type"] not in ("MOVE", "RESTOCK_IN", "STOCKOUT"):
            continue
        if sku_ids is not None and e["sku_id"] not in sku_ids:
            continue
        if _parse_ms(e["occurred_at"]) <since:
            continue
        out.append(e)
    return sorted(out, key=lambda e: e["occurred_at"])

# ============================================================================
# 2026-08-21 ai-server 인수분 — 조회 3종·집계 1종·대체 후보·경로 계산·말풍선 전달
# ============================================================================
# 실물 응답은 자바 DTO라 camelCase(skuId·purchaserCount)로 온다. **이 파일에서snake_case로 통일해 돌려준다**
# mock과 실물의 반환 모양을 같게 맞추는 일은 이 파일의 계약(머리 주석)이고, 변환을 도구 쪽에 미루면 도구마다 두 표기를다 알아야 해서 계약이 무너진다.

def _in_window(ts: str, days: int) -> bool:
    """시각 문자열이 '지금부터 최근 days일' 창 안인가. 지표·인기 집계의 공용 조각.
    창의 기준은 실제 시계가 아니라 DEMO_NOW다 — search_products의 행사 판정과
    같은 이유(재현성)로, mock 세계의 '지금'은 한 곳에서만 나온다."""
    return _parse_ms(ts) >= config.DEMO_NOW - timedelta(days=days)


def get_products_by_skus(sku_ids: list[int]) -> list[dict]:
    """sku 여러 개의 상품 dict를 한 번에. 계산 도구(가격 정렬·대체 후보)의 재료.

    [왜 get_product 반복 호출이 아닌가] 실물에서는 호출 1번 = 네트워크 왕복
    1번이다. 10개 비교에 10번 왕복하면 그만큼 느려지므로, 백엔드가 이미
    묶음 조회(/api/products/by-skus)를 열어뒀다. mock에서도 같은 모양을 지킨다.
    없는 sku는 조용히 빠진다(부르는 쪽이 개수 비교로 알 수 있다).
    """
    if not config.USE_MOCK_SOT:
        # 자바 쪽 파라미터 표기는 skuIds(camelCase) — 여기서 변환한다.
        rows = _http_get(_API["get_products_by_skus"], {"skuIds": sku_ids})
        # 실물 응답의 camelCase 키를 mock과 같은 snake_case로 맞춘다.
        return [{"sku_id": r.get("skuId"), "name": r.get("name"), "brand": r.get("brand"),
                 "price_krw": r.get("priceKrw"), "category_l1": r.get("categoryL1"),
                 "category_l2": r.get("categoryL2"), "spec_raw": r.get("specRaw"),
                 "lifecycle_status": r.get("lifecycleStatus")} for r in rows]
    # mock: PRODUCTS에서 있는 것만 골라 담는다. `if s in mock_data.PRODUCTS`가
    # 없으면 없는 sku에서 KeyError로 죽는다 — '없음'은 정상 입력(get_product와 동일).
    return [mock_data.PRODUCTS[s] for s in sku_ids if s in mock_data.PRODUCTS]


def get_frequent_purchases(member_id: int, keyword: str | None = None,
                           min_count: int = 2) -> dict:
    """반복구매 상품 집계 — '내가 항상 사는 X 담아줘'의 근거.

    [출력] {"items": [{sku_id, name, purchase_count, avg_qty, suggested_quantity,
                       last_purchased_at}, …]}  — purchase_count 내림차순.
    suggested_quantity = 매번 산 수량의 평균을 반올림한 값. LLM이 담을 수량을
    지어내지 않고 이 값을 그대로 쓰게 한다(ai-server의 원칙을 그대로 인수).

    [실물] 집계는 백엔드 /internal/orders/frequent가 한다(consumerId를 받아
    자기 주문 테이블에서 계산). 우리는 결과를 받아 표기만 통일한다.
    [mock] 같은 계산을 PURCHASES로 직접 한다 — 두 경로의 결과 모양이 같아야
    실물 전환이 스위치 한 번이 된다.
    """
    if not config.USE_MOCK_SOT:
        rows = _http_get(_API["get_frequent"],
                         {"consumerId": member_id, "keyword": keyword, "minCount": min_count},
                         headers=_internal_headers())
        items = [{"sku_id": r.get("skuId"), "name": r.get("productName") or r.get("name"),
                  "purchase_count": r.get("purchaseCount"), "avg_qty": r.get("avgQty"),
                  "suggested_quantity": r.get("suggestedQuantity"),
                  "last_purchased_at": r.get("lastPurchasedAt")}
                 for r in (rows if isinstance(rows, list) else rows.get("items", []))]
        return {"items": items}

    # ── mock 집계 ── 회원의 구매를 sku별로 모은다: {sku: [행, 행, …]}
    by_sku: dict[int, list[dict]] = {}
    for p in mock_data.PURCHASES:
        if p["member_id"] != member_id:
            continue
        # setdefault(키, []) = 키가 없으면 빈 리스트를 넣고, 있으면 기존 것을
        # 돌려준다. "없으면 만들고 이어붙이기"를 한 줄로 쓰는 dict의 관용구 —
        # counts.get(k, 0) + 1 (query의 장바구니 복원)과 같은 문제의 리스트판.
        by_sku.setdefault(p["sku_id"], []).append(p)

    items = []
    for sku, rows in by_sku.items():
        # 반복구매의 단위는 '행'이 아니라 '장바구니(basket)'다 — 한 번 장 볼 때
        # 물티슈 2개를 스캔하면 행이 2개라도 구매 1회다. set으로 중복을 접는다.
        baskets = {r["basket_id"] for r in rows}
        if len(baskets) < min_count:
            continue                       # 기준 미달 — "항상 사는 것"이 아니다
        p = mock_data.PRODUCTS.get(sku)
        name = p["name"] if p else str(sku)
        if keyword and keyword not in name:
            continue
        qty_total = sum(r["qty"] for r in rows)
        avg = qty_total / len(baskets)     # 장보기 1회당 평균 수량
        items.append({
            "sku_id": sku, "name": name,
            "purchase_count": len(baskets),
            # round(x)는 반올림. 0개를 제안하는 일이 없도록 max(1, …)로 바닥을 깐다
            # (평균 0.4개 같은 값도 '살 때는 1개'라는 뜻이므로).
            "avg_qty": round(avg, 2),
            "suggested_quantity": max(1, round(avg)),
            "last_purchased_at": max(r["purchased_at"] for r in rows),
        })
    # 구매 횟수가 많은 것이 먼저 — "항상 사는 것"의 대표를 앞에 세운다.
    # reverse=True = 내림차순. key가 돌려주는 값(횟수) 큰 순서.
    items.sort(key=lambda x: x["purchase_count"], reverse=True)
    return {"items": items}


def get_product_metrics(sku_ids: list[int]) -> dict:
    """상품별 반응 지표 묶음 — 판매량·담기·조회·재구매율 (ai-server 인수 도구).

    [출력] {"window_days": 30, "items": [{sku_id, name, sales_qty_30d,
        sales_qty_total, cart_add_count_30d, view_count_30d,
        unique_buyer_count, repeat_buyer_count, repurchase_rate_pct}, …]}
    재구매율(%) = 서로 다른 장바구니에서 2회 이상 산 사람 / 전체 구매자 × 100.

    [실물] 백엔드 /internal/products/metrics가 전부 계산해 준다(METRICS_README).
    [mock] PURCHASES·CONSUMER_EVENTS로 같은 정의를 직접 계산한다. mock 세계의
    이력이 몇 줄뿐이라 숫자는 작게 나오지만, **모양과 정의가 같다는 것**이
    골든셋이 실물 전환 후에도 유효한 근거다.
    """
    if not config.USE_MOCK_SOT:
        rows = _http_get(_API["get_product_metrics"], {"skuIds": sku_ids},
                         headers=_internal_headers())
        items = [{"sku_id": r.get("skuId"), "name": r.get("productName"),
                  "sales_qty_30d": r.get("salesQty30d"), "sales_qty_total": r.get("salesQtyTotal"),
                  "cart_add_count_30d": r.get("cartAddCount30d"),
                  "view_count_30d": r.get("viewCount30d"),
                  "unique_buyer_count": r.get("uniqueBuyerCount"),
                  "repeat_buyer_count": r.get("repeatBuyerCount"),
                  "repurchase_rate_pct": r.get("repurchaseRate")}
                 for r in (rows if isinstance(rows, list) else rows.get("items", []))]
        return {"window_days": 30, "items": items}

    items = []
    for sku in sku_ids:
        p = mock_data.PRODUCTS.get(sku)
        rows = [r for r in mock_data.PURCHASES if r["sku_id"] == sku]
        # 구매자별 장바구니 집합: {회원: {바스켓, …}} — 재구매 판정의 재료.
        buyer_baskets: dict[int, set] = {}
        for r in rows:
            buyer_baskets.setdefault(r["member_id"], set()).add(r["basket_id"])
        uniq = len(buyer_baskets)
        # 서로 다른 바스켓 2개 이상 = 다른 날 또 산 사람. sum(조건 for …)은
        # True를 1로 세는 관용구(True는 산술에서 1이다).
        repeat = sum(len(b) >= 2 for b in buyer_baskets.values())
        events = [e for e in mock_data.CONSUMER_EVENTS
                  if e.get("sku_id") == sku and _in_window(e["occurred_at"], 30)]
        items.append({
            "sku_id": sku, "name": p["name"] if p else None,
            "sales_qty_30d": sum(r["qty"] for r in rows if _in_window(r["purchased_at"], 30)),
            "sales_qty_total": sum(r["qty"] for r in rows),
            "cart_add_count_30d": sum(e["event_type"] == "SCAN_ADD" for e in events),
            "view_count_30d": sum(e["event_type"] == "VIEW" for e in events),
            "unique_buyer_count": uniq,
            "repeat_buyer_count": repeat,
            # 구매자가 0명일 때 0으로 나누면 ZeroDivisionError로 죽는다 —
            # 지표 없음은 오류가 아니라 값(0.0)으로 돌려준다.
            "repurchase_rate_pct": round(repeat / uniq * 100, 2) if uniq else 0.0,
        })
    return {"window_days": 30, "items": items}


def compare_purchase_popularity(sku_ids: list[int], lookback_days: int = 90) -> dict:
    """상품 몇 개의 판매 실적을 나란히 — 'A랑 B 중 뭐가 더 많이 팔려?'의 근거.

    [출력] {"lookback_days": N, "items": [{sku_id, name, total_qty,
            purchaser_count}, …]} — **purchaser_count 내림차순으로 정렬해서** 준다.
    정렬을 여기서 끝내는 이유(ai-server의 원칙 인수): LLM이 숫자를 눈대중으로
    비교하다 순서를 뒤집는 사고를 막는다. LLM은 1등이 누군지 '읽기만' 한다.
    인기의 기준이 판매 수량이 아니라 구매자 수인 이유: 한 명이 40개 산 상품보다
    스무 명이 하나씩 산 상품이 "많이들 사는" 상품이다.
    """
    if not config.USE_MOCK_SOT:
        rows = _http_get(_API["compare_popularity"],
                         {"skuIds": sku_ids, "lookbackDays": lookback_days},
                         headers=_internal_headers())
        items = [{"sku_id": r.get("skuId"), "name": r.get("productName"),
                  "total_qty": r.get("totalQty"), "purchaser_count": r.get("purchaserCount")}
                 for r in (rows if isinstance(rows, list) else rows.get("items", []))]
    else:
        items = []
        for sku in sku_ids:
            rows = [r for r in mock_data.PURCHASES
                    if r["sku_id"] == sku and _in_window(r["purchased_at"], lookback_days)]
            p = mock_data.PRODUCTS.get(sku)
            items.append({"sku_id": sku, "name": p["name"] if p else None,
                          "total_qty": sum(r["qty"] for r in rows),
                          "purchaser_count": len({r["member_id"] for r in rows})})
    # `x["purchaser_count"] or 0`: 실물이 null을 줄 수 있는데 None끼리는 비교가
    # 안 되어 정렬이 죽는다. None이면 0으로 취급하는 방어.
    items.sort(key=lambda x: x["purchaser_count"] or 0, reverse=True)
    return {"lookback_days": lookback_days, "items": items}


def get_popular_products(category_l2: str | None = None,
                         lookback_days: int = 90, limit: int = 10) -> dict:
    """카테고리(또는 전체) 인기 순위 — '요즘 뭐가 잘 나가?'의 근거.

    [출력] compare_purchase_popularity와 같은 모양(같은 질문의 '순위판'이므로).
    ⚠ 실물 경로 /internal/purchases/popular는 **백엔드에 아직 없다**(공개판
    /api/purchases/popular는 JWT 필수라 서버 대 서버로 못 부른다). jmy에게
    내부판 신설을 요청해 둔 상태 — 그 전에 실물 모드로 부르면 404가 나고,
    query.py의 예외 처리(원칙 ④)가 이를 값으로 바꿔 LLM이 정직하게 착지한다.
    """
    if not config.USE_MOCK_SOT:
        rows = _http_get(_API["get_popular"],
                         {"categoryL2": category_l2, "lookbackDays": lookback_days,
                          "limit": limit},
                         headers=_internal_headers())
        items = [{"sku_id": r.get("skuId"), "name": r.get("productName"),
                  "total_qty": r.get("totalQty"), "purchaser_count": r.get("purchaserCount")}
                 for r in (rows if isinstance(rows, list) else rows.get("items", []))]
        return {"lookback_days": lookback_days, "category_l2": category_l2, "items": items}

    # mock: 창 안의 구매를 sku별로 모은 뒤, 카테고리 조건을 걸러 순위를 만든다.
    stats: dict[int, dict] = {}
    for r in mock_data.PURCHASES:
        if not _in_window(r["purchased_at"], lookback_days):
            continue
        p = mock_data.PRODUCTS.get(r["sku_id"])
        if p is None or (category_l2 and p["category_l2"] != category_l2):
            continue
        s = stats.setdefault(r["sku_id"], {"sku_id": r["sku_id"], "name": p["name"],
                                           "total_qty": 0, "buyers": set()})
        s["total_qty"] += r["qty"]
        s["buyers"].add(r["member_id"])
    items = [{"sku_id": s["sku_id"], "name": s["name"], "total_qty": s["total_qty"],
              "purchaser_count": len(s["buyers"])} for s in stats.values()]
    items.sort(key=lambda x: x["purchaser_count"], reverse=True)
    return {"lookback_days": lookback_days, "category_l2": category_l2,
            "items": items[:limit]}


def get_alternative_candidates(sku_id: int, limit: int = 8) -> list[dict]:
    """대체 후보의 원료 — 같은 소분류 + 비슷한 가격대의 상품들.

    후보를 '만드는' 곳이지 '고르는' 곳이 아니다. 순위 매기기(행사·개인 이력·
    지표 가중)는 계산 도구 find_substitutes(tools/compute.py)의 몫 — 이 분리가
    있어야 실물 전환 시 후보 생성만 백엔드로 넘어가고 정렬 로직은 그대로 남는다.
    """
    if not config.USE_MOCK_SOT:
        rows = _http_get(_API["get_alt_candidates"].format(sku_id=sku_id),
                         {"limit": limit})
        return [{"sku_id": r.get("skuId"), "name": r.get("name"), "brand": r.get("brand"),
                 "price_krw": r.get("priceKrw"), "category_l2": r.get("categoryL2"),
                 "lifecycle_status": r.get("lifecycleStatus")}
                for r in (rows if isinstance(rows, list) else rows.get("items", []))]

    org = mock_data.PRODUCTS.get(sku_id)
    if org is None:
        return []
    out = []
    for p in mock_data.PRODUCTS.values():
        if p["sku_id"] == sku_id or p["category_l2"] != org["category_l2"]:
            continue
        # 가격대 ±60%: 1L 우유의 대체로 10배짜리 선물세트가 오르지 못하게 하는
        # 느슨한 울타리. 규격 정합(1L vs 200ml)은 08/27의 규격 파서 몫이라
        # 여기서는 가격으로만 거른다 — 후보는 넓게, 최종 판단은 계산 도구에서.
        if not (org["price_krw"] * 0.4 <= p["price_krw"] <= org["price_krw"] * 1.6):
            continue
        out.append(p)
    # 원상품과 가격이 가까운 순 — abs(차이)는 방향(더 싸다/비싸다)을 지운 거리.
    out.sort(key=lambda p: abs(p["price_krw"] - org["price_krw"]))
    return out[:limit]


def get_current_prices(sku_ids: list[int]) -> dict:
    """sku별 '지금 실제로 내는 값' — {sku: {regular, discount, final, on_promo}}.

    가격 비교(compare_products)·조합(optimize_bundle)의 공용 재료다.
    행사가 반영을 SoT 층에서 끝내는 이유: 정가로 비교하면 지금 행사 중이라
    실제로 더 싼 상품을 놓친다(ai-server가 실호출로 겪고 프롬프트에 박았던
    함정). 그 판정을 도구마다 반복하게 두면 하나쯤 정가로 비교하는 놈이 생긴다.
    """
    if not config.USE_MOCK_SOT:
        rows = _http_get(_API["get_products_by_skus"], {"skuIds": sku_ids})
        out = {}
        for r in rows:
            sku = r.get("skuId")
            regular = r.get("priceKrw")
            # dict.get(키, 기본값)의 기본값 자리에 다른 키의 값을 넣는 관용구 —
            # 백엔드가 finalPriceKrw를 안 실어주면 정가를 실판매가로 취급한다.
            final = r.get("finalPriceKrw", regular)
            out[sku] = {"regular": regular, "final": final,
                        "discount": r.get("discountKrw", 0),
                        "on_promo": bool(r.get("onPromo", False))}
        return out

    # mock: 지금(DEMO_NOW) 활성인 행사에서 sku별 할인액을 찾는다.
    active = {p["sku_id"]: p["discount_krw"] for p in mock_data.PROMOTIONS
              if _parse_ms(p["starts_at"]) <= config.DEMO_NOW <= _parse_ms(p["ends_at"])}
    out = {}
    for sku in sku_ids:
        p = mock_data.PRODUCTS.get(sku)
        if p is None:
            continue
        disc = active.get(sku, 0)
        out[sku] = {"regular": p["price_krw"], "discount": disc,
                    "final": p["price_krw"] - disc, "on_promo": sku in active}
    return out


def resolve_location(location_id: str) -> dict | None:
    """location_id → {floor_no, x, y}. 동선 계산의 출발점 해석용(mock 전용).

    실물 모드에서 None을 돌려주는 이유: 실물의 출발점은 location_id가 아니라
    get_position이 주는 사람의 좌표 3종이다 — 매대 id로 사람 위치를 흉내내는 건
    mock에서만 허용되는 근사다. compute.py가 None을 받으면 좌표를 요구하는
    오류를 값으로 돌려 LLM이 get_position부터 부르게 유도한다.
    """
    if not config.USE_MOCK_SOT:
        return None
    loc = mock_data.LOCATIONS.get(location_id)
    if loc is None:
        return None
    return {"floor_no": loc["floor_no"], "x": loc["x"], "y": loc["y"]}


def get_navigation_route(start_floor: int, start_x: int, start_y: int,
                         stops: list[dict]) -> dict:
    """백엔드 A* 경로 계산기 호출 — 동선 계산(optimize_route)의 실물 비용 원천.

    stops = [{"skuId": 101042, "label": "물티슈"}, …]. **순서를 바꾸지 않는다** —
    방문 순서는 우리 솔버(compute.py)가 정하고, 백엔드는 그 순서의 실제 보행
    경로(장애물·무빙워크 반영)와 거리만 계산한다. 역할 분담: 순서는 최적화
    문제(우리 몫), 경로는 지도 문제(지도를 가진 백엔드 몫).

    mock 모드에서 부르면 즉시 예외 — compute.py가 mock에서는 좌표 휴리스틱을
    쓰기로 되어 있어, 여기 도달한 것 자체가 분기 버그다. 조용히 빈 값을 주면
    그 버그가 "경로 없음"으로 위장되므로 시끄럽게 죽는 쪽을 고른다.
    """
    if config.USE_MOCK_SOT:
        raise RuntimeError("mock 모드에서는 백엔드 경로 계산을 부르지 않는다 (compute.py의 분기 버그)")
    return _http_post(_API["navigation_route"], {
        "startFloor": int(start_floor), "startX": int(start_x), "startY": int(start_y),
        "stops": stops,
    })


def push_proactive_message(session_id: str, content: str) -> dict:
    """자발형 발화를 백엔드에 전달한다 — 저장·프론트 SSE 중계는 백엔드가 한다.

    [경로] 감시자 → (예절·가드 통과한) 문장 → 여기 → POST /internal/chat/proactive
           → 백엔드가 chat_message 저장 + /api/realtime/stream으로 프론트에 밀어줌.
    ⚠ 백엔드 제약(ai-server PROACTIVE_README에서 인수): 그 sessionId의
    chat_session이 이미 있어야 저장된다. 프론트가 장보기 세션 시작 때 채팅
    세션을 만들어 두는 흐름이 전제다.

    [mock] 네트워크 없이 print로 흘리고 성공 모양을 돌려준다 — 감시자·예절·
    가드의 오프라인 스모크가 이 지점까지 실제 코드로 통과할 수 있게.
    """
    if config.USE_MOCK_SOT:
        print(f"[proactive:mock] session={session_id} :: {content}")
        return {"ok": True, "mock": True}
    return _http_post(_API["push_proactive"],
                      {"sessionId": session_id, "content": content},
                      headers=_internal_headers())
