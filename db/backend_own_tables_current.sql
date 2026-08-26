-- ============================================================================
-- 1. consumer
-- 로그인/인증/회원 계정은 스키마 규칙서상 백엔드 고유 영역.
-- members와 FK를 만들지 않는다.
-- members 연계는 계약대로 member_id = 10000000 + consumer_id 계산식 사용.
-- ============================================================================
CREATE TABLE IF NOT EXISTS consumer (
                                        consumer_id BIGINT NOT NULL AUTO_INCREMENT,
                                        phone_number VARCHAR(20) NOT NULL,
    name VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL,

    gender VARCHAR(10) NULL,
    birth_date DATE NULL,

    camera_consent BOOLEAN NOT NULL DEFAULT FALSE,
    personal_info_consent BOOLEAN NOT NULL DEFAULT FALSE,
    mic_consent BOOLEAN NOT NULL DEFAULT FALSE,
    marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,

    grade VARCHAR(20) NOT NULL DEFAULT 'BASIC',
    monthly_spend_amount INT NOT NULL DEFAULT 0,
    point_balance INT NOT NULL DEFAULT 0,

    refresh_token VARCHAR(500) NULL,
    withdrawn_at DATETIME NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (consumer_id),
    UNIQUE KEY uk_consumer_phone_number (phone_number),
    KEY idx_consumer_withdrawn_at (withdrawn_at)
    ) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 2. cart_group
-- 로그인 회원의 "이번 주 장보기", "생활용품" 같은 장바구니 그룹.
-- ============================================================================
CREATE TABLE IF NOT EXISTS cart_group (
                                          cart_group_id BIGINT NOT NULL AUTO_INCREMENT,
                                          consumer_id BIGINT NOT NULL,
                                          title VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (cart_group_id),
    KEY idx_cart_group_consumer (consumer_id),

    CONSTRAINT fk_cart_group_consumer
    FOREIGN KEY (consumer_id)
    REFERENCES consumer (consumer_id)
    ON DELETE CASCADE
    ) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 3. cart_item
--
-- 현재 팀 호환 구조:
--   consumer_id   : 기존 회원 장바구니 코드 호환
--   session_id    : 기존 비회원 DB 장바구니 코드 호환
--   cart_group_id : 신규 그룹형 장바구니 코드
--
-- 신규 서비스 흐름에서는 비회원 장바구니를 localStorage에 두고,
-- 로그인 후 /api/cart/migrate 로 cart_group/cart_item에 승계한다.
-- 그러나 기존 팀 코드 호환을 위해 consumer_id/session_id 컬럼은 유지한다.
-- ============================================================================
CREATE TABLE IF NOT EXISTS cart_item (
                                         cart_item_id BIGINT NOT NULL AUTO_INCREMENT,

                                         cart_group_id BIGINT NULL,
                                         consumer_id BIGINT NULL,
                                         session_id VARCHAR(64) NULL,

    sku_id INT UNSIGNED NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    is_checked BOOLEAN NOT NULL DEFAULT TRUE,
    scanned_at DATETIME NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (cart_item_id),

    UNIQUE KEY uk_cart_consumer_product (consumer_id, sku_id),
    UNIQUE KEY uk_cart_session_product (session_id, sku_id),

    KEY idx_cart_item_cart_group (cart_group_id),
    KEY idx_cart_item_session_id (session_id),
    KEY idx_cart_item_sku (sku_id),

    CONSTRAINT fk_cart_consumer
    FOREIGN KEY (consumer_id)
    REFERENCES consumer (consumer_id),

    -- products는 schema_v2.sql 소유. 여기서는 참조만 한다.
    CONSTRAINT fk_cart_product
    FOREIGN KEY (sku_id)
    REFERENCES products (sku_id),

    CONSTRAINT fk_cart_item_cart_group
    FOREIGN KEY (cart_group_id)
    REFERENCES cart_group (cart_group_id)
    ON DELETE CASCADE,

    -- 기존 구조 + 신규 그룹 구조 모두 허용.
    CONSTRAINT chk_cart_owner
    CHECK (
              consumer_id IS NOT NULL
              OR session_id IS NOT NULL
              OR cart_group_id IS NOT NULL
          )
    ) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 4. event_log
