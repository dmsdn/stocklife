-- ── 매장 세계 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zones (
    zone_id     VARCHAR(16) PRIMARY KEY,
    floor_no    TINYINT NOT NULL,
    zone_type   ENUM('SALES','BACKROOM') NOT NULL,
    name        VARCHAR(100),
    x           INT NOT NULL, y INT NOT NULL,
    w           INT NOT NULL, h INT NOT NULL,
    INDEX idx_floor (floor_no)
);

CREATE TABLE IF NOT EXISTS locations (
    location_id VARCHAR(32) PRIMARY KEY,
    zone_id     VARCHAR(16) NOT NULL,
    floor_no    TINYINT NOT NULL,
    rack_no     INT NOT NULL, bay_no INT NOT NULL, level_no INT NOT NULL,
    tier_role   ENUM('PICK','BULK') NOT NULL,
    x           INT NOT NULL, y INT NOT NULL,
    FOREIGN KEY (zone_id) REFERENCES zones(zone_id),
    INDEX idx_zone_tier (zone_id, tier_role),
    INDEX idx_floor_xy (floor_no, x, y)
);

CREATE TABLE IF NOT EXISTS map_cells (
    floor_no    TINYINT NOT NULL,
    x           INT NOT NULL, y INT NOT NULL,
    walkable    BOOLEAN NOT NULL DEFAULT TRUE,
    zone_id     VARCHAR(16) NULL,
    transit_id  VARCHAR(16) NULL,
    PRIMARY KEY (floor_no, x, y),
    INDEX idx_transit (transit_id)
);

-- ── 상품 (기존 테이블 그대로) ───────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    sku_id          INT PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    category        VARCHAR(100) NOT NULL,
    price_krw       INT NOT NULL,
    unit            VARCHAR(50),
    brand           VARCHAR(100),
    origin          VARCHAR(20),
    attributes_json JSON,
    active          BOOLEAN DEFAULT TRUE,
    INDEX idx_category (category),
    INDEX idx_name (name)
);

CREATE TABLE IF NOT EXISTS stocks (
    sku_id      INT NOT NULL,
    location_id VARCHAR(32) NOT NULL,
    qty         INT NOT NULL DEFAULT 0,
    PRIMARY KEY (sku_id, location_id),
    FOREIGN KEY (sku_id) REFERENCES products(sku_id),
    FOREIGN KEY (location_id) REFERENCES locations(location_id),
    INDEX idx_location (location_id)
);

