-- ============================================================================
-- 구매 이력을 화면이 읽는 장부에도 투영한다 — purchases → orders / order_item
-- ============================================================================
-- [무엇을 푸는가] **구매 장부가 둘인데 서로 겹치지 않았다.**
--
--     purchases            48건   ← 에이전트가 읽는 곳 (우리 세계 · DES 산출)
--     orders / order_item   1건   ← 화면이 읽는 곳 (백엔드 고유 · 실제 결제)
--
--   그래서 로그인해서 "구매내역"을 열면 비어 있는데, 에이전트는 그 이력을
--   근거로 취향을 말한다. **구매 이력이 시연의 근거인데 화면에서 못 보여주면
--   앞뒤가 안 맞는다** — `/api/orders/frequent` 가 빈 배열이던 이유다.
--
-- [왜 이 방향인가] 반대로(orders → purchases) 가면 에이전트가 읽을 이력이
--   1건뿐이라 개인화가 도로 죽는다. 세계가 만든 48건이 원본이고, 화면 장부는
--   그것의 **투영**이다.
--
-- [무엇을 하나] 같은 장바구니(`basket_id`)를 **한 주문으로 묶는다.**
--   결제 시각은 그 바구니의 마지막 구매 시각, 상태는 PAID,
--   적립은 2%(`Grade` 주석의 적립률 · 실측으로 확인: 65,570원 주문의 1,311P).
--   소비자의 누적 포인트·등급도 같이 맞춘다 — 주문만 넣고 포인트를 안 맞추면
--   "구매는 많은데 등급이 베이직"인 **자기모순 화면**이 된다.
--
-- [되찾는 열쇠] `orders` 에는 basket 칸이 없어서, 넣은 뒤 order_item 을
--   붙이려면 방금 만든 주문을 다시 찾아야 한다. auto_increment 가 연속이라는
--   가정은 쓰지 않는다(동시 삽입이 있으면 깨진다). 대신 **(consumer_id,
--   created_at)** 으로 되찾는다 — 180개 바구니 전부 이 짝이 유일함을 확인했다.
--   ⚠ `orders.created_at` 은 초 단위(datetime)라 밀리초가 잘린다. 유일성 검사도
--     **초로 잘라서** 했다(잘린 뒤에 겹치면 소용없으므로).
--
-- [되돌리기] 넣은 것만 지운다. 원래 있던 주문 1건은 안 건드린다:
--   DELETE oi FROM order_item oi JOIN orders o ON o.order_id=oi.order_id
--     WHERE o.consumer_id BETWEEN 1 AND 30 AND o.order_id > (되돌릴 기준 id);
--   -- 더 쉬운 방법: 아래 검산의 order_id 범위를 적어 두고 그 범위를 지운다.
--
-- ⚠ 04_demo_accounts.sql 을 먼저 돌려야 한다(purchases 가 10,000,00x 에 있어야).
-- ============================================================================
SET NAMES utf8mb4;

-- ── 1. 바구니 → 주문 후보 ───────────────────────────────────────────────────
DROP TEMPORARY TABLE IF EXISTS _basket;
CREATE TEMPORARY TABLE _basket AS
SELECT  member_id - 10000000            AS consumer_id,
        basket_id,
        SUM(qty * unit_price_krw)       AS amount,
        -- 초 단위로 잘라 둔다. `orders.created_at` 이 datetime 이라 어차피
        -- 잘리는데, 여기서 안 자르면 아래 조인이 밀리초 때문에 안 맞는다.
        DATE_FORMAT(MAX(purchased_at), '%Y-%m-%d %H:%i:%s') AS paid_at
  FROM  purchases
 WHERE  member_id >= 10000000
 GROUP  BY member_id, basket_id;

-- ── 2. 주문 ─────────────────────────────────────────────────────────────────
--    적립 2%. FLOOR 인 이유: 실측 주문(65,570원 → 1,311P)이 내림이다.
INSERT INTO orders (consumer_id, total_amount, status, created_at, points_used, points_earned)
SELECT consumer_id, amount, 'PAID', paid_at, 0, FLOOR(amount * 0.02)
  FROM _basket;

-- ── 3. 주문 상세 ────────────────────────────────────────────────────────────
--    `product_name` 을 주문에 **박아 둔다**(상품명이 나중에 바뀌어도 그때 산
--    이름이 남아야 영수증이다 — 백엔드가 이 칸을 둔 이유).
INSERT INTO order_item (order_id, sku_id, product_name, price_krw, quantity)
SELECT  o.order_id, pu.sku_id, pr.name, pu.unit_price_krw, pu.qty
  FROM  purchases pu
  JOIN  _basket b   ON b.basket_id = pu.basket_id
                   AND b.consumer_id = pu.member_id - 10000000
  JOIN  orders  o   ON o.consumer_id = b.consumer_id
                   AND o.created_at  = b.paid_at
  JOIN  products pr ON pr.sku_id = pu.sku_id
 WHERE  pu.member_id >= 10000000;

-- ── 4. 누적 포인트·등급 정합 ────────────────────────────────────────────────
--    등급은 `Grade.calculateFrom`(누적 적립 포인트) 규칙 그대로:
--      1,000P 브론즈 · 2,000P 실버 · 3,000P 골드
UPDATE consumer c
  JOIN (SELECT consumer_id, SUM(points_earned) p FROM orders GROUP BY consumer_id) s
    ON s.consumer_id = c.consumer_id
   SET c.point_earned_total = s.p,
       c.point_balance      = s.p,
       c.grade = CASE WHEN s.p >= 3000 THEN 'GOLD'
                      WHEN s.p >= 2000 THEN 'SILVER'
                      WHEN s.p >= 1000 THEN 'BRONZE'
                      ELSE 'BASIC' END
 WHERE c.consumer_id BETWEEN 1 AND 30;

-- ── 검산 ────────────────────────────────────────────────────────────────────
SELECT 'orders'     AS t, COUNT(*) AS n FROM orders     WHERE consumer_id BETWEEN 1 AND 30
UNION ALL SELECT 'order_item', COUNT(*) FROM order_item oi
                 JOIN orders o ON o.order_id = oi.order_id WHERE o.consumer_id BETWEEN 1 AND 30
UNION ALL SELECT 'purchases(원본)', COUNT(*) FROM purchases WHERE member_id >= 10000000;
-- ⚠ order_item 수 = purchases 수 여야 한다. 적으면 조인에서 샌 것이다.
SELECT consumer_id, COUNT(*) orders_, SUM(points_earned) pts
  FROM orders WHERE consumer_id BETWEEN 1 AND 3 GROUP BY consumer_id;
