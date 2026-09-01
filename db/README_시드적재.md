# DB 세우기 — 순서와 함정 (2026-08-26 실전 기록)

> 08-26에 백엔드↔에이전트 첫 실연동을 하며 실제로 걸린 것들을 순서대로 적는다.
> **이 순서를 지키면 30분, 안 지키면 하루 걸린다.**

## 0. 전제

```
MySQL   localhost:3307 / storeflow_db
접속    Backend/src/main/resources/application.yml 의 spring.datasource
        (⚠ 이 파일은 git 미추적 — 각자 로컬. 없으면 팀원에게 받는다)
```

## 1. 적재 순서 — 위에서 아래로

| # | 파일 | 무엇 | 왜 이 순서 |
|---|---|---|---|
| ① | `db/schema/schema_v2.sql` | **세계 스키마 v2.5** — products·locations·stocks·members·purchases·shelf_events·consumer_events | 나머지가 전부 여기 기댄다 |
| ② | `db/backend_own_tables_`**`current`**`.sql` | **백엔드 고유** — orders·order_item·consumer·cart_*·chat_*·coupon·notification | ①과 별개 도메인이다(아래 §3). ⚠ `_v1` 이 아니다 — §2-⑤ |
| ③ | `db/phone_verification.sql`<br>`db/migration_chat_v1.sql` | 마이그레이션 **(앞)** — 테이블을 만드는 것 | 시드보다 먼저. ⚠ `--force` 필수 — §2-⑧ |
| ④ | `db/seed/01_consumer_seed_2000.sql` | consumer 2,000 | ⚠ **`migration_chat_v2` 보다 먼저** — §2-⑩. 빠뜨리면 장바구니 3종이 죽는다 — §1-⑧ |
| ⑤ | **`db/seed/migration_chat_v2.sql`**<br>`db/Migration_guest_cart_v1.sql` | 마이그레이션 **(뒤)** — 컬럼을 더하고 **기존 행을 채우는 것** | ④ 뒤여야 한다(회원이 있어야 이름을 채운다). ⚠ 빠뜨리면 채팅 창구가 전부 500 — §2-⑦ |
| ⑥ | `Agent/catalog/out/products_seed_5000.sql` | 상품 5,000 | 위치·재고가 sku를 참조 |
| ⑦ | `Agent/sim/out/world_seed.sql` | locations 11,544 · stocks 9,940 · shelf_configs 4,970 | 매대 구조 |
| ⑧ | `Agent/sim/out/members_seed.sql` | 회원 10,000 | |
| ⑨ | `Agent/sim/out/wishlist_seed.sql` | **찜 54,903건**(회원당 5.5) | 회원 다음. `get_wishlist` 와 진입 브리핑의 재료 |
| ⑩ | `Agent/sim/out/mode1/history_seed.sql` | **데모 슬라이스** — 회원 30명 × 90일<br>purchases 1,988 · shelf_events 255,891 · consumer_events 3,696 | 몇 분 걸린다.<br>⚠ 숫자는 08-27 재생성 후 실측(08-28). 시점 정합으로 창이 바뀌면 또 달라진다 — 세고 싶으면 `INSERT INTO` 사이의 `(` 로 시작하는 줄을 센다 |

> ⚠ **08-28 교정 — 이 블록에 ③ 마이그레이션 네 개가 빠져 있었다.**
> 위 표에는 적혀 있는데 **복붙하는 블록에는 없었다.** 사람은 표가 아니라
> 블록을 복사한다. 그래서 아무도 안 돌렸고, `chat_session` 에 컬럼이 없어
> **채팅 도메인 전체가 500** 이었다(§2-⑦ · §2-⑧).
> **표와 블록이 어긋나면 블록이 이긴다** — 절차서는 읽히는 게 아니라 실행된다.

