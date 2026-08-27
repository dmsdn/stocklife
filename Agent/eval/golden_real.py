# ============================================================================
# 실물 골든셋 — 백엔드·DB에 붙은 상태로 채점한다 (2026-08-27 신설)
# ============================================================================
# [왜 golden_set.py 와 따로 있나]
#   기존 골든셋은 **mock 세계 전용**이다 — sku 101042(물티슈) 대역, 12,900원,
#   "인기 1위=물티슈" 같은 mock 숫자가 기대값에 박혀 있다. 실물 DB는 200000
#   대역이라 그대로 돌리면 전멸한다.
#   그렇다고 갈아엎으면 **백엔드 없이 도는 유일한 검증 경로**가 사라진다
#   (개발 중·오프라인·CI). 그래서 둘을 나란히 둔다:
#       golden_set.py    mock 회귀 — 로직·발화 규율 (백엔드 불필요)
#       golden_real.py   실물 회귀 — 계약·연동·세계 정합 (백엔드 필요)
#
# [⚠ 이 파일의 설계 원칙 — mock 골든셋이 깨진 이유를 반복하지 않는다]
#   mock 판이 깨진 원인은 **세계의 값을 케이스에 하드코딩**한 것이다.
#   그런데 이 세계도 곧 바뀐다 — DES 설계 §10의 세계 버전 대조(v2~v5)가
#   09/06 이후에 예정돼 있고, 그때 재고·이력·인기 순위가 **전부 달라진다.**
#   같은 실수를 하면 이 파일도 그날 죽는다.
#
#   그래서 두 층으로 나눈다:
#     ① 불변(카탈로그)  sku_id · 상품명 · 정가 — 결정적 생성물이라 세계 버전과
#                       무관하다. 케이스에 적어도 안전하다.
#     ② 가변(세계 상태) 재고·큐·이력·인기 — **적지 않는다.** 실행 시각에
#                       `fixtures()` 가 SoT 에서 뽑아 기대값을 만든다.
#
#   즉 이 파일은 "값"이 아니라 **"성질"**을 적는다:
#     ✗ "매대 0, 예비 135개인 sku 200032 를 물으면 '135'가 나와야 한다"
#     ✓ "매대 0 + 예비 있음인 아무 상품이나 물으면 품절이라 하지 않고
#        보충을 말해야 한다"
#
# [실행]  Agent/ 에서
#     python -m eval.runner --real            전체
#     python -m eval.runner --real --only real_scene1
#   ⚠ 선행: 백엔드 8080 기동 + `.env` 의 USE_MOCK_SOT=false + 시드 적재.
#     `python backend_probe.py` 가 "전환 가능"이어야 한다.
# ============================================================================
from __future__ import annotations


# ── 고정 재료 — 카탈로그는 결정적이라 세계 버전이 바뀌어도 그대로다 ──────────
# (`catalog.py` 는 append-only 이고 sku_id 는 품목×10+변형으로 결정된다)
SKU_IN_STOCK = 202233          # 쿡프리즈 라자냐 700g — 매대에 재고가 있는 쪽
MEMBER_WITH_HISTORY = 1005     # 데모 슬라이스 30명 중 하나(이력 33건)
MEMBER_NONE = None             # 비회원


def fixtures(sot) -> dict:
    """실행 시각에 SoT 를 읽어 **케이스가 쓸 재료**를 만든다.

    [왜 함수인가] 세계 상태(재고·큐·이력·인기)는 DES 를 다시 돌리면 바뀐다.
      케이스에 값을 박으면 §10 세계 버전 대조에서 이 파일이 통째로 죽는다.
      실행할 때마다 **지금 세계에서** 조건에 맞는 상품을 찾아 쓴다.

    [반환] {"restock_name": str|None, "in_stock_name": str, "top_name": str|None,
            "repeat_name": str|None}
      None 이면 그 조건을 만족하는 재료가 세계에 없다는 뜻 — 러너가 케이스를
      **건너뛰고 SKIP 으로 표시**한다(FAIL 이 아니다. 세계 탓이지 코드 탓이 아니다).

    [부작용] 없다. 읽기만 한다.
    """
    f = {}

    # ① 장면 1 재료 — 매대 0 + 예비 있음 + 대기 원점 있음
    #    셋을 다 만족해야 "곧 채워진다"가 사실이 된다. 하나라도 없으면
    #    그 발화가 거짓이 되므로 케이스 자체가 성립하지 않는다.
    f["restock_name"] = None
    for row in (sot.get_pending_replenishments() or [])[:300]:
        if not (row.get("queued_at") and row.get("has_bulk")):
            continue
        inv = sot.get_inventory(row["sku_id"]) or {}
        locs = inv.get("locations") or []
        pick = next((L for L in locs if L.get("tier_role") == "PICK"), None)
        bulk = next((L for L in locs if L.get("tier_role") == "BULK"), None)
        if pick and bulk and pick.get("qty") == 0 and (bulk.get("qty") or 0) > 0:
            p = sot.get_product(row["sku_id"]) or {}
            if p.get("name"):
                f["restock_name"] = p["name"]
                break

    # ② 재고 있는 상품 — 위치 안내용
    p = sot.get_product(SKU_IN_STOCK) or {}
    f["in_stock_name"] = p.get("name")
    f["in_stock_price"] = p.get("final_price_krw") or p.get("price_krw")

    # ③ 인기 1위 — 집계는 백엔드가 한다
    items = (sot.get_popular_products(limit=1) or {}).get("items") or []
    f["top_name"] = items[0]["name"] if items else None

    # ④ 그 회원이 **두 번 이상** 산 상품 — 재구매 질문의 재료
    f["repeat_name"] = None
    hist = sot.get_purchase_history(MEMBER_WITH_HISTORY) or []
    seen = {}
    for h in hist:
        seen[h["sku_id"]] = seen.get(h["sku_id"], 0) + 1
    rep = [s for s, n in seen.items() if n >= 2]
    if rep:
        p = sot.get_product(rep[0]) or {}
        f["repeat_name"] = p.get("name")
    return f


