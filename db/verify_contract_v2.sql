-- ============================================================================
-- StoreFlow 계약 테스트 v2 — 불변식 10개를 자동 검사한다
-- ============================================================================
-- 왜 필요한가: 팀 계약을 문서로만 적어 두면 "지켜졌는지"를 사람이 눈으로 확인해야 하고,
--   깨졌을 때는 이미 학습·추론이 조용히 틀린 뒤다(학습-서빙 불일치는 에러를 내지 않는다).
--   그래서 계약을 **실행 가능한 검사**로 바꿔 둔다. 백엔드가 스키마를 고쳐도 이 스크립트만
--   통과하면 우리 파이프라인은 안전하다 — 그것이 이 계약의 실질이다.
--
-- 두 종류의 검사가 섞여 있다.
--   [S] 구조 검사 — information_schema 조회. 샘플 데이터가 없어도 항상 실행 가능
--   [D] 데이터 검사 — sample_rows_v2.sql 적재 후에만 의미 있음
--
-- 실행:
--   docker exec -i storeflow_mysql mysql -uroot -p1234 --default-character-set=utf8mb4 <db> < verify_contract_v2.sql
-- ============================================================================

SET NAMES utf8mb4;

DROP TEMPORARY TABLE IF EXISTS _chk;
CREATE TEMPORARY TABLE _chk (
  no       INT,
  kind     CHAR(1),           -- S=구조 / D=데이터
  item     VARCHAR(60),
  expected VARCHAR(220),
  actual   VARCHAR(220)
) ENGINE=MEMORY DEFAULT CHARSET=utf8mb4;

-- ── [S] 구조 검사 ────────────────────────────────────────────────────────

-- 1. 필수 테이블 12종 (reviews는 v2.1, price_histories는 v2.4에서 제거)
INSERT INTO _chk VALUES (1,'S','필수 테이블 존재','12',
 (SELECT CAST(COUNT(*) AS CHAR) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN
   ('zones','locations','map_cells','products','stocks','shelf_configs','promotions',
    'members','purchases','wishlists','shelf_events','consumer_events')));

-- 2. 불변식 #1 좌표 격자 — 위치는 (층,x,y)로 표현된다
INSERT INTO _chk VALUES (2,'S','locations 좌표 3종','floor_no,x,y',
 (SELECT IFNULL(GROUP_CONCAT(COLUMN_NAME ORDER BY FIELD(COLUMN_NAME,'floor_no','x','y')),'(없음)')
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
     AND TABLE_NAME='locations' AND COLUMN_NAME IN ('floor_no','x','y')));

-- 3. 불변식 #2 tier_role — 수직 보충의 근거
INSERT INTO _chk VALUES (3,'S','tier_role 정의',"enum('PICK','BULK','FACILITY')",
 (SELECT IFNULL(COLUMN_TYPE,'(없음)') FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='locations' AND COLUMN_NAME='tier_role'));

-- 4. 불변식 #3 임계 구조 — BELOW_PAR의 기준값
INSERT INTO _chk VALUES (4,'S','shelf_configs.min_qty 존재','1',
 (SELECT CAST(COUNT(*) AS CHAR) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='shelf_configs' AND COLUMN_NAME='min_qty'));

-- 5. 불변식 #5 발생 시각의 밀리초 — 리드타임 정확도의 전제
INSERT INTO _chk VALUES (5,'S','occurred_at 정밀도(ms)','3 / 3',
 (SELECT CONCAT(IFNULL(MAX(CASE WHEN TABLE_NAME='shelf_events'    THEN DATETIME_PRECISION END),'-'),' / ',
                IFNULL(MAX(CASE WHEN TABLE_NAME='consumer_events' THEN DATETIME_PRECISION END),'-'))
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
     AND TABLE_NAME IN ('shelf_events','consumer_events') AND COLUMN_NAME='occurred_at'));

-- 6. 이벤트 문법 v2 — 매대 8종 (ENUM 값과 순서까지 계약이다)
INSERT INTO _chk VALUES (6,'S','매대 이벤트 8종',
 "enum('SALE','BELOW_PAR','TASK_QUEUED','TASK_STARTED','ITEM_CONFIRMED','STOCKOUT','RESTOCK_IN','MOVE')",
 (SELECT IFNULL(COLUMN_TYPE,'(없음)') FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='shelf_events' AND COLUMN_NAME='event_type'));

-- 7. 이벤트 문법 v2 — 행동 6종
INSERT INTO _chk VALUES (7,'S','행동 이벤트 6종',
 "enum('SCAN_ADD','SCAN_REMOVE','SEARCH','VIEW','LIST_EDIT','PURCHASE')",
 (SELECT IFNULL(COLUMN_TYPE,'(없음)') FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='consumer_events' AND COLUMN_NAME='event_type'));