```bash
MYSQL="/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe"
# ⚠ 옵션 둘은 선택이 아니다 — 없으면 조용히 반만 적용된다(§2-⑧ · §2-⑨)
#   --force                      오류에서 안 멈춘다(중복은 무해, 중단은 유해)
#   --default-character-set      윈도우 클라이언트 기본이 euckr 이라 한글이 깨진다
OPTS="--force --default-character-set=utf8mb4"
DB="-h127.0.0.1 -P3307 -uroot -p storeflow_db"

# ① 세계 스키마
"$MYSQL" $OPTS $DB < db/schema/schema_v2.sql
# ② 백엔드 고유 테이블
"$MYSQL" $OPTS $DB < db/backend_own_tables_current.sql
# ③ 마이그레이션 (앞) — 테이블을 만드는 것들
"$MYSQL" $OPTS $DB < db/phone_verification.sql
"$MYSQL" $OPTS $DB < db/migration_chat_v1.sql
# ④ consumer 시드 — ⚠ **chat_v2 보다 먼저.** 이유는 §2-⑩
"$MYSQL" $OPTS $DB < db/seed/01_consumer_seed_2000.sql
# ⑤ 마이그레이션 (뒤) — 컬럼을 더하고 기존 행을 채우는 것들
"$MYSQL" $OPTS $DB < db/seed/migration_chat_v2.sql
"$MYSQL" $OPTS $DB < db/Migration_guest_cart_v1.sql
# ⚠ 위 파일의 CHECK 하나는 **지금 코드와 안 맞는다** — 반드시 걷어낸다(§2-⑪)
"$MYSQL" $OPTS $DB -e "ALTER TABLE cart_item DROP CHECK chk_cart_owner;"
# ⑥~⑪ 세계 시드
"$MYSQL" $OPTS $DB < Agent/catalog/out/products_seed_5000.sql
"$MYSQL" $OPTS $DB < Agent/sim/out/world_seed.sql
"$MYSQL" $OPTS $DB < Agent/sim/out/members_seed.sql
"$MYSQL" $OPTS $DB < Agent/sim/out/wishlist_seed.sql
"$MYSQL" $OPTS $DB < Agent/sim/out/mode1/history_seed.sql
"$MYSQL" $OPTS $DB < Agent/sim/out/mode1/stock_sync.sql
```

**다 돌린 뒤 컬럼이 실제로 섰는지 본다** — `--force` 는 오류를 넘기므로
"돌렸다"가 "됐다"를 뜻하지 않는다.

```bash
"$MYSQL" $OPTS $DB -e "SHOW COLUMNS FROM chat_session;"
# anonymous_id · group_id · title 이 다 보여야 한다. 하나라도 없으면 ③이 반만 돈 것.
```

### ⑦-b `stock_sync.sql` — **반드시 history 다음, 마지막에** (08-27 신설)

재고 스냅샷을 DES 스냅샷 시각(**2026-08-08 토 14:20** = `config.DEMO_NOW`)으로
동기화한다. 없으면 stocks 가 t=0 상태라 "이미 채워졌는데 par 밑" 같은 자기모순이
생기고, pending 의 queuedAt 이 전부 null 이 된다. 토요일 오후인 이유: 평일 낮의
순간 큐는 0~5건이라 킬링 장면 1이 성립하지 않는다(주말 오후가 피크 — 큐 96건).

### ⑧ `01_consumer_seed_2000.sql` — **빠뜨리면 장바구니 3종이 죽는다**

`consumer` 2,000명(id 1~2,000)을 넣는다. **`members` 로 대신 안 된다** — §3 참조.
데모에 쓰는 슬라이스 회원 1001~1030 은 두 테이블에 **다 있어야** 하고,
consumer 시드가 1~2,000 이라 그 30명이 마침 겹친다.

### ⑨ 다 되면 도구 23종을 관통시킨다

적재가 끝났는지는 표로 확인한다. **오류 0 · 빈결과 0 이면 통과**다.

```bash
cd Agent && python tool_check.py          # 실물 (백엔드 필요) → 23/23
USE_MOCK_SOT=true python tool_check.py    # mock (아무것도 안 떠 있어도 된다)
```

시연 리허설은 주입기로 한다 — 자발형은 **사건이 없으면 아무것도 안 보인다**:

