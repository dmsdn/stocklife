-- ============================================================================
-- StoreFlow 샘플 행 v2 — 스키마 v2.3 검증용 최소 데이터셋
-- ============================================================================
-- 목적: 스키마가 "돌아간다"가 아니라 **우리 기능이 실제로 성립한다**를 보이는 데이터.
--       그래서 무작위 더미가 아니라 킬링 장면 3개를 그대로 재현한다.
--         장면 1  품절이어도 답하기 → 보충 사이클(리드타임 832초) + 재고 전환
--         장면 2  망설임 개입     → 같은 소분류 재스캔·취소 시퀀스
--         장면 3  진입 브리핑     → 회원 구매 이력(소비주기) + 자리 이동(MOVE) + 입고 알림
--
-- 좌표·존 코드는 매장 도면(floormap_gen.py)과 동일 체계다.
--   F2-B = 2층 화장지·위생 구역 · R01 = 그 존의 1번 랙 · B05 = 5번 베이 · L2 = 2단
--   PICK(L1~L3)과 BULK(L4~L6)의 수직 페어는 level +3 (L2 ↔ L5)
--
-- 실행(스키마 적재 후):
--   docker exec -i storeflow_mysql mysql -uroot -p1234 --default-character-set=utf8mb4 <db> < sample_rows_v2.sql
-- ============================================================================

SET NAMES utf8mb4;

-- 재실행 대비 정리 (자식부터)
DELETE FROM consumer_events; DELETE FROM shelf_events; DELETE FROM wishlists;
DELETE FROM purchases; DELETE FROM promotions;   -- v2.4: price_histories 제거
DELETE FROM shelf_configs; DELETE FROM stocks; DELETE FROM map_cells;
DELETE FROM locations; DELETE FROM zones; DELETE FROM members; DELETE FROM products;

-- ── 1. 존 ────────────────────────────────────────────────────────────────
-- 판매 존 3 + 백룸 2. 백룸을 별도 테이블이 아니라 zone_type으로 구분하는 덕에
-- 보충 경로(수평·층간)가 "존 → 존 이동"으로 균일하게 표현된다.
INSERT INTO zones (zone_id, floor_no, name, zone_type) VALUES
 ('F2-B', 2, '화장지·위생 구역', 'SALES'),
 ('F2-A', 2, '세제·청소 구역',   'SALES'),
 ('F1-H', 1, '음료·주류 구역',   'SALES'),
 ('F2-W', 2, '2층 백룸',         'BACKROOM'),
 ('B1-W', 0, 'B1 중앙창고',      'BACKROOM');

-- ── 2. 로케이션 ──────────────────────────────────────────────────────────
-- 핵심 3가지가 이 표에 다 들어 있다.
--  (1) 수직 페어: 같은 베이의 L2(PICK)와 L5(BULK) — 좌표가 같다(레벨은 높이일 뿐)
--  (2) 랙 깊이 2셀: 앞면 베이(B05)는 y=15, 뒷면 베이(B19)는 y=16 — 접근 통로가 갈린다
--  (3) 보충 3분기의 원천: 같은 베이 위(수직) / F2-W(수평) / B1-W(층간)
INSERT INTO locations (location_id, zone_id, rack_no, bay_no, level_no, tier_role, floor_no, x, y) VALUES
 -- 물티슈A: PICK + 바로 위 BULK
 ('F2-B-R01-B05-L2', 'F2-B', 1,  5, 2, 'PICK', 2,  7, 15),
 ('F2-B-R01-B05-L5', 'F2-B', 1,  5, 5, 'BULK', 2,  7, 15),
 -- 물티슈B: 옆 베이 (단위가격 비교 대상)
 ('F2-B-R01-B06-L2', 'F2-B', 1,  6, 2, 'PICK', 2,  8, 15),
 ('F2-B-R01-B06-L5', 'F2-B', 1,  6, 5, 'BULK', 2,  8, 15),
 -- 같은 랙 뒷면 (깊이 2셀 → y가 하나 크다)
 ('F2-B-R01-B19-L2', 'F2-B', 1, 19, 2, 'PICK', 2,  7, 16),
 -- 세제 2종 (망설임 장면)
 ('F2-A-R01-B03-L1', 'F2-A', 1,  3, 1, 'PICK', 2,  5, 26),
 ('F2-A-R01-B04-L1', 'F2-A', 1,  4, 1, 'PICK', 2,  6, 26),
 -- 커피: 자리 이동(MOVE) 전/후
 ('F1-H-R01-B03-L1', 'F1-H', 1,  3, 1, 'PICK', 1, 36, 26),
 ('F1-H-R03-B05-L1', 'F1-H', 3,  5, 1, 'PICK', 1, 44, 26),
 -- 백룸·중앙창고
 ('F2-W-R01-B01-L1', 'F2-W', 1,  1, 1, 'BULK', 2,  6, 38),
 ('B1-W-R01-B01-L1', 'B1-W', 1,  1, 1, 'BULK', 0, 20, 20);

