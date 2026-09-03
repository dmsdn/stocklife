-- ============================================================================
-- 시설을 locations 의 1급 시민으로 (2026-09-03) — zones·locations ENUM 확장 + 시설 행 39개
-- ============================================================================
-- [왜] 시설(화장실·계산대·엘리베이터…)이 location_id 없이 좌표로만 있으면 동선 도구의
--   정지점 목록에 상품과 섞을 수 없다. id 가 있으면 백엔드 resolveStop 의 locationId 갈래가
--   그대로 받고, 출발·도착점도 id 하나로 표현된다.
-- [무엇] ① zones.zone_type 에 FACILITY · locations.tier_role 에 FACILITY
--        ② 층별 시설 존 3행('F1-X'…) ③ 시설 위치 36행 (STRUCTURE 제외 · rack 0 · level 0 · x,y=블록 중심)
-- [실행] mysql -uroot -p --default-character-set=utf8mb4 --force storeflow_db < db/migration_locations_facility_0903.sql
--   (migration_map_cells_facility_0903.sql 을 먼저 적용했어야 한다 — 시설 칸이 passable=1 이어야 A* 가 도착한다)
--   새 DB 는 schema_v2.sql + world_seed.sql 만으로 충분하다.
-- [불변] 매대 위치·재고·존 A~H 는 한 행도 안 바뀐다. 시설 행은 stocks·shelf_configs 를 갖지 않는다.
SET NAMES utf8mb4;
ALTER TABLE zones MODIFY zone_type ENUM('SALES','BACKROOM','FACILITY') NOT NULL DEFAULT 'SALES';
ALTER TABLE locations MODIFY tier_role ENUM('PICK','BULK','FACILITY') NOT NULL;
-- 재실행 안전: 시설 행은 stocks 를 갖지 않으므로 지우고 다시 넣는다
DELETE FROM locations WHERE tier_role='FACILITY';
INSERT IGNORE INTO zones (zone_id, floor_no, name, zone_type) VALUES
 ('F1-X',1,'시설 구역','FACILITY'),
 ('F2-X',2,'시설 구역','FACILITY'),
 ('F3-X',3,'시설 구역','FACILITY');
INSERT INTO locations (location_id, zone_id, rack_no, bay_no, level_no, tier_role, floor_no, x, y) VALUES
 ('F1-X-ATM-1','F1-X',0,1,0,'FACILITY',1,51,73),
 ('F1-X-BAKERY-1','F1-X',0,2,0,'FACILITY',1,59,72),
 ('F1-X-CHECKOUT-1','F1-X',0,3,0,'FACILITY',1,16,71),
 ('F1-X-CHECKOUT-2','F1-X',0,4,0,'FACILITY',1,17,71),
 ('F1-X-CHECKOUT-3','F1-X',0,5,0,'FACILITY',1,27,70),
 ('F1-X-CUSTOMER_SERVICE-1','F1-X',0,6,0,'FACILITY',1,43,73),
 ('F1-X-ELEVATOR-1','F1-X',0,7,0,'FACILITY',1,92,31),
 ('F1-X-ENTRANCE-1','F1-X',0,8,0,'FACILITY',1,10,71),
 ('F1-X-ESCALATOR-1','F1-X',0,9,0,'FACILITY',1,92,60),
 ('F1-X-ESCALATOR-2','F1-X',0,10,0,'FACILITY',1,94,60),
 ('F1-X-EVENT-1','F1-X',0,11,0,'FACILITY',1,30,32),
 ('F1-X-EVENT-2','F1-X',0,12,0,'FACILITY',1,74,36),
 ('F1-X-FOODCOURT-1','F1-X',0,13,0,'FACILITY',1,73,72),
 ('F1-X-RESTROOM_F-1','F1-X',0,14,0,'FACILITY',1,92,42),
 ('F1-X-RESTROOM_M-1','F1-X',0,15,0,'FACILITY',1,92,35),
 ('F1-X-TRASH-1','F1-X',0,16,0,'FACILITY',1,93,37),
 ('F2-X-ELEVATOR-1','F2-X',0,1,0,'FACILITY',2,92,31),
 ('F2-X-ESCALATOR-1','F2-X',0,2,0,'FACILITY',2,92,60),
 ('F2-X-ESCALATOR-2','F2-X',0,3,0,'FACILITY',2,94,60),
 ('F2-X-EVENT-1','F2-X',0,4,0,'FACILITY',2,89,12),
 ('F2-X-EVENT-2','F2-X',0,5,0,'FACILITY',2,75,33),
 ('F2-X-OPTICAL-1','F2-X',0,6,0,'FACILITY',2,6,66),
 ('F2-X-PHARMACY-1','F2-X',0,7,0,'FACILITY',2,6,72),
 ('F2-X-RESTROOM_F-1','F2-X',0,8,0,'FACILITY',2,92,42),
 ('F2-X-RESTROOM_M-1','F2-X',0,9,0,'FACILITY',2,92,35),
 ('F2-X-TASTING-1','F2-X',0,10,0,'FACILITY',2,48,69),
 ('F2-X-TRASH-1','F2-X',0,11,0,'FACILITY',2,93,37),
 ('F3-X-AS_CENTER-1','F3-X',0,1,0,'FACILITY',3,4,56),
 ('F3-X-ELEVATOR-1','F3-X',0,2,0,'FACILITY',3,92,31),
 ('F3-X-ESCALATOR-1','F3-X',0,3,0,'FACILITY',3,92,60),
 ('F3-X-ESCALATOR-2','F3-X',0,4,0,'FACILITY',3,94,60),
 ('F3-X-EXPERIENCE-1','F3-X',0,5,0,'FACILITY',3,19,68),
 ('F3-X-LOUNGE-1','F3-X',0,6,0,'FACILITY',3,60,68),
 ('F3-X-RESTROOM_F-1','F3-X',0,7,0,'FACILITY',3,92,42),
 ('F3-X-RESTROOM_M-1','F3-X',0,8,0,'FACILITY',3,92,35),
 ('F3-X-TRASH-1','F3-X',0,9,0,'FACILITY',3,93,37);