CREATE TABLE IF NOT EXISTS shelf_configs (
    sku_id           INT NOT NULL,
    location_id      VARCHAR(32) NOT NULL,
    min_qty          INT NOT NULL,
    capacity_qty     INT NOT NULL,
    replenish_to_qty INT NOT NULL,
    PRIMARY KEY (sku_id, location_id),
    FOREIGN KEY (sku_id) REFERENCES products(sku_id),
    FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

CREATE TABLE IF NOT EXISTS promotions (
    promo_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    sku_id      INT NOT NULL,
    start_date  DATE NOT NULL, end_date DATE NOT NULL,
    promo_price INT NOT NULL,
    FOREIGN KEY (sku_id) REFERENCES products(sku_id),
    INDEX idx_sku_period (sku_id, start_date, end_date)
);

CREATE TABLE IF NOT EXISTS price_histories (
    sku_id     INT NOT NULL,
    changed_at TIMESTAMP(3) NOT NULL,
    price_krw  INT NOT NULL,
    PRIMARY KEY (sku_id, changed_at),
    FOREIGN KEY (sku_id) REFERENCES products(sku_id)
);

-- reviews: 이정기 안(body/author_masked) 채택
CREATE TABLE IF NOT EXISTS reviews (
    review_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    sku_id        INT NOT NULL,
    rating        TINYINT NOT NULL,
    body          TEXT,
    author_masked VARCHAR(50),
    created_at    TIMESTAMP(3) NOT NULL,
    FOREIGN KEY (sku_id) REFERENCES products(sku_id),
    INDEX idx_sku (sku_id)
);

-- ── 사건(이벤트 소싱) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shelf_events (
    event_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type  ENUM('SALE','INBOUND','BELOW_PAR','STOCKOUT',
                     'REPLENISH_QUEUED','REPLENISH_STARTED','ITEM_CONFIRMED') NOT NULL,
    occurred_at TIMESTAMP(3) NOT NULL,
    recorded_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    sku_id      INT NOT NULL,
    location_id VARCHAR(32) NOT NULL,
    qty_delta   INT NULL,
    task_id     BIGINT NULL,
    source      ENUM('SIM','SYSTEM','ADMIN','CONSUMER') NOT NULL,
    FOREIGN KEY (sku_id) REFERENCES products(sku_id),
    FOREIGN KEY (location_id) REFERENCES locations(location_id),
    INDEX idx_sku_loc_time (sku_id, location_id, occurred_at),
    INDEX idx_task (task_id),
    INDEX idx_type_time (event_type, occurred_at)
);

CREATE TABLE IF NOT EXISTS consumer_events (
    event_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type  ENUM('SCAN_ADD','CART_ADD','CART_REMOVE','CHECKOUT','SEARCH') NOT NULL,
    occurred_at TIMESTAMP(3) NOT NULL,
    recorded_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    session_id  VARCHAR(64) NOT NULL,
    user_id     BIGINT NULL,
    sku_id      INT NULL,
    barcode     VARCHAR(20) NULL,
    location_id VARCHAR(32) NULL,
    meta        JSON NULL,
    INDEX idx_session_time (session_id, occurred_at),
    INDEX idx_type_time (event_type, occurred_at)
);

-- ── products 보강 (재실행 안전) ────────────────────────────
SET @ddl = (SELECT IF(COUNT(*) = 0,
       'ALTER TABLE products ADD COLUMN barcode VARCHAR(20) NULL UNIQUE AFTER sku_id',
       'DO 0')
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'barcode');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = (SELECT IF(COUNT(*) = 0,
       'ALTER TABLE products ADD COLUMN shelf_life_days INT NULL AFTER origin',
       'DO 0')
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'shelf_life_days');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 장민영 파트: 소비자·장바구니 ────────────────────────────
CREATE TABLE IF NOT EXISTS consumer (
    consumer_id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    phone_number            VARCHAR(20)  NOT NULL,
    password                VARCHAR(255) NOT NULL,
    gender                  VARCHAR(10)  NULL,
    birth_date              DATE         NULL,
    camera_consent          BOOLEAN      NOT NULL DEFAULT FALSE,
    personal_info_consent   BOOLEAN      NOT NULL DEFAULT FALSE,
    mic_consent             BOOLEAN      NOT NULL DEFAULT FALSE,
    grade                    VARCHAR(20)  NOT NULL DEFAULT 'BASIC',
    monthly_spend_amount     INT          NOT NULL DEFAULT 0,
    created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    refresh_token           VARCHAR(500) NULL,
    CONSTRAINT uk_consumer_phone_number UNIQUE (phone_number)
);

CREATE TABLE IF NOT EXISTS cart_item (
    cart_item_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    consumer_id     BIGINT NOT NULL,
    sku_id          INT NOT NULL,
    quantity        INT NOT NULL DEFAULT 1,
    is_checked      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cart_consumer FOREIGN KEY (consumer_id) REFERENCES consumer(consumer_id),
    CONSTRAINT fk_cart_product FOREIGN KEY (sku_id) REFERENCES products(sku_id),
    CONSTRAINT uk_cart_consumer_product UNIQUE (consumer_id, sku_id)
);

-- ── 내 파트: 관리 이벤트 로그 ────────────────────────────────
CREATE TABLE IF NOT EXISTS event_log (
    event_id    INT PRIMARY KEY AUTO_INCREMENT,
    event_type  VARCHAR(30) NOT NULL,
    ref_id      VARCHAR(50),
    message     VARCHAR(255),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_type (event_type),
    INDEX idx_created (created_at)
);