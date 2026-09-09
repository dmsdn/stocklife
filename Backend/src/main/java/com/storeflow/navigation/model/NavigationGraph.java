package com.storeflow.navigation.model;

import com.storeflow.inventory.entity.MapCell;

import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * map_cells(요구사항 35번 데이터)를 A* 탐색이 쓸 수 있는 그래프로 올려둔 것.
 * - passable=false인 칸(진열대, 벽 등 장애물)은 지나갈 수 없다.
 * - transitId가 같은 칸끼리는(무빙워크) 층이 달라도 서로 이동 가능한 간선으로 취급한다.
 *
 * 좌표계는 map_cells와 동일하게 존/랙/베이/레벨 기반이 아니라 floorNo+x+y 격자다
 * (요구사항 35번 비고: 구 시트의 'Aisle' 층위는 없음).
 */
public class NavigationGraph {

    /** 무빙워크로 층을 넘는 간선의 비용. 일반 보행 1칸=1보다 크게 잡아 "그냥 걸어서 갈 수 있으면 그쪽을 우선"하게 한다. */
    private static final int TRANSIT_COST = 3;

    private static final int[][] DIRECTIONS = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};

    public record Edge(GridKey to, int cost) {}

    private final Map<GridKey, MapCell> cellsByKey;
    private final Map<String, List<GridKey>> transitGroups;

    private NavigationGraph(Map<GridKey, MapCell> cellsByKey, Map<String, List<GridKey>> transitGroups) {
        this.cellsByKey = cellsByKey;
        this.transitGroups = transitGroups;
    }

    public static NavigationGraph load(List<MapCell> allCells) {
        Map<GridKey, MapCell> cellsByKey = new HashMap<>();
        for (MapCell cell : allCells) {
            cellsByKey.put(GridKey.of(cell.getFloorNo(), cell.getX(), cell.getY()), cell);
        }

        Map<String, List<GridKey>> transitGroups = allCells.stream()
                .filter(c -> c.getTransitId() != null && !c.getTransitId().isBlank())
                .collect(Collectors.groupingBy(
                        MapCell::getTransitId,
                        Collectors.mapping(c -> GridKey.of(c.getFloorNo(), c.getX(), c.getY()), Collectors.toList())
                ));

        return new NavigationGraph(cellsByKey, transitGroups);
    }

    public boolean isPassable(GridKey key) {
        MapCell cell = cellsByKey.get(key);
        return cell != null && cell.isPassable();
    }

    public boolean exists(GridKey key) {
        return cellsByKey.containsKey(key);
    }

    /** 현재 칸에서 이동 가능한 이웃(같은 층 4방향 + 무빙워크 간선)을 돌려준다. */
    public List<Edge> neighbors(GridKey key) {
        return neighbors(key, false);
    }

    /** 장보기는 실제 ESC 계약의 인접 층만 연결한다. 엘리베이터·같은 층 순간 이동을 배제한다. */
    public List<Edge> neighbors(GridKey key, boolean escalatorsOnly) {
        List<Edge> edges = new java.util.ArrayList<>();

        for (int[] d : DIRECTIONS) {
            GridKey next = GridKey.of(key.floorNo(), (short) (key.x() + d[0]), (short) (key.y() + d[1]));
            if (isPassable(next)) {
                edges.add(new Edge(next, 1));
            }
        }

        MapCell current = cellsByKey.get(key);
        if (current != null && current.getTransitId() != null && !current.getTransitId().isBlank()) {
            for (GridKey other : transitGroups.getOrDefault(current.getTransitId(), List.of())) {
                if (!other.equals(key) && isPassable(other)) {
                    if (escalatorsOnly) {
                        // 세계 정본 TRANSIT=ESC. 시설 이름을 추측하거나 임의 transit을 허용하지 않는다.
                        if (!"ESC".equals(current.getTransitId())
                                || Math.abs(other.floorNo() - key.floorNo()) != 1
                                || other.x() != key.x() || other.y() != key.y()) continue;
                    }
                    edges.add(new Edge(other, TRANSIT_COST));
                }
            }
        }

        return edges;
    }

    /**
     * 목적지 칸 자체가 장애물(진열대)이면 갈 수 없으므로, 같은 층에서 BFS로
     * 가장 가까운 통행 가능 칸("선반 앞자리")을 찾아 실제 도착지로 보정한다.
     * maxRadius 안에서 못 찾으면 null(안내 불가).
     */
    public GridKey nearestPassable(GridKey origin, int maxRadius) {
        if (isPassable(origin)) {
            return origin;
        }

        Queue<GridKey> queue = new ArrayDeque<>();
        Set<GridKey> seen = new HashSet<>();
        queue.add(origin);
        seen.add(origin);

        for (int radius = 0; radius <= maxRadius && !queue.isEmpty(); radius++) {
            int levelSize = queue.size();
            for (int i = 0; i < levelSize; i++) {
                GridKey cur = queue.poll();
                for (int[] d : DIRECTIONS) {
                    GridKey next = GridKey.of(cur.floorNo(), (short) (cur.x() + d[0]), (short) (cur.y() + d[1]));
                    if (!exists(next) || !seen.add(next)) {
                        continue;
                    }
                    if (isPassable(next)) {
                        return next;
                    }
                    queue.add(next);
                }
            }
        }
        return null;
    }
}