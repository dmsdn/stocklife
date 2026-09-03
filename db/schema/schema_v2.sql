-- ============================================================================
-- StoreFlow 스키마 v2.5 — 매장 관제 테이블군 (2026-08-13 전면 재정립판)
-- v2.1: reviews 테이블 제거 (후기·별점 기능 팀 회의 탈락)
-- v2.2: 1 상품 = 1 로케이션 확정 (동거 폐지) — stocks.location_id UNIQUE 추가
-- v2.3: 랙 6단 전환 — L1~L3 PICK / L4~L6 BULK (구조 변경 없음, 주석·생성 규칙만)
-- v2.4 (08-18): ① members.household_size NULL 허용 — NULL = 모름(실사용자).
--                  임의 숫자로 채우지 않는다(그럴듯한 가짜가 조용한 오답을 만든다)
--               ② price_histories 테이블 제거 — 읽는 기능이 없음(백엔드 제안 수용).
--                  "그때 얼마에 샀나"는 purchases.unit_price_krw 동결값이 담당
--               ③ reviews DROP 제거 — 백엔드가 UI용 reviews 테이블을 소유하게 됨.
--                  우리가 지우면 안 된다(AI는 여전히 안 읽는다 — 웹 검색 대체 결정 유지)
-- v2.5 (08-19): members.persona_type 삭제 → 축 컬럼 4개(has_pet·has_child·by_car 신규).
--                  라벨 한 칸에 서로 다른 축이 섞여 "1인 가구인데 반려동물을 키움" 같은
--                  실제 조합이 표현되지 않았다. 상세 근거는 아래 members 정의부 주석.
-- ============================================================================
-- 지위: 구 「DB스키마_초안.md 부록 A」를 대체한다. 조건부 ALTER로 기존 테이블을
--       고치는 방식이 아니라, 매장 세계 테이블군을 통째로 재생성한다(권한 확보됨).
--       백엔드 고유 테이블(로그인·인증·결제·쿠폰)은 이 파일이 건드리지 않는다.
--
-- 실행(팀 공용 도커):
--   Get-Content schema_v2.sql -Encoding UTF8 | docker exec -i storeflow_mysql mysql -uroot -p1234 <db>
--   ⚠ -Encoding UTF8 필수 — 파워셸 기본 인코딩으로 파이프하면 한글 리터럴이 깨진다.
--
-- 재실행 정책: DROP → CREATE. 조건부 ALTER(v1 방식)를 버린 이유는
--   ① 세계 데이터는 전부 시드에서 재적재하므로 보존할 상태가 없고
--   ② "CREATE TABLE IF NOT EXISTS"는 컬럼 변경을 반영하지 못하는 함정이 있어서
--      (테이블이 이미 있으면 조용히 스킵 → 낡은 스키마가 계속 살아남는다)
--   재실행 = 깨끗한 재생성이 가장 예측 가능하기 때문이다.
--
-- 이 파일이 지키는 불변식(팀계약.md §5.2) 매핑:
--   #1 좌표 격자        → locations(floor_no,x,y) + map_cells PK
--   #2 tier_role        → locations.tier_role ENUM('PICK','BULK')
--   #3 임계 구조        → shelf_configs.min_qty (BELOW_PAR 발행 임계)
--   #5 발생 시각 ms     → 모든 이벤트 occurred_at TIMESTAMP(3)
--   #7 상품 정체성 불변 → products.sku_id·barcode 재사용 금지, 단종=lifecycle_status 전환
--   #8 바코드 유일      → products.barcode UNIQUE
--   #9 세션·회원 연결   → consumer_events.session_id NOT NULL + member_id NULL 허용
--   (#4 재고 단일 경로, #6 문법 단일 소스, #10 단일 SSE는 스키마가 아니라 동작 계약)
-- ============================================================================

SET NAMES utf8mb4;

-- 자식(참조하는 쪽)부터 지워야 FK 제약에 걸리지 않는다.
DROP TABLE IF EXISTS consumer_events;
DROP TABLE IF EXISTS shelf_events;
DROP TABLE IF EXISTS wishlists;
DROP TABLE IF EXISTS purchases;
-- (v2.4: reviews는 DROP하지 않는다 — 백엔드 소유 UI 테이블로 이관됨.
--  세계 재적재가 백엔드의 25만 행 리뷰 시드를 지워버리면 안 된다.)
DROP TABLE IF EXISTS price_histories;   -- v2.4: 테이블 제거 — 구버전 DB의 잔재 청소용으로만 남김
DROP TABLE IF EXISTS promotions;
DROP TABLE IF EXISTS shelf_configs;
DROP TABLE IF EXISTS stocks;
DROP TABLE IF EXISTS map_cells;
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS zones;
DROP TABLE IF EXISTS members;
DROP TABLE IF EXISTS products;

-- ============================================================================
-- 1. 매장 구조 — zones · locations · map_cells
-- ============================================================================

-- 존: 카테고리 묶음 단위의 구역. 에이전트의 응답 문장에 그대로 읽히므로
-- zone_id를 의미 없는 숫자가 아니라 사람이 읽는 형태('F2-C')로 둔다.
CREATE TABLE zones (
  zone_id   VARCHAR(8)   NOT NULL,          -- 'F2-C' = 2층 C구역. 'B1-W' = 지하 창고
  floor_no  TINYINT      NOT NULL,          -- 1~3 판매층, 0 = B1(지하 중앙창고).
                                            -- 음수 대신 0을 쓰는 이유: v1 시드·검증 스크립트가
                                            -- 이미 0=지하 관례를 쓰고 있어 혼선을 만들지 않는다
  name      VARCHAR(40)  NOT NULL,          -- '세제·청소 구역' — 소비자 노출 라벨.
                                            -- 에이전트가 "2층 세제·청소 구역이에요"라고 말할 때 쓴다
  zone_type ENUM('SALES','BACKROOM','FACILITY') NOT NULL DEFAULT 'SALES',   -- 09-03: 층별 시설 존 'F1-X'
                                            -- 백룸을 별도 테이블이 아니라 존의 한 유형으로 두는 이유:
                                            -- 보충 경로(수평/층간)가 "존→존 이동"으로 균일하게 표현된다
  PRIMARY KEY (zone_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 로케이션: 베이×레벨 한 칸. 재고·이벤트·경로 안내가 전부 이 단위를 가리킨다.
CREATE TABLE locations (
  location_id VARCHAR(24) NOT NULL,         -- 'F2-C-R03-B2-L1'. 문자열 PK를 유지하는 이유:
                                            -- 이벤트 로그·응답 문장·디버깅에서 위치가 즉시 읽혀야 하고,
                                            -- 조인 성능 손해(수천 행 규모)보다 가독성 이득이 크다
  zone_id     VARCHAR(8)  NOT NULL,
  rack_no     TINYINT     NOT NULL,
  bay_no      TINYINT     NOT NULL,
  level_no    TINYINT     NOT NULL,         -- 1~6단
  tier_role   ENUM('PICK','BULK','FACILITY') NOT NULL, -- L1~L3=PICK(손 닿는 진열), L4~L6=BULK(위 예비).
                                            -- 09-03 FACILITY: 시설(화장실·계산대·엘리베이터…) 위치 행.
                                            --   id 'F1-X-RESTROOM_M-1', rack 0 · bay=순번 · level 0,
                                            --   x,y = 블록 중심(통행 칸). 동선 정지점·출발점으로 쓴다
                                            -- 수직 보충(분 단위 리드타임)이라는 개념의 물리적 근거.
                                            -- 규칙은 생성기가 보장하고 계약 테스트가 검사한다
  floor_no    TINYINT     NOT NULL,         -- zones.floor_no와 중복 저장. 비정규화하는 이유:
                                            -- 위치 질의(경로·지도)마다 zones 조인을 피한다 —
                                            -- 좌표 3요소(floor,x,y)는 항상 한 테이블에서 나와야
                                            -- 학습 피처와 내비 그래프가 같은 소스를 보게 된다(불변식 #1)
  x           SMALLINT    NOT NULL,         -- 격자 좌표(셀=2m). 같은 랙의 4개 레벨은 좌표가 동일 —
  y           SMALLINT    NOT NULL,         --   "위치"는 평면상 접근 지점이고 레벨은 높이일 뿐이다
  PRIMARY KEY (location_id),
  KEY idx_floor_xy (floor_no, x, y),        -- 내비 그래프 파생·근접 질의용
  KEY idx_zone (zone_id),
  CONSTRAINT fk_loc_zone FOREIGN KEY (zone_id) REFERENCES zones(zone_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 보행 격자: 통행 가능/불가 + 층간 이동 수단. 내비 그래프의 원천.
CREATE TABLE map_cells (
  floor_no   TINYINT  NOT NULL,
  x          SMALLINT NOT NULL,
  y          SMALLINT NOT NULL,
  passable   BOOLEAN  NOT NULL DEFAULT TRUE,
  transit_id VARCHAR(8) NULL,               -- 'MW-UP'/'MW-DN' 등 무빙워크 식별자.
  kind       ENUM('AISLE','SHELF','FACILITY','TRANSIT') NOT NULL DEFAULT 'AISLE',
                                            -- 09-02: 칸의 정체. 없으면 프론트가 "가장 가까운
                                            -- location 의 존" 으로 추측해 시설 블록을 매대로,
                                            -- 벽가 매대를 벽으로 칠했다. 생성기가 아는 것을 싣는다
  shelf_zone VARCHAR(8) NULL,               -- kind=SHELF 일 때 그 매대 몸체의 zone_id ('F1-A')
  facility_kind VARCHAR(24) NULL,           -- 09-03: kind=FACILITY/TRANSIT 일 때 시설 종류
                                            -- (RESTROOM_M·ELEVATOR·ESCALATOR·CHECKOUT·FOODCOURT…
                                            --  sim/map_layout.FACILITY_LABELS 의 키). 이름 있는
                                            -- 시설은 passable=TRUE — 들어가거나 가로지를 수 있다
                                            -- 같은 transit_id를 가진 셀들이 층간 간선으로 연결된다.
                                            -- 간선 비용(2~3분)은 DB가 아니라 그래프 생성기의 파라미터 —
                                            -- 튜닝 값이라 스키마에 굳히지 않는다
  PRIMARY KEY (floor_no, x, y)              -- FK 없음(의도): 셀은 수천 개 단위 벌크 적재라
                                            -- 행별 FK 검사 비용을 피하고, 정합성은 생성기가 보장
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 2. 상품 — products
-- ============================================================================

CREATE TABLE products (
  sku_id           INT UNSIGNED NOT NULL,   -- 시드가 부여(AUTO_INCREMENT 아님).
                                            -- 세계 버전을 올려 재생성해도 같은 상품이 같은 ID를 갖도록
                                            -- 생성기가 결정적으로 부여해야, 재적재 후에도 구매 이력·
                                            -- 이벤트와의 연결이 보존된다
  barcode          VARCHAR(20)  NOT NULL,   -- EAN-13. 상품 모델당 1개(개체당이 아님) — 불변식 #8
  name             VARCHAR(200) NOT NULL,
  brand            VARCHAR(50)  NOT NULL,
  is_pb            BOOLEAN      NOT NULL DEFAULT FALSE,
  category_l1      VARCHAR(30)  NOT NULL,   -- ENUM이 아니라 VARCHAR인 이유: 카테고리 목록은
  category_l2      VARCHAR(30)  NOT NULL,   -- W2 초까지 튜닝 대상이라 스키마에 굳히면 매번 DDL이
                                            -- 바뀐다. 값의 정합성은 계약 테스트가 카탈로그와 대조
  is_refrigerated  BOOLEAN      NOT NULL DEFAULT FALSE, -- 플래그 4종을 카테고리와 별개 컬럼으로
  is_frozen        BOOLEAN      NOT NULL DEFAULT FALSE, -- 두는 이유: "요리용 청주=조미료지만 주류"
  is_alcohol       BOOLEAN      NOT NULL DEFAULT FALSE, -- 처럼 카테고리와 직교하는 확정 사실이고,
  is_fresh         BOOLEAN      NOT NULL DEFAULT FALSE, -- LLM에게 추론이 아니라 조건 변환만 시키는
                                                        -- 헌법의 물리적 지지대다
  unit             VARCHAR(20)  NOT NULL,   -- 'volume_ml' 등 — 단위가격 비교의 주 축
  price_krw        INT UNSIGNED NOT NULL,
  spec             JSON         NOT NULL,   -- {"raw":..,"quantity":{..},"quality":{..},"usage":{..}}
                                            -- JSON인 이유: 읽는 주체가 SQL 필터가 아니라
                                            -- 파서·비교기(도구 내부)라서. LLM이 조건으로 거는 값은
                                            -- 전부 위의 열거형 컬럼에 있다 (저장 방식 원칙)
  spec_raw         VARCHAR(200) NOT NULL,   -- '9,000ml (1.5L × 6입)' — 표시·파싱 입력 원문
  image_url        VARCHAR(300) NULL,       -- 이미지는 파일로 따로 인도, DB에는 경로만
  first_stocked_at DATE         NOT NULL,   -- 최초 입고일. "취향인 신상"(기능 20)의 근거.
                                            -- 이벤트가 아니라 정적 속성 — 세계 생성 시 분포로 부여
  lifecycle_status ENUM('ACTIVE','DISCONTINUED') NOT NULL DEFAULT 'ACTIVE',
                                            -- 단종 = 행 삭제가 아니라 상태 전환(불변식 #7).
                                            -- 지우면 과거 구매 이력·이벤트가 고아가 되어
                                            -- 소비주기 학습이 깨진다. 리뉴얼 = 신규 sku_id
  PRIMARY KEY (sku_id),
  UNIQUE KEY uq_barcode (barcode),
  KEY idx_category (category_l1, category_l2),          -- search_products의 범위 질의
  KEY idx_new_arrivals (lifecycle_status, first_stocked_at)  -- "신상" 질의
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 3. 재고와 매대 설정 — stocks · shelf_configs
-- ============================================================================

-- 재고: (상품 × 로케이션) 쌍.
-- 관계 규칙(v2.2): 로케이션 하나에는 상품 하나만 산다 — UNIQUE(location_id)로 강제.
-- 그런데도 PK가 복합인 이유: 한 상품은 로케이션을 여러 개 가진다
-- (PICK 1 + 바로 위 BULK 1 + 필요시 백룸·B1) — 관계는 상품:로케이션 = 1:N이다.
CREATE TABLE stocks (
  sku_id      INT UNSIGNED NOT NULL,
  location_id VARCHAR(24)  NOT NULL,
  qty         INT          NOT NULL,
  PRIMARY KEY (sku_id, location_id),
  UNIQUE KEY uq_stk_location (location_id), -- "한 칸 = 한 상품". 동거를 스키마 차원에서 봉쇄 —
                                            -- 시드 생성기의 버그(같은 칸에 두 상품 배정)가
                                            -- 조용히 저장되지 않고 적재 시점에 터진다
  CONSTRAINT fk_stk_sku FOREIGN KEY (sku_id) REFERENCES products(sku_id),
  CONSTRAINT fk_stk_loc FOREIGN KEY (location_id) REFERENCES locations(location_id),
  CONSTRAINT ck_qty CHECK (qty >= 0)        -- 음수 재고는 버그의 증상 — 조용히 저장되게 두지 않고
                                            -- 쓰기 시점에 터뜨린다 (MySQL 8.0.16+에서 실제 강제됨)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 매대 설정: PICK 로케이션의 임계·보충 목표·용량.
-- BELOW_PAR 이벤트의 발행 조건(old >= min AND new < min)이 이 min_qty를 참조한다.
CREATE TABLE shelf_configs (
  sku_id           INT UNSIGNED NOT NULL,
  location_id      VARCHAR(24)  NOT NULL,
  min_qty          INT NOT NULL,            -- 임계(par). 불변식 #3의 실체
  replenish_to_qty INT NOT NULL,            -- 보충 목표량
  capacity_qty     INT NOT NULL,            -- 물리 용량
  PRIMARY KEY (sku_id, location_id),
  CONSTRAINT fk_cfg_sku FOREIGN KEY (sku_id) REFERENCES products(sku_id),
  CONSTRAINT fk_cfg_loc FOREIGN KEY (location_id) REFERENCES locations(location_id),
  CONSTRAINT ck_cfg CHECK (min_qty < replenish_to_qty AND replenish_to_qty <= capacity_qty)
                                            -- 이 순서가 깨지면 보충 시뮬이 무한 루프를 돌거나
                                            -- (목표<임계) 진열대가 넘친다(목표>용량). 도메인 규칙을
                                            -- 주석이 아니라 제약으로 박아 시드 버그를 적재 시점에 잡는다
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 4. 가격·행사 — promotions
-- ============================================================================

CREATE TABLE promotions (
  promo_id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku_id     INT UNSIGNED NOT NULL,
  promo_type VARCHAR(20)  NOT NULL,         -- 'DISCOUNT' / 'BUNDLE' 등. 종류가 확정 전이라 VARCHAR
  discount_krw INT UNSIGNED NOT NULL,
  starts_at  TIMESTAMP(3) NOT NULL,
  ends_at    TIMESTAMP(3) NOT NULL,
  PRIMARY KEY (promo_id),
  KEY idx_promo_active (starts_at, ends_at),-- "지금 행사 중" 질의: WHERE now BETWEEN starts AND ends
  KEY idx_promo_sku (sku_id),
  CONSTRAINT fk_promo_sku FOREIGN KEY (sku_id) REFERENCES products(sku_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (v2.4에서 price_histories 삭제 — 도구 19·기능 21 어디에도 소비자가 없었다.
--  현재가는 products.price_krw가 유일 소스이고, "그때 얼마에 샀나"는
--  purchases.unit_price_krw가 구매 시점에 동결 보관한다. 시뮬 세계의 가격 변동
--  자체는 생성기 내부·parquet에 살아 있다 — DB 서빙만 없앤 것.)

-- (v2.1에서 reviews 테이블 삭제 — 후기·별점 기능이 팀 회의에서 탈락했다.
--  근거: 창고형 매장 사이트들에서 후기·별점이 실사용되지 않고, "이 상품 어때?"류 질의는
--  후기 요약보다 LLM의 웹 검색으로 답하는 쪽이 소비자 편의적이다.
--  DROP 목록에는 남겨 두어 구버전 스키마에서 넘어와도 잔재가 지워지게 한다.)

-- ============================================================================
-- 5. 회원과 구매 이력 — members · purchases · wishlists
-- ============================================================================

-- 회원 프로필: 백엔드의 인증·계정 테이블과 의도적으로 분리된 별도 테이블.
-- 이유: 로그인은 백엔드 불가침 영역이고, 우리가 필요한 것은 개인화 판단의 입력뿐이다.
-- 연결은 FK가 아니라 계산식(member_id = 10,000,000 + consumer_id)으로 한다 — 시드를
-- 통째로 갈아엎을 때 FK가 실사용자 계정까지 함께 끌고 지워지면 안 되기 때문.
--
-- v2.5: persona_type을 삭제하고 축 컬럼으로 나눴다. 구 7종('4인가족'·'반려인'·'캠핑레저족'…)은
-- 한 칸에 네 축(가구 규모·구매 목적·반려 여부·관심 카테고리)을 섞어 놓은 라벨이라,
-- "1인 가구인데 반려동물을 키움" 같은 실제 조합을 표현할 수 없었다.
--
-- 컬럼이 될 자격 — 셋을 모두 만족해야 한다:
--   ① 구매 이력이 **원리적으로** 모르는 값인가.
--      취향·가격민감도·방문주기·평균 바스켓은 이력에 드러나므로 묻지 않는다. 물어보는 순간
--      그것을 학습할 자산(취향 매칭·소비주기)이 할 일을 잃는다. 게다가 자기보고는 부정확하다.
--   ② 그 값을 소비하는 기능이 기능 21 안에 실제로 있는가(배송·혼잡도 등은 소비자가 없다).
--   ③ 가입 폼에서 한 번의 탭으로 답할 수 있는가.
--
-- 전부 NULL 허용인 이유: NULL(안 물어봄) ≠ FALSE(없다고 답함).
-- '반려동물 없음'이면 사료 추천을 빼도 되지만 '모름'이면 일반 추천으로 가야 한다.
-- 모르는 값을 그럴듯한 기본값으로 채우면 필터를 깜빡한 코드가 조용히 틀린다 — NULL은 시끄럽게 틀린다.
CREATE TABLE members (
  member_id      INT UNSIGNED NOT NULL,     -- 시드가 부여 — sku_id와 같은 이유(결정적 재생성).
                                            -- 실사용자는 10,000,000 + consumer_id.
                                            -- v2.5: 학습 대상 필터는 이 범위로 한다
                                            -- (member_id < 10000000). 구 `persona_type != '실사용자'`는
                                            -- 문자열이라 오타 하나에 조용히 오염됐다 — 범위는 구조라 안 틀린다
  household_size TINYINT      NULL,         -- 1~5 (5 = 5명 이상). 소비 주기의 '분모'.
                                            -- 화장지 30롤은 1인에게 약 5개월치, 4인에게 약 6주치다.
                                            -- 기능 14(과다구매 경고)와 재구매 시점의 사전값(prior)이며,
                                            -- 이력이 3회 이상 쌓이면 이력이 이긴다.
                                            -- 창고형은 구매 주기가 길어 그게 몇 달 걸린다 — 그 사이를 메운다
  has_pet        BOOLEAN      NULL,         -- 이력은 "안 샀다"만 알고 "왜 안 샀나"를 모른다.
  has_child      BOOLEAN      NULL,         -- 안 키워서인가, 다른 데서 사서인가 — 이 한 비트가 가른다.
                                            -- 전자면 사료 행사 알림은 스팸이고, 후자면 정확한 개입이다
  by_car         BOOLEAN      NULL,         -- 창고형 고유 축. 도보·대중교통 방문자에게
                                            -- "30롤이 100ml당 12% 저렴해요"는 맞지만 틀린 추천이다(못 들고 간다).
                                            -- 단위가격 비교(기능 13)·망설임 개입이 대용량을 밀 때의 게이트
  created_at     TIMESTAMP(3) NOT NULL,
  PRIMARY KEY (member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 구매 이력: 소비주기 학습과 개인화 기능 8종의 젖줄. 시드(180일) + 데모 중 PURCHASE로 적재.
-- 바스켓 단위가 아니라 품목 단위 행인 이유: 소비주기는 (회원 × 품목)의 구매 "간격"을 보므로
-- 품목 행이 기본 단위다. 같은 결제 건은 basket_id로 묶는다.
CREATE TABLE purchases (
  purchase_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  basket_id     VARCHAR(36)  NOT NULL,      -- 결제 1건의 묶음 식별자 (장보기 결산·기능 19가 사용)
  member_id     INT UNSIGNED NOT NULL,
  sku_id        INT UNSIGNED NOT NULL,
  qty           INT UNSIGNED NOT NULL,
  unit_price_krw INT UNSIGNED NOT NULL,     -- 구매 시점 단가를 동결 보관 — 나중에 가격이 바뀌어도
                                            -- "그때 얼마에 샀나"가 보존되어야 결산·주기 분석이 정확하다
  purchased_at  TIMESTAMP(3) NOT NULL,
  PRIMARY KEY (purchase_id),
  KEY idx_pur_member (member_id, purchased_at),  -- 회원 이력 조회(get_purchase_history)
  KEY idx_pur_member_sku (member_id, sku_id, purchased_at),
                                            -- 소비주기의 핵심 질의: "이 회원이 이 품목을 언제언제 샀나"
                                            -- 를 인덱스만으로 시간순으로 뽑기 위한 복합 인덱스
  CONSTRAINT fk_pur_member FOREIGN KEY (member_id) REFERENCES members(member_id),
  CONSTRAINT fk_pur_sku FOREIGN KEY (sku_id) REFERENCES products(sku_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE wishlists (
  member_id INT UNSIGNED NOT NULL,
  sku_id    INT UNSIGNED NOT NULL,
  added_at  TIMESTAMP(3) NOT NULL,
  PRIMARY KEY (member_id, sku_id),          -- 같은 상품 중복 찜 방지가 PK로 공짜로 해결된다
  KEY idx_wl_sku (sku_id),                  -- 세계 감시자의 역방향 조인:
                                            -- "입고된 이 상품, 누구 위시리스트에 있나"
  CONSTRAINT fk_wl_member FOREIGN KEY (member_id) REFERENCES members(member_id),
  CONSTRAINT fk_wl_sku FOREIGN KEY (sku_id) REFERENCES products(sku_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 6. 이벤트 — shelf_events · consumer_events (append-only)
-- ============================================================================
-- 두 테이블 공통 설계:
--   · FK 없음(의도) — 이벤트는 고빈도 삽입이고, 적재가 마스터 데이터 문제로 실패하면
--     로그에 구멍이 나는 쪽이 더 큰 사고다. 정합성은 발행 코드(단일 경로)가 보장한다.
--   · occurred_at = "발생" 시각이지 기록 시각이 아니다. TIMESTAMP(3)로 밀리초 보존 —
--     리드타임(BELOW_PAR→ITEM_CONFIRMED)이 이 차이로 계산되므로 초 반올림이면
--     분 단위인 수직 보충의 분포가 뭉개진다.
--   · payload JSON — 타입별 부가 정보의 확장 자리. 새 필드가 필요할 때마다
--     ALTER 없이 담을 수 있게 하되, 자주 조회하는 값은 컬럼으로 승격한다.

CREATE TABLE shelf_events (
  event_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type  ENUM('SALE','BELOW_PAR','TASK_QUEUED','TASK_STARTED',
                   'ITEM_CONFIRMED','STOCKOUT','RESTOCK_IN','MOVE') NOT NULL,
                                            -- ENUM인 이유: 문법이 계약이므로 오타가 저장되면 안 된다.
                                            -- MySQL ENUM 규칙 — 새 타입은 반드시 "끝에" 추가
                                            -- (중간 삽입은 기존 행의 내부 인덱스를 흔든다)
  sku_id      INT UNSIGNED NOT NULL,
  location_id VARCHAR(24)  NOT NULL,        -- MOVE의 경우: 신(新) 위치. 구 위치는 payload에
                                            -- {"prev_location_id": ...}로 담는다 — "지금 어디 있나"를
                                            -- 묻는 조회가 압도적으로 많으므로 신 위치를 컬럼에 둔다
  qty         INT          NULL,            -- SALE·ITEM_CONFIRMED 등 수량이 있는 타입만
  task_id     VARCHAR(36)  NULL,            -- 보충 사이클 묶음(QUEUED→STARTED→CONFIRMED을
                                            -- 하나의 작업으로 잇는 실). 리드타임 학습의 조인 키
  occurred_at TIMESTAMP(3) NOT NULL,
  payload     JSON         NULL,
  PRIMARY KEY (event_id),
  KEY idx_se_sku_loc_time (sku_id, location_id, occurred_at),
                                            -- 학습 데이터 구성의 핵심 질의: (상품×위치)의 사건 시계열
  KEY idx_se_type_time (event_type, occurred_at)
                                            -- get_change_events: "최근 MOVE·RESTOCK_IN" 질의 +
                                            -- 감시자의 타입별 필터
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE consumer_events (
  event_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type  ENUM('SCAN_ADD','SCAN_REMOVE','SEARCH','VIEW',
                   'LIST_EDIT','PURCHASE') NOT NULL,
  session_id  VARCHAR(64)  NOT NULL,        -- 비회원 포함 전원 — 행동 감시자·위치 추정은
                                            -- 로그인 여부와 무관하게 동작해야 한다 (불변식 #9)
  member_id   INT UNSIGNED NULL,            -- 로그인 세션이면 연결, 아니면 NULL.
                                            -- 개인화(주기·취향)는 이 컬럼이 있는 행만 쓴다
  sku_id      INT UNSIGNED NULL,            -- SEARCH 등 상품이 특정되지 않는 타입이 있어 NULL 허용
  location_id VARCHAR(24)  NULL,            -- SCAN_ADD에서 필수 — 위치 앵커의 원천.
                                            -- 스캔한 상품의 로케이션 = 사용자가 서 있는 지점
  occurred_at TIMESTAMP(3) NOT NULL,
  payload     JSON         NULL,            -- SEARCH의 질의문, PURCHASE의 basket_id 등
  PRIMARY KEY (event_id),
  KEY idx_ce_session_time (session_id, occurred_at),
                                            -- 행동 감시자의 핵심 질의: 이 세션의 최근 행동 윈도우
  KEY idx_ce_member_time (member_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
