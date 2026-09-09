"""입장부터 결제·퇴장까지의 장보기 동선 — compute._optimize_route의 화면 모드.

SR1. 비용 행렬: 행 i, 열 j에 실제 통로의 최단 보행 비용을 둔다. 상품 사이의
직선거리는 선반을 뚫으므로 쓰지 않는다. Spring이 ESC 인접 층 정책으로 계산한다.
SR2. 비트마스크: 1 << j는 j번째 상품의 방문 표시다. mask & bit로 방문 여부를
읽고 mask | bit로 추가한다. 상품 수 n이면 집합은 2**n개다. 그래서 정확해를
12개까지 제한하고 더 큰 목록은 제약을 지키는 근사해임을 화면에 밝힌다.
SR3. 동적 계획: (방문 집합, 마지막 상품)이 같으면 이후 선택지도 같으므로
지금까지 비용이 작은 경로 하나만 남긴다. 냉장 순서 제약으로 허용 전이만 열고,
마지막에 계산대와 출구 비용까지 더해 고른다. 마지막 상품까지만 최소화한 뒤
출구를 붙이면 전체가 최적이라는 보장은 없다.
SR4. 단계와 위치: 안내의 다음 버튼은 관측이 아니다. 스캔 또는 '도착했어요'가
확인된 앵커만 새 출발로 사용한다. 시설을 요청한 즉시 출발을 시설로 바꾸면
아직 걷지 않은 거리를 통째로 생략하게 된다.
"""
from __future__ import annotations

from math import inf, isfinite
import httpx

from app import sot_client
from app.tools import infer

EXACT_LIMIT = 12
MAX_ITEMS = 40
PHASE_LABELS = ("일반 상품", "신선·냉장 · 나중에 담기", "냉동 · 마지막에 담기")


def cold_phase(product: dict) -> int:
    """정본 상품 플래그를 우선순위 0/1/2로 변환한다. 이름으로 식품을 추측하지 않는다.

    '냉동밥 보관 용기'는 냉동식품이 아니다. 키가 없으면 구 DTO를 쓰는 것이므로
    일반 상품으로 조용히 분류하지 않고 계약 오류로 돌려준다. DB 쓰기는 없다.
    """
    if any(product.get(k) is None for k in ("is_frozen", "is_fresh", "is_refrigerated")):
        raise ValueError("상품의 냉장·냉동 구분을 받지 못했어요. 백엔드를 최신화해 주세요.")
    return 2 if product["is_frozen"] else 1 if product["is_fresh"] or product["is_refrigerated"] else 0


def solve_order(cost: list, phases: list[int], terminals: list[int], exit_index: int,
                start_index: int = 0) -> tuple[list[int], int, float, bool]:
    """상품(행렬 인덱스1..n)의 순서, 계산대 인덱스, 총비용, 정확해 여부를 반환한다.

    terminals에는 방문 가능한 계산대 후보를 넣는다. tuple의 첫 두 원소가 경로,
    뒤 둘은 평가 결과다. inf는 단절이고 0은 같은 자리다. 두 값을 혼동하지 않는다.
    함수는 I/O가 없어 완전 열거와 비교해 알고리즘을 검증할 수 있다.
    """
    n = len(phases)
    def finish(last):
        # min(key=...)는 계산대까지가 아니라 출구까지의 합이 작은 후보를 고른다.
        t = min(terminals, key=lambda j: (cost[last][j] + cost[j][exit_index], j))
        return cost[last][t] + cost[t][exit_index], t

    def total(order):
        points = [start_index] + order
        tail, terminal = finish(points[-1])
        return sum(cost[a][b] for a, b in zip(points, points[1:])) + tail, terminal

    if n == 0:
        value, terminal = total([])
        return [], terminal, value, True
    if n > EXACT_LIMIT:
        # 동일 냉장 단계 안에서만 역전시킨다. 초기해도 냉장 제약을 지킨다.
        # 2-opt는 두 절단점 사이 순서를 뒤집는 국소 개선이다. 전역 최적이라고 부르지 않는다.
        order = sorted(range(1, n + 1), key=lambda j: phases[j-1])
        value, terminal = total(order)
        for _ in range(n):
            best = None
            for a in range(n):
                for b in range(a+1, n):
                    if phases[order[a]-1] != phases[order[b]-1]:
                        continue
                    trial = order[:a] + order[a:b+1][::-1] + order[b+1:]
                    candidate, t = total(trial)
                    if candidate < value:
                        value, terminal, best = candidate, t, trial
            if best is None:
                break
            order = best
        return order, terminal, value, False

    # prerequisites[j]는 j보다 먼저 담아야 하는 모든 낮은 단계 상품의 집합이다.
    prerequisites = [sum(1 << k for k in range(n) if phases[k] < phases[j]) for j in range(n)]
    dp = {(0, start_index): (0.0, ())}
    for _ in range(n):
        following = {}
        for (mask, last), (value, order) in dp.items():
            for j in range(n):
                bit = 1 << j
                if mask & bit or (mask & prerequisites[j]) != prerequisites[j]:
                    continue
                new_value = value + cost[last][j+1]
                key = (mask | bit, j+1)
                if new_value < following.get(key, (inf, ()))[0]:
                    following[key] = (new_value, order + (j+1,))
        dp = following
    choices = [(value + finish(last)[0], order, finish(last)[1])
               for (_, last), (value, order) in dp.items()]
    if not choices:
        return [], terminals[0], inf, True
    value, order, terminal = min(choices)
    return list(order), terminal, value, True


