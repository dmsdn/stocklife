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
