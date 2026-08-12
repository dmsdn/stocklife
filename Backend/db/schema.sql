-- StoreFlow AI - products 테이블 (Product 엔티티)
-- storeflow_products_seed_5000.csv 컬럼과 1:1로 맞춰뒀습니다.

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

CREATE TABLE consumer (
    consumer_id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    phone_number           VARCHAR(20)  NOT NULL,
    password                VARCHAR(255) NOT NULL,
    gender                  VARCHAR(10)  NULL,
    birth_date              DATE         NULL,
    camera_consent          BOOLEAN      NOT NULL DEFAULT FALSE,
    personal_info_consent   BOOLEAN      NOT NULL DEFAULT FALSE,
    mic_consent             BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    refresh_token           VARCHAR(500) NULL,

    CONSTRAINT uk_consumer_phone_number UNIQUE (phone_number)
);

ALTER TABLE consumer
    ADD COLUMN grade VARCHAR(20) NOT NULL DEFAULT 'BASIC',
    ADD COLUMN monthly_spend_amount INT NOT NULL DEFAULT 0;

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