def _point(p: dict) -> dict:
    """시설/재고의 snake_case 좌표를 백엔드 DTO로 옮긴다. 좌표를 새로 추정하지 않는다."""
    return {"floorNo": int(p["floor_no"]), "x": int(p["x"]), "y": int(p["y"])}


def split_steps(legs: list[dict], stops: list[dict]) -> list[dict]:
    """A* 폴리라인의 층 변경마다 보행·에스컬레이터·도착 보행을 나눈다.

    층 변경 간선은 3의 모델 비용이다. 새 층 구간의 첫 점은 그 간선의 도착점이다.
    목록과 지도는 이 같은 배열을 쓰므로 번호만 바뀌고 출발점이 사라지지 않는다.
    """
    result = []
    for leg, stop in zip(legs, stops):
        segment = [leg["path"][0]]
        for a, b in zip(leg["path"], leg["path"][1:]):
            if a["floorNo"] != b["floorNo"]:
                result.append({"kind": "WALK", "label": f'{a["floorNo"]}층 에스컬레이터로 이동',
                               "path": segment, "distance": len(segment)-1})
                result.append({"kind": "ESCALATOR", "label": f'에스컬레이터 {a["floorNo"]}층 → {b["floorNo"]}층',
                               "path": [a, b], "distance": 3, "anchor": b})
                segment = [b]
            else:
                segment.append(b)
        result.append({**stop, "path": segment, "distance": len(segment)-1})
    return [{**s, "stepIndex": i} for i, s in enumerate(result)]


