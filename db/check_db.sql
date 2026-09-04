-- ============================================================================
-- 내 DB 가 최신인가 — 한 번에 답한다 (2026-09-04 신설)
-- ============================================================================
-- [왜 만드나]
--   09-04 에 로컬과 팀 RDS 가 **양방향으로** 어긋나 있었다. 한쪽이 낡은 게 아니라
--   둘 다 자기한테 없는 것을 코드가 기대하고 있었다.
--
--     로컬에 없던 것   cart_group.status         → GET /api/cart/groups 가 **500**
--                                                  → 리스트도 스캔도 막힌다
--     RDS 에 없던 것   point_transaction 테이블  → 결제하면 **거기서 죽는다**
--
--   둘 다 **화면이 깨질 때까지 아무도 몰랐다.** `README_시드적재.md` 에 순서가
--   다 적혀 있어도, 「내가 ③번을 돌렸던가?」 는 문서를 읽어서 알 수 없다.
--
--   > 절차서는 **무엇을 할지**를 말하고, 이 스크립트는 **무엇이 됐는지**를 말한다.
--   > 오늘 없던 것은 뒤쪽이다.
--
-- [무엇을 재나 — 두 층을 다르게 잰다]
--   ① 스키마 : **엄격하게.** 칸 하나가 없으면 그 창구가 500 이다. 있고 없고가 전부다.
--   ② 데이터 : **느슨하게.** 행 수는 정당하게 흔들린다(테스트로 리스트가 늘고,
--              시드를 다시 굽고). 그래서 「몇 행인가」가 아니라 **「그 종류가
--              들어와 있나」** 를 본다. 정확한 수를 박아 두면 그 숫자가 먼저 낡아
--              경보가 늑대가 된다.
--
-- [왜 임시 테이블을 쓰나 — 09-04 첫 판의 버그]
--   첫 판은 표를 보여 주는 SELECT 와 판정을 내는 SELECT 를 **따로** 썼다.
--   판정 쪽이 같은 검사를 손으로 베낀 사본이었고, 거기서 괄호를 빠뜨려
--   (`A = 0 + B = 0` 이 비교의 연쇄가 된다) **둘이 부족한데 「최신」이라고 답했다.**
--   ⇒ 검사를 임시 테이블에 **한 번만** 적고, 표도 판정도 그 행에서 뽑는다.
--     그러면 검사를 더해도 판정이 저절로 따라온다 — 베낀 것이 없으니 어긋날 수 없다.
--
-- [실행]  한 연결 안에서 다 돌아야 한다(임시 테이블). 파일을 통째로 넘긴다.
--   로컬:  docker exec -i storeflow_mysql mysql -uroot -p1234 \
--            --default-character-set=utf8mb4 --table storeflow_db < db/check_db.sql
--   원격:  mysql -h <host> -u <user> -p --default-character-set=utf8mb4 \
--            --table storeflow_db < db/check_db.sql
--
-- [★ 가 나오면]  같은 줄의 「돌릴 것」을 실행한다. 상세는 db/README_시드적재.md
-- ============================================================================

SET NAMES utf8mb4;

DROP TEMPORARY TABLE IF EXISTS _chk;
CREATE TEMPORARY TABLE _chk (
  kind VARCHAR(8),        -- 'schema' | 'data'
  ord  INT,
  chk  VARCHAR(60),
  got  BIGINT,
  need BIGINT,            -- 스키마는 1(있어야 한다), 데이터는 최소 행 수
  fix  VARCHAR(60)
);

