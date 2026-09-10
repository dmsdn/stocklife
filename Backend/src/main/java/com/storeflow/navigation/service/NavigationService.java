package com.storeflow.navigation.service;

import com.storeflow.inventory.dto.InventoryItemResponse;
import com.storeflow.inventory.entity.Location;
import com.storeflow.inventory.repository.LocationRepository;
import com.storeflow.inventory.repository.MapCellRepository;
import com.storeflow.inventory.repository.StockRepository;
import com.storeflow.navigation.dto.RouteLegResponse;
import com.storeflow.navigation.dto.RouteRequest;
import com.storeflow.navigation.dto.RouteResponse;
import com.storeflow.navigation.dto.RouteStopRequest;
import com.storeflow.navigation.model.GridKey;
import com.storeflow.navigation.model.NavigationGraph;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * "네비는 이 목적지들을 이어주는 것까지" — 방문 순서는 AI(Agent)가 자연어를 해석해서
 * 이미 정해서 stops 순서로 넘겨준다. 이 서비스는 그 순서를 바꾸지 않고, 순서대로
 * 이전 지점 -> 다음 목적지 구간을 A*로 계산해서 좌표 폴리라인을 만들어줄 뿐이다.
 *
 * 진행 중인 요청 하나 안에서는 지도를 한 번만 읽어(loadGraph) 재사용한다 —
 * 목적지가 여러 개라도 매 구간마다 DB를 다시 긁지 않는다.
 */
@Service
public class NavigationService {

    /** 목적지 칸이 장애물(진열대)일 때 주변 통행 가능 칸을 찾는 탐색 반경(칸 수). */
    private static final int NEAREST_PASSABLE_RADIUS = 6;

    private final MapCellRepository mapCellRepository;
    private final NavigationGraphCache graphCache;
    private final LocationRepository locationRepository;
    private final StockRepository stockRepository;

    public NavigationService(MapCellRepository mapCellRepository,
                             LocationRepository locationRepository,
                             StockRepository stockRepository,
                             NavigationGraphCache graphCache) {
        this.mapCellRepository = mapCellRepository;
        this.graphCache = graphCache;
        this.locationRepository = locationRepository;
        this.stockRepository = stockRepository;
    }

    @Transactional(readOnly = true)
    public RouteResponse buildRoute(RouteRequest request) {
        // 09-03: 요청마다 21,375행을 읽어 그래프를 새로 짓던 것을 캐시로 (NavigationGraphCache).
        //   실측 2.26초/요청 → 첫 요청만. 에이전트 동선이 구간 비용을 재려고 이 창구를 십수 번
        //   부르므로 그 2.26초가 곧 "화장실 들렀다가 계란" 질문의 80초였다.
        NavigationGraph graph = graphCache.get();

        GridKey current = GridKey.of(request.getStartFloor(), request.getStartX(), request.getStartY());
        List<RouteLegResponse> legs = new ArrayList<>();
        int totalDistance = 0;

        int index = 0;
        for (RouteStopRequest stop : request.getStops()) {
            ResolvedStop resolved = resolveStop(stop);

            if (resolved == null) {
                legs.add(RouteLegResponse.unresolved(index, stop));
                index++;
                continue;
            }

            GridKey rawTarget = resolved.key();
            GridKey walkableTarget = graph.nearestPassable(rawTarget, NEAREST_PASSABLE_RADIUS);
            GridKey walkableStart = graph.nearestPassable(current, NEAREST_PASSABLE_RADIUS);

            if (walkableTarget == null || walkableStart == null) {
                legs.add(RouteLegResponse.unreachable(
                        index, stop.getLabel(), resolved.skuId(), resolved.locationId(), resolved.zoneId()));
                index++;
                continue;
            }

            AStarPathfinder.Result result = AStarPathfinder.findPath(graph, walkableStart, walkableTarget, request.isEscalatorsOnly());

            if (result == null) {
                legs.add(RouteLegResponse.unreachable(
                        index, stop.getLabel(), resolved.skuId(), resolved.locationId(), resolved.zoneId()));
            } else {
                legs.add(RouteLegResponse.ok(
                        index, stop.getLabel(), resolved.skuId(), resolved.locationId(), resolved.zoneId(),
                        result.path(), result.cost()));
                totalDistance += result.cost();
                current = walkableTarget; // 다음 구간은 이번 도착지에서 이어진다
            }
            index++;
        }

        return new RouteResponse(legs, totalDistance);
    }

