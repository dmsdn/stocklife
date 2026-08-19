package com.storeflow.navigation.service;

import com.storeflow.navigation.model.GridKey;
import com.storeflow.navigation.model.NavigationGraph;

import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;

/**
 * 격자 위 A* 최단경로. 프론트가 그릴 폴리라인(경유 좌표 리스트)을 그대로 만들어준다.
 *
 * Java PriorityQueue는 원소 삽입 후 우선순위가 바뀌어도 힙을 다시 정렬해주지 않으므로
 * (decrease-key 미지원), 같은 칸을 여러 번 큐에 넣고 꺼낼 때 이미 확정(visited)된 칸이면
 * 버리는 "지연 삭제" 방식을 쓴다 — 표준적인 자바 A              다익스트라 구현 패턴*/

public final class AStarPathfinder {

    private AStarPathfinder() {}

    public record Result(List<GridKey> path, int cost) {}

    private record QueueEntry(GridKey key, int fScore) {}

    /** @return 경로를 못 찾으면 null */
    public static Result findPath(NavigationGraph graph, GridKey start, GridKey goal) {
        if (start.equals(goal)) {
            return new Result(List.of(start), 0);
        }
        if (!graph.isPassable(start) || !graph.isPassable(goal)) {
            return null;
        }

        Map<GridKey, Integer> gScore = new HashMap<>();
        Map<GridKey, GridKey> cameFrom = new HashMap<>();
        Set<GridKey> visited = new HashSet<>();
        PriorityQueue<QueueEntry> open = new PriorityQueue<>(Comparator.comparingInt(QueueEntry::fScore));

        gScore.put(start, 0);
        open.add(new QueueEntry(start, heuristic(start, goal)));

        while (!open.isEmpty()) {
            GridKey current = open.poll().key();

            if (!visited.add(current)) {
                continue; // 이미 더 나은 값으로 확정된 칸 — 오래된(지연 삭제 대상) 큐 항목
            }
            if (current.equals(goal)) {
                return new Result(reconstruct(cameFrom, current), gScore.get(current));
            }

            int currentScore = gScore.get(current);
            for (NavigationGraph.Edge edge : graph.neighbors(current)) {
                if (visited.contains(edge.to())) {
                    continue;
                }
                int tentative = currentScore + edge.cost();
                if (tentative < gScore.getOrDefault(edge.to(), Integer.MAX_VALUE)) {
                    gScore.put(edge.to(), tentative);
                    cameFrom.put(edge.to(), current);
                    open.add(new QueueEntry(edge.to(), tentative + heuristic(edge.to(), goal)));
                }
            }
        }

        return null; // 경로 없음 (완전히 막혀있거나 층 연결이 끊김)
    }

    /** 층이 다르면 실거리를 모르므로 0을 써서 admissible(과대추정 없음)하게 유지한다. */
    private static int heuristic(GridKey a, GridKey b) {
        if (a.floorNo() != b.floorNo()) {
            return 0;
        }
        return Math.abs(a.x() - b.x()) + Math.abs(a.y() - b.y());
    }

    private static List<GridKey> reconstruct(Map<GridKey, GridKey> cameFrom, GridKey goal) {
        LinkedList<GridKey> path = new LinkedList<>();
        GridKey current = goal;
        path.addFirst(current);
        while (cameFrom.containsKey(current)) {
            current = cameFrom.get(current);
            path.addFirst(current);
        }
        return path;
    }
}