-- 백엔드 내부용 단순 로그.
-- schema_v2의 consumer_events / shelf_events와 다른 테이블이며,
-- Agent 이벤트 계약을 대체하거나 수정하지 않는다.
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_log (
                                         event_id INT NOT NULL AUTO_INCREMENT,
                                         event_type VARCHAR(30) NOT NULL,
    ref_id VARCHAR(50) NULL,
    message VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (event_id),
    KEY idx_type (event_type),
    KEY idx_created (created_at)
    ) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 5. coupon
-- ============================================================================
CREATE TABLE IF NOT EXISTS coupon (
                                      coupon_id BIGINT NOT NULL AUTO_INCREMENT,
                                      code VARCHAR(50) NOT NULL,
    title VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,

    discount_type VARCHAR(20) NOT NULL,
    discount_value INT NOT NULL,
    min_order_amount INT NOT NULL DEFAULT 0,
    max_discount_amount INT NULL,

    valid_from DATETIME NOT NULL,
    valid_until DATETIME NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (coupon_id),
    UNIQUE KEY uk_coupon_code (code),

    CONSTRAINT chk_coupon_discount_type
    CHECK (discount_type IN ('FIXED', 'PERCENT')),
    CONSTRAINT chk_coupon_discount_value
    CHECK (discount_value > 0),
    CONSTRAINT chk_coupon_min_order
    CHECK (min_order_amount >= 0)
    ) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 6. consumer_coupon
-- ============================================================================
CREATE TABLE IF NOT EXISTS consumer_coupon (
                                               consumer_coupon_id BIGINT NOT NULL AUTO_INCREMENT,
                                               consumer_id BIGINT NOT NULL,
                                               coupon_id BIGINT NOT NULL,

                                               status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at DATETIME NULL,
    used_order_id BIGINT NULL,

    PRIMARY KEY (consumer_coupon_id),

    UNIQUE KEY uk_consumer_coupon_once (consumer_id, coupon_id),
    KEY idx_consumer_coupon_consumer (consumer_id, status),
    KEY idx_consumer_coupon_coupon (coupon_id),

    CONSTRAINT fk_consumer_coupon_consumer
    FOREIGN KEY (consumer_id)
    REFERENCES consumer (consumer_id),

    CONSTRAINT fk_consumer_coupon_coupon
    FOREIGN KEY (coupon_id)
    REFERENCES coupon (coupon_id),

    CONSTRAINT chk_consumer_coupon_status
    CHECK (status IN ('AVAILABLE', 'USED', 'EXPIRED'))
    ) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 7. orders
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders (
                                      order_id BIGINT NOT NULL AUTO_INCREMENT,
                                      consumer_id BIGINT NOT NULL,

                                      original_amount INT NOT NULL DEFAULT 0,
                                      discount_amount INT NOT NULL DEFAULT 0,
                                      consumer_coupon_id BIGINT NULL,

                                      total_amount INT NOT NULL,
                                      status VARCHAR(20) NOT NULL DEFAULT 'PAID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (order_id),

    KEY idx_orders_consumer (consumer_id),
    KEY idx_orders_consumer_coupon (consumer_coupon_id),

    CONSTRAINT fk_order_consumer
    FOREIGN KEY (consumer_id)
    REFERENCES consumer (consumer_id),

    CONSTRAINT fk_orders_consumer_coupon
    FOREIGN KEY (consumer_coupon_id)
    REFERENCES consumer_coupon (consumer_coupon_id)
    ON DELETE SET NULL
    ) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 8. order_item
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_item (
                                          order_item_id BIGINT NOT NULL AUTO_INCREMENT,
                                          order_id BIGINT NOT NULL,

    -- products는 schema_v2.sql의 계약 컬럼 sku_id를 그대로 참조.
                                          sku_id INT UNSIGNED NOT NULL,

    -- 영수증은 구매 당시 상품명/가격 스냅샷을 유지.
                                          product_name VARCHAR(255) NOT NULL,
    price_krw INT NOT NULL,
    quantity INT NOT NULL,

    PRIMARY KEY (order_item_id),

    KEY idx_order_item_order (order_id),
    KEY idx_order_item_sku (sku_id),

    CONSTRAINT fk_orderitem_order
    FOREIGN KEY (order_id)
    REFERENCES orders (order_id),

    CONSTRAINT fk_orderitem_product
    FOREIGN KEY (sku_id)
    REFERENCES products (sku_id)
    ) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 9. point_history
