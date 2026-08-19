-- 백엔드 고유 영역(인증) — schema_v2.sql과 별도 관리, 이정기 팀원 재생성 대상 아님
-- ddl-auto: none 이라 Hibernate가 자동으로 만들어주지 않음. 별도 실행 필요.

CREATE TABLE phone_verification (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    phone_number       VARCHAR(20)  NOT NULL,
    verification_code  VARCHAR(6)   NOT NULL,
    purpose            VARCHAR(20)  NOT NULL,   -- SIGNUP, PASSWORD_RESET
    expires_at         TIMESTAMP    NOT NULL,
    verified           BOOLEAN      NOT NULL DEFAULT FALSE,
    attempt_count      INT          NOT NULL DEFAULT 0,
    created_at         TIMESTAMP    NOT NULL,
    PRIMARY KEY (id),
    KEY idx_phone_verification_lookup (phone_number, purpose, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;