-- 8. 불변식 #9 세션·회원 — 비회원도 감시 대상이므로 session_id는 필수, member_id는 선택
INSERT INTO _chk VALUES (8,'S','session_id 필수 / member_id 선택','NO / YES',
 (SELECT CONCAT(IFNULL(MAX(CASE WHEN COLUMN_NAME='session_id' THEN IS_NULLABLE END),'-'),' / ',
                IFNULL(MAX(CASE WHEN COLUMN_NAME='member_id'  THEN IS_NULLABLE END),'-'))
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
     AND TABLE_NAME='consumer_events' AND COLUMN_NAME IN ('session_id','member_id')));

-- 9. 불변식 #8 바코드 유일 (상품 모델당 1개)
INSERT INTO _chk VALUES (9,'S','barcode UNIQUE','1',
 (SELECT CAST(COUNT(DISTINCT INDEX_NAME) AS CHAR) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products'
     AND COLUMN_NAME='barcode' AND NON_UNIQUE=0));

-- 10. v2.2 규칙 — 한 로케이션 = 한 상품 (동거 봉쇄)
--     주의: PK(sku_id, location_id)도 location_id를 포함한 UNIQUE 인덱스라 단순 카운트는
--     2가 나온다. 계약이 요구하는 것은 "location_id **단독**"의 유일성이므로,
--     컬럼이 하나뿐인 UNIQUE 인덱스만 센다.
INSERT INTO _chk VALUES (10,'S','location_id 단독 UNIQUE','1',
 (SELECT CAST(COUNT(*) AS CHAR) FROM
   (SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='stocks' AND NON_UNIQUE=0
     GROUP BY INDEX_NAME
     HAVING COUNT(*)=1 AND MAX(COLUMN_NAME)='location_id') t));

