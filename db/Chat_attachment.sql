-- 채팅 첨부파일(카메라/갤러리/파일/영수증) 테이블.
-- ddl-auto: none 이라 직접 실행 필요.

CREATE TABLE chat_attachment (
                                 chat_attachment_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
                                 chat_session_id         BIGINT NOT NULL,
                                 chat_message_id         BIGINT NULL,          -- 업로드 직후엔 NULL, 메시지 전송 시 연결됨
                                 type                    VARCHAR(20) NOT NULL, -- IMAGE / DOCUMENT / RECEIPT
                                 original_filename       VARCHAR(255) NOT NULL,
                                 storage_key             VARCHAR(512) NOT NULL,
                                 url                     VARCHAR(1024) NOT NULL,
                                 content_type            VARCHAR(100) NOT NULL,
                                 size_bytes              BIGINT NOT NULL,
                                 uploaded_by_consumer_id BIGINT NULL,
                                 created_at              DATETIME NOT NULL,

                                 CONSTRAINT fk_chat_attachment_session
                                     FOREIGN KEY (chat_session_id) REFERENCES chat_session (chat_session_id)
                                         ON DELETE CASCADE,

                                 CONSTRAINT fk_chat_attachment_message
                                     FOREIGN KEY (chat_message_id) REFERENCES chat_message (chat_message_id)
                                         ON DELETE CASCADE,

                                 INDEX idx_chat_attachment_message (chat_message_id),
                                 INDEX idx_chat_attachment_session_pending (chat_session_id, chat_message_id)
);