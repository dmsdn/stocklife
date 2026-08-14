-- StoreFlow 채팅 세션/이력 테이블 (요구사항 23, 24, 25번)
-- 백엔드 고유 영역(스키마 규칙서 🟢) — Agent 스키마와 무관하게 추가

CREATE TABLE IF NOT EXISTS chat_session (
                                            chat_session_id BIGINT AUTO_INCREMENT PRIMARY KEY,
                                            session_id      VARCHAR(64) NOT NULL,      -- consumer_events.session_id와 같은 값 체계
    consumer_id     BIGINT NULL,                -- 비회원이면 NULL
    created_at      DATETIME NOT NULL,
    updated_at      DATETIME NOT NULL,
    UNIQUE KEY uq_chat_session_session_id (session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_message (
                                            chat_message_id BIGINT AUTO_INCREMENT PRIMARY KEY,
                                            chat_session_id BIGINT NOT NULL,
                                            sender          ENUM('USER', 'AI', 'AI_PROACTIVE') NOT NULL,
    content         TEXT NOT NULL,
    created_at      DATETIME NOT NULL,
    KEY idx_chat_message_session_time (chat_session_id, created_at),
    CONSTRAINT fk_chat_message_session
    FOREIGN KEY (chat_session_id) REFERENCES chat_session(chat_session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;