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


ALTER TABLE consumer
    ADD COLUMN marketing_consent BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE consumer
    MODIFY COLUMN camera_consent BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE consumer
    MODIFY COLUMN mic_consent BOOLEAN NOT NULL DEFAULT FALSE;




-- 회원탈퇴(withdraw) 기능 — 백엔드 고유 영역(consumer 테이블). Agent 세계 시드(schema_v2.sql)는 건드리지 않음.
-- consumer는 이미 존재하는 테이블이므로 CREATE가 아니라 ALTER로 변경한다.

-- 1) 탈퇴 시각. NULL이면 정상 회원, 값이 있으면 탈퇴한 회원(로그인 차단 + phone_number는 tombstone 값으로 교체됨).
--    완전 삭제 대신 소프트 삭제를 쓰는 이유: purchases 등 구매/이벤트 이력이 consumer_id를 참조하고 있어서,
--    행을 지우면 재구매 주기 계산·매출 통계 같은 다른 기능이 참조하는 이력이 끊긴다.
ALTER TABLE consumer
    ADD COLUMN withdrawn_at DATETIME NULL AFTER refresh_token;

-- 2) 탈퇴한 회원을 조회에서 걸러낼 일이 많을 것 같아 인덱스 추가(선택이지만 미리 추가).
ALTER TABLE consumer
    ADD INDEX idx_consumer_withdrawn_at (withdrawn_at);


-- ============================================================================
-- StoreFlow cart_item - "어떻게 담았는지" 구분용 scanned_at 추가
--
-- scanned_at이 있으면: 매장에서 실제로 스캔/검색해서 담은 상품
-- scanned_at이 NULL이면: 그냥 계획 단계에서 담아둔 상품(체크박스 토글은 이 값을 안 건드림)
--
-- AI "이번달 소비 분석"에서 계획 대비 실구매 비교의 근거 데이터로 사용.
-- ============================================================================

ALTER TABLE cart_item
    ADD COLUMN scanned_at DATETIME NULL AFTER is_checked;