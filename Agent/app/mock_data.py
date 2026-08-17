# ============================================================================
# Agent의 mock 세계 — sample_rows_v2.sql과 "동일 값" (실행계획 ④)
# ============================================================================
# 이 파일의 존재 이유는 편의가 아니라 **검증 가능성**이다:
#   mock의 값 == 샘플 SQL의 값  →  백엔드 연동으로 스위치를 올렸을 때
#   같은 질문에 같은 답이 나와야 하고, 다르면 연동 버그다. 값이 다르면
#   "mock이라 달랐나?"라는 핑계가 생겨 버그가 숨는다.
# 그래서 여기 값을 수정할 때는 반드시 sample_rows_v2.sql을 먼저 고치고
# 그대로 옮긴다(단일 소스는 SQL 쪽이다).
#
# 킬링 장면 3개가 그대로 들어 있다:
#   장면 1  물티슈A(101042) 매대 0 + 위 BULK 40 + 보충 사이클 832초
#   장면 2  세제 2종(102301/102302) 재스캔·취소 망설임 시퀀스
#   장면 3  회원 9001의 물티슈 반복 구매(마지막 6/28, 46일 경과) + 커피 자리 이동
# ============================================================================

# ── 상품 (sample §4) ────────────────────────────────────────────────────────
# dict의 키를 sku_id로 두는 이유: 도구의 접근 패턴이 전부 "sku로 찾기"다.
# 리스트 + 순회로 두면 코드가 돌지만, 접근 패턴과 자료구조가 어긋난 설계다.
PRODUCTS = {
    101042: {"sku_id": 101042, "barcode": "8801234500011",
             "name": "아기 물티슈 캡형 100매 9입", "brand": "브랜드A", "is_pb": False,
             "category_l1": "생활용품", "category_l2": "위생용품",
             "is_refrigerated": False, "is_frozen": False, "is_alcohol": False, "is_fresh": False,
             "unit": "count_sheet", "price_krw": 12900,
             "spec": {"raw": "900매 (100매 x 9입)",
                      "quantity": {"primary": "count_sheet", "value": 900, "alt": {"count_pack": 9}},
                      "quality": {"form": "sheet", "ply": 2}},
             "spec_raw": "900매 (100매 × 9입)", "image_url": "/img/101042.webp",
             "first_stocked_at": "2026-03-02", "lifecycle_status": "ACTIVE"},
    101043: {"sku_id": 101043, "barcode": "8801234500028",
             "name": "아기 물티슈 리필 100매 6입", "brand": "브랜드B", "is_pb": False,
             "category_l1": "생활용품", "category_l2": "위생용품",
             "is_refrigerated": False, "is_frozen": False, "is_alcohol": False, "is_fresh": False,
             "unit": "count_sheet", "price_krw": 7900,
             "spec": {"raw": "600매 (100매 x 6입)",
                      "quantity": {"primary": "count_sheet", "value": 600, "alt": {"count_pack": 6}},
                      "quality": {"form": "sheet", "ply": 2}},
             "spec_raw": "600매 (100매 × 6입)", "image_url": "/img/101043.webp",
             "first_stocked_at": "2026-03-02", "lifecycle_status": "ACTIVE"},
    102301: {"sku_id": 102301, "barcode": "8801234500035",
             "name": "실속형 액체세제 9L", "brand": "PB스토어플로우", "is_pb": True,
             "category_l1": "생활용품", "category_l2": "세탁세제",
             "is_refrigerated": False, "is_frozen": False, "is_alcohol": False, "is_fresh": False,
             "unit": "volume_ml", "price_krw": 18900,
             "spec": {"raw": "9,000ml (1.5L x 6입)",
                      "quantity": {"primary": "volume_ml", "value": 9000, "alt": {"count_pack": 6}},
                      "quality": {"form": "liquid"},
                      "usage": {"unit": "회", "per_use": 15, "servings": 600}},
             "spec_raw": "9,000ml (1.5L × 6입)", "image_url": "/img/102301.webp",
             "first_stocked_at": "2026-01-15", "lifecycle_status": "ACTIVE"},
    102302: {"sku_id": 102302, "barcode": "8801234500042",
             "name": "고농축 액체세제 4L", "brand": "브랜드C", "is_pb": False,
             "category_l1": "생활용품", "category_l2": "세탁세제",
             "is_refrigerated": False, "is_frozen": False, "is_alcohol": False, "is_fresh": False,
             "unit": "volume_ml", "price_krw": 14900,
             "spec": {"raw": "4,000ml (2L x 2입)",
                      "quantity": {"primary": "volume_ml", "value": 4000, "alt": {"count_pack": 2}},
                      "quality": {"form": "liquid"},
                      "usage": {"unit": "회", "per_use": 8, "servings": 500}},
             "spec_raw": "4,000ml (2L × 2입)", "image_url": "/img/102302.webp",
             "first_stocked_at": "2026-06-20", "lifecycle_status": "ACTIVE"},
    103877: {"sku_id": 103877, "barcode": "8801234500059",
             "name": "원두 커피 홀빈 1kg", "brand": "브랜드D", "is_pb": False,
             "category_l1": "음료·주류", "category_l2": "커피·차",
             "is_refrigerated": False, "is_frozen": False, "is_alcohol": False, "is_fresh": False,
             "unit": "weight_g", "price_krw": 24900,
             "spec": {"raw": "1,000g", "quantity": {"primary": "weight_g", "value": 1000}},
             "spec_raw": "1,000g", "image_url": "/img/103877.webp",
             "first_stocked_at": "2025-11-04", "lifecycle_status": "DISCONTINUED"},
    103902: {"sku_id": 103902, "barcode": "8801234500066",
             "name": "원두 커피 홀빈 900g", "brand": "브랜드D", "is_pb": False,
             "category_l1": "음료·주류", "category_l2": "커피·차",
             "is_refrigerated": False, "is_frozen": False, "is_alcohol": False, "is_fresh": False,
             "unit": "weight_g", "price_krw": 22900,
             "spec": {"raw": "900g", "quantity": {"primary": "weight_g", "value": 900}},
             "spec_raw": "900g", "image_url": "/img/103902.webp",
             "first_stocked_at": "2026-08-10", "lifecycle_status": "ACTIVE"},
}