```bash
cd Agent
python demo_inject.py            # 재료 후보
python demo_inject.py restock    # 킬링 장면 1 — 보충 완료
python demo_inject.py move       # 킬링 장면 3 — 자리 이동
python demo_inject.py undo       # 되돌리기(여러 번 리허설할 때)
```

## 2. 걸린 것들 — 다음 사람은 안 걸리게

### ⑤ 절차서가 낡으면 **멀쩡한 코드가 고장나 보인다** (08-27 B · 08-28 A)

08-26 판 절차서가 ②로 `backend_own_tables_v1.sql` 을 가리키고 ⑧이 아예
없었다. 그대로 적재한 기계에서 이렇게 났다.

| 증상 | 진짜 원인 |
|---|---|
| `add_to_cart`·`get_session_cart` **500** | `cart_item` 에 `cart_group_id` 가 없다 → `Unknown column` |
| 〃 (컬럼을 고친 뒤에도) **500** | `consumer` **0행** → FK 위반 |

⚠ **`CREATE TABLE IF NOT EXISTS` 라 「다시 돌리면 고쳐지겠지」가 안 통한다.**
구 `cart_item` 이 이미 있으면 새 정의가 **조용히 건너뛰어진다.** 두 테이블을
지우고 다시 세워야 한다(둘 다 비어 있을 때만 — 데이터가 있으면 ALTER 로).

```bash
"$MYSQL" ... storeflow_db -e "
  SELECT (SELECT COUNT(*) FROM cart_item) AS ci, (SELECT COUNT(*) FROM cart_group) AS cg;"
# 둘 다 0 이면
"$MYSQL" ... storeflow_db -e "
  SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS cart_item, cart_group;
  SET FOREIGN_KEY_CHECKS=1;"
"$MYSQL" ... storeflow_db < db/backend_own_tables_current.sql
"$MYSQL" ... storeflow_db < db/seed/01_consumer_seed_2000.sql
```

⚠⚠ **DROP 이 실패하면 나머지가 조용히 성공한다.** 08-28 에 실제로 겪었다 —
`consumer` 2,000명은 들어갔는데 `cart_item` 은 구 스키마 그대로였다. 세 명령을
이어 돌리면 중간이 죽어도 뒤가 도니까, **"다 했는데 왜 안 되지"** 로 한참을 쓴다.
그래서 **적재 뒤에 반드시 확인한다:**

```bash
"$MYSQL" ... storeflow_db -N -e "
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema='storeflow_db' AND table_name='cart_item'
     AND column_name='cart_group_id';       -- 1 이어야 한다
  SELECT COUNT(*) FROM consumer;"           -- 2000 이어야 한다
```

컬럼만 없으면 **DROP 없이 덧붙여도 된다**(빈 테이블이면 더 안전하다):

```sql
ALTER TABLE cart_item
  ADD COLUMN cart_group_id BIGINT NULL AFTER cart_item_id,
  ADD KEY idx_cart_item_cart_group (cart_group_id),
  ADD CONSTRAINT fk_cart_item_cart_group
      FOREIGN KEY (cart_group_id) REFERENCES cart_group (cart_group_id)
      ON DELETE CASCADE;
```

백엔드 재시작은 필요 없다 — `ddl-auto: none` 이라 질의할 때 스키마를 읽는다.

⚠ **PowerShell 5.1 에서는 `&&` 도 `< 파일` 도 안 된다.** 위 블록은 bash 문법이다.
PowerShell 이면 한 줄씩 나눠 돌리고, 리다이렉션은 `cmd` 에게 맡긴다:
`cmd /c '"C:\...\mysql.exe" -h127.0.0.1 -P3307 -uroot -p storeflow_db < <경로>'`

### ⑥ 세계의 시계는 **벽시계가 아니다** (08-28)

데이터는 `DEMO_NOW`(2026-08-08 14:20)에서 끝난다. 그런데 백엔드의
`/api/inventory/change-events` 는 `Instant.now()` 를 기준으로 창을 잡는다.
그래서 벽시계 날짜가 흐르면 **"최근 24시간"이 영원히 0건**이 된다 —
404 도 500 도 아니라 빈 배열이라 창구 문제로 착각하기 쉽다.

