# ===============================================
# Agent 하네스 - 계산형 도구 실행부
# ===============================================
# 현재 구현: optimize_route
# 역할: LLM이 방문 순서를 추측하지 않도록, 실제 상품 좌표와 매장 경로 비용을 이용해
#       "현재 위치 -> 여러 상품"의 최소 보행 순서를 결정한다.
#
# 실물 백엔드 연결 시:
#   Spring /api/navigation/route 의 A* 계산기를 비용 oracle로 사용한다.
#   즉 장애물, 통행 가능 셀, 층간 무빙워크 비용이 전부 반영된다.
# mock 모드:
#   mock_data에 map_cells가 없으므로 좌표 Manhattan + 층 이동 penalty 휴리스틱을 쓴다.
# ===============================================

from __future__ import annotations

from functools import lru_cache
from math import inf

from app import config, mock_data, sot_client

MAX_EXACT_STOPS = 10
MOCK_FLOOR_CHANGE_COST = 30


def _choose_destination(sku_id: int) -> dict | None:
    """Backend NavigationService.resolveBySkuId와 같은 우선순위로 목적지 위치를 고른다."""
    inv = sot_client.get_inventory(sku_id)
    locations = list(inv.get("locations") or [])
    if not locations:
        return None

    chosen = next((x for x in locations if int(x.get("qty", 0)) > 0 and x.get("tier_role") == "PICK"), None)
    if chosen is None:
        chosen = next((x for x in locations if int(x.get("qty", 0)) > 0), None)
    if chosen is None:
        chosen = locations[0]

    return {
        "sku_id": sku_id,
        "location_id": chosen.get("location_id"),
        "zone_id": chosen.get("zone_id"),
        "floor_no": int(chosen["floor_no"]),
        "x": int(chosen["x"]),
        "y": int(chosen["y"]),
        "qty": int(chosen.get("qty", 0)),
        "tier_role": chosen.get("tier_role"),
    }


def _product_name(sku_id: int) -> str:
    try:
        p = sot_client.get_product(sku_id)
        if p:
            return str(p.get("name") or sku_id)
    except Exception:
        pass
    return str(sku_id)


def _resolve_start(start_location_id: str | None,
                   start_floor: int | None,
                   start_x: int | None,
                   start_y: int | None) -> tuple[int, int, int] | None:
    # 가장 신뢰할 수 있는 것은 get_position이 돌려준 실제 좌표 3종이다.
    if start_floor is not None and start_x is not None and start_y is not None:
        return int(start_floor), int(start_x), int(start_y)

    # mock에서는 location_id -> 좌표 표가 있으므로 직접 해석 가능하다.
    if config.USE_MOCK_SOT and start_location_id:
        loc = mock_data.LOCATIONS.get(start_location_id)
        if loc:
            return int(loc["floor_no"]), int(loc["x"]), int(loc["y"])

    return None