-- ── ① 스키마 — 없으면 그 창구가 죽는다 ──────────────────────────────────────
INSERT INTO _chk
SELECT 'schema', 1, '테이블 products',   (SELECT COUNT(*) FROM information_schema.tables  WHERE table_schema=DATABASE() AND table_name='products'), 1, 'schema_v2.sql' UNION ALL
SELECT 'schema', 2, '테이블 locations',  (SELECT COUNT(*) FROM information_schema.tables  WHERE table_schema=DATABASE() AND table_name='locations'), 1, 'schema_v2.sql' UNION ALL
SELECT 'schema', 3, '테이블 purchases',  (SELECT COUNT(*) FROM information_schema.tables  WHERE table_schema=DATABASE() AND table_name='purchases'), 1, 'schema_v2.sql' UNION ALL
SELECT 'schema', 4, '테이블 price_histories',    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='price_histories'), 1, 'migration_schema_align_0904.sql' UNION ALL
SELECT 'schema', 5, '테이블 orders',     (SELECT COUNT(*) FROM information_schema.tables  WHERE table_schema=DATABASE() AND table_name='orders'), 1, 'backend_own_tables_current.sql' UNION ALL
SELECT 'schema', 6, '테이블 cart_group', (SELECT COUNT(*) FROM information_schema.tables  WHERE table_schema=DATABASE() AND table_name='cart_group'), 1, 'backend_own_tables_current.sql' UNION ALL
SELECT 'schema', 7, '테이블 chat_session',       (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='chat_session'), 1, 'migration_chat_v1.sql' UNION ALL
SELECT 'schema', 8, '테이블 phone_verification', (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='phone_verification'), 1, 'phone_verification.sql' UNION ALL
-- ⚠ 09-04 에 RDS 에 없어서 결제가 죽을 뻔한 것
SELECT 'schema', 9, '테이블 point_transaction',  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='point_transaction'), 1, 'migration_schema_align_0904.sql' UNION ALL
-- ⚠ 09-04 에 로컬에 없어서 /api/cart/groups 가 500 이던 것
SELECT 'schema',10, '칸 cart_group.status',      (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='cart_group' AND column_name='status'), 1, 'migration_schema_align_0904.sql' UNION ALL
SELECT 'schema',11, '칸 orders.discount_amount', (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='orders' AND column_name='discount_amount'), 1, 'migration_schema_align_0904.sql' UNION ALL
SELECT 'schema',12, '칸 map_cells.facility_kind',(SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='map_cells' AND column_name='facility_kind'), 1, 'migration_map_cells_facility_0903.sql' UNION ALL
SELECT 'schema',13, '칸 map_cells.kind',         (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='map_cells' AND column_name='kind'), 1, 'migration_map_cells_kind_0902.sql' UNION ALL
SELECT 'schema',14, '칸 cart_item.session_id',   (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='cart_item' AND column_name='session_id'), 1, 'Migration_guest_cart_v1.sql' UNION ALL
-- 09-04 밤. 새 RDS 에 이게 없어서 **로그인이 500** 이었다. 여러 절 ALTER 가
-- 통째로 죽어서 안 생긴 칸이다(상세는 migration_schema_align_0904.sql 의 C절).
-- ⚠ 그날 이 검사기는 26/26 초록이었다 — 이 칸을 안 보고 있었기 때문이다.
--   검사기가 고른 목록의 바깥은 검사되지 않는다.
SELECT 'schema',15, '칸 consumer.point_earned_total', (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='consumer' AND column_name='point_earned_total'), 1, 'migration_schema_align_0904.sql';