에이전트 쪽은 `sot_client.get_change_events` 가 그 차이만큼 `hours` 를
벌려 보정한다. **DB 를 다시 적재해도 이 어긋남은 안 없어진다** — 없애려면
세계를 벽시계 시각으로 다시 만들거나, 백엔드가 `since` 를 받아야 한다.

### ① `members` 가 v2.5 이전 스키마면 시드가 튕긴다

```
ERROR 1054: Unknown column 'has_pet' in 'field list'
```

08-19의 v2.5에서 `persona_type`(라벨 1개)을 **지우고** 축 4개로 나눴다
(`household_size`·`has_pet`·`has_child`·`by_car`, 전부 NULL 허용).
백엔드 **자바 코드는 이미 v2.5**인데 DB만 뒤처져 있을 수 있다 —
`ddl-auto: none` 이라 하이버네이트가 안 고쳐 준다.

```sql
ALTER TABLE members
  ADD COLUMN has_pet   BOOLEAN NULL AFTER household_size,
  ADD COLUMN has_child BOOLEAN NULL AFTER has_pet,
  ADD COLUMN by_car    BOOLEAN NULL AFTER has_child,
  MODIFY COLUMN household_size TINYINT NULL,
  DROP COLUMN persona_type;
```

### ② `consumer_events.payload` 는 **JSON 컬럼**이다

```
ERROR 3140: Invalid JSON text: "Invalid value." at position 0
```

`sim/mode1.py` 가 PURCHASE 이벤트의 `basket_id` 를 **맨 문자열**로 넣고 있었다.
parquet·csv 로만 쓸 때는 안 드러나고 **DB에 넣는 순간** 터진다.
→ 08-26에 생성기를 고쳤다(`{"basket_id": "..."}`). 옛 SQL을 쓰면 같은 오류가 난다.

### ③ 백엔드 서버가 `ncp.sms.*` 없으면 안 뜬다

```
Could not resolve placeholder 'ncp.sms.access-key'
```

문자 인증(NCP SENS) 설정이다. **에이전트 연동에는 안 쓰이므로 더미로 충분**하다.
`application.yml` 끝에:

```yaml
ncp:
  sms:
    access-key: dummy
    secret-key: dummy
    service-id: dummy
    from: "01000000000"
```

### ④ 내부키가 양쪽에서 같아야 한다

`application.yml` 의 `internal.service-key` ↔ `Agent/.env` 의
`INTERNAL_SERVICE_KEY`. 다르면 `/internal/**` 이 **401**이다.
yml 을 팀원 것으로 교체하면 키도 같이 바뀌니 **그때마다 .env 도 맞춘다.**

### ⑦ `migration_chat_v2` 를 빼면 채팅이 전부 500 (08-28)

`migration_chat_v1` 은 `chat_session`·`chat_message` **테이블을 만들고**,
`db/seed/migration_chat_v2.sql` 은 거기에 **컬럼을 더한다**(`anonymous_id`·`title`)
+ `consumer.name`.

v2 를 빠뜨리면 **테이블은 있는데 엔티티가 기대하는 칸이 없다.** 그러면
채팅 관련 질의가 전부 SQL 오류로 죽는다:

| 창구 | |
|---|---|
| `POST /api/chat/sessions` | 500 |
| `GET /api/chat/sessions/{id}/messages` | 500 |
| **`POST /internal/chat/proactive`** | 500 ← **자발형 개입의 전달 창구** |

⚠ **마지막 줄이 특히 조용하다.** 자발형은 감시자·예절·루프·가드를 전부
통과한 **뒤에** 이 창구로 나간다. 그러니 개입은 실제로 만들어졌는데
마지막 한 걸음에서 버려진다 — 에이전트 로그에 한 줄 남을 뿐이고,
겉으로는 "자발형이 안 되네" 로만 보인다.

08-28 에 킬링 장면 1 을 눈으로 돌려 보다 발견했다. 그전까지 도구 23/23 ·
골든셋 45/45 · 시나리오 16/16 이 전부 초록이었다 — **셋 다 이 창구를
안 탄다.**