-- ── 3. 보행 격자 ─────────────────────────────────────────────────────────
-- 매대 셀은 통행 불가(passable=0), 통로 셀은 가능. transit_id가 같은 셀끼리
-- 층간 간선이 된다 — 무빙워크가 그래프에 들어가는 유일한 방법.
INSERT INTO map_cells (floor_no, x, y, passable, transit_id) VALUES
 (2,  7, 14, 1, NULL),   -- 물티슈 앞 통로 (앞면 접근)
 (2,  8, 14, 1, NULL),
 (2,  7, 15, 0, NULL),   -- 매대 자리
 (2,  7, 17, 1, NULL),   -- 랙 뒷면 통로 (뒷면 접근)
 (2,  5, 25, 1, NULL),   -- 세제 앞 통로
 (2, 53,  5, 1, 'MW-UP'),-- 무빙워크 상행 (2F 승강장)
 (1, 53,  5, 1, 'MW-UP'),-- 같은 transit_id = 1F↔2F 간선
 (1, 53, 10, 1, 'MW-DN');

-- ── 4. 상품 ──────────────────────────────────────────────────────────────
-- 물티슈 2종은 **단위가격 역전** 케이스다: 대용량(A)이 총액은 비싸지만 100매당
-- 단가는 오히려 B가 저렴 — 이 역전이 있어야 기능 13("어느 쪽이 이득?")이 의미를 갖는다.
--   A: 12,900원 / 900매 = 14.33원/매      B: 7,900원 / 600매 = 13.17원/매  ← B가 저렴
-- 커피는 lifecycle_status='DISCONTINUED' — 단종을 행 삭제가 아니라 상태 전환으로
-- 표현한다는 불변식 #7의 시연(과거 구매 이력이 고아가 되지 않는다).
INSERT INTO products
 (sku_id, barcode, name, brand, is_pb, category_l1, category_l2,
  is_refrigerated, is_frozen, is_alcohol, is_fresh, unit, price_krw,
  spec, spec_raw, image_url, first_stocked_at, lifecycle_status) VALUES
 (101042, '8801234500011', '아기 물티슈 캡형 100매 9입', '브랜드A', 0, '생활용품', '위생용품',
  0,0,0,0, 'count_sheet', 12900,
  '{"raw":"900매 (100매 x 9입)","quantity":{"primary":"count_sheet","value":900,"alt":{"count_pack":9}},"quality":{"form":"sheet","ply":2}}',
  '900매 (100매 × 9입)', '/img/101042.webp', '2026-03-02', 'ACTIVE'),
 (101043, '8801234500028', '아기 물티슈 리필 100매 6입', '브랜드B', 0, '생활용품', '위생용품',
  0,0,0,0, 'count_sheet',  7900,
  '{"raw":"600매 (100매 x 6입)","quantity":{"primary":"count_sheet","value":600,"alt":{"count_pack":6}},"quality":{"form":"sheet","ply":2}}',
  '600매 (100매 × 6입)', '/img/101043.webp', '2026-03-02', 'ACTIVE'),
 (102301, '8801234500035', '실속형 액체세제 9L', 'PB스토어플로우', 1, '생활용품', '세탁세제',
  0,0,0,0, 'volume_ml', 18900,
  '{"raw":"9,000ml (1.5L x 6입)","quantity":{"primary":"volume_ml","value":9000,"alt":{"count_pack":6}},"quality":{"form":"liquid"},"usage":{"unit":"회","per_use":15,"servings":600}}',
  '9,000ml (1.5L × 6입)', '/img/102301.webp', '2026-01-15', 'ACTIVE'),
 (102302, '8801234500042', '고농축 액체세제 4L', '브랜드C', 0, '생활용품', '세탁세제',
  0,0,0,0, 'volume_ml', 14900,
  '{"raw":"4,000ml (2L x 2입)","quantity":{"primary":"volume_ml","value":4000,"alt":{"count_pack":2}},"quality":{"form":"liquid"},"usage":{"unit":"회","per_use":8,"servings":500}}',
  '4,000ml (2L × 2입)', '/img/102302.webp', '2026-06-20', 'ACTIVE'),
 (103877, '8801234500059', '원두 커피 홀빈 1kg', '브랜드D', 0, '음료·주류', '커피·차',
  0,0,0,0, 'weight_g', 24900,
  '{"raw":"1,000g","quantity":{"primary":"weight_g","value":1000}}',
  '1,000g', '/img/103877.webp', '2025-11-04', 'DISCONTINUED'),
 -- 단종품(103877)의 후계 상품. 리뉴얼은 같은 sku_id 재사용이 아니라 **신규 SKU**다
 -- (재사용하면 과거 구매 이력이 다른 상품과 뒤섞여 소비주기 학습이 깨진다).
 (103902, '8801234500066', '원두 커피 홀빈 900g', '브랜드D', 0, '음료·주류', '커피·차',
  0,0,0,0, 'weight_g', 22900,
  '{"raw":"900g","quantity":{"primary":"weight_g","value":900}}',
  '900g', '/img/103902.webp', '2026-08-10', 'ACTIVE');