def build(f: dict) -> list[dict]:
    """재료로 케이스를 조립한다. 계약은 golden_set.py 와 같다(러너 공용).

    `needs` 칸이 추가됐다 — 그 재료가 None 이면 러너가 SKIP 한다.
    """
    return [
        # ── 킬링 장면 1 — 실물 큐 상태에서 재고 3분기가 서는가 ──────────────
        {"id": "real_scene1", "needs": "restock_name",
         "q": f"{f['restock_name']} 있어요?",
         "consumer_id": MEMBER_WITH_HISTORY, "session_id": "real-1",
         "expect_tools": ["search_products", "get_inventory"],
         "must_include": [("보충", "채워", "들어오", "입고", "예비", "다시")],
         "must_not_include": [r"품절", r"없습니다[.!]?\s*$"],
         "why": "실물 DB에서 매대 0 + 예비 있음인 상품. mock 과 달리 **큐 상태가"
                " 진짜다** — pending 창구·stock_sync 시점 정합이 여기서 검증된다"},

        # ── 재고 있음 → 위치를 사람 말로 ────────────────────────────────────
        {"id": "real_in_stock", "needs": "in_stock_name",
         "q": f"{f['in_stock_name']} 어디 있어요?",
         "consumer_id": MEMBER_WITH_HISTORY, "session_id": "real-2",
         "expect_tools": ["search_products", "get_inventory"],
         "must_include": [("1층", "F1")],
         "must_not_include": [r"품절", r"F1-H-R\d"],   # 코드 그대로 노출 금지
         "why": "위치는 사람 말로. location_id 를 그대로 읽으면 손님이 못 찾는다"},

        # ── 가격 정확성 — `_norm_product` 가 없으면 여기서 죽는다 ───────────
        {"id": "real_price", "needs": "in_stock_name",
         "q": f"{f['in_stock_name']} 얼마예요?",
         "consumer_id": MEMBER_NONE, "session_id": "real-3",
         "expect_tools": ["search_products"],
         "must_include": [(f"{f['in_stock_price']:,}", str(f['in_stock_price']))],
         "must_not_include": [r"약\s*\d[\d,]*원", r"만\s*\d천"],
         "why": "가격은 원 단위 그대로 — 08-27에 get_product 가 camelCase 를 흘려"
                "보내 price_krw 가 None 이던 버그를 이 케이스가 잡는다"},

        # ── 이력 기반 — 요청 ④ history API 가 붙었는가 ──────────────────────
        {"id": "real_repurchase", "needs": "repeat_name",
         "q": f"{f['repeat_name']} 다시 살 때 됐나요?",
         "consumer_id": MEMBER_WITH_HISTORY, "session_id": "real-4",
         "expect_tools": ["get_purchase_history"],
         "must_include": [],
         "must_not_include": [r"이력이 없|구매 기록이 없|처음 (구매|사)"],
         "why": "실제로 2회 이상 산 상품이다. '이력 없음'이 나오면 history 창구가"
                " 안 붙은 것(memberId vs consumerId 함정 포함)"},

        # ── 인기 — 집계를 지어내지도 회피하지도 않는가 ──────────────────────
        {"id": "real_popular", "needs": "top_name",
         "q": "요즘 뭐가 잘 나가요?",
         "consumer_id": MEMBER_WITH_HISTORY, "session_id": "real-5",
         "expect_tools": ["get_popular_products"],
         "must_include": [(f["top_name"],)],
         "must_not_include": [r"확인이 어렵|모르겠|데이터가 없"],
         "why": "08-27에 categoryL2='' 를 보내 항상 0건이던 버그가 있었다."
                " 빈 배열을 '데이터 없음'으로 착지시키면 이 케이스가 잡는다"},

        # ── 취급 안 하는 것 — 없는 것을 지어내지 않는가 ─────────────────────
        {"id": "real_not_carried", "needs": None,
         "q": "여기 오토바이 헬멧 파나요?",
         "consumer_id": MEMBER_NONE, "session_id": "real-6",
         "expect_tools": ["search_products"],
         "must_include": [("취급", "없", "안 파", "판매하지")],
         "must_not_include": [r"\d층\s*[A-Z]구역", r"재고\s*\d+개"],
         "why": "카탈로그 5,000에 없는 품목. 위치·재고를 지어내면 안 된다"},

        # ── 범위 밖 — 무능이 아니라 범위로 ──────────────────────────────────
        {"id": "real_out_of_scope", "needs": None,
         "q": "주차장 몇 시까지 열어요?",
         "consumer_id": MEMBER_NONE, "session_id": "real-7",
         "expect_tools": [],
         "must_include": [("매장", "상품", "안내")],
         "must_not_include": [r"\d+시까지"],       # 모르는 운영 정보를 지어내지 않는다
         "why": "운영 정보는 우리 도구에 없다. 시간을 지어내면 손님이 헛걸음한다"},
    ]


# ── 자체 검산 — 골든셋 자신도 조용히 망가진다 ────────────────────────────────
_probe = build({"restock_name": "X", "in_stock_name": "Y", "in_stock_price": 1000,
                "top_name": "Z", "repeat_name": "W"})
_ids = [c["id"] for c in _probe]
assert len(set(_ids)) == len(_ids), "케이스 id 중복"
for _c in _probe:
    for _k in ("id", "q", "expect_tools", "must_include", "must_not_include",
               "why", "needs"):
        assert _k in _c, f"{_c.get('id', '?')}: {_k} 칸 누락"
