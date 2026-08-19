# StoreFlow DB — 적재 순서와 파일 지도

> 스키마 **v2.4** / 상품 **4,970 SKU** / 세계(로케이션·재고) 포함 · 2026-08-18
> 규칙(무엇을 바꿔도 되고 무엇은 안 되는가)은 `스키마_변경규칙.md` 한 장에 있습니다.

## 처음부터 다 올리기

순서가 중요합니다 — 뒤 파일이 앞 파일의 테이블을 참조합니다(FK).

```bash
docker exec -i storeflow_mysql mysql -uroot -p1234 --default-character-set=utf8mb4 storeflow_db < db/schema_v2.sql
docker exec -i storeflow_mysql mysql -uroot -p1234 --default-character-set=utf8mb4 storeflow_db < db/seed/products_seed.sql
docker exec -i storeflow_mysql mysql -uroot -p1234 --default-character-set=utf8mb4 storeflow_db < db/seed/world_seed.sql
docker exec -i storeflow_mysql mysql -uroot -p1234 --default-character-set=utf8mb4 storeflow_db < db/backend_own_tables_v1.sql
```

> **PowerShell에서 파이프로 넣을 때는 `-Encoding UTF8`을 반드시 붙이세요.**
> 기본 인코딩으로 넘기면 한글 리터럴이 조용히 깨집니다(에러 없이).

## ⚠ 재실행할 때 (이미 한 번 올린 DB)

`schema_v2.sql`은 **DROP → CREATE**입니다. 그런데 `cart_item`이 `products`를
FK로 물고 있어서 **그냥 돌리면 `DROP products`가 막힙니다**
(`ERROR 3730: Cannot drop table referenced by a foreign key constraint`).

재적재 전에 백엔드 소유 테이블을 비워주세요:

```sql
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE cart_item; TRUNCATE order_item; TRUNCATE orders;
-- 여기서 위의 적재 4단계 실행
SET FOREIGN_KEY_CHECKS = 1;
```

`consumer`는 지우지 않습니다(계정은 보존). 대신 실사용자의 `members` 행이
같이 날아가므로, 적재 후 아래 한 줄로 복구합니다:

```sql
-- v2.5: persona_type 삭제 → 축 4개. 축 값은 가입 폼에서만 오므로 복구 시엔 전부 NULL이다
-- (NULL = 안 물어봄. 임의 숫자로 채우면 그 회원에게 조용히 틀린 추천이 나간다).
INSERT INTO members (member_id, household_size, has_pet, has_child, by_car, created_at)
SELECT 10000000 + consumer_id, NULL, NULL, NULL, NULL, created_at FROM consumer
ON DUPLICATE KEY UPDATE member_id = member_id;
```

## 검증 (적재 후 한 번씩)

```bash
docker exec -i storeflow_mysql mysql -uroot -p1234 --default-character-set=utf8mb4 storeflow_db < db/verify_seed.sql    # 상품 10종
docker exec -i storeflow_mysql mysql -uroot -p1234 --default-character-set=utf8mb4 storeflow_db < db/verify_world.sql   # 세계 12종
```

`verify_contract_v2.sql`(계약 **30종**, v2.5에서 28~30 추가)은 일부가 **샘플 데이터 기준**이라,
빈 DB에 `sample_rows_v2.sql`을 넣고 돌려야 30/30이 나옵니다. 실사용 DB에서 돌리면
이벤트·회원이 달라 [D] 검사 일부가 FAIL로 뜨는데 정상입니다.
**[S] 구조 검사(1~12, 28~30)는 어느 DB에서든 PASS여야 합니다** — 여기가 깨지면 진짜 계약 위반입니다.

## 파일 지도

| 파일 | 무엇 | 소유 |
|---|---|---|
| `schema_v2.sql` | 매장 세계 테이블 12종 DDL (DROP→CREATE) | Agent |
| `seed/products_seed.sql` | 상품 4,970 SKU | Agent |
| `seed/world_seed.sql` | zones 20 · locations 11,544 · map_cells 21,375 · stocks 9,940 · shelf_configs 4,970 | Agent |
| `sample_rows_v2.sql` | 계약 테스트용 최소 샘플 | Agent |
| `verify_seed.sql` · `verify_world.sql` · `verify_contract_v2.sql` | 검증 | Agent |
| `스키마_변경규칙.md` | 🔴 유지 / 🟡 알리고 변경 / 🟢 자유 | Agent |
| `backend_own_tables_v1.sql` | consumer · cart_item · orders · order_item · event_log | 백엔드 |
| `migration_chat_v1.sql` | 채팅 세션 | 백엔드 |
| `seed/*.py` · `storeflow_reviews_seed_v2.csv` | 리뷰·가격 보정 스크립트 | 백엔드 |

## 좌표계 (프론트·백엔드 공통)

- **격자 1칸 = 1m.** 원점은 매장 내부 좌상단, **y는 아래로 증가**(화면 좌표계).
- `locations.x, y`는 매대 자체가 아니라 **그 앞 통로 셀**입니다 — 손님이 서는 자리.
  양면 랙은 두 줄이 서로 **반대 통로**를 봅니다.
- `map_cells.passable = 0`은 랙·시설(계산대·푸드코트·에스컬레이터·행사매대).
- `map_cells.transit_id`가 같은 셀끼리 층간으로 이어집니다(에스컬레이터).
- `zones`에 `B1-W`(지하 중앙창고)가 있습니다 — 맵에 없는 층이며 보충 경로용입니다.

## 알아두면 좋은 것

- **`members`는 계정 테이블이 아닙니다.** 시뮬레이터가 만든 소비 주체이고,
  로그인 회원(`consumer`)과는 **FK 없이 계산식으로** 이어집니다:
  `member_id = 10,000,000 + consumer_id`. 이유는 `스키마_변경규칙.md` 참조.
- **[v2.5] `persona_type`이 없어지고 축 컬럼 4개가 됐습니다** —
  `household_size` · `has_pet` · `has_child` · `by_car`. 가입 INSERT 변경점은
  `스키마_변경규칙.md` 맨 아래 「v2.5 변경점」에 SQL 그대로 있습니다.
- **NULL과 FALSE는 다릅니다.** NULL = 안 물어봄(일반 추천으로), FALSE = 없다고 답함(그 카테고리 제외).
  안 받은 항목을 0/1로 채우지 마세요 — 에러 없이 조용히 틀립니다.
- **학습 대상 필터는 `member_id < 10000000`**입니다(구: `persona_type != '실사용자'`).
  문자열 비교는 오타 하나에 학습 데이터가 조용히 오염되지만, ID 범위는 구조라 안 틀립니다.
- 상품 수가 5,000 → 4,970이 됐지만 **기존 sku_id는 하나도 바뀌지 않았습니다.**
  빠진 30개는 3F 홈·가전 "고급형" 변형입니다(맵 확정으로 그 존 매대 용량이 270이 됨).