def _mock_cost(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    af, ax, ay = a
    bf, bx, by = b
    return abs(ax - bx) + abs(ay - by) + abs(af - bf) * MOCK_FLOOR_CHANGE_COST


def _extract_endpoint(route: dict) -> tuple[int, int, int] | None:
    legs = route.get("legs") or []
    if not legs:
        return None
    leg = legs[-1]
    if str(leg.get("status")) != "OK":
        return None
    path = leg.get("path") or []
    if not path:
        return None
    p = path[-1]
    return int(p["floorNo"]), int(p["x"]), int(p["y"])


def _backend_single_leg(start: tuple[int, int, int], sku_id: int) -> tuple[int, tuple[int, int, int]] | None:
    route = sot_client.get_navigation_route(
        start[0], start[1], start[2],
        [{"skuId": int(sku_id), "label": _product_name(sku_id)}],
    )
    legs = route.get("legs") or []
    if not legs or str(legs[0].get("status")) != "OK":
        return None
    endpoint = _extract_endpoint(route)
    if endpoint is None:
        return None
    return int(legs[0].get("distance", route.get("totalDistance", 0))), endpoint


def _held_karp_order(start_cost: list[float], pair_cost: list[list[float]]) -> tuple[list[int], int] | None:
    """출발점은 고정, 마지막에는 출발점으로 돌아오지 않는 open-TSP Held-Karp."""
    n = len(start_cost)
    if n == 0:
        return [], 0

    # dp[(mask,last)] = (cost, previous_last)
    dp: dict[tuple[int, int], tuple[float, int | None]] = {}
    for i, c in enumerate(start_cost):
        if c < inf:
            dp[(1 << i, i)] = (c, None)

    for mask in range(1, 1 << n):
        for last in range(n):
            state = dp.get((mask, last))
            if state is None:
                continue
            base = state[0]
            for nxt in range(n):
                if mask & (1 << nxt):
                    continue
                edge = pair_cost[last][nxt]
                if edge == inf:
                    continue
                nm = mask | (1 << nxt)
                nc = base + edge
                old = dp.get((nm, nxt))
                if old is None or nc < old[0]:
                    dp[(nm, nxt)] = (nc, last)

    full = (1 << n) - 1
    endings = [(dp[(full, i)][0], i) for i in range(n) if (full, i) in dp]
    if not endings:
        return None
    total, last = min(endings)

    order_rev = []
    mask = full
    while last is not None:
        order_rev.append(last)
        _, prev = dp[(mask, last)]
        mask ^= 1 << last
        last = prev
    order_rev.reverse()
    return order_rev, int(total)


def _optimize_route(sku_ids: list[int],
                    start_location_id: str | None = None,
                    start_floor: int | None = None,
                    start_x: int | None = None,
                    start_y: int | None = None) -> dict:
    # 중복 SKU는 한 번만 방문한다. 입력 순서는 보존한다.
    sku_ids = list(dict.fromkeys(int(x) for x in sku_ids))
    if len(sku_ids) < 2:
        return {"error": "need_multiple_stops", "message": "동선 최적화에는 상품이 2개 이상 필요합니다."}
    if len(sku_ids) > MAX_EXACT_STOPS:
        return {
            "error": "too_many_stops",
            "message": f"정확 최적화는 한 번에 최대 {MAX_EXACT_STOPS}개까지 지원합니다.",
            "max_stops": MAX_EXACT_STOPS,
        }

    start = _resolve_start(start_location_id, start_floor, start_x, start_y)
    if start is None:
        return {
            "error": "missing_start_position",
            "message": (
                "현재 위치 좌표가 필요합니다. get_position 결과의 floor_no/x/y를 "
                "start_floor/start_x/start_y로 넘기세요. 임의의 입구 좌표는 추측하지 않습니다."
            ),
        }

    destinations = []
    unresolved = []
    for sku in sku_ids:
        d = _choose_destination(sku)
        if d is None:
            unresolved.append(sku)
        else:
            d["name"] = _product_name(sku)
            destinations.append(d)

    if len(destinations) < 2:
        return {
            "error": "not_enough_resolved_stops",
            "message": "위치를 확인할 수 있는 상품이 2개 미만입니다.",
            "unresolved_sku_ids": unresolved,
        }

    # ---------------- mock: 좌표 휴리스틱 ----------------
    if config.USE_MOCK_SOT:
        coords = [(d["floor_no"], d["x"], d["y"]) for d in destinations]
        start_cost = [_mock_cost(start, c) for c in coords]
        pair_cost = [[inf] * len(coords) for _ in coords]
        for i in range(len(coords)):
            for j in range(len(coords)):
                if i != j:
                    pair_cost[i][j] = _mock_cost(coords[i], coords[j])
        solved = _held_karp_order(start_cost, pair_cost)
        if solved is None:
            return {"error": "route_unreachable", "message": "모든 목적지를 잇는 경로를 찾지 못했습니다."}
        order_idx, total = solved
        ordered = [destinations[i] for i in order_idx]
        return {
            "ok": True,
            "mode": "mock_coordinate_heuristic",
            "start": {"floor_no": start[0], "x": start[1], "y": start[2]},
            "visit_order": ordered,
            "floor_order": [d["floor_no"] for d in ordered],
            "estimated_cost": total,
            "unresolved_sku_ids": unresolved,
            "note": "mock 모드는 장애물/무빙워크 A*가 아니라 좌표+층이동 휴리스틱입니다.",
        }

    # ---------------- real: 백엔드 A* 비용으로 정확 순서 ----------------
    # 각 목적지의 실제 '선반 앞 통행 가능 칸'을 먼저 구한다.
    endpoints: list[tuple[int, int, int] | None] = [None] * len(destinations)
    start_cost: list[float] = [inf] * len(destinations)
    for i, d in enumerate(destinations):
        r = _backend_single_leg(start, d["sku_id"])
        if r is not None:
            start_cost[i], endpoints[i] = r

    # 목적지 i -> j A* 비용 행렬. endpoint_i에서 출발한다.
    n = len(destinations)
    pair_cost: list[list[float]] = [[inf] * n for _ in range(n)]
    for i in range(n):
        if endpoints[i] is None:
            continue
        for j in range(n):
            if i == j:
                pair_cost[i][j] = 0
                continue
            r = _backend_single_leg(endpoints[i], destinations[j]["sku_id"])
            if r is not None:
                pair_cost[i][j] = r[0]

    solved = _held_karp_order(start_cost, pair_cost)
    if solved is None:
        unreachable = [destinations[i]["sku_id"] for i, c in enumerate(start_cost) if c == inf]
        return {
            "error": "route_unreachable",
            "message": "현재 위치에서 모든 목적지를 잇는 경로를 찾지 못했습니다.",
            "unreachable_sku_ids": unreachable,
            "unresolved_sku_ids": unresolved,
        }

    order_idx, optimized_cost = solved
    ordered = [destinations[i] for i in order_idx]

    # 최종 순서 전체를 백엔드에 한 번 더 보내 실제 폴리라인/구간 비용을 받는다.
    final_route = sot_client.get_navigation_route(
        start[0], start[1], start[2],
        [{"skuId": d["sku_id"], "label": d["name"]} for d in ordered],
    )

    floor_order = []
    for d in ordered:
        if not floor_order or floor_order[-1] != d["floor_no"]:
            floor_order.append(d["floor_no"])

    return {
        "ok": True,
        "mode": "backend_astar_exact_order",
        "algorithm": "Held-Karp(open TSP) + Spring A* pairwise costs",
        "start": {"floor_no": start[0], "x": start[1], "y": start[2]},
        "visit_order": ordered,
        "floor_order": floor_order,
        "optimized_cost": optimized_cost,
        "total_distance": int(final_route.get("totalDistance", optimized_cost)),
        "legs": final_route.get("legs", []),
        "unresolved_sku_ids": unresolved,
    }


REGISTRY = {
    "optimize_route": _optimize_route,
}


def run(tool_name: str, tool_input: dict) -> dict:
    fn = REGISTRY.get(tool_name)
    if fn is None:
        return {"error": "unknown_compute_tool", "message": f"'{tool_name}'은 없는 계산 도구입니다."}
    try:
        return fn(**tool_input)
    except TypeError as e:
        return {"error": "bad_arguments", "message": str(e)}
    except Exception as e:
        return {"error": type(e).__name__, "message": str(e)}