# ── 로케이션 (sample §2) ─────────────────────────────────────────────────────
LOCATIONS = {
    "F2-B-R01-B05-L2": {"zone_id": "F2-B", "tier_role": "PICK", "floor_no": 2, "x": 7,  "y": 15},
    "F2-B-R01-B05-L5": {"zone_id": "F2-B", "tier_role": "BULK", "floor_no": 2, "x": 7,  "y": 15},
    "F2-B-R01-B06-L2": {"zone_id": "F2-B", "tier_role": "PICK", "floor_no": 2, "x": 8,  "y": 15},
    "F2-B-R01-B06-L5": {"zone_id": "F2-B", "tier_role": "BULK", "floor_no": 2, "x": 8,  "y": 15},
    "F2-B-R01-B19-L2": {"zone_id": "F2-B", "tier_role": "PICK", "floor_no": 2, "x": 7,  "y": 16},
    "F2-A-R01-B03-L1": {"zone_id": "F2-A", "tier_role": "PICK", "floor_no": 2, "x": 5,  "y": 26},
    "F2-A-R01-B04-L1": {"zone_id": "F2-A", "tier_role": "PICK", "floor_no": 2, "x": 6,  "y": 26},
    "F1-H-R01-B03-L1": {"zone_id": "F1-H", "tier_role": "PICK", "floor_no": 1, "x": 36, "y": 26},
    "F1-H-R03-B05-L1": {"zone_id": "F1-H", "tier_role": "PICK", "floor_no": 1, "x": 44, "y": 26},
    "F2-W-R01-B01-L1": {"zone_id": "F2-W", "tier_role": "BULK", "floor_no": 2, "x": 6,  "y": 38},
    "B1-W-R01-B01-L1": {"zone_id": "B1-W", "tier_role": "BULK", "floor_no": 0, "x": 20, "y": 20},
}

# ── 재고 (sample §5) — 장면 1의 물리적 근거 ─────────────────────────────────
# (sku_id, location_id) → qty. 물티슈A의 PICK 0 + BULK 40이 "없습니다"가 아니라
# "약 N분 뒤 채워집니다"라고 답할 수 있는 근거다.
STOCKS = {
    (101042, "F2-B-R01-B05-L2"):   0,
    (101042, "F2-B-R01-B05-L5"):  40,
    (101043, "F2-B-R01-B06-L2"):  18,
    (101043, "F2-B-R01-B06-L5"):  36,
    (102301, "F2-A-R01-B03-L1"):  12,
    (102302, "F2-A-R01-B04-L1"):   9,
    (103902, "F1-H-R03-B05-L1"):  24,
    (101042, "F2-W-R01-B01-L1"): 120,
    (101043, "B1-W-R01-B01-L1"): 400,
}

