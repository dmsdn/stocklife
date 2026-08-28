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
| ③ | `db/phone_verification.sql`<br>`db/migration_chat_v1.sql`<br>`db/Migration_guest_cart_v1.sql` | 이후 마이그레이션 | 이미 적용됐으면 "Duplicate key" 오류가 나는데 **무해하다** |
| ④ | `Agent/catalog/out/products_seed_5000.sql` | 상품 5,000 | 위치·재고가 sku를 참조 |
| ⑤ | `Agent/sim/out/world_seed.sql` | locations 11,544 · stocks 9,940 · shelf_configs 4,970 | 매대 구조 |
| ⑥ | `Agent/sim/out/members_seed.sql` | 회원 10,000 | |
| ⑥-b | `Agent/sim/out/wishlist_seed.sql` | **찜 54,903건**(회원당 5.5) | 회원 다음. `get_wishlist` 와 진입 브리핑의 재료 |
| ⑦-a | `Agent/sim/out/mode1/history_seed.sql` | **데모 슬라이스** — 회원 30명 × 90일<br>purchases 1,988 · shelf_events 255,891 · consumer_events 3,696 | 몇 분 걸린다.<br>⚠ 숫자는 08-27 재생성 후 실측(08-28). 시점 정합으로 창이 바뀌면 또 달라진다 — 세고 싶으면 `INSERT INTO` 사이의 `(` 로 시작하는 줄을 센다 |

```bash
MYSQL="/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe"
"$MYSQL" -h127.0.0.1 -P3307 -uroot -p storeflow_db < db/schema/schema_v2.sql
"$MYSQL" -h127.0.0.1 -P3307 -uroot -p storeflow_db < db/backend_own_tables_current.sql
"$MYSQL" -h127.0.0.1 -P3307 -uroot -p storeflow_db < db/seed/01_consumer_seed_2000.sql
"$MYSQL" -h127.0.0.1 -P3307 -uroot -p storeflow_db < Agent/catalog/out/products_seed_5000.sql
"$MYSQL" -h127.0.0.1 -P3307 -uroot -p storeflow_db < Agent/sim/out/world_seed.sql
"$MYSQL" -h127.0.0.1 -P3307 -uroot -p storeflow_db < Agent/sim/out/members_seed.sql
"$MYSQL" -h127.0.0.1 -P3307 -uroot -p storeflow_db < Agent/sim/out/wishlist_seed.sql
"$MYSQL" -h127.0.0.1 -P3307 -uroot -p storeflow_db < Agent/sim/out/mode1/history_seed.sql
"$MYSQL" -h127.0.0.1 -P3307 -uroot -p storeflow_db < Agent/sim/out/mode1/stock_sync.sql
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

## 2. 걸린 것 넷 — 다음 사람은 안 걸리게

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