⚠ v2 는 `db/` 가 아니라 **`db/seed/`** 에 있다. 그래서 ③의 목록을 훑을 때
눈에 안 띈다.

### ⑧ `--force` 없이 돌리면 파일 **뒷부분이 통째로 안 돈다** (08-28)

절차서가 08-27까지 이렇게 적고 있었다 — *"이미 적용됐으면 Duplicate key 오류가
나는데 **무해하다**."* **틀렸다.**

`mysql` 클라이언트는 **오류에서 멈춘다**(기본값). 그래서 이미 적용된 문장이
파일 **앞쪽**에 있으면, 그 뒤의 아직 안 된 문장이 **하나도 안 돈다.**

08-28에 실제로 겪었다. `Migration_guest_cart_v1.sql` 이 8번째 줄에서
`Duplicate column name 'session_id'` 로 멈췄고, 48번째 줄의

```sql
ALTER TABLE chat_session ADD COLUMN group_id BIGINT NULL AFTER anonymous_id;
```

이 영영 안 돌았다. `ChatSession` 엔티티 생성자는 그 칸을 넣으므로 **채팅
도메인 전체가 500** 이었다 — 세션 생성도, 개입 전달도.

> **"무해한 오류"는 없다. 무해한 것은 「멈추지 않는 오류」다.**
> 중복은 무해하지만 **중단은 무해하지 않다.**

```
"$MYSQL" $OPTS -h127.0.0.1 -P3307 -uroot -p storeflow_db < <경로>
```

`--force` 는 오류를 무시하고 **끝까지 간다.** 그러면 이미 된 것은 중복 오류로
지나가고 안 된 것만 적용된다 — 그것이 애초에 원했던 동작이다.

⚠ 그 뒤 **오류 개수를 세어 본다.** 0이 아니어도 정상일 수 있지만(중복),
갑자기 늘었으면 새 문제다.

### ⑨ `--default-character-set=utf8mb4` 없이 돌리면 한글이 깨진다 (08-28)

테이블은 `utf8mb4` 인데 **윈도우의 mysql 클라이언트는 기본이 `euckr`** 이다
(`SHOW VARIABLES LIKE 'character_set_client'` 로 확인된다).

그래서 SQL 파일 안의 한글 리터럴이 깨져 들어간다:

```
ERROR 1366 (HY000): Incorrect string value: '\xED\x9A\x8C\xEC\x9B\x90...'
   for column 'name' at row 1
```

`\xED\x9A\x8C\xEC\x9B\x90` 은 UTF-8 로 **"회원"** 이다 —
`migration_chat_v2.sql` 의 `SET name = CONCAT('회원', …)` 이 여기서 죽었다.

⚠ **이 오류는 `--force` 와 겹치면 더 나쁘다.** `--force` 가 오류를 넘기므로
**깨진 채로 조용히 지나간다.** 둘을 같이 쓰되, 문자셋 옵션을 **반드시** 준다.

### ⑩ `consumer` 시드는 `migration_chat_v2` **보다 먼저** (08-28)

`migration_chat_v2.sql` 은 `consumer.name` 을 이렇게 다룬다:

```sql
ALTER TABLE consumer ADD COLUMN name VARCHAR(50) NULL;      -- ① 널 허용으로 추가
UPDATE consumer SET name = CONCAT('회원', LPAD(consumer_id,6,'0')) WHERE …;  -- ② 채우고
ALTER TABLE consumer MODIFY COLUMN name VARCHAR(50) NOT NULL;               -- ③ 조인다
```

**②가 요점이다** — 이 마이그레이션은 *"기존 회원은 임시 이름으로 채운다"* 를
전제로 설계됐다. 그러니 **회원이 이미 들어 있어야** 한다.

순서를 뒤집으면(마이그레이션 → 시드) `name` 이 이미 `NOT NULL` 인데
`01_consumer_seed_2000.sql` 은 그 칸을 **안 넣으므로**

```
ERROR 1364: Field 'name' doesn't have a default value
```

