-- ============================================================================
-- 스키마 정합 — 로컬 ↔ RDS 가 양방향으로 어긋나 있었다 (2026-09-04)
-- ============================================================================
-- [무엇을 푸는가]
--   09-04 에 팀 RDS(us-east-1)와 로컬 docker MySQL 의 컬럼을 **전수 대조**했다.
--   227 vs 219 칸이고, 어긋남이 **양방향**이었다 — 한쪽이 낡은 게 아니라 둘 다
--   자기한테 없는 것을 코드가 기대하고 있었다.
--
--     RDS 에만 있음 (로컬이 뒤처짐)        로컬에만 있음 (RDS 가 뒤처짐)
--       cart_group.status                    point_transaction (테이블 통째)
--       orders.consumer_coupon_id            price_histories   (테이블 통째)
--       orders.discount_amount
--       orders.original_amount
--
-- [무엇이 실제로 깨졌나]
--   · 로컬: `GET /api/cart/groups` → **500**. CartGroup 엔티티가 status 를 읽는데
--     칸이 없다. 그러면 리스트 목록이 안 뜨고, **스캔 페이지도 담을 리스트를 못 찾아
--     막힌다**("담을 리스트를 준비하는 중이에요"). 09-04 시연에서 실제로 걸렸다.
--   · RDS: `point_transaction` 이 없다. `PointTransaction` 엔티티가
--     `@Table(name="point_transaction")` 으로 붙어 있고 `OrderService` 가 결제 때
--     적립/사용을 쓴다 — **RDS 에 붙여 결제하면 거기서 죽는다.**
--     (RDS 에는 `point_history` 만 있는데 그 이름을 쓰는 엔티티가 없다.)
--
-- [왜 마이그레이션이 없었나 — 이게 근본 원인이다]
--   `cart_group.status` 는 `911d972`(09-03)에서 **자바 엔티티에만** 추가됐다.
--   `db/` 에 그 칸을 만드는 DDL 이 한 줄도 없다. 그래서 RDS 에는 (누군가 손으로
--   넣어서) 있고 로컬에는 없다 — **팀원 각자의 DB 가 제각각이라는 뜻이다.**
--   orders 쿠폰 3칸도 같다.
--
--   > 엔티티에 칸을 더하는 것과 그 칸이 생기는 것은 다른 일이다.
--   > 전자만 하면 **자기 기계에서만 도는 코드**가 된다.
--
-- [실행]
--   mysql -h <host> -u <user> -p --default-character-set=utf8mb4 storeflow_db \
--     < db/migration_schema_align_0904.sql
--
--   ⚠ 재실행 안전하다. 이미 있으면 건너뛴다(아래 프로시저).
--   ⚠ **양쪽 다 돌린다.** 로컬은 A 만, RDS 는 B 만 실제로 바뀌지만 스크립트는 같다.
-- ============================================================================

SET NAMES utf8mb4;

