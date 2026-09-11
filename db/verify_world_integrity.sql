-- ============================================================================
-- 세계 데이터 정합성 검사 — AI가 참조하는 값이 스스로 앞뒤가 맞는지 본다
-- ============================================================================
-- [무엇을 보나] AI는 상품 위치와 매장 격자를 사실로 믿고 답한다. 그 값이 서로
--   어긋나 있으면 AI는 틀린 줄도 모르고 손님을 엉뚱한 곳으로 보낸다. 여기서 보는
--   것은 "값이 있느냐"가 아니라 "값들끼리 말이 되느냐"다.
--
-- [왜 FK 로는 안 되나] map_cells 에는 FK 가 없다(스키마 주석: 수천 개 단위 벌크
--   적재라 의도적으로 뺐다). 그래서 locations 가 존재하지도 않는 칸을 가리켜도
--   DB 는 아무 말을 하지 않는다. 반대로 stocks 는 FK 와 UNIQUE 가 걸려 있어
--   적재 시점에 터지므로 여기서 다시 볼 필요가 없다 — 이 파일은 **DB 가 막아주지
--   않는 것만** 본다.
--
-- [쓰는 법]
--   mysql -h <호스트> -u <계정> -p <DB> < db/verify_world_integrity.sql
--   또는 DB 클라이언트에서 통째로 실행.
--
-- [읽는 법] 마지막 요약 표의 violations 가 전부 0 이면 통과다. 0 이 아니면 그
--   번호에 해당하는 아래 상세 쿼리를 따로 돌려서 어느 행인지 본다.
--
-- [주의] 읽기 전용이다. INSERT/UPDATE/DELETE 가 한 줄도 없다.
-- ============================================================================


-- ── 요약 표 ─────────────────────────────────────────────────────────────────
-- 09-10 실측: 층 0(B1 지하창고)에서 1,440건이 나온다. B1 은 팀에서 없애기로 한 층인데
-- world_gen 의 격자 생성이 for f in (1,2,3) 이라 격자만 사라지고 로케이션은 남았다.
-- 재고가 0이라 지금은 무해하다(8번 참고). 정리하면 이 숫자도 0이 된다.
SELECT '1' AS no, '좌표가 map_cells 에 없음' AS 검사, floor_no AS 층, COUNT(*) AS violations
FROM locations l
WHERE NOT EXISTS (
        SELECT 1 FROM map_cells m
        WHERE m.floor_no = l.floor_no AND m.x = l.x AND m.y = l.y)
GROUP BY floor_no

UNION ALL
-- 접근 지점인데 못 걸어가는 칸이면 A* 가 도달하지 못한다. AI 안내가 실패하는 자리.
SELECT '2', '접근 지점이 통행 불가', l.floor_no, COUNT(*)
FROM locations l
JOIN map_cells m ON m.floor_no = l.floor_no AND m.x = l.x AND m.y = l.y
WHERE m.passable = 0
GROUP BY l.floor_no

UNION ALL
-- 매대 앞에 설 자리는 있는데 정작 그 옆에 매대가 없으면, 손님은 빈 통로에 서게 된다.
-- 09-10 자소서에 쓴 그 버그를 자동으로 잡는 검사다.
SELECT '3', '옆에 같은 존 매대가 없음', l.floor_no, COUNT(*)
FROM locations l
WHERE l.tier_role = 'PICK'
  AND NOT EXISTS (
        SELECT 1 FROM map_cells m
        WHERE m.floor_no = l.floor_no
          AND m.kind = 'SHELF'
          AND m.shelf_zone = l.zone_id
          AND ABS(m.x - l.x) + ABS(m.y - l.y) <= 2)
GROUP BY l.floor_no

UNION ALL
-- 층을 오갈 수단이 없으면 다른 층 상품은 안내 자체가 성립하지 않는다.
-- 배포에서 에스컬레이터가 사라졌던 건이 이 검사에 걸린다.
SELECT '4', '층에 통행 가능한 수직동선 없음', f.floor_no, 
       CASE WHEN EXISTS (
            SELECT 1 FROM map_cells m
            WHERE m.floor_no = f.floor_no AND m.kind = 'TRANSIT' AND m.passable = 1)
       THEN 0 ELSE 1 END
FROM (SELECT DISTINCT floor_no FROM locations WHERE floor_no > 0) f

UNION ALL
-- 매대 칸인데 걸어 통과할 수 있으면 캐릭터가 진열대를 뚫고 지나간다.
SELECT '5', '매대 칸인데 통행 가능', m.floor_no, COUNT(*)
FROM map_cells m
WHERE m.kind = 'SHELF' AND m.passable = 1
GROUP BY m.floor_no