    /** 모든 지점을 한 번 해석하고 실제 보행 비용을 행렬로 반환한다.
     * 순서 최적화는 Agent가 수행한다. null은 도달 불가이며 0m로 바꾸지 않는다.
     * 인덱스0은 출발, 나머지는 request.stops 순서. DB를 쓰거나 구매 상태를 바꾸지 않는다. */
    @Transactional(readOnly = true)
    public java.util.Map<String, Object> buildMatrix(RouteRequest request) {
        NavigationGraph graph = graphCache.get();
        List<GridKey> points = new ArrayList<>();
        points.add(graph.nearestPassable(GridKey.of(request.getStartFloor(), request.getStartX(), request.getStartY()), NEAREST_PASSABLE_RADIUS));
        for (RouteStopRequest stop : request.getStops()) {
            ResolvedStop resolved = resolveStop(stop);
            points.add(resolved == null ? null : graph.nearestPassable(resolved.key(), NEAREST_PASSABLE_RADIUS));
        }
        Integer[][] costs = new Integer[points.size()][points.size()];
        for (int i = 0; i < points.size(); i++) {
            for (int j = i; j < points.size(); j++) {
                if (points.get(i) == null || points.get(j) == null) continue;
                AStarPathfinder.Result result = AStarPathfinder.findPath(graph, points.get(i), points.get(j), request.isEscalatorsOnly());
                // 현 세계 ESC는 양방향이며 같은 좌표로 인접 층을 연결한다.
                // 방향성 세계로 바뀌면 이 대칭 재사용도 함께 바꿔야 한다.
                costs[i][j] = costs[j][i] = result == null ? null : result.cost();
            }
        }
        return java.util.Map.of("costs", costs, "policy", request.isEscalatorsOnly() ? "ESC_ADJACENT" : "LEGACY");
    }

    // ------------------------------------------------------------------

    private record ResolvedStop(Integer skuId, String locationId, String zoneId, GridKey key) {}

    private ResolvedStop resolveStop(RouteStopRequest stop) {
        if (stop.getLocationId() != null && !stop.getLocationId().isBlank()) {
            return locationRepository.findById(stop.getLocationId())
                    .map(loc -> new ResolvedStop(
                            stop.getSkuId(), loc.getLocationId(), loc.getZoneId(),
                            GridKey.of(loc.getFloorNo(), loc.getX(), loc.getY())))
                    .orElse(null);
        }
        if (stop.getSkuId() != null) {
            return resolveBySkuId(stop.getSkuId());
        }
        // 09-03: 좌표 목적지 — 시설(화장실·엘리베이터·계산대…)로 가는 경로.
        //   sku 도 location 도 없는 자리이므로 격자 좌표를 그대로 목적지로 삼는다.
        //   A* 는 통행 가능 칸만 밟으므로, 이름 있는 시설 칸이 passable=TRUE 여야 도착한다.
        if (stop.getFloorNo() != null && stop.getX() != null && stop.getY() != null) {
            return new ResolvedStop(null, null, null,
                    GridKey.of(stop.getFloorNo().byteValue(),
                            stop.getX().shortValue(), stop.getY().shortValue()));
        }
        return null;
    }

    /**
     * get_inventory(요구사항 10번)와 같은 조회를 재사용해서, 재고가 있는 PICK(진열)
     * 위치를 우선으로 목적지를 정한다. PICK 재고가 없으면 재고가 있는 아무 위치,
     * 그마저 없으면(품절) 그래도 상품이 원래 있는 첫 위치로 안내한다 — "위치는
     * 맞는데 지금 품절"이라는 정보 자체는 유용하므로 완전히 안내를 포기하지 않는다.
     */
    private ResolvedStop resolveBySkuId(Integer skuId) {
        List<InventoryItemResponse> items = stockRepository.findInventoryBySkuId(skuId);
        if (items.isEmpty()) {
            return null;
        }

        InventoryItemResponse chosen = items.stream()
                .filter(i -> i.getQty() > 0 && i.getTierRole() == Location.TierRole.PICK)
                .findFirst()
                .or(() -> items.stream().filter(i -> i.getQty() > 0).findFirst())
                .orElse(items.get(0));

        return new ResolvedStop(
                skuId, chosen.getLocationId(), chosen.getZoneId(),
                GridKey.of(chosen.getFloorNo(), chosen.getX(), chosen.getY()));
    }
}