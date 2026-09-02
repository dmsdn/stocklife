-- ============================================================================
-- 엔티티에는 있는데 DB 에는 없던 것들 — 전수 대조로 찾은 5건 (2026-09-01)
-- ============================================================================
-- [어떻게 찾았나] 하나 고치면 다음 것이 나오는 식이라, 파일 하나가 아니라
--   **JPA 엔티티 24개 전부**를 information_schema 와 1:1 대조했다.
--     · 테이블 누락 2 : chat_attachment · point_transaction
--     · 컬럼 누락  3 : cart_group.shopping_date · orders.points_used/points_earned
--   이 다섯이 전부다(대조 결과 나머지는 일치).
--
-- [왜 나중에도 필요한가] `ddl-auto: none` 이라 Hibernate 가 안 만들어 준다.
--   없으면 **그 도메인을 건드리는 순간 500** 이 난다:
--     chat_attachment  → 채팅에 사진·파일 첨부
--     point_transaction→ 주문 결제·포인트 적립/사용 (등급 산정의 원장)
--     shopping_date    → 장보기 리스트의 "언제 장 볼지"
--     orders.points_*  → 주문 저장 자체
--   시연에서 결제까지 보여 줄 거면 전부 필요하다.
--
-- ⚠ 정식 DDL 은 백엔드 담당 몫이다. 아래는 **엔티티에서 역산**한 것이라
--   타입·길이는 맞지만 인덱스·외래키는 최소한만 걸었다. 팀 스크립트가
--   오면 그것으로 갈아탄다(요청서 09-01 참조).
--
-- [실행] db/README_시드적재.md 의 순서 마지막. Chat_attachment.sql 은
--   이미 팀이 준 파일이 있어 여기 안 넣었다 — 그것도 같이 돌린다.
-- ============================================================================
SET NAMES utf8mb4;

-- ── 1. point_transaction — 포인트 원장 ──────────────────────────────────────
--    PointTransaction 엔티티에서 역산. transaction_type 은 @Enumerated(STRING)
--    이라 VARCHAR 이고, order_id 는 nullable(적립이 주문과 무관할 수 있다).
CREATE TABLE IF NOT EXISTS point_transaction (
    point_transaction_id BIGINT       NOT NULL AUTO_INCREMENT,
    consumer_id          BIGINT       NOT NULL,
    order_id             BIGINT       NULL,
    transaction_type     VARCHAR(30)  NOT NULL,
    amount               INT          NOT NULL,
    balance_after        INT          NOT NULL,
    description          VARCHAR(255) NULL,
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (point_transaction_id),
    -- 조회는 늘 "이 사람의 최근 내역"이라 두 칸을 묶어 건다.
    KEY idx_pt_consumer_created (consumer_id, created_at),
    KEY idx_pt_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 2. cart_group.shopping_date ─────────────────────────────────────────────
--    ⚠ 이건 새로 만든 게 아니다. `db/Migration_guest_cart_v1.sql:64` 에 이미
--      있는데 **그 파일이 끝까지 안 돌았다.** 같은 사고가 08-28 에도 있었다
--      (표에는 있는데 복붙 블록에 없어서 채팅 도메인이 통째로 500).
ALTER TABLE cart_group ADD COLUMN shopping_date DATE NULL AFTER description;

-- ── 3. orders 의 포인트 두 칸 ───────────────────────────────────────────────
--    주문 당시의 적립·사용액을 주문에 박아 둔다 — 나중에 적립률이 바뀌어도
--    그 주문의 적립분은 보존돼야 환불을 정확히 되돌릴 수 있다(Order.java 주석).
ALTER TABLE orders
    ADD COLUMN points_used   INT NOT NULL DEFAULT 0,
    ADD COLUMN points_earned INT NOT NULL DEFAULT 0;