-- 구매금액 기준 포인트 적립/차감 이력.
-- ============================================================================
CREATE TABLE IF NOT EXISTS point_history (
                                             point_history_id BIGINT NOT NULL AUTO_INCREMENT,
                                             consumer_id BIGINT NOT NULL,
                                             order_id BIGINT NOT NULL,

                                             amount INT NOT NULL,
                                             type VARCHAR(30) NOT NULL,
    description VARCHAR(100) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (point_history_id),

    UNIQUE KEY uk_point_history_order_type (order_id, type),
    KEY idx_point_history_consumer_created (consumer_id, created_at),

    CONSTRAINT fk_point_history_consumer
    FOREIGN KEY (consumer_id)
    REFERENCES consumer (consumer_id),

    CONSTRAINT fk_point_history_order
    FOREIGN KEY (order_id)
    REFERENCES orders (order_id)
    ) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 10. chat_session
-- Agent의 consumer_events.session_id 계약은 변경하지 않는다.
-- 이 테이블은 백엔드 UI의 채팅방/이력 관리용 별도 테이블.
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_session (
                                            chat_session_id BIGINT NOT NULL AUTO_INCREMENT,

                                            session_id VARCHAR(64) NOT NULL,
    consumer_id BIGINT NULL,
    anonymous_id VARCHAR(64) NULL,
    group_id BIGINT NULL,
    title VARCHAR(120) NULL,

    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    PRIMARY KEY (chat_session_id),

    UNIQUE KEY uq_chat_session_session_id (session_id),
    KEY idx_chat_session_consumer_updated (consumer_id, updated_at),
    KEY idx_chat_session_anonymous_updated (anonymous_id, updated_at),
    KEY idx_chat_session_group (group_id),

    CONSTRAINT fk_chat_session_group
    FOREIGN KEY (group_id)
    REFERENCES cart_group (cart_group_id)
    ON DELETE SET NULL
    ) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 11. chat_message
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_message (
                                            chat_message_id BIGINT NOT NULL AUTO_INCREMENT,
                                            chat_session_id BIGINT NOT NULL,

                                            sender ENUM('USER', 'AI', 'AI_PROACTIVE') NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME NOT NULL,

    PRIMARY KEY (chat_message_id),

    KEY idx_chat_message_session_time (chat_session_id, created_at),

    CONSTRAINT fk_chat_message_session
    FOREIGN KEY (chat_session_id)
    REFERENCES chat_session (chat_session_id)
    ) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 12. phone_verification
-- ============================================================================
CREATE TABLE IF NOT EXISTS phone_verification (
                                                  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                                                  phone_number VARCHAR(20) NOT NULL,
    verification_code VARCHAR(6) NOT NULL,
    purpose VARCHAR(20) NOT NULL,

    expires_at TIMESTAMP NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    attempt_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL,

    PRIMARY KEY (id),

    KEY idx_phone_verification_lookup (
                                          phone_number,
                                          purpose,
                                          created_at
                                      )
    ) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 13. notification
-- 알림함 목록/읽음 처리.
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification (
                                            notification_id BIGINT NOT NULL AUTO_INCREMENT,
                                            consumer_id BIGINT NOT NULL,

                                            type VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
    title VARCHAR(120) NOT NULL,
    message VARCHAR(500) NOT NULL,
    link_url VARCHAR(500) NULL,

    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME NULL,

    PRIMARY KEY (notification_id),

    KEY idx_notification_consumer_created (consumer_id, created_at),
    KEY idx_notification_consumer_read (consumer_id, is_read),

    CONSTRAINT fk_notification_consumer
    FOREIGN KEY (consumer_id)
    REFERENCES consumer (consumer_id)
    ON DELETE CASCADE
    ) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 14. notification_setting
-- 회원 1명당 알림 수신 설정 1행.
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_setting (
                                                    consumer_id BIGINT NOT NULL,

                                                    all_enabled TINYINT(1) NOT NULL DEFAULT 1,
    order_enabled TINYINT(1) NOT NULL DEFAULT 1,
    coupon_enabled TINYINT(1) NOT NULL DEFAULT 1,
    point_enabled TINYINT(1) NOT NULL DEFAULT 1,
    restock_enabled TINYINT(1) NOT NULL DEFAULT 1,
    marketing_enabled TINYINT(1) NOT NULL DEFAULT 1,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (consumer_id),

    CONSTRAINT fk_notification_setting_consumer
    FOREIGN KEY (consumer_id)
    REFERENCES consumer (consumer_id)
    ON DELETE CASCADE
    ) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;