로 **2,000행이 전부 실패한다.** ⚠ `--force` 를 쓰고 있으면 그 실패가
**넘어가고 consumer 가 0행인 채로 끝난다** — 그러면 장바구니 3종이 죽는다(§⑧).

> **기존 행을 채우는 마이그레이션은 그 행이 있고 나서 돌려야 한다.**
> "마이그레이션 먼저, 시드 나중" 은 새 DB 에서만 맞는 규칙이다.

⚠ 반대로 `migration_chat_v1`(테이블 생성)과 `phone_verification` 은 시드보다
**먼저** 와야 한다. 그래서 마이그레이션이 앞뒤 둘로 갈린다.

### ⑪ `Migration_guest_cart_v1` 의 CHECK 는 지금 코드와 안 맞는다 (08-28)

그 파일이 마지막에 이것을 건다:

```sql
ALTER TABLE cart_item
    ADD CONSTRAINT chk_cart_owner CHECK (consumer_id IS NOT NULL OR session_id IS NOT NULL);
```

*"둘 다 NULL 인 유령 카트 방지"* 가 취지였고, **그때는 맞았다.** 그 뒤
장바구니가 `cart_group` 모델로 바뀌면서 **소유권이 행이 아니라 그룹으로**
옮겨갔다. 지금 `CartService.addItemToGroup` 은 이렇게 만든다:

```java
new CartItem(groupId, request.getSkuId(), request.getQuantity())
//           ↑ consumer_id 도 session_id 도 안 넣는다. 소유자는 그룹이 안다.
```

그래서 CHECK 가 걸려 **`POST /internal/cart` 가 500** 이 되고, 도구 23종 중
`add_to_cart`·`update_cart_quantity`·`remove_from_cart` **셋이 죽는다.**

```sql
ALTER TABLE cart_item DROP CHECK chk_cart_owner;
```

> **`--force` 는 양날이다.** 오류에서 안 멈추게 해 주지만, 그 대가로
> **옛 마이그레이션의 낡은 제약까지 끝까지 밀어 넣는다.**
> 08-27까지 이 CHECK 가 없었던 이유는 그 파일이 8번째 줄에서 멈춰서였다 —
> 사고가 사고를 가리고 있었던 셈이다.

⚠ 08-28 이전에 적재한 DB 에는 이 CHECK 가 **없다**(파일이 앞에서 멈췄으므로).
`--force` 를 쓰기 시작한 뒤부터 생긴다. 그러니 이 줄은 **새로 적재할 때만**
필요하고, 이미 도는 DB 에서는 `SHOW CREATE TABLE cart_item` 으로 확인한다.

## 3. ⚠ 구매 기록이 **두 벌**이다 — 헷갈리지 말 것

| | `purchases` | `orders` + `order_item` |
|---|---|---|
| 주인 | 세계 스키마(v2.5) — 우리 | 백엔드 고유 도메인 |
| 채우는 것 | `history_seed.sql`(DES 산출) | 실제 결제 흐름 |
| 갖는 것 | `purchased_at` **시각** — 재구매 간격의 원료 | 주문·결제 상태 |
| 지금 행 수 | 2,064 | 0 |

`/internal/orders/frequent` 는 **`orders` 를 읽으므로 빈 배열**이다.
그리고 응답에 시각이 없어(`skuId`·`productName`·`purchaseCount`·`suggestedQuantity`)
**소비주기 예측에 쓸 수 없다** — 간격을 계산하려면 원장이 필요하다.

→ **백엔드 요청 ④**: `purchases` 위에 시각을 주는 내부 창구가 필요하다.
   (요청서: `Storeflow_상세설명파일/StoreFlow_백엔드요청_내부API.md`)

## 4. 확인

```bash
cd Agent && python backend_probe.py     # 인증·필드명·시드적재를 한 번에
```

`⚠ 빈 배열` 이 뜨면 **"0건"인지 "데이터 없음"인지** 반드시 가른다 —
후자를 그냥 두면 가용예측이 *"매장이 한가하다"* 는 틀린 확률을 낸다.
