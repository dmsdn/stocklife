-- 알림 설정 저장 테이블
-- 회원 1명당 1행
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
);

-- 기존 회원도 설정 행이 바로 생기도록 기본값(모두 ON) 생성
INSERT INTO notification_setting (
    consumer_id,
    all_enabled,
    order_enabled,
    coupon_enabled,
    point_enabled,
    restock_enabled,
    marketing_enabled
)
SELECT
    c.consumer_id,
    1, 1, 1, 1, 1, 1
FROM consumer c
WHERE NOT EXISTS (
    SELECT 1
    FROM notification_setting ns
    WHERE ns.consumer_id = c.consumer_id
);
