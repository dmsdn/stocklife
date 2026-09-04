-- ============================================================================
-- StoreFlow 세계 시드 검증 (모드 0) — world_seed.sql 적재 후 실행
-- ============================================================================
-- 계약 테스트(verify_contract_v2.sql)는 **샘플 데이터** 기준이라 이벤트·회원이
-- 없는 세계 패키지에서는 일부가 FAIL로 뜬다. 이 파일은 세계 구조 자체만 본다.
--
-- 실행:
--   docker exec -i storeflow_mysql mysql -uroot -p1234 --default-character-set=utf8mb4 \
--     <db> < sim/verify_world.sql
-- 적재 순서: schema_v2.sql → products_seed.sql → world_seed.sql → 이 파일
-- ============================================================================

SET NAMES utf8mb4;

SELECT '=== StoreFlow 세계 검증 (모드 0) ===' AS ``;

SELECT 1 AS `#`, '존 20개(판매 19 + 창고 1)' AS `검사`, '19 / 1' AS `기대`,
       CONCAT(SUM(zone_type='SALES'),' / ',SUM(zone_type='BACKROOM')) AS `실제`,
       IF(SUM(zone_type='SALES')=19 AND SUM(zone_type='BACKROOM')=1,'PASS','FAIL') AS `판정`
FROM zones

-- 베이는 반드시 6단이 다 있어야 한다. 하나라도 빠지면 수직 페어(L→L+3)가 끊긴다.
UNION ALL SELECT 2,'모든 베이가 6단','0',
 CAST((SELECT COUNT(*) FROM (SELECT zone_id,rack_no,bay_no FROM locations
        GROUP BY zone_id,rack_no,bay_no HAVING COUNT(*)<>6) t) AS CHAR),
 IF((SELECT COUNT(*) FROM (SELECT zone_id,rack_no,bay_no FROM locations
      WHERE tier_role<>'FACILITY'                       -- 09-03: 시설 행은 6단이 아니다
      GROUP BY zone_id,rack_no,bay_no HAVING COUNT(*)<>6) t)=0,'PASS','FAIL')

-- L1~L3=PICK, L4~L6=BULK 규칙 위반 (판매층 기준. B1은 전부 BULK)
UNION ALL SELECT 3,'단↔tier_role 규칙 위반','0',
 CAST((SELECT COUNT(*) FROM locations WHERE floor_no>0 AND tier_role<>'FACILITY'
        AND tier_role <> IF(level_no<=3,'PICK','BULK')) AS CHAR),
 IF((SELECT COUNT(*) FROM locations WHERE floor_no>0 AND tier_role<>'FACILITY'
      AND tier_role <> IF(level_no<=3,'PICK','BULK'))=0,'PASS','FAIL')

-- 상품은 자기 소분류의 존에만 있어야 한다. 어긋나면 "우유 사러 3층" 같은 안내가 나간다.
UNION ALL SELECT 4,'카테고리↔존 정합 위반','0',
 CAST((SELECT COUNT(*) FROM stocks s
        JOIN locations l ON l.location_id=s.location_id
        JOIN products p ON p.sku_id=s.sku_id
       WHERE l.floor_no>0 AND l.zone_id <> (
         SELECT z2.zone_id FROM stocks s2 JOIN locations z2 ON z2.location_id=s2.location_id
          WHERE s2.sku_id=s.sku_id AND z2.tier_role='PICK' LIMIT 1)) AS CHAR),
 IF((SELECT COUNT(*) FROM stocks s JOIN locations l ON l.location_id=s.location_id
      WHERE l.floor_no>0 AND l.zone_id <> (
        SELECT z2.zone_id FROM stocks s2 JOIN locations z2 ON z2.location_id=s2.location_id
         WHERE s2.sku_id=s.sku_id AND z2.tier_role='PICK' LIMIT 1))=0,'PASS','FAIL')

-- 모든 상품이 PICK 자리를 하나씩 가진다 (없으면 매장에서 못 찾는 상품이 된다)
UNION ALL SELECT 5,'PICK 자리 없는 상품','0',
 CAST((SELECT COUNT(*) FROM products p WHERE NOT EXISTS
        (SELECT 1 FROM stocks s JOIN locations l ON l.location_id=s.location_id
          WHERE s.sku_id=p.sku_id AND l.tier_role='PICK')) AS CHAR),
 IF((SELECT COUNT(*) FROM products p WHERE NOT EXISTS
      (SELECT 1 FROM stocks s JOIN locations l ON l.location_id=s.location_id
        WHERE s.sku_id=p.sku_id AND l.tier_role='PICK'))=0,'PASS','FAIL')

-- 수직 페어: PICK 상품이 바로 위(L+3)에 자기 예비를 갖는다 = 상품 수와 같아야 한다
UNION ALL SELECT 6,'수직 페어 성립 = 상품 수',
 CAST((SELECT COUNT(*) FROM products) AS CHAR),
 CAST((SELECT COUNT(*) FROM stocks sp
        JOIN locations p ON p.location_id=sp.location_id AND p.tier_role='PICK'
        JOIN locations b ON b.zone_id=p.zone_id AND b.rack_no=p.rack_no
                        AND b.bay_no=p.bay_no AND b.level_no=p.level_no+3
        JOIN stocks sb ON sb.location_id=b.location_id AND sb.sku_id=sp.sku_id) AS CHAR),
 IF((SELECT COUNT(*) FROM stocks sp
      JOIN locations p ON p.location_id=sp.location_id AND p.tier_role='PICK'
      JOIN locations b ON b.zone_id=p.zone_id AND b.rack_no=p.rack_no
                      AND b.bay_no=p.bay_no AND b.level_no=p.level_no+3
      JOIN stocks sb ON sb.location_id=b.location_id AND sb.sku_id=sp.sku_id)
    =(SELECT COUNT(*) FROM products),'PASS','FAIL')