-- ── 5. 재고 ──────────────────────────────────────────────────────────────
-- 물티슈A의 PICK이 0 = 품절 상태. 그런데 바로 위 BULK에 40개가 있다 →
-- 이것이 "없습니다"가 아니라 "약 15분 뒤 채워집니다"라고 답할 수 있는 근거다.
INSERT INTO stocks (sku_id, location_id, qty) VALUES
 (101042, 'F2-B-R01-B05-L2',   0),   -- 매대 비었음
 (101042, 'F2-B-R01-B05-L5',  40),   -- 바로 위 예비 재고 (수직 보충)
 (101043, 'F2-B-R01-B06-L2',  18),
 (101043, 'F2-B-R01-B06-L5',  36),
 (102301, 'F2-A-R01-B03-L1',  12),
 (102302, 'F2-A-R01-B04-L1',   9),
 (103902, 'F1-H-R03-B05-L1',  24),   -- 커피: 이동 후 위치
 (101042, 'F2-W-R01-B01-L1', 120),   -- 같은 층 백룸 (수평 보충 원천)
 (101043, 'B1-W-R01-B01-L1', 400);   -- B1 중앙창고 (층간 보충 원천)

-- ── 6. 매대 설정 ─────────────────────────────────────────────────────────
-- min_qty가 BELOW_PAR 이벤트의 임계다. 규칙 min < replenish_to <= capacity 는
-- 스키마의 CHECK 제약이 강제한다(시드 버그를 적재 시점에 잡는다).
INSERT INTO shelf_configs (sku_id, location_id, min_qty, replenish_to_qty, capacity_qty) VALUES
 (101042, 'F2-B-R01-B05-L2',  8, 24, 40),
 (101043, 'F2-B-R01-B06-L2',  6, 20, 36),
 (102301, 'F2-A-R01-B03-L1',  4, 16, 24),
 (102302, 'F2-A-R01-B04-L1',  4, 16, 24),
 (103902, 'F1-H-R03-B05-L1',  6, 24, 36);

-- ── 7. 행사 ──────────────────────────────────────────────────────────────
-- (v2.4: price_histories 샘플 제거 — 테이블 자체가 삭제됨.
--  가격 변천의 흔적은 purchases의 unit_price_krw 13900→12900에 이미 있다.)
INSERT INTO promotions (sku_id, promo_type, discount_krw, starts_at, ends_at) VALUES
 (101043, 'DISCOUNT', 1000, '2026-08-10 00:00:00.000', '2026-08-20 23:59:59.999');

-- ── 8. 회원과 구매 이력 ──────────────────────────────────────────────────
-- 소비주기 학습의 최소 형태: 같은 회원이 같은 품목을 6~7주 간격으로 반복 구매.
-- 마지막 구매(6/28)로부터 데모 시점(8/13)까지 46일 → "살 때 되셨어요"가 성립한다.
INSERT INTO members (member_id, persona_type, household_size, created_at) VALUES
 (9001, '4인가족',  4, '2026-02-01 10:00:00.000'),
 (9002, '1인자취',  1, '2026-03-11 19:20:00.000');

INSERT INTO purchases (basket_id, member_id, sku_id, qty, unit_price_krw, purchased_at) VALUES
 ('bskt-0001', 9001, 101042, 1, 13900, '2026-03-08 15:22:41.000'),
 ('bskt-0001', 9001, 102301, 1, 18900, '2026-03-08 15:22:41.000'),
 ('bskt-0002', 9001, 101042, 1, 13900, '2026-04-19 14:05:12.000'),
 ('bskt-0003', 9001, 101042, 1, 12900, '2026-05-31 16:40:03.000'),
 ('bskt-0003', 9001, 103877, 1, 24900, '2026-05-31 16:40:03.000'),  -- 지금은 단종된 커피
 ('bskt-0004', 9001, 101042, 1, 12900, '2026-06-28 11:12:55.000'),
 ('bskt-0005', 9002, 101043, 2,  7900, '2026-07-05 20:31:09.000');

INSERT INTO wishlists (member_id, sku_id, added_at) VALUES
 (9001, 101042, '2026-08-12 21:03:00.000');   -- 품절이라 못 산 상품 → 입고 알림 대상