# ── 매대 설정 (sample §6) ────────────────────────────────────────────────────
SHELF_CONFIGS = {
    (101042, "F2-B-R01-B05-L2"): {"min_qty": 8, "replenish_to_qty": 24, "capacity_qty": 40},
    (101043, "F2-B-R01-B06-L2"): {"min_qty": 6, "replenish_to_qty": 20, "capacity_qty": 36},
    (102301, "F2-A-R01-B03-L1"): {"min_qty": 4, "replenish_to_qty": 16, "capacity_qty": 24},
    (102302, "F2-A-R01-B04-L1"): {"min_qty": 4, "replenish_to_qty": 16, "capacity_qty": 24},
    (103902, "F1-H-R03-B05-L1"): {"min_qty": 6, "replenish_to_qty": 24, "capacity_qty": 36},
}

# ── 행사 (sample §7) ─────────────────────────────────────────────────────────
PROMOTIONS = [
    {"sku_id": 101043, "promo_type": "DISCOUNT", "discount_krw": 1000,
     "starts_at": "2026-08-10 00:00:00.000", "ends_at": "2026-08-20 23:59:59.999"},
]

# ── 회원·구매 이력 (sample §8) — 장면 3의 근거 ──────────────────────────────
MEMBERS = {
    9001: {"persona_type": "4인가족", "household_size": 4},
    9002: {"persona_type": "1인자취", "household_size": 1},
}

# 회원 9001이 물티슈A를 3/8 → 4/19 → 5/31 → 6/28 네 번 = 평균 주기 약 37일.
# DEMO_NOW(8/13)는 마지막 구매로부터 46일 → "살 때 되셨어요"가 성립하는 수치다.
PURCHASES = [
    {"basket_id": "bskt-0001", "member_id": 9001, "sku_id": 101042, "qty": 1,
     "unit_price_krw": 13900, "purchased_at": "2026-03-08 15:22:41.000"},
    {"basket_id": "bskt-0001", "member_id": 9001, "sku_id": 102301, "qty": 1,
     "unit_price_krw": 18900, "purchased_at": "2026-03-08 15:22:41.000"},
    {"basket_id": "bskt-0002", "member_id": 9001, "sku_id": 101042, "qty": 1,
     "unit_price_krw": 13900, "purchased_at": "2026-04-19 14:05:12.000"},
    {"basket_id": "bskt-0003", "member_id": 9001, "sku_id": 101042, "qty": 1,
     "unit_price_krw": 12900, "purchased_at": "2026-05-31 16:40:03.000"},
    {"basket_id": "bskt-0003", "member_id": 9001, "sku_id": 103877, "qty": 1,
     "unit_price_krw": 24900, "purchased_at": "2026-05-31 16:40:03.000"},  # 지금은 단종
    {"basket_id": "bskt-0004", "member_id": 9001, "sku_id": 101042, "qty": 1,
     "unit_price_krw": 12900, "purchased_at": "2026-06-28 11:12:55.000"},
    {"basket_id": "bskt-0005", "member_id": 9002, "sku_id": 101043, "qty": 2,
     "unit_price_krw": 7900, "purchased_at": "2026-07-05 20:31:09.000"},
]

WISHLISTS = [
    {"member_id": 9001, "sku_id": 101042, "added_at": "2026-08-12 21:03:00.000"},
]

