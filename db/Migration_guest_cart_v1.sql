-- 요구사항 30: 장바구니(쇼핑리스트) API — "비회원은 세션 기준, 회원은 계정 기준"
-- 요구사항 29: 비회원 → 회원 데이터 승계 — 로그인 시 session_id로 남은 비회원 카트를 계정에 연결
-- 백엔드 고유 영역(스키마 규칙서 🟢) — schema_v2.sql, 즉 Agent 파트 세계 시드 테이블은 건드리지 않음.
-- cart_item은 이미 존재하는 테이블이므로 CREATE가 아니라 ALTER로 변경한다.

-- 1) 비회원 장보기 세션을 식별할 컬럼 추가.
--    chat_session.session_id / consumer_events.session_id와 같은 값 체계(프론트가 발급하는 UUID)를 그대로 쓴다.
ALTER TABLE cart_item
    ADD COLUMN session_id VARCHAR(64) NULL AFTER consumer_id;

-- 2) 비회원은 로그인 전이라 consumer_id가 없으므로 NOT NULL 제약을 풀어준다.
--    (회원 담기 API는 애플리케이션 레벨에서 여전히 consumer_id를 채워서 저장한다 — DB 레벨에서는 둘 중 하나만 있으면 됨)
ALTER TABLE cart_item
    MODIFY COLUMN consumer_id BIGINT NULL;

-- 3) 기존 유니크 제약 (consumer_id, sku_id)은 비회원 행(consumer_id가 NULL)에 대해 의미가 없어진다.
--    MySQL은 UNIQUE 인덱스에서 NULL을 서로 다른 값으로 취급해 중복 방지가 안 되므로,
--    회원/비회원 각각에 맞는 유니크 제약으로 분리한다.
ALTER TABLE cart_item
DROP INDEX uk_cart_consumer_product;

ALTER TABLE cart_item
    ADD CONSTRAINT uk_cart_consumer_product UNIQUE (consumer_id, sku_id);

ALTER TABLE cart_item
    ADD CONSTRAINT uk_cart_session_product UNIQUE (session_id, sku_id);

-- 4) 조회 성능: "이 세션의 카트 전체" 조회(get_session_cart, 12번)가 session_id로 스캔하므로 인덱스 추가.
ALTER TABLE cart_item
    ADD INDEX idx_cart_item_session_id (session_id);

-- 5) 데이터 정합성: consumer_id와 session_id 둘 중 최소 하나는 있어야 한다(둘 다 NULL인 유령 카트 방지).
--    MySQL 8.0.16+ CHECK 제약 지원 전제.
ALTER TABLE cart_item
    ADD CONSTRAINT chk_cart_owner CHECK (consumer_id IS NOT NULL OR session_id IS NOT NULL);



-- ============================================================================
-- StoreFlow 채팅 세션 - 장보기 리스트(cart_group) 연동 v3
--
-- 요구사항: 장보기 리스트 화면에서 "AI에게 물어보기"로 시작한 대화는
--   그 리스트를 기억해야 함. group_id가 NULL이면 지금처럼 그냥 일반 대화.
--
-- 기존 migration_chat_v1.sql, migration_chat_v2.sql 적용 후 실행.
-- ============================================================================

ALTER TABLE chat_session
    ADD COLUMN group_id BIGINT NULL AFTER anonymous_id;

-- cart_group이 삭제되면 해당 대화는 그냥 "일반 대화"로 남기고(연결만 끊기),
-- 대화 이력 자체는 지우지 않는다 — 채팅 이력 삭제는 별도 정책 소관.
ALTER TABLE chat_session
    ADD CONSTRAINT fk_chat_session_group
        FOREIGN KEY (group_id) REFERENCES cart_group (cart_group_id)
            ON DELETE SET NULL;


CREATE INDEX idx_chat_session_group
    ON chat_session (group_id);

-- cart_group에 "장 볼 날짜" 컬럼 추가 (nullable, 선택 입력)
ALTER TABLE cart_group
    ADD COLUMN shopping_date DATE NULL AFTER description;