-- 접근 지점(locations.x,y)이 통행 가능해야 손님이 그 앞에 설 수 있다.
-- 여기가 막혀 있으면 동선 솔버가 목적지에 도달하지 못한다.
UNION ALL SELECT 7,'접근 지점이 통행 불가','0',
 CAST((SELECT COUNT(DISTINCT l.zone_id,l.rack_no,l.bay_no) FROM locations l
        JOIN map_cells m ON m.floor_no=l.floor_no AND m.x=l.x AND m.y=l.y
       WHERE l.floor_no>0 AND m.passable=0) AS CHAR),
 IF((SELECT COUNT(*) FROM locations l JOIN map_cells m
      ON m.floor_no=l.floor_no AND m.x=l.x AND m.y=l.y
     WHERE l.floor_no>0 AND m.passable=0)=0,'PASS','FAIL')

-- 좌표가 격자 밖으로 나가면 지도 렌더와 경로 계산이 동시에 깨진다
UNION ALL SELECT 8,'격자 범위 이탈 로케이션','0',
 CAST((SELECT COUNT(*) FROM locations l WHERE l.floor_no>0 AND NOT EXISTS
        (SELECT 1 FROM map_cells m WHERE m.floor_no=l.floor_no AND m.x=l.x AND m.y=l.y)) AS CHAR),
 IF((SELECT COUNT(*) FROM locations l WHERE l.floor_no>0 AND NOT EXISTS
      (SELECT 1 FROM map_cells m WHERE m.floor_no=l.floor_no AND m.x=l.x AND m.y=l.y))=0,
    'PASS','FAIL')

-- 층간 이동 수단이 세 층 모두에 같은 id로 있어야 층 분해 TSP가 성립한다
UNION ALL SELECT 9,'수직동선 있는 층 수','3',
 CAST((SELECT COUNT(DISTINCT floor_no) FROM map_cells WHERE transit_id IS NOT NULL) AS CHAR),
 IF((SELECT COUNT(DISTINCT floor_no) FROM map_cells WHERE transit_id IS NOT NULL)=3,'PASS','FAIL')

-- 통로가 지나치게 적으면(=랙이 과밀) 경로가 안 나온다. 매장은 보통 통로가 절반 이상.
UNION ALL SELECT 10,'통행 가능 비율 50~90%',
 '50~90%',
 CONCAT(ROUND(100*(SELECT SUM(passable)/COUNT(*) FROM map_cells WHERE floor_no>0)),'%'),
 IF((SELECT SUM(passable)/COUNT(*) FROM map_cells WHERE floor_no>0) BETWEEN 0.50 AND 0.90,
    'PASS','FAIL')

-- 매대에 지금 비어 있는 칸이 있어야 장면 1("매대엔 없는데 위에 있어요")이 성립한다.
-- 초기 재고를 전부 가득 채우면 데모 첫 장면이 만들어지지 않는다.
UNION ALL SELECT 11,'임계 이하 매대 존재(장면 1 재료)','>=1',
 CAST((SELECT COUNT(*) FROM stocks s JOIN shelf_configs c
        ON c.sku_id=s.sku_id AND c.location_id=s.location_id
       WHERE s.qty <= c.min_qty) AS CHAR),
 IF((SELECT COUNT(*) FROM stocks s JOIN shelf_configs c
      ON c.sku_id=s.sku_id AND c.location_id=s.location_id
     WHERE s.qty <= c.min_qty)>=1,'PASS','FAIL')

-- 한글 왕복(utf8mb4). 존 이름이 깨지면 에이전트 발화가 그대로 깨져 나간다.
UNION ALL SELECT 12,'존 이름 한글 왕복','OK',
 IF((SELECT MAX(LENGTH(name))>MAX(CHAR_LENGTH(name)) FROM zones),'OK','깨짐'),
 IF((SELECT MAX(LENGTH(name))>MAX(CHAR_LENGTH(name)) FROM zones),'PASS','FAIL');

SELECT '--- 층·존별 요약 ---' AS ``;
SELECT z.floor_no AS `층`, z.zone_id AS `존`, z.name AS `이름`,
       COUNT(DISTINCT l.rack_no) AS `랙`,
       COUNT(DISTINCT l.rack_no, l.bay_no) AS `베이`,
       SUM(l.tier_role='PICK') AS `PICK`,
       (SELECT COUNT(*) FROM stocks s JOIN locations l2 ON l2.location_id=s.location_id
         WHERE l2.zone_id=z.zone_id AND l2.tier_role='PICK') AS `상품`
FROM zones z JOIN locations l ON l.zone_id=z.zone_id
GROUP BY z.zone_id, z.floor_no, z.name ORDER BY z.floor_no, z.zone_id;