-- 11. 불변식 #7 상품 생애 — 단종은 삭제가 아니라 상태 전환
INSERT INTO _chk VALUES (11,'S','lifecycle_status 정의',"enum('ACTIVE','DISCONTINUED')",
 (SELECT IFNULL(COLUMN_TYPE,'(없음)') FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products' AND COLUMN_NAME='lifecycle_status'));

-- 12. 보행 격자의 PK — (층,x,y)가 셀의 정체성
INSERT INTO _chk VALUES (12,'S','map_cells PK(floor_no,x,y)','floor_no,x,y',
 (SELECT IFNULL(GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX),'(없음)')
    FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
     AND TABLE_NAME='map_cells' AND INDEX_NAME='PRIMARY'));

-- ── [D] 데이터 검사 ──────────────────────────────────────────────────────

-- 13. 음수 재고 없음 (CHECK 제약이 살아 있는지 데이터로 재확인)
INSERT INTO _chk VALUES (13,'D','음수 재고','0',
 (SELECT CAST(COUNT(*) AS CHAR) FROM stocks WHERE qty < 0));

-- 14. 매대 설정 순서 규칙 (min < replenish_to <= capacity)
INSERT INTO _chk VALUES (14,'D','임계<목표<=용량 위반','0',
 (SELECT CAST(COUNT(*) AS CHAR) FROM shelf_configs
   WHERE NOT (min_qty < replenish_to_qty AND replenish_to_qty <= capacity_qty)));

-- 15. 로케이션 동거 없음 (제약이 없더라도 데이터가 규칙을 지키는지)
INSERT INTO _chk VALUES (15,'D','한 칸에 2상품','0',
 (SELECT CAST(COUNT(*) AS CHAR) FROM
   (SELECT location_id FROM stocks GROUP BY location_id HAVING COUNT(*)>1) t));

-- 16. 좌표 일관성 — 같은 (존,랙,베이)의 레벨들은 좌표가 같아야 한다
INSERT INTO _chk VALUES (16,'D','같은 베이 좌표 불일치','0',
 (SELECT CAST(COUNT(*) AS CHAR) FROM locations a JOIN locations b
    ON a.zone_id=b.zone_id AND a.rack_no=b.rack_no AND a.bay_no=b.bay_no
   WHERE a.x<>b.x OR a.y<>b.y));

-- 17. 수직 페어링 — PICK(L1~L3)의 상품이 같은 베이 +3단(L4~L6)에 자기 BULK를 갖는다.
--     "수직 보충 = 바로 위에서 내리기"가 데이터로 성립하는지 본다.
INSERT INTO _chk VALUES (17,'D','수직 페어 성립 SKU 수','2',
 (SELECT CAST(COUNT(*) AS CHAR)
    FROM stocks sp
    JOIN locations p ON p.location_id=sp.location_id AND p.tier_role='PICK'
    JOIN locations b ON b.zone_id=p.zone_id AND b.rack_no=p.rack_no
                    AND b.bay_no=p.bay_no AND b.level_no=p.level_no+3 AND b.tier_role='BULK'
    JOIN stocks sb ON sb.location_id=b.location_id AND sb.sku_id=sp.sku_id));

-- 18. PICK인데 매대 설정이 없는 로케이션 (있으면 BELOW_PAR가 영영 발행되지 않는다)
INSERT INTO _chk VALUES (18,'D','설정 없는 PICK 로케이션','0',
 (SELECT CAST(COUNT(*) AS CHAR) FROM stocks s
    JOIN locations l ON l.location_id=s.location_id AND l.tier_role='PICK'
    LEFT JOIN shelf_configs c ON c.sku_id=s.sku_id AND c.location_id=s.location_id
   WHERE c.sku_id IS NULL));

-- 19. 리드타임 — 장면 1의 보충 사이클이 초 단위까지 재현되는가
INSERT INTO _chk VALUES (19,'D','보충 리드타임(초)','832',
 (SELECT IFNULL(CAST(TIMESTAMPDIFF(SECOND,
     MIN(CASE WHEN event_type='BELOW_PAR'      THEN occurred_at END),
     MIN(CASE WHEN event_type='ITEM_CONFIRMED' THEN occurred_at END)) AS CHAR),'(이벤트 없음)')
    FROM shelf_events WHERE task_id='T-8842'));

-- 20. 밀리초 보존 — 초로 반올림되면 분 단위 수직 보충의 분포가 뭉개진다
--     MICROSECOND()/1000 은 DECIMAL이라 '320.0000'이 된다 → DIV로 정수 나눗셈.
INSERT INTO _chk VALUES (20,'D','BELOW_PAR 밀리초','320',
 (SELECT IFNULL(CAST(MICROSECOND(occurred_at) DIV 1000 AS CHAR),'-')
    FROM shelf_events WHERE event_type='BELOW_PAR' AND task_id='T-8842' LIMIT 1));

-- 21. 전이 규칙 — BELOW_PAR은 (상품,위치,작업)당 1회만. 매 판매마다 발행되면 안 된다.
INSERT INTO _chk VALUES (21,'D','BELOW_PAR 중복 발행','0',
 (SELECT CAST(COUNT(*) AS CHAR) FROM
   (SELECT sku_id, location_id, task_id FROM shelf_events WHERE event_type='BELOW_PAR'
     GROUP BY sku_id, location_id, task_id HAVING COUNT(*)>1) t));

-- 22. 위치 앵커 — SCAN_ADD에는 로케이션이 있어야 한다(없으면 위치 추정의 입력이 사라진다)
INSERT INTO _chk VALUES (22,'D','로케이션 없는 SCAN_ADD','0',
 (SELECT CAST(COUNT(*) AS CHAR) FROM consumer_events
   WHERE event_type='SCAN_ADD' AND location_id IS NULL));

-- 23. 비회원 세션이 실제로 기록되는가 (member_id NULL 허용의 실사용)
INSERT INTO _chk VALUES (23,'D','비회원 행동 이벤트','>=1',
 (SELECT CAST(COUNT(*) AS CHAR) FROM consumer_events WHERE member_id IS NULL));

-- 24. 단종 상품의 과거 구매 이력이 살아 있는가 (불변식 #7의 목적)
INSERT INTO _chk VALUES (24,'D','단종품 구매 이력 보존','>=1',
 (SELECT CAST(COUNT(*) AS CHAR) FROM purchases p
    JOIN products pr ON pr.sku_id=p.sku_id WHERE pr.lifecycle_status='DISCONTINUED'));

-- 25. 소비주기 학습의 최소 조건 — 같은 회원×품목의 반복 구매가 3회 이상
INSERT INTO _chk VALUES (25,'D','반복구매 3회+ 조합','>=1',
 (SELECT CAST(COUNT(*) AS CHAR) FROM
   (SELECT member_id, sku_id FROM purchases GROUP BY member_id, sku_id HAVING COUNT(*)>=3) t));

-- 26. 단위가격 역전 — 총액이 비싼 쪽이 단가는 저렴한 케이스가 있어야
--     기능 13("어느 쪽이 이득?")이 계산해 볼 가치를 갖는다.
INSERT INTO _chk VALUES (26,'D','단위가격 역전 존재','>=1',
 (SELECT CAST(COUNT(*) AS CHAR) FROM products a JOIN products b
    ON a.category_l2=b.category_l2 AND a.sku_id<b.sku_id
   WHERE a.price_krw > b.price_krw
     AND a.price_krw / (a.spec->>'$.quantity.value')
       < b.price_krw / (b.spec->>'$.quantity.value')));

-- 27. 한글 보존 — 콘솔 출력이 ?로 깨져 보여도 저장 자체는 정상이어야 한다.
--     확실한 검사법은 **왕복 대조**다: 저장된 값이 원래 리터럴과 같은가.
--     (바이트 수만 보면 '1kg' 같은 ASCII가 섞였을 때 오판한다 — 한글만 3바이트다.)
INSERT INTO _chk VALUES (27,'D','한글 왕복 저장','OK',
 (SELECT IF(COUNT(*)=1 AND MAX(LENGTH(name)) > MAX(CHAR_LENGTH(name)),'OK','깨짐')
    FROM products WHERE sku_id=103877 AND name='원두 커피 홀빈 1kg'));

-- ── [S] v2.5 회원 축 컬럼 ────────────────────────────────────────────────
-- 이 세 검사는 구조 검사지만 파일 끝에 붙였다 — 번호를 뒤에 이어 붙이면 기존 27개의
-- 번호가 그대로 남아, 과거 실행 결과와 "몇 번이 깨졌나"를 대조할 수 있다.
-- (앞에 끼워 넣으면 전 항목이 한 칸씩 밀려 이력 대조가 불가능해진다.)

-- 28. 축 컬럼 4종이 있는가. 하나라도 빠지면 그 축을 게이트로 쓰는 기능이 조용히
--     전원을 통과시킨다 — by_car가 없으면 도보 방문자에게도 대용량을 민다.
INSERT INTO _chk VALUES (28,'S','members 축 컬럼 4종','by_car,has_child,has_pet,household_size',
 (SELECT IFNULL(GROUP_CONCAT(COLUMN_NAME ORDER BY COLUMN_NAME),'(없음)')
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
     AND TABLE_NAME='members'
     AND COLUMN_NAME IN ('household_size','has_pet','has_child','by_car')));

-- 29. 구 라벨 컬럼이 남아 있지 않은가. 남으면 가입 INSERT가 예전 컬럼을 계속 채우고
--     학습 필터가 두 기준(문자열 vs member_id 범위)으로 갈라진다.
--     둘 다 에러 없이 도는데 결과만 다른 상태가 가장 잡기 어렵다.
INSERT INTO _chk VALUES (29,'S','persona_type 제거됨','0',
 (SELECT CAST(COUNT(*) AS CHAR) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='members' AND COLUMN_NAME='persona_type'));

-- 30. 축 4개가 NULL을 담을 수 있는가. NOT NULL이 하나라도 걸리면 NULL(안 물어봄)과
--     FALSE(없다고 답함)의 구분이 무너지고, 기본값 0이 채워져 **전원이 "반려동물 없음"**이 된다.
INSERT INTO _chk VALUES (30,'S','축 컬럼 NULL 허용','4',
 (SELECT CAST(COUNT(*) AS CHAR) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='members' AND IS_NULLABLE='YES'
     AND COLUMN_NAME IN ('household_size','has_pet','has_child','by_car')));

-- ── 결과 ─────────────────────────────────────────────────────────────────
SELECT '=== StoreFlow 계약 테스트 v2 ===' AS ``;

SELECT no AS `#`, kind AS `구분`, item AS `검사 항목`, expected AS `기대`, actual AS `실제`,
       CASE WHEN expected LIKE '>=%'
              THEN IF(CAST(actual AS SIGNED) >= CAST(SUBSTRING(expected,3) AS SIGNED),'PASS','**FAIL**')
            WHEN expected='3배'
              THEN IF(actual LIKE '%(3배)','PASS','**FAIL**')
            ELSE IF(actual = expected,'PASS','**FAIL**') END AS `판정`
  FROM _chk ORDER BY no;

SELECT
  CONCAT(SUM(CASE WHEN pass=1 THEN 1 ELSE 0 END),' / ',COUNT(*),' 통과') AS `요약`,
  IF(SUM(CASE WHEN pass=0 THEN 1 ELSE 0 END)=0,
     '계약 준수 — 파이프라인 안전',
     CONCAT('계약 위반 ', SUM(CASE WHEN pass=0 THEN 1 ELSE 0 END), '건 — 위 FAIL 행 확인')) AS `결론`
FROM (
  SELECT CASE WHEN expected LIKE '>=%'
                THEN CAST(actual AS SIGNED) >= CAST(SUBSTRING(expected,3) AS SIGNED)
              WHEN expected='3배' THEN actual LIKE '%(3배)'
              ELSE actual = expected END AS pass
    FROM _chk) t;
