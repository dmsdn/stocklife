package com.storeflow.navigation.service;

import com.storeflow.navigation.dto.NavigationRequest;
import com.storeflow.navigation.dto.NavigationResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class CartRouteService {

    private static final String DEFAULT_GROUP_TITLE = "빠른 장보기";

    // 층 이동 비용.
    // 일반 셀 1칸 이동보다 엘리베이터/에스컬레이터 이동을 비싸게 본다.
    private static final int TRANSIT_COST = 6;

    private static final int INF = 1_000_000_000;

    private final JdbcTemplate jdbcTemplate;

    public CartRouteService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(readOnly = true)
    public NavigationResponse buildCartRoute(
            Long consumerId,
            NavigationRequest request
    ) {
        if (request == null
                || request.getFloor() == null
                || request.getX() == null
                || request.getY() == null) {
            throw new IllegalArgumentException("현재 캐릭터 위치가 필요합니다.");
        }

        Long groupId = resolveCartGroup(
                consumerId,
                request.getGroupId()
        );

        List<CartProduct> cartProducts =
                loadCartProducts(groupId);

        if (cartProducts.isEmpty()) {
            throw new IllegalStateException(
                    "길찾기할 장바구니 상품이 없습니다."
            );
        }

        Map<Node, Cell> map = loadMap();

        Node requestedStart = new Node(
                request.getFloor(),
                request.getX(),
                request.getY()
        );

        Node start = nearestPassable(
                requestedStart,
                map
        );

        if (start == null) {
            throw new IllegalStateException(
                    "현재 위치 주변에서 이동 가능한 셀을 찾지 못했습니다."
            );
        }

        /*
         * 장바구니 SKU → 실제 진열 PICK 위치 결정.
         *
         * 한 상품에 PICK 위치가 여러 개면
         * 현재는 재고가 가장 많은 PICK 위치를 사용한다.
         */
        List<Target> targets = new ArrayList<>();

        for (CartProduct product : cartProducts) {
            ProductLocation location =
                    findProductLocation(product.skuId());

            if (location == null) {
                continue;
            }

            Node productNode = new Node(
                    location.floor(),
                    location.x(),
                    location.y()
            );

            Node accessNode =
                    nearestPassable(productNode, map);

            if (accessNode == null) {
                continue;
            }

            targets.add(new Target(
                    product.skuId(),
                    product.name(),
                    location.locationId(),
                    accessNode
            ));
        }

        if (targets.isEmpty()) {
            throw new IllegalStateException(
                    "장바구니 상품의 매대 위치를 찾지 못했습니다."
            );
        }

        /*
         * 모든 지점 간 A* 거리를 먼저 구한다.
         *
         * 0 = 현재 위치
         * 1~N = 상품 위치
         */
        int n = targets.size();

        List<Node> points = new ArrayList<>();
        points.add(start);

        for (Target target : targets) {
            points.add(target.node());
        }

        PathResult[][] pairPaths =
                new PathResult[n + 1][n + 1];

        for (int i = 0; i <= n; i++) {
            pairPaths[i][i] =
                    new PathResult(
                            0,
                            List.of(points.get(i))
                    );

            for (int j = i + 1; j <= n; j++) {

                PathResult forward =
                        findPath(
                                points.get(i),
                                points.get(j),
                                map
                        );

                if (forward == null) {
                    pairPaths[i][j] =
                            new PathResult(INF, List.of());

                    pairPaths[j][i] =
                            new PathResult(INF, List.of());

                    continue;
                }

                pairPaths[i][j] = forward;

                List<Node> reversed =
                        new ArrayList<>(forward.path());

                Collections.reverse(reversed);

                pairPaths[j][i] =
                        new PathResult(
                                forward.cost(),
                                reversed
                        );
            }
        }

        /*
         * 상품 수가 많지 않으면 DP로 정확한 최적 방문 순서를 계산.
         *
         * 장바구니 12개 이하:
         * Held-Karp DP
         *
         * 13개 이상:
         * nearest-neighbor
         */
        List<Integer> order;

        if (n <= 12) {
            order = optimizeExact(pairPaths, n);
        } else {
            order = optimizeGreedy(pairPaths, n);
        }

        if (order.isEmpty()) {
            throw new IllegalStateException(
                    "장바구니 상품 사이의 이동 경로를 찾지 못했습니다."
            );
        }

        List<NavigationResponse.Stop> stops =
                new ArrayList<>();

        List<NavigationResponse.PathPoint> fullPath =
                new ArrayList<>();

        fullPath.add(toPathPoint(start));

        int totalDistance = 0;
        int previousIndex = 0;

        for (Integer targetIndex : order) {

            PathResult segment =
                    pairPaths[previousIndex][targetIndex];

            if (segment == null
                    || segment.cost() >= INF
                    || segment.path().isEmpty()) {
                continue;
            }

            totalDistance += segment.cost();

            /*
             * 첫 칸은 이전 segment의 마지막 칸과 중복이므로 제외.
             */
            for (int i = 1; i < segment.path().size(); i++) {
                fullPath.add(
                        toPathPoint(segment.path().get(i))
                );
            }

            Target target =
                    targets.get(targetIndex - 1);

            stops.add(
                    new NavigationResponse.Stop(
                            target.skuId(),
                            target.name(),
                            target.locationId(),
                            target.node().floor(),
                            target.node().x(),
                            target.node().y()
                    )
            );

            previousIndex = targetIndex;
        }

        return new NavigationResponse(
                groupId,
                totalDistance,
                stops,
                fullPath
        );
    }

    // ============================================================
    // 장바구니 조회
    // ============================================================

    private Long resolveCartGroup(
            Long consumerId,
            Long requestedGroupId
    ) {
        if (requestedGroupId != null) {

            List<Long> ids = jdbcTemplate.query(
                    """
                    SELECT cart_group_id
                    FROM cart_group
                    WHERE cart_group_id = ?
                      AND consumer_id = ?
                    """,
                    (rs, rowNum) ->
                            rs.getLong("cart_group_id"),
                    requestedGroupId,
                    consumerId
            );

            if (ids.isEmpty()) {
                throw new IllegalStateException(
                        "장바구니 그룹을 찾을 수 없습니다."
                );
            }

            return ids.get(0);
        }

        List<Long> ids = jdbcTemplate.query(
                """
                SELECT cart_group_id
                FROM cart_group
                WHERE consumer_id = ?
                  AND title = ?
                ORDER BY cart_group_id ASC
                LIMIT 1
                """,
                (rs, rowNum) ->
                        rs.getLong("cart_group_id"),
                consumerId,
                DEFAULT_GROUP_TITLE
        );

        if (ids.isEmpty()) {
            throw new IllegalStateException(
                    "기본 장바구니가 없습니다."
            );
        }

        return ids.get(0);
    }

    private List<CartProduct> loadCartProducts(
            Long groupId
    ) {
        return jdbcTemplate.query(
                """
                SELECT DISTINCT
                       ci.sku_id,
                       p.name
                FROM cart_item ci
                JOIN products p
                  ON p.sku_id = ci.sku_id
                WHERE ci.cart_group_id = ?
                  AND ci.is_checked = TRUE
                  AND ci.quantity > 0
                ORDER BY ci.sku_id
                """,
                (rs, rowNum) ->
                        new CartProduct(
                                rs.getInt("sku_id"),
                                rs.getString("name")
                        ),
                groupId
        );
    }

    // ============================================================
    // 상품 위치
    // ============================================================

    private ProductLocation findProductLocation(
            Integer skuId
    ) {
        List<ProductLocation> locations =
                jdbcTemplate.query(
                        """
                        SELECT
                            l.location_id,
                            l.floor_no,
                            l.x,
                            l.y,
                            s.qty
                        FROM stocks s
                        JOIN locations l
                          ON l.location_id = s.location_id
                        WHERE s.sku_id = ?
                          AND l.tier_role = 'PICK'
                          AND s.qty > 0
                        ORDER BY s.qty DESC,
                                 l.location_id ASC
                        LIMIT 1
                        """,
                        (rs, rowNum) ->
                                new ProductLocation(
                                        rs.getString("location_id"),
                                        rs.getInt("floor_no"),
                                        rs.getInt("x"),
                                        rs.getInt("y")
                                ),
                        skuId
                );

        return locations.isEmpty()
                ? null
                : locations.get(0);
    }

    // ============================================================
    // map_cells 로드
    // ============================================================

    private Map<Node, Cell> loadMap() {

        Map<Node, Cell> result =
                new HashMap<>();

        jdbcTemplate.query(
                """
                SELECT
                    floor_no,
                    x,
                    y,
                    passable,
                    transit_id
                FROM map_cells
                """,
                rs -> {
                    Node node =
                            new Node(
                                    rs.getInt("floor_no"),
                                    rs.getInt("x"),
                                    rs.getInt("y")
                            );

                    result.put(
                            node,
                            new Cell(
                                    node,
                                    rs.getBoolean("passable"),
                                    rs.getString("transit_id")
                            )
                    );
                }
        );

        return result;
    }

    // ============================================================
    // A*
    // ============================================================

    private PathResult findPath(
            Node start,
            Node goal,
            Map<Node, Cell> map
    ) {
        if (start.equals(goal)) {
            return new PathResult(
                    0,
                    List.of(start)
            );
        }

        PriorityQueue<SearchNode> open =
                new PriorityQueue<>(
                        Comparator.comparingInt(SearchNode::f)
                );

        Map<Node, Integer> gScore =
                new HashMap<>();

        Map<Node, Node> cameFrom =
                new HashMap<>();

        gScore.put(start, 0);

        open.add(
                new SearchNode(
                        start,
                        heuristic(start, goal)
                )
        );

        while (!open.isEmpty()) {

            SearchNode currentSearch =
                    open.poll();

            Node current =
                    currentSearch.node();

            if (current.equals(goal)) {

                List<Node> path =
                        reconstructPath(
                                cameFrom,
                                current
                        );

                return new PathResult(
                        gScore.get(current),
                        path
                );
            }

            int currentG =
                    gScore.getOrDefault(
                            current,
                            INF
                    );

            for (Neighbor next :
                    neighbors(current, map)) {

                int tentative =
                        currentG + next.cost();

                if (tentative
                        < gScore.getOrDefault(
                        next.node(),
                        INF
                )) {

                    cameFrom.put(
                            next.node(),
                            current
                    );

                    gScore.put(
                            next.node(),
                            tentative
                    );

                    int f =
                            tentative
                                    + heuristic(
                                    next.node(),
                                    goal
                            );

                    open.add(
                            new SearchNode(
                                    next.node(),
                                    f
                            )
                    );
                }
            }
        }

        return null;
    }

    private List<Neighbor> neighbors(
            Node node,
            Map<Node, Cell> map
    ) {

        List<Neighbor> result =
                new ArrayList<>();

        int[][] dirs = {
                {1, 0},
                {-1, 0},
                {0, 1},
                {0, -1}
        };

        // 같은 층 4방향 이동
        for (int[] dir : dirs) {

            Node next =
                    new Node(
                            node.floor(),
                            node.x() + dir[0],
                            node.y() + dir[1]
                    );

            Cell cell =
                    map.get(next);

            if (cell != null
                    && cell.passable()) {

                result.add(
                        new Neighbor(
                                next,
                                1
                        )
                );
            }
        }

        /*
         * 층간 이동.
         *
         * 현재 셀이 transit_id를 갖고 있으면
         * 바로 위/아래층의 동일 transit_id 중
         * 가장 가까운 셀과 연결한다.
         */
        Cell currentCell =
                map.get(node);

        if (currentCell != null
                && currentCell.transitId() != null
                && !currentCell.transitId().isBlank()) {

            String transitId =
                    currentCell.transitId();

            for (int floorDelta :
                    new int[]{-1, 1}) {

                int targetFloor =
                        node.floor()
                                + floorDelta;

                Node best = null;
                int bestDistance = INF;

                for (Cell candidate :
                        map.values()) {

                    if (!candidate.passable()) {
                        continue;
                    }

                    if (candidate.node().floor()
                            != targetFloor) {
                        continue;
                    }

                    if (!transitId.equals(
                            candidate.transitId())) {
                        continue;
                    }

                    int distance =
                            Math.abs(
                                    node.x()
                                            - candidate.node().x()
                            )
                                    + Math.abs(
                                    node.y()
                                            - candidate.node().y()
                            );

                    if (distance < bestDistance) {
                        bestDistance = distance;
                        best = candidate.node();
                    }
                }

                if (best != null) {
                    result.add(
                            new Neighbor(
                                    best,
                                    TRANSIT_COST
                            )
                    );
                }
            }
        }

        return result;
    }

    private int heuristic(
            Node a,
            Node b
    ) {
        return Math.abs(a.x() - b.x())
                + Math.abs(a.y() - b.y())
                + Math.abs(
                a.floor() - b.floor()
        ) * TRANSIT_COST;
    }

    private List<Node> reconstructPath(
            Map<Node, Node> cameFrom,
            Node current
    ) {

        LinkedList<Node> path =
                new LinkedList<>();

        path.addFirst(current);

        while (cameFrom.containsKey(current)) {
            current = cameFrom.get(current);
            path.addFirst(current);
        }

        return path;
    }

    // ============================================================
    // 매대 좌표가 통행불가일 경우 가장 가까운 통로 선택
    // ============================================================

    private Node nearestPassable(
            Node target,
            Map<Node, Cell> map
    ) {

        Cell exact =
                map.get(target);

        if (exact != null
                && exact.passable()) {
            return target;
        }

        Node best = null;
        int bestDistance = INF;

        for (Cell cell : map.values()) {

            if (!cell.passable()) {
                continue;
            }

            if (cell.node().floor()
                    != target.floor()) {
                continue;
            }

            int d =
                    Math.abs(
                            cell.node().x()
                                    - target.x()
                    )
                            + Math.abs(
                            cell.node().y()
                                    - target.y()
                    );

            if (d < bestDistance) {
                bestDistance = d;
                best = cell.node();
            }
        }

        return best;
    }

    // ============================================================
    // 방문순서 최적화
    // Held-Karp
    // ============================================================

    private List<Integer> optimizeExact(
            PathResult[][] paths,
            int n
    ) {
        int states = 1 << n;

        int[][] dp =
                new int[states][n];

        int[][] parent =
                new int[states][n];

        for (int[] row : dp) {
            Arrays.fill(row, INF);
        }

        for (int[] row : parent) {
            Arrays.fill(row, -1);
        }

        /*
         * 시작점 → 각 상품
         */
        for (int i = 0; i < n; i++) {
            int distance =
                    paths[0][i + 1].cost();

            if (distance >= INF) {
                continue;
            }

            dp[1 << i][i] =
                    distance;
        }

        for (int mask = 1;
             mask < states;
             mask++) {

            for (int last = 0;
                 last < n;
                 last++) {

                int current =
                        dp[mask][last];

                if (current >= INF) {
                    continue;
                }

                for (int next = 0;
                     next < n;
                     next++) {

                    if ((mask & (1 << next))
                            != 0) {
                        continue;
                    }

                    int distance =
                            paths[last + 1]
                                    [next + 1]
                                    .cost();

                    if (distance >= INF) {
                        continue;
                    }

                    int nextMask =
                            mask | (1 << next);

                    int newCost =
                            current
                                    + distance;

                    if (newCost
                            < dp[nextMask][next]) {

                        dp[nextMask][next] =
                                newCost;

                        parent[nextMask][next] =
                                last;
                    }
                }
            }
        }

        int fullMask =
                states - 1;

        int bestLast = -1;
        int bestCost = INF;

        for (int i = 0; i < n; i++) {

            if (dp[fullMask][i]
                    < bestCost) {

                bestCost =
                        dp[fullMask][i];

                bestLast = i;
            }
        }

        if (bestLast == -1) {
            return List.of();
        }

        LinkedList<Integer> result =
                new LinkedList<>();

        int mask = fullMask;
        int current = bestLast;

        while (current != -1) {

            // pairPaths에서는 상품 index가 1부터 시작
            result.addFirst(
                    current + 1
            );

            int previous =
                    parent[mask][current];

            mask =
                    mask ^ (1 << current);

            current = previous;
        }

        return result;
    }

    // 상품이 너무 많을 때
    private List<Integer> optimizeGreedy(
            PathResult[][] paths,
            int n
    ) {

        List<Integer> order =
                new ArrayList<>();

        boolean[] visited =
                new boolean[n + 1];

        int current = 0;

        for (int count = 0;
             count < n;
             count++) {

            int best = -1;
            int bestDistance = INF;

            for (int next = 1;
                 next <= n;
                 next++) {

                if (visited[next]) {
                    continue;
                }

                int distance =
                        paths[current][next]
                                .cost();

                if (distance
                        < bestDistance) {

                    bestDistance =
                            distance;

                    best = next;
                }
            }

            if (best == -1
                    || bestDistance >= INF) {
                break;
            }

            visited[best] = true;
            order.add(best);
            current = best;
        }

        return order;
    }

    private NavigationResponse.PathPoint
    toPathPoint(Node node) {

        return new NavigationResponse.PathPoint(
                node.floor(),
                node.x(),
                node.y()
        );
    }

    // ============================================================
    // 내부 자료형
    // ============================================================

    private record Node(
            int floor,
            int x,
            int y
    ) {}

    private record Cell(
            Node node,
            boolean passable,
            String transitId
    ) {}

    private record Neighbor(
            Node node,
            int cost
    ) {}

    private record SearchNode(
            Node node,
            int f
    ) {}

    private record CartProduct(
            Integer skuId,
            String name
    ) {}

    private record ProductLocation(
            String locationId,
            int floor,
            int x,
            int y
    ) {}

    private record Target(
            Integer skuId,
            String name,
            String locationId,
            Node node
    ) {}

    private record PathResult(
            int cost,
            List<Node> path
    ) {}
}