-- ── 「있으면 건너뛴다」 도우미 ────────────────────────────────────────────────
-- MySQL 은 `ADD COLUMN IF NOT EXISTS` 를 안 준다(MariaDB 만 있다). 그래서
-- information_schema 를 보고 동적 SQL 로 돈다. 이게 없으면 두 번째 실행이
-- "Duplicate column" 으로 멈추고, 그러면 사람이 "이미 됐나?" 를 매번 확인해야 한다.
DROP PROCEDURE IF EXISTS _add_col;
DELIMITER //
CREATE PROCEDURE _add_col(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN ', ddl);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    SELECT CONCAT('  + ', tbl, '.', col) AS '';
  ELSE
    SELECT CONCAT('  = ', tbl, '.', col, ' (이미 있음)') AS '';
  END IF;
END //
DELIMITER ;

SELECT '── A. RDS 에는 있고 로컬에 없던 것 ──' AS '';

-- 장보기 리스트의 상태. 결제 완료된 리스트에 더 담지 못하게 막는 데 쓴다
-- (CartGroup.assertNotCompleted). 기존 행은 전부 ACTIVE 가 맞다 —
-- 결제 완료 표시는 그동안 없었으므로 "아직 진행 중"이 참이다.
CALL _add_col('cart_group', 'status',
  "status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' AFTER shopping_date");

-- 쿠폰·할인. 기존 주문은 쿠폰을 안 썼으므로 discount 0 이고
-- original_amount 는 total_amount 와 같다(아래에서 채운다).
CALL _add_col('orders', 'original_amount',  'original_amount INT NOT NULL DEFAULT 0 AFTER total_amount');
CALL _add_col('orders', 'discount_amount',  'discount_amount INT NOT NULL DEFAULT 0 AFTER original_amount');
CALL _add_col('orders', 'consumer_coupon_id', 'consumer_coupon_id BIGINT NULL AFTER discount_amount');

-- ⚠ 기존 주문의 original_amount 를 0 으로 두면 "정가 0원에 0원 할인" 이 되어
--   영수증·주문 상세가 이상해진다. 할인이 없던 주문이므로 정가 = 결제액이다.
UPDATE orders SET original_amount = total_amount
 WHERE original_amount = 0 AND total_amount > 0;

SELECT '── B. 로컬에는 있고 RDS 에 없던 것 ──' AS '';

-- 포인트 원장. `PointTransaction` 엔티티가 이 이름으로 붙어 있고
-- `OrderService` 가 결제 때 USE/EARN 을 쓴다. 없으면 **결제가 죽는다.**
-- ⚠ RDS 에 있는 `point_history` 는 이 엔티티가 안 쓰는 다른 테이블이다.
--   지우지 않는다 — 누가 쓰는지 확인 전이고, 남겨 둬도 해가 없다.
CREATE TABLE IF NOT EXISTS point_transaction (
  point_transaction_id BIGINT       NOT NULL AUTO_INCREMENT,
  consumer_id          BIGINT       NOT NULL,
  transaction_type     VARCHAR(30)  NOT NULL,
  amount               INT          NOT NULL,
  balance_after        INT          NOT NULL,
  order_id             BIGINT       NULL,
  description          VARCHAR(255) NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (point_transaction_id),
  KEY idx_point_tx_consumer (consumer_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 가격 이력. 우리 세계 스키마(schema_v2)의 테이블인데 지금 **0행**이고
-- 자바도 우리 하네스도 안 읽는다. 그래도 만든다 — 스키마가 계약이고,
-- 한쪽에만 없으면 "이 DB 는 v2 인가"를 물을 때마다 답이 갈린다.
CREATE TABLE IF NOT EXISTS price_histories (
  history_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku_id         INT UNSIGNED NOT NULL,
  price_krw      INT UNSIGNED NOT NULL,
  effective_from TIMESTAMP(3) NOT NULL,
  PRIMARY KEY (history_id),
  KEY idx_price_hist_sku (sku_id, effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT '-- C. 여러 절 ALTER 가 통째로 죽어서 안 생긴 것 (09-04 밤 발견) --' AS '';

-- ⚠ 이건 「한쪽 DB 가 낡아서」가 아니라 **DDL 작성 방식 때문에** 안 생긴 칸이다.
--
--   backend_own_tables_current.sql:23  consumer 를 만들 때 point_balance 만 넣는다
--   Migration_guest_cart_v1.sql:70~72  ALTER TABLE consumer
--                                        ADD point_balance      <- 이미 있다 -> ERROR 1060
--                                        ADD point_earned_total <- 같은 구문이라 같이 죽는다
--   seed/04_demo_accounts.sql:38~40    똑같은 두 줄짜리 ALTER -> 똑같이 죽는다
--
--   **여러 절이 붙은 ALTER 는 통째로 하나의 구문이다.** 앞 절이 「이미 있음」이면
--   정말 필요했던 뒤 절까지 같이 안 된다. --force 는 그걸 넘기고 다음 파일로 간다.
--
--   기존 DB 에서는 안 터졌다 — 그때는 point_balance 가 아직 없어서 두 절이 다
--   성공했기 때문이다. **같은 파일이 새 DB 에서만 다르게 돈다.**
--
-- [안 고치면]  Consumer 엔티티가 @Column(name="point_earned_total", nullable=false)
--   로 이 칸을 읽는다. 없으면 consumer 를 건드리는 모든 질의가 SQL 오류다 —
--   **로그인부터 500.** 09-04 에 새 RDS 가 정확히 이 상태였다.
--
-- 아래 _add_col 은 칸을 **하나씩** 검사해서 더하므로 이 실패 방식에 면역이다.
CALL _add_col('consumer', 'point_earned_total',
  'point_earned_total INT NOT NULL DEFAULT 0 AFTER point_balance');

DROP PROCEDURE IF EXISTS _add_col;

-- ── 검산 ────────────────────────────────────────────────────────────────────
SELECT '── 검산 (7/7 이어야 한다) ──' AS '';
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='cart_group' AND column_name='status')
+ (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='orders' AND column_name='original_amount')
+ (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='orders' AND column_name='discount_amount')
+ (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='orders' AND column_name='consumer_coupon_id')
+ (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name='point_transaction')
+ (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name='price_histories')
+ (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='consumer' AND column_name='point_earned_total')
  AS `충족(7이면 정합)`;
