-- ============================================================================
-- 시연용 로그인 계정에 이력을 붙인다 — consumer 1~30 ↔ member 10,000,001~030
-- ============================================================================
-- [무엇을 푸는가]
--   로그인한 손님의 이력을 백엔드는 `member_id = 10,000,000 + consumer_id` 로
--   찾는다(`Member.toMemberId`). 그런데 세계 시드의 회원은 1001~11000 이고
--   데모 슬라이스의 구매 이력은 **1001~1030 에만** 있다.
--   ⇒ 어떤 계정으로 로그인해도 10,000,00x 를 조회하므로 **이력이 늘 0건**이다.
--     "담아줘"는 되는데 "늘 사시던 것"은 안 되는 반쪽 데모가 된다.
--
-- [왜 코드가 아니라 데이터로 고치나]
--   `toMemberId` 의 오프셋을 데모용으로 바꾸면 한 줄이면 되지만, 그건
--   **팀 저장소의 계약을 우리 기계에서만 거짓으로 만드는** 것이다. 발표 날
--   다른 브랜치·다른 기계에서 띄우면 그대로 깨진다.
--   데이터로 놓으면 계약이 참인 채로 어디서든 같은 결과가 나온다.
--
-- [무엇을 하나] 세계 시드 회원 1001~1030 의 이력을 10,000,001~030 으로
--   **복사**한다(옮기지 않는다 — 원본은 학습·분석의 재료라 그대로 둔다).
--
--   로그인:  전화번호 0108000000N  /  비밀번호 test1234   (N = 1~30)
--            → consumer_id N → member 10,000,000+N → 구매·찜·행동 이력 있음
--
-- [되돌리기] 아래 한 줄이면 전부 사라진다(원본은 안 건드렸으므로 무손실):
--   DELETE FROM purchases       WHERE member_id >= 10000000;
--   DELETE FROM wishlists       WHERE member_id >= 10000000;
--   DELETE FROM consumer_events WHERE member_id >= 10000000;
--   DELETE FROM members         WHERE member_id >= 10000000;
--
-- ⚠ 재적재(세계 시드 다시 넣기) 뒤에는 이 파일을 **다시 돌려야 한다.**
--   시드적재 절차서(db/README_시드적재.md)의 마지막 단계다.
-- ============================================================================
SET NAMES utf8mb4;

-- ── 0. consumer 에 포인트 컬럼 (jmy 70ffe6a 등급 모델 전환분) ────────────────
--    엔티티에는 있고 DB 에는 없어서 **로그인·가입이 전부 500** 이었다.
--    ⚠ 정식 DDL 은 백엔드 담당이 줘야 한다 — 아래는 엔티티에서 역산한 것.
--    이미 있으면 오류가 나는데 무해하다(--force 로 넘어간다).
ALTER TABLE consumer
    ADD COLUMN point_balance      INT NOT NULL DEFAULT 0,
    ADD COLUMN point_earned_total INT NOT NULL DEFAULT 0;

-- ── 1. 회원 30명 ────────────────────────────────────────────────────────────
--    축 4개(가구원수·반려·자녀·차량)를 그대로 가져온다 — 취향 매칭이 이 값을 쓴다.
INSERT INTO members (member_id, household_size, has_pet, has_child, by_car, created_at)
SELECT 10000000 + (member_id - 1000), household_size, has_pet, has_child, by_car, created_at
  FROM members
 WHERE member_id BETWEEN 1001 AND 1030;

-- ── 2. 구매 이력 (1,988행) ──────────────────────────────────────────────────
--    소비주기 예측 · 취향 매칭 · 재구매 추천이 전부 이 표에 붙는다.
--    ⚠ basket_id 에 'D-' 를 붙인다. 안 붙이면 원본과 같은 장바구니 번호가 되어
--      basket 단위로 묶는 질의가 두 회원의 장바구니를 하나로 본다.
INSERT INTO purchases (basket_id, member_id, sku_id, qty, unit_price_krw, purchased_at)
SELECT CONCAT('D-', basket_id), 10000000 + (member_id - 1000),
       sku_id, qty, unit_price_krw, purchased_at
  FROM purchases
 WHERE member_id BETWEEN 1001 AND 1030;

-- ── 3. 찜 (154행) ───────────────────────────────────────────────────────────
--    진입 브리핑(킬링 장면 3)과 get_wishlist 의 재료.
INSERT INTO wishlists (member_id, sku_id, added_at)
SELECT 10000000 + (member_id - 1000), sku_id, added_at
  FROM wishlists
 WHERE member_id BETWEEN 1001 AND 1030;

-- ── 4. 행동 이벤트 (3,697행) ────────────────────────────────────────────────
--    망설임 감시자(킬링 장면 2)가 읽는 스캔·검색 흔적.
INSERT INTO consumer_events (event_type, session_id, member_id, sku_id, location_id, occurred_at, payload)
SELECT event_type, session_id, 10000000 + (member_id - 1000),
       sku_id, location_id, occurred_at, payload
  FROM consumer_events
 WHERE member_id BETWEEN 1001 AND 1030;

-- ── 검산 ────────────────────────────────────────────────────────────────────
SELECT 'members'         AS t, COUNT(*) AS n FROM members         WHERE member_id >= 10000000
UNION ALL SELECT 'purchases',       COUNT(*) FROM purchases       WHERE member_id >= 10000000
UNION ALL SELECT 'wishlists',       COUNT(*) FROM wishlists       WHERE member_id >= 10000000
UNION ALL SELECT 'consumer_events', COUNT(*) FROM consumer_events WHERE member_id >= 10000000;