-- ── 9. 매대 이벤트 — 장면 1의 보충 사이클 ────────────────────────────────
-- 리드타임 = ITEM_CONFIRMED − BELOW_PAR = 14:16:02.900 − 14:02:10.320 = 832초.
-- 밀리초를 보존해야 이 값이 정확해진다(초 반올림이면 분 단위 수직 보충이 뭉개진다).
-- BELOW_PAR은 판매로 8→6이 되며 임계를 "넘어선 그 순간"에만 발행된다(전이).
INSERT INTO shelf_events (event_type, sku_id, location_id, qty, task_id, occurred_at, payload) VALUES
 ('SALE',           101042, 'F2-B-R01-B05-L2',  2, NULL,      '2026-08-13 14:02:10.100', NULL),
 ('BELOW_PAR',      101042, 'F2-B-R01-B05-L2', NULL,'T-8842', '2026-08-13 14:02:10.320',
   '{"old_qty":8,"new_qty":6,"min_qty":8}'),
 ('TASK_QUEUED',    101042, 'F2-B-R01-B05-L2', NULL,'T-8842', '2026-08-13 14:02:45.000',
   '{"path":"VERTICAL","from":"F2-B-R01-B05-L5"}'),
 ('TASK_STARTED',   101042, 'F2-B-R01-B05-L2', NULL,'T-8842', '2026-08-13 14:09:30.500',
   '{"worker":"npc-03"}'),
 ('STOCKOUT',       101042, 'F2-B-R01-B05-L2',  0, 'T-8842',  '2026-08-13 14:14:58.700', NULL),
 ('ITEM_CONFIRMED', 101042, 'F2-B-R01-B05-L2', 24, 'T-8842',  '2026-08-13 14:16:02.900', NULL),
 -- 장면 3: 커피 자리 이동. 신 위치를 컬럼에, 구 위치를 payload에 둔다
 -- ("지금 어디 있나" 조회가 압도적으로 많으므로).
 ('MOVE',           103902, 'F1-H-R03-B05-L1', NULL, NULL,    '2026-08-13 09:15:00.000',
   '{"prev_location_id":"F1-H-R01-B03-L1","reason":"SEASONAL_RESET"}'),
 -- 입고 알림(기능 4)의 근거
 ('RESTOCK_IN',     101042, 'F2-W-R01-B01-L1', 120, NULL,     '2026-08-13 08:40:12.000', NULL);

-- ── 10. 소비자 행동 이벤트 — 장면 2의 망설임 ─────────────────────────────
-- 같은 소분류(세탁세제)를 담았다 취소하기를 반복 → 행동 감시자의 개입 트리거.
-- SCAN_ADD에만 location_id가 있다: 스캔한 상품의 자리가 곧 사용자의 위치(위치 앵커).
-- 마지막 두 행은 비회원 세션 — member_id NULL 허용을 시연한다(불변식 #9).
INSERT INTO consumer_events (event_type, session_id, member_id, sku_id, location_id, occurred_at, payload) VALUES
 ('SEARCH',      'sess-7f3a9c', 9001, NULL,   NULL,              '2026-08-13 13:58:02.000', '{"q":"물티슈 어디 있어요?"}'),
 ('SCAN_ADD',    'sess-7f3a9c', 9001, 102301, 'F2-A-R01-B03-L1', '2026-08-13 14:01:33.200', NULL),
 ('SCAN_REMOVE', 'sess-7f3a9c', 9001, 102301, NULL,              '2026-08-13 14:01:52.700', NULL),
 ('SCAN_ADD',    'sess-7f3a9c', 9001, 102302, 'F2-A-R01-B04-L1', '2026-08-13 14:02:11.050', NULL),
 ('SCAN_REMOVE', 'sess-7f3a9c', 9001, 102302, NULL,              '2026-08-13 14:02:29.400', NULL),
 ('VIEW',        'sess-7f3a9c', 9001, 102301, NULL,              '2026-08-13 14:02:40.000', NULL),
 ('SCAN_ADD',    'sess-7f3a9c', 9001, 102301, 'F2-A-R01-B03-L1', '2026-08-13 14:03:58.900', NULL),
 ('PURCHASE',    'sess-7f3a9c', 9001, 102301, NULL,              '2026-08-13 14:31:00.000',
   '{"basket_id":"bskt-0006","total_krw":18900}'),
 ('SEARCH',      'sess-anon-01', NULL, NULL,  NULL,              '2026-08-13 15:10:00.000', '{"q":"세제"}'),
 ('SCAN_ADD',    'sess-anon-01', NULL, 101043,'F2-B-R01-B06-L2', '2026-08-13 15:12:30.000', NULL);
