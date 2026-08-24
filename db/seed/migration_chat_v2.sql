-- ============================================================================
-- StoreFlow 채팅 세션 관리 v2
-- 요구사항 5-1 보강:
--   - 로그인 사용자별 채팅방 목록 조회
--   - 비회원 브라우저별 채팅방 목록 조회
--   - 채팅방 제목
--
-- 기존 migration_chat_v1.sql 적용 후 실행.
-- ============================================================================

ALTER TABLE chat_session
    ADD COLUMN anonymous_id VARCHAR(64) NULL AFTER consumer_id,
    ADD COLUMN title VARCHAR(120) NULL AFTER anonymous_id;

CREATE INDEX idx_chat_session_consumer_updated
    ON chat_session (consumer_id, updated_at);

CREATE INDEX idx_chat_session_anonymous_updated
    ON chat_session (anonymous_id, updated_at);


-- consumer.name 컬럼 추가 및 필수화
-- 기존 DB에 1회 실행. 기존 회원은 임시 이름(회원000001...)으로 채운다.

ALTER TABLE consumer
    ADD COLUMN name VARCHAR(50) NULL AFTER phone_number;

UPDATE consumer
SET name = CONCAT('회원', LPAD(consumer_id, 6, '0'))
WHERE consumer_id > 0
  AND (name IS NULL OR TRIM(name) = '');

ALTER TABLE consumer
    MODIFY COLUMN name VARCHAR(50) NOT NULL;

SELECT consumer_id, phone_number, name
FROM consumer
ORDER BY consumer_id
    LIMIT 20;