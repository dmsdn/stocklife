-- ============================================================================
-- StoreFlow 회원·행사 시드 검증 (모드 0 ②) — members_seed.sql 적재 후 실행
-- ============================================================================
-- 사용법: 적재 순서 schema_v2 → products_seed → world_seed → members_seed → 이 파일
--   mysql ... < verify_members.sql
-- 각 행이 검사 하나. 기대/실제가 다르면 그 행의 결과가 FAIL로 찍힌다.
-- (verify_contract_v2.sql · verify_world.sql과 같은 형식 — 표가 곧 판정)
-- ============================================================================

SELECT 'M01 회원 수 10,000 (08-20 v2: 2,000→10,000)' AS 검사,
       IF(COUNT(*) = 10000, 'PASS', CONCAT('FAIL: ', COUNT(*))) AS 결과
FROM members;

SELECT 'M02 시드 대역 (member_id < 10,000,000)' AS 검사,
       IF(COUNT(*) = 0, 'PASS', CONCAT('FAIL: ', COUNT(*), '건 이탈')) AS 결과
FROM members WHERE member_id >= 10000000;

-- 축 조합 — 0이면 라벨식 생성으로 되돌아간 것 (세계명세 §7 체크리스트)
SELECT 'M03 조합: 1인 가구 + 반려동물 > 0' AS 검사,
       IF(COUNT(*) > 0, CONCAT('PASS (', COUNT(*), '명)'), 'FAIL: 0명') AS 결과
FROM members WHERE household_size = 1 AND has_pet = 1;

SELECT 'M04 조합: 4인 이상 + 차 없음 > 0' AS 검사,
       IF(COUNT(*) > 0, CONCAT('PASS (', COUNT(*), '명)'), 'FAIL: 0명') AS 결과
FROM members WHERE household_size >= 4 AND by_car = 0;

-- NULL의 실존 — "안 물어봄"이 세계에 있어야 일반 추천 분기가 시험된다.
-- 상한 25%: NULL이 주류가 되면 축이 학습 사전값(prior) 구실을 못 한다
SELECT 'M05 각 축 NULL 3~25%' AS 검사,
       IF(MIN(r) > 0.03 AND MAX(r) < 0.25, 'PASS',
          CONCAT('FAIL: ', MIN(r), '~', MAX(r))) AS 결과
FROM (SELECT AVG(household_size IS NULL) AS r FROM members
      UNION ALL SELECT AVG(has_pet    IS NULL) FROM members
      UNION ALL SELECT AVG(has_child  IS NULL) FROM members
      UNION ALL SELECT AVG(by_car     IS NULL) FROM members) t;

SELECT 'M06 가입일이 기준일 이전' AS 검사,
       IF(COUNT(*) = 0, 'PASS', CONCAT('FAIL: ', COUNT(*), '건')) AS 결과
FROM members WHERE created_at >= '2026-08-13 00:00:00';

SELECT 'P01 행사 FK — 없는 상품 참조 0' AS 검사,
       IF(COUNT(*) = 0, 'PASS', CONCAT('FAIL: ', COUNT(*), '건')) AS 결과
FROM promotions p LEFT JOIN products s ON s.sku_id = p.sku_id
WHERE s.sku_id IS NULL;

SELECT 'P02 할인이 가격 미만' AS 검사,
       IF(COUNT(*) = 0, 'PASS', CONCAT('FAIL: ', COUNT(*), '건')) AS 결과
FROM promotions p JOIN products s ON s.sku_id = p.sku_id
WHERE p.discount_krw >= s.price_krw OR p.discount_krw <= 0;

SELECT 'P03 기간 역전 0' AS 검사,
       IF(COUNT(*) = 0, 'PASS', CONCAT('FAIL: ', COUNT(*), '건')) AS 결과
FROM promotions WHERE starts_at >= ends_at;

-- 같은 SKU의 행사 기간이 겹치면 "지금 할인가"가 두 답을 갖는다
SELECT 'P04 같은 SKU 기간 겹침 0' AS 검사,
       IF(COUNT(*) = 0, 'PASS', CONCAT('FAIL: ', COUNT(*), '쌍')) AS 결과
FROM promotions a JOIN promotions b
  ON a.sku_id = b.sku_id AND a.promo_id < b.promo_id
 AND a.starts_at <= b.ends_at AND b.starts_at <= a.ends_at;

-- 기준일(세계의 "지금")에 행사 중인 상품이 있어야 검색 on_promo_only가 산다
SELECT 'P05 기준일 행사 중 > 50' AS 검사,
       IF(COUNT(*) > 50, CONCAT('PASS (', COUNT(*), 'SKU)'),
          CONCAT('FAIL: ', COUNT(*))) AS 결과
FROM promotions WHERE '2026-08-13 12:00:00' BETWEEN starts_at AND ends_at;

SELECT 'P06 행사 이력이 270일을 덮음 (첫 행사가 기준일-265 이전)' AS 검사,
       IF(MIN(starts_at) <= '2025-11-21 23:59:59', 'PASS',
          CONCAT('FAIL: 최초 ', MIN(starts_at))) AS 결과
FROM promotions;
