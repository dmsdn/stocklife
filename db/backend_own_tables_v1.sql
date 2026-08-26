-- 이미 schema_v2.sql이 적용된 DB에 백엔드 고유 테이블만 추가하는 용도.
-- CREATE TABLE IF NOT EXISTS라서, products/zones/locations 등 이미 있는 테이블은 건드리지 않고 건너뜀.
-- 실제로 새로 생기는 건 consumer, cart_item, event_log, orders, order_item 뿐.

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
                                         sku_id          INT UNSIGNED NOT NULL,
                                         quantity        INT NOT NULL DEFAULT 1,
                                         is_checked      BOOLEAN NOT NULL DEFAULT TRUE,
                                         created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                         updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                         CONSTRAINT fk_cart_consumer FOREIGN KEY (consumer_id) REFERENCES consumer(consumer_id),
                                         CONSTRAINT fk_cart_product FOREIGN KEY (sku_id) REFERENCES products(sku_id),
                                         CONSTRAINT uk_cart_consumer_product UNIQUE (consumer_id, sku_id)
);

CREATE TABLE IF NOT EXISTS event_log (
                                         event_id    INT PRIMARY KEY AUTO_INCREMENT,
                                         event_type  VARCHAR(30) NOT NULL,
                                         ref_id      VARCHAR(50),
                                         message     VARCHAR(255),
                                         created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                         INDEX idx_type (event_type),
                                         INDEX idx_created (created_at)
);

CREATE TABLE IF NOT EXISTS orders (
                                      order_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
                                      consumer_id   BIGINT NOT NULL,
                                      total_amount  INT NOT NULL,
                                      status        VARCHAR(20) NOT NULL DEFAULT 'PAID',
                                      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                      CONSTRAINT fk_order_consumer FOREIGN KEY (consumer_id) REFERENCES consumer(consumer_id)
);

CREATE TABLE IF NOT EXISTS order_item (
                                          order_item_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
                                          order_id       BIGINT NOT NULL,
                                          sku_id         INT UNSIGNED NOT NULL,
                                          product_name   VARCHAR(255) NOT NULL,
                                          price_krw      INT NOT NULL,
                                          quantity       INT NOT NULL,
                                          CONSTRAINT fk_orderitem_order FOREIGN KEY (order_id) REFERENCES orders(order_id),
                                          CONSTRAINT fk_orderitem_product FOREIGN KEY (sku_id) REFERENCES products(sku_id)
);

CREATE TABLE cart_group (
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
);