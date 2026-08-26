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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