UNION ALL
-- 존 이름이 zones 에 없으면 프론트가 색과 이름표를 못 찾는다(FK 가 없어서 조용히 통과된다).
SELECT '6', '없는 존을 가리키는 매대 칸', m.floor_no, COUNT(*)
FROM map_cells m
WHERE m.kind = 'SHELF'
  AND m.shelf_zone IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM zones z WHERE z.zone_id = m.shelf_zone)
GROUP BY m.floor_no

UNION ALL
-- 재고가 붙어 있는데 손이 닿지 않는 자리(BULK)면 "여기 있어요"라고 안내하면 안 된다.
SELECT '7', 'PICK 이 아닌 칸에 판매 재고', l.floor_no, COUNT(*)
FROM stocks s
JOIN locations l ON l.location_id = s.location_id
WHERE l.tier_role = 'FACILITY' AND s.qty > 0
GROUP BY l.floor_no

UNION ALL
-- 격자가 없는 층(=이 세계에 더 이상 없는 층)의 로케이션에 재고가 붙어 있으면, AI 는 갈 수도
-- 없는 곳의 재고를 근거로 "곧 채워져요"라고 답한다. 에러가 안 나고 조용히 틀리는 조합이라
-- 1번(격자 없음)과 따로 센다 — 1번은 껍데기만 남은 무해한 상태까지 잡지만, 이건 실제로
-- AI 응답이 틀어지는 순간만 잡는다.
-- 09-10 기준 B1(층 0) 로케이션 1,440개가 남아 있으나 재고는 0이라 이 검사는 0건이다.
SELECT '8', '격자 없는 층에 재고가 붙어 있음', l.floor_no, COUNT(*)
FROM stocks s
JOIN locations l ON l.location_id = s.location_id
WHERE s.qty > 0
  AND NOT EXISTS (SELECT 1 FROM map_cells m WHERE m.floor_no = l.floor_no)
GROUP BY l.floor_no

ORDER BY no, 층;


-- ============================================================================
-- 상세 — 위 표에서 0 이 아닌 번호만 골라서 따로 돌린다
-- ============================================================================
--
-- [1] 좌표가 map_cells 에 없는 location
-- SELECT l.location_id, l.floor_no, l.x, l.y FROM locations l
-- WHERE NOT EXISTS (SELECT 1 FROM map_cells m
--     WHERE m.floor_no=l.floor_no AND m.x=l.x AND m.y=l.y) LIMIT 50;
--
-- [2] 통행 불가 칸을 가리키는 location
-- SELECT l.location_id, l.floor_no, l.x, l.y, m.kind FROM locations l
-- JOIN map_cells m ON m.floor_no=l.floor_no AND m.x=l.x AND m.y=l.y
-- WHERE m.passable=0 LIMIT 50;
--
-- [3] 옆에 같은 존 매대가 없는 PICK location
-- SELECT l.location_id, l.zone_id, l.floor_no, l.x, l.y FROM locations l
-- WHERE l.tier_role='PICK' AND NOT EXISTS (SELECT 1 FROM map_cells m
--     WHERE m.floor_no=l.floor_no AND m.kind='SHELF' AND m.shelf_zone=l.zone_id
--       AND ABS(m.x-l.x)+ABS(m.y-l.y)<=2) LIMIT 50;
--
-- [4] 층별 수직동선 칸 수 (0 이면 그 층은 고립)
-- SELECT floor_no, COUNT(*) AS transit_cells,
--        SUM(passable) AS passable_cells, GROUP_CONCAT(DISTINCT transit_id) AS ids
-- FROM map_cells WHERE kind='TRANSIT' GROUP BY floor_no;
--
-- [5] 통행 가능한 매대 칸
-- SELECT floor_no, x, y, shelf_zone FROM map_cells
-- WHERE kind='SHELF' AND passable=1 LIMIT 50;
--
-- [6] 없는 존을 가리키는 매대 칸
-- SELECT DISTINCT shelf_zone FROM map_cells m WHERE m.kind='SHELF'
--   AND m.shelf_zone IS NOT NULL
--   AND NOT EXISTS (SELECT 1 FROM zones z WHERE z.zone_id=m.shelf_zone);
--
-- [참고] 아래 두 가지는 DB 제약이 이미 막고 있어 여기서 검사하지 않는다.
--   한 칸에 두 상품  → stocks.uq_stk_location (UNIQUE)
--   없는 위치의 재고 → stocks.fk_stk_loc (FOREIGN KEY)
