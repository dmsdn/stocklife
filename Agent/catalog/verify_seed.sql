-- ============================================================================
-- StoreFlow 상품 시드 검증 — products_seed.sql 적재 후 실행 (v2 / 08-18 맵 반영: 4,970 SKU)
-- ============================================================================
-- 실행: docker exec -i storeflow_mysql mysql -uroot -p1234
--         --default-character-set=utf8mb4 --table seed_test < verify_seed.sql
-- 원리: 각 검사가 "기대/실제/판정" 한 행을 낸다. 전부 PASS여야 안전.
--   단위가격 검사(#8)의 품목 식별이 sku_id DIV 10인 이유: sku_id가
--   품목인덱스×10+변형 으로 결정적 부여되므로, DIV 10이 곧 품목 그룹이다.
-- ============================================================================
SET NAMES utf8mb4;

SELECT 1 AS `#`, '총 SKU 수' AS `검사`, '4970' AS `기대`, COUNT(*) AS `실제`,
       IF(COUNT(*)=4970,'PASS','FAIL') AS `판정` FROM products
UNION ALL
SELECT 2, '소분류(l2) 수', '60', COUNT(DISTINCT category_l2),
       IF(COUNT(DISTINCT category_l2)=60,'PASS','FAIL') FROM products
UNION ALL
SELECT 3, '대분류(l1) 수', '12', COUNT(DISTINCT category_l1),
       IF(COUNT(DISTINCT category_l1)=12,'PASS','FAIL') FROM products
UNION ALL
SELECT 4, 'PB 비율 18~22%', '900~1100', SUM(is_pb),
       IF(SUM(is_pb) BETWEEN 900 AND 1100,'PASS','FAIL') FROM products
UNION ALL
SELECT 5, 'PB 이름 규칙(PB- 접두 ⟺ is_pb)', '0',
       SUM((is_pb=1) != (name LIKE 'PB-%')),
       IF(SUM((is_pb=1) != (name LIKE 'PB-%'))=0,'PASS','FAIL') FROM products
UNION ALL
SELECT 6, 'spec JSON: quantity.primary=unit, value>0', '4970',
       SUM(JSON_UNQUOTE(JSON_EXTRACT(spec,'$.quantity.primary'))=unit
           AND JSON_EXTRACT(spec,'$.quantity.value') > 0),
       IF(SUM(JSON_UNQUOTE(JSON_EXTRACT(spec,'$.quantity.primary'))=unit
           AND JSON_EXTRACT(spec,'$.quantity.value') > 0)=4970,'PASS','FAIL') FROM products
UNION ALL
SELECT 7, '주류 플래그 ⟺ 주류 소분류', '0',
       SUM((is_alcohol=1) != (category_l2 IN ('맥주·와인','소주·양주'))),
       IF(SUM((is_alcohol=1) != (category_l2 IN ('맥주·와인','소주·양주')))=0,'PASS','FAIL') FROM products
UNION ALL
-- #8 가격-규격 정합: 같은 품목(sku_id DIV 10) 안에서 총량 최대 SKU의 단위가격이
-- 총량 최소 SKU보다 낮은 품목이 "대다수 + 소수의 역전"이어야 한다(세계명세 §3.3)
SELECT 8, '묶음↑→단위가격↓ 우세(역전 5% 안팎)', '70~99%',
       CONCAT(ROUND(100*AVG(cheaper)), '%'),
       IF(AVG(cheaper) BETWEEN 0.70 AND 0.99,'PASS','FAIL')
FROM (
  SELECT t.item_id,
         (MAX(CASE WHEN t.qty=t.maxq THEN t.unit_price END)
          < MAX(CASE WHEN t.qty=t.minq THEN t.unit_price END)) AS cheaper
  FROM (
    SELECT sku_id DIV 10 AS item_id,
           CAST(JSON_EXTRACT(spec,'$.quantity.value') AS DOUBLE) AS qty,
           price_krw / CAST(JSON_EXTRACT(spec,'$.quantity.value') AS DOUBLE) AS unit_price,
           MIN(CAST(JSON_EXTRACT(spec,'$.quantity.value') AS DOUBLE))
             OVER (PARTITION BY sku_id DIV 10) AS minq,
           MAX(CAST(JSON_EXTRACT(spec,'$.quantity.value') AS DOUBLE))
             OVER (PARTITION BY sku_id DIV 10) AS maxq
    FROM products) t
  WHERE t.maxq > t.minq
  GROUP BY t.item_id) g
UNION ALL
SELECT 9, '한글 왕복(utf8mb4)', '1', COUNT(*),
       IF(COUNT(*)=1,'PASS','FAIL') FROM products
 WHERE name = '농부의아침 한우 등심 500g'
UNION ALL
SELECT 10, '신상 존재(최근 30일 입고, 기능 20)', '>=50', COUNT(*),
       IF(COUNT(*)>=50,'PASS','FAIL') FROM products
 WHERE first_stocked_at >= '2026-07-14';