def optimize(sku_ids: list[int], *, anchor: dict | None = None,
             detour_id: str | None = None, paid: bool = False) -> dict:
    """SoT를 읽어 전체 여정을 계산한다. 리스트·결제·학습 상태는 변경하지 않는다.

    상품 추가는 sku_ids에 들어오고 수집한 상품은 호출자가 제거한다. 현재 위치를
    모르면 입구를 사용한다. 위치 조회 실패를 입구로 조용히 바꾸지 않는다.
    paid는 화면의 퇴장 안내 선택이며 결제 승인 자체를 대신하지 않는다.
    """
    from app.tools import compute
    try:
        entrance = infer.nearest_facility_point("ENTRANCE", None)
        checkouts = infer.facility_points("CHECKOUT")
        if not entrance or not checkouts:
            raise ValueError("입구 또는 계산대 위치를 확인할 수 없어요.")
        start = entrance
        label = "입구"
        anchor = anchor or {}
        if anchor.get("skuId"):
            start = compute._choose_destination(anchor["skuId"])
            label = "마지막 스캔 매대"
        elif anchor.get("locationId"):
            start = infer.facility_point(anchor["locationId"])
            label = (start or {}).get("label", "확인한 시설")
        elif "floorNo" in anchor:
            # UI가 서버 경로의 에스컬레이터 도착점을 확인했을 때만 쓰는 좌표 앵커.
            f, x, y = anchor["floorNo"], anchor["x"], anchor["y"]
            if f not in (1, 2, 3) or (x, y) not in ((88,66),(88,67),(89,66),(89,67)):
                raise ValueError("확인된 에스컬레이터 도착 위치가 아니에요.")
            start = {"floor_no": f, "x": x, "y": y}
            label = f"{f}층 에스컬레이터"
        if not start:
            raise ValueError("현재 위치를 확인하지 못했어요. 상품이나 시설 위치를 다시 확인해 주세요.")
        origin = _point(start)
        products, phases, excluded = [], [], []
        for sku in list(dict.fromkeys(sku_ids)) if not paid else []:
            try:
                dest = compute._choose_destination(sku)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code != 404:
                    raise
                dest = None
            if not dest or dest.get("tier_role") != "PICK" or dest.get("qty", 0) <= 0:
                excluded.append({"skuId": sku, "reason": "현재 집을 수 있는 매대 재고가 없어요."})
                continue
            product = sot_client.get_product(sku)
            phase = cold_phase(product)
            products.append({"kind": "PRODUCT", "skuId": sku, "locationId": dest["location_id"],
                             "label": product["name"], "coldLabel": PHASE_LABELS[phase], **_point(dest)})
            phases.append(phase)
        if len(products) > MAX_ITEMS:
            raise ValueError(f"미수집 상품은 한 번에 {MAX_ITEMS}종까지 안내할 수 있어요.")
        exit_stop = {"kind": "EXIT", "label": "출구 · 입구로 돌아가기", "locationId": entrance["location_id"], **_point(entrance)}
        cash_stops = [{"kind": "CHECKOUT", "label": "계산대 · 결제하기", "locationId": p["location_id"], **_point(p)} for p in checkouts]
        nodes = products + cash_stops + [exit_stop]
        detour = infer.facility_point(detour_id) if detour_id else None
        if detour_id and not detour:
            raise ValueError("요청한 시설을 확인할 수 없어요.")
        if detour:
            nodes.append({"kind": "FACILITY", "label": detour["label"], "locationId": detour_id, **_point(detour)})
        response = sot_client.get_navigation_matrix(origin, nodes)
        if response.get("policy") != "ESC_ADJACENT":
            raise ValueError("에스컬레이터 전용 경로 서버를 확인해 주세요.")
        raw = response.get("costs", [])
        if len(raw) != len(nodes)+1 or any(len(row) != len(raw) for row in raw):
            raise ValueError("경로 비용 응답이 올바르지 않아요.")
        cost = [[inf if value is None else float(value) for value in row] for row in raw]
        n = len(products)
        terminal_ids = list(range(n+1, n+1+len(cash_stops)))
        exit_index = n+1+len(cash_stops)
        source = len(nodes) if detour else 0
        prefix = [source] if detour else []
        if paid:
            indices, exact = prefix + [exit_index], True
        else:
            order, terminal, value, exact = solve_order(cost, phases, terminal_ids, exit_index, source)
            if not isfinite(value):
                raise ValueError("에스컬레이터로 모든 상품·계산대·출구를 연결할 수 없어요.")
            indices = prefix + order + [terminal, exit_index]
        stops = [nodes[i-1] for i in indices]
        if not all(isfinite(cost[a][b]) for a,b in zip([0]+indices, indices)):
            raise ValueError("현재 위치에서 요청한 경유지까지 이동할 수 없어요.")
        route = sot_client.get_navigation_route(origin["floorNo"], origin["x"], origin["y"], stops, escalators_only=True)
        legs = route.get("legs", [])
        if len(legs) != len(stops) or any(l.get("status") != "OK" or not l.get("path") for l in legs):
            raise ValueError("상품 위치 또는 지도가 바뀌었어요. 다시 계산해 주세요.")
        # 비용 행렬과 표시 경로의 거리가 다르면 지도가 갱신된 상태다. 거짓 절약 수치를 내지 않는다.
        expected = sum(cost[a][b] for a,b in zip([0]+indices, indices))
        if route["totalDistance"] != expected:
            raise ValueError("계산 중 통로가 바뀌었어요. 다시 계산해 주세요.")
        steps = split_steps(legs, stops)
        floors = [origin["floorNo"]]
        for step in steps:
            for p in step["path"]:
                if floors[-1] != p["floorNo"]:
                    floors.append(p["floorNo"])
        return {**route, "journeySteps": steps, "orderedSkuIds": [s["skuId"] for s in stops if s["kind"]=="PRODUCT"],
                "floorOrder": floors, "start": {**origin, "label": label}, "excluded": excluded,
                "originalDistance": None, "savedDistance": None, "optimizationSource": "compute._optimize_route/shopping",
                "optimal": exact, "methodLabel": "냉장 순서를 지킨 최단 동선" if exact else "냉장 순서를 지킨 개선 동선 (근사)",
                "facilities": [{"locationId":p["location_id"], "label":f'{p["floor_no"]}층 {p["label"]}', **_point(p)}
                               for p in infer.facility_points() if p["kind"] in ("RESTROOM_M", "RESTROOM_F", "LOUNGE", "ATM")],
                "paid": paid}
    except (ValueError, httpx.HTTPError) as exc:
        # 서버 URL/내부 응답을 소비자 화면에 내보내지 않는다.
        return {"error": "shopping_route_unavailable", "message": str(exc) if isinstance(exc, ValueError) else "매장 정보를 읽지 못했어요. 연결을 확인하고 다시 계산해 주세요."}