# ── 매대 이벤트 (sample §9) — 장면 1 보충 사이클 ────────────────────────────
# 리드타임 = ITEM_CONFIRMED(14:16:02.900) − BELOW_PAR(14:02:10.320) = 832초.
# 밀리초까지 문자열 그대로 둔 이유: 파싱해 초로 뭉개는 순간 SQL과의 대조가
# 불가능해진다. 시간 계산은 쓰는 쪽(도구)이 한다.
SHELF_EVENTS = [
    {"event_type": "SALE",           "sku_id": 101042, "location_id": "F2-B-R01-B05-L2",
     "qty": 2,    "task_id": None,     "occurred_at": "2026-08-13 14:02:10.100", "payload": None},
    {"event_type": "BELOW_PAR",      "sku_id": 101042, "location_id": "F2-B-R01-B05-L2",
     "qty": None, "task_id": "T-8842", "occurred_at": "2026-08-13 14:02:10.320",
     "payload": {"old_qty": 8, "new_qty": 6, "min_qty": 8}},
    {"event_type": "TASK_QUEUED",    "sku_id": 101042, "location_id": "F2-B-R01-B05-L2",
     "qty": None, "task_id": "T-8842", "occurred_at": "2026-08-13 14:02:45.000",
     "payload": {"path": "VERTICAL", "from": "F2-B-R01-B05-L5"}},
    {"event_type": "TASK_STARTED",   "sku_id": 101042, "location_id": "F2-B-R01-B05-L2",
     "qty": None, "task_id": "T-8842", "occurred_at": "2026-08-13 14:09:30.500",
     "payload": {"worker": "npc-03"}},
    {"event_type": "STOCKOUT",       "sku_id": 101042, "location_id": "F2-B-R01-B05-L2",
     "qty": 0,    "task_id": "T-8842", "occurred_at": "2026-08-13 14:14:58.700", "payload": None},
    {"event_type": "ITEM_CONFIRMED", "sku_id": 101042, "location_id": "F2-B-R01-B05-L2",
     "qty": 24,   "task_id": "T-8842", "occurred_at": "2026-08-13 14:16:02.900", "payload": None},
    {"event_type": "MOVE",           "sku_id": 103902, "location_id": "F1-H-R03-B05-L1",
     "qty": None, "task_id": None,     "occurred_at": "2026-08-13 09:15:00.000",
     "payload": {"prev_location_id": "F1-H-R01-B03-L1", "reason": "SEASONAL_RESET"}},
    {"event_type": "RESTOCK_IN",     "sku_id": 101042, "location_id": "F2-W-R01-B01-L1",
     "qty": 120,  "task_id": None,     "occurred_at": "2026-08-13 08:40:12.000", "payload": None},
]

# ── 소비자 행동 이벤트 (sample §10) — 장면 2 망설임 ─────────────────────────
CONSUMER_EVENTS = [
    {"event_type": "SEARCH",      "session_id": "sess-7f3a9c", "member_id": 9001,
     "sku_id": None,   "location_id": None,              "occurred_at": "2026-08-13 13:58:02.000",
     "payload": {"q": "물티슈 어디 있어요?"}},
    {"event_type": "SCAN_ADD",    "session_id": "sess-7f3a9c", "member_id": 9001,
     "sku_id": 102301, "location_id": "F2-A-R01-B03-L1", "occurred_at": "2026-08-13 14:01:33.200",
     "payload": None},
    {"event_type": "SCAN_REMOVE", "session_id": "sess-7f3a9c", "member_id": 9001,
     "sku_id": 102301, "location_id": None,              "occurred_at": "2026-08-13 14:01:52.700",
     "payload": None},
    {"event_type": "SCAN_ADD",    "session_id": "sess-7f3a9c", "member_id": 9001,
     "sku_id": 102302, "location_id": "F2-A-R01-B04-L1", "occurred_at": "2026-08-13 14:02:11.050",
     "payload": None},
    {"event_type": "SCAN_REMOVE", "session_id": "sess-7f3a9c", "member_id": 9001,
     "sku_id": 102302, "location_id": None,              "occurred_at": "2026-08-13 14:02:29.400",
     "payload": None},
    {"event_type": "VIEW",        "session_id": "sess-7f3a9c", "member_id": 9001,
     "sku_id": 102301, "location_id": None,              "occurred_at": "2026-08-13 14:02:40.000",
     "payload": None},
    {"event_type": "SCAN_ADD",    "session_id": "sess-7f3a9c", "member_id": 9001,
     "sku_id": 102301, "location_id": "F2-A-R01-B03-L1", "occurred_at": "2026-08-13 14:03:58.900",
     "payload": None},
    {"event_type": "PURCHASE",    "session_id": "sess-7f3a9c", "member_id": 9001,
     "sku_id": 102301, "location_id": None,              "occurred_at": "2026-08-13 14:31:00.000",
     "payload": {"basket_id": "bskt-0006", "total_krw": 18900}},
    {"event_type": "SEARCH",      "session_id": "sess-anon-01", "member_id": None,
     "sku_id": None,   "location_id": None,              "occurred_at": "2026-08-13 15:10:00.000",
     "payload": {"q": "세제"}},
    {"event_type": "SCAN_ADD",    "session_id": "sess-anon-01", "member_id": None,
     "sku_id": 101043, "location_id": "F2-B-R01-B06-L2", "occurred_at": "2026-08-13 15:12:30.000",
     "payload": None},
]
