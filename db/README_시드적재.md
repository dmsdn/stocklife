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
| ② | `db/backend_own_tables_v1.sql` | **백엔드 고유** — orders·order_item·consumer·cart_*·chat_* | ①과 별개 도메인이다(아래 §3) |
| ③ | `db/phone_verification.sql`<br>`db/migration_chat_v1.sql`<br>`db/Migration_guest_cart_v1.sql` | 이후 마이그레이션 | 이미 적용됐으면 "Duplicate key" 오류가 나는데 **무해하다** |
| ④ | `Agent/catalog/out/products_seed_5000.sql` | 상품 5,000 | 위치·재고가 sku를 참조 |
| ⑤ | `Agent/sim/out/world_seed.sql` | locations 11,544 · stocks 9,940 · shelf_configs 4,970 | 매대 구조 |
| ⑥ | `Agent/sim/out/members_seed.sql` | 회원 10,000 | |
| ⑦ | `Agent/sim/out/mode1/history_seed.sql` | **데모 슬라이스** — 회원 30명 × 90일<br>purchases 2,064 · shelf_events 188,396 · consumer_events 3,845 | 16.6MB · 몇 분 걸린다 |

```bash
MYSQL="/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe"
"$MYSQL" -h127.0.0.1 -P3307 -uroot -p storeflow_db < db/schema/schema_v2.sql
"$MYSQL" -h127.0.0.1 -P3307 -uroot -p storeflow_db < db/backend_own_tables_v1.sql
"$MYSQL" -h127.0.0.1 -P3307 -uroot -p storeflow_db < Agent/catalog/out/products_seed_5000.sql
"$MYSQL" -h127.0.0.1 -P3307 -uroot -p storeflow_db < Agent/sim/out/world_seed.sql
"$MYSQL" -h127.0.0.1 -P3307 -uroot -p storeflow_db < Agent/sim/out/members_seed.sql
"$MYSQL" -h127.0.0.1 -P3307 -uroot -p storeflow_db < Agent/sim/out/mode1/history_seed.sql
```

## 2. 걸린 것 넷 — 다음 사람은 안 걸리게

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