-- ── ② 데이터 — 「종류가 들어와 있나」 ────────────────────────────────────────
INSERT INTO _chk
SELECT 'data', 1, '상품',                  (SELECT COUNT(*) FROM products), 4970, 'products_seed_5000.sql' UNION ALL
SELECT 'data', 2, '매대 위치(PICK/BULK)',  (SELECT COUNT(*) FROM locations WHERE tier_role IN ('PICK','BULK')), 11500, 'world_seed.sql' UNION ALL
-- 없으면 find_facility 가 빈 손이고 동선에 화장실을 못 넣는다
SELECT 'data', 3, '시설 위치(FACILITY)',   (SELECT COUNT(*) FROM locations WHERE tier_role='FACILITY'), 34, 'migration_locations_facility_0903.sql' UNION ALL
SELECT 'data', 4, '재고',                  (SELECT COUNT(*) FROM stocks), 9900, 'world_seed.sql' UNION ALL
SELECT 'data', 5, '세계 회원',             (SELECT COUNT(*) FROM members), 10000, 'members_seed.sql' UNION ALL
SELECT 'data', 6, '로그인 계정(consumer)', (SELECT COUNT(*) FROM consumer), 2000, '01_consumer_seed_2000.sql' UNION ALL
SELECT 'data', 7, '찜',                    (SELECT COUNT(*) FROM wishlists), 50000, 'wishlist_seed.sql' UNION ALL
SELECT 'data', 8, '매대 이벤트',           (SELECT COUNT(*) FROM shelf_events), 200000, 'history_seed.sql' UNION ALL
SELECT 'data', 9, '구매 · 세계축(1001~)',  (SELECT COUNT(*) FROM purchases WHERE member_id < 10000000), 1900, 'history_seed.sql' UNION ALL
-- ⚠ 여기가 핵심이다. 축이 둘인데 **로그인한 손님은 10,000,00x 로만 조회된다**
--   (Member.toMemberId = 10,000,000 + consumer_id). 낮은 축만 있으면 화면상
--   이력이 많아 보여도 **에이전트는 0건**을 본다 — 브리핑·재구매가 통째로 죽는다.
SELECT 'data',10, '구매 · 데모축(10,000,00x)', (SELECT COUNT(*) FROM purchases WHERE member_id >= 10000000), 1900, '04_demo_accounts.sql' UNION ALL
SELECT 'data',11, '주문(화면 장부)',       (SELECT COUNT(*) FROM orders), 100, '06_demo_orders.sql' UNION ALL
SELECT 'data',12, '보충 대기 큐',          (SELECT COUNT(*) FROM shelf_events WHERE event_type='TASK_QUEUED'), 20000, 'history_seed.sql';

-- ── 표 ──────────────────────────────────────────────────────────────────────
SELECT '════ 1. 스키마 — 없으면 그 창구가 죽는다 ════' AS '';
SELECT chk AS '검사', IF(got >= need, 'OK', '★ 없음') AS '결과', fix AS '없으면 돌릴 것'
  FROM _chk WHERE kind='schema' ORDER BY ord;

SELECT '════ 2. 데이터 — 종류가 들어와 있나 ════' AS '';
SELECT chk AS '검사', got AS '실측', need AS '최소', IF(got >= need, 'OK', '★ 부족') AS '결과', fix AS '부족하면'
  FROM _chk WHERE kind='data' ORDER BY ord;

-- ── 판정 — **위 표와 같은 행에서** 뽑는다 ───────────────────────────────────
-- ⚠ MySQL 은 한 질의에서 **임시 테이블을 두 번 못 연다**("Can't reopen table").
--   그래서 CASE 안에 서브질의를 여러 개 넣을 수 없다. 먼저 변수로 한 번씩 담는다.
SELECT COUNT(*) INTO @miss   FROM _chk WHERE got < need;
SELECT COUNT(*) INTO @miss_s FROM _chk WHERE got < need AND kind = 'schema';
SELECT COUNT(*) INTO @miss_d FROM _chk WHERE got < need AND kind = 'data';

SELECT '════ 3. 판정 ════' AS '';
SELECT
  CASE WHEN @miss = 0
       THEN '✅ 최신이다 — 스키마·데이터 모두 충족'
       ELSE CONCAT('★ ', @miss, '개 부족 (스키마 ', @miss_s, ' · 데이터 ', @miss_d,
                   ') — 아래 「돌릴 것」을 순서대로. 상세는 db/README_시드적재.md')
  END AS '판정';

SELECT chk AS '부족한 것', fix AS '돌릴 것' FROM _chk WHERE got < need ORDER BY kind DESC, ord;

DROP TEMPORARY TABLE IF EXISTS _chk;
