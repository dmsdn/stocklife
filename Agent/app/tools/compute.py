# ============================================================================
# StoreFlow 하네스 — 계산형 도구 실행부 (definitions.py의 짝, 헌법 2의 집)
# ============================================================================
# [역할] "계산은 솔버가, 이해·표현은 LLM이"의 솔버 쪽 절반. 방문 순서·예산 조합·
#   가격 정렬·대체 후보 순위를 **결정적으로** 계산한다. LLM은 이 결과의 숫자를
#   읽기만 하고 스스로 만들지 않는다.
#
# [출처: 2026-08-21 ai-server 인수] optimize_route와 optimize_bundle의 알고리즘
#   본체(Held-Karp·다중선택 배낭 DP)와 find_substitutes의 정렬 규칙은 jmy가
#   ai-server에서 실물 백엔드로 검증한 것을 옮겨 왔다. 옮기며 바꾼 것 셋:
#   ① mock_data 직접 접근 제거 — 세계에 닿는 길은 sot_client 하나(그 파일의 계약).
#   ② 개인화의 신원을 query.current_member_id()에서 받는다(B안 — LLM 손이 안 닿는 경로).
#   ③ 실패는 전부 값으로 돌려준다(query.run과 같은 원칙 ④).
#
# [남긴 개조 예약 — 08/26] optimize_route는 현재 jmy판 그대로 **단일 Held-Karp**다
#   (층 이동을 비용에 녹임). 파일명세 §2.4의 출하 사양은 "층 분해 TSP"(층 순서
#   전수 ≤4! + 층내 TSP) — 실물 모드에서 백엔드 A* 호출이 n²+n으로 늘어나는
#   비용 폭발을 막기 위해서다. mock·소규모(n≤10)에서는 지금 판으로 충분해서
#   오늘은 동작을 보존하고, 개조는 08/26 일정에 한다.
#
# [경계] 여기에는 조회의 가공(그건 query.py)도, 학습 모델(그건 infer.py)도 없다.
#   규격 파서(compare_unit_price·find_substitutes 공유)는 08/27 — 그때까지
#   compare_unit_price는 루프의 스텁으로 남는다.
# ============================================================================
#
# ─── 개념 사전 — 이 파일에 처음 나오는 개념 3개 (㊽~㊿) ──────────────────────
# (①~㊼: 앞 파일들의 사전은 아는 것으로 전제. 유니코드 원문자가 ㊿(50)에서
#  끝나므로 51부터는 (51) 표기로 잇는다 — 중간 삽입은 기존처럼 ㊽-a 방식.)
#
# ㊽ 비트마스크(bitmask) — 정수 하나로 "집합"을 표현하기
#    Held-Karp가 "지금까지 방문한 목적지들의 집합"을 상태로 들고 다녀야 하는데,
#    set을 dict의 키로 쓸 수 없다(수정 가능한 것은 키가 못 된다 — 개념 ⑥).
#    그래서 정수의 **이진수 자릿수**를 집합처럼 쓴다: i번째 자리가 1이면
#    "i번 목적지를 방문했다"는 뜻이다. 목적지가 3개면 상태는 0b000~0b111.
#      1 << i   : 1을 왼쪽으로 i칸 민다 → i번째 자리만 1인 정수 (원소 하나짜리 집합)
#      m | b    : OR — 두 집합의 합집합 (그 자리를 1로 켠다)
#      m & b    : AND — 교집합. `mask & (1 << i)`가 0이 아니면 "i를 이미 방문했다"
#      m ^= b   : XOR 후 대입 — 켜진 자리를 끈다 (경로 복원 때 하나씩 빼며 되감기)
#    왜 이 표현이 표준인가: 정수는 수정 불가라 dict 키가 되고, 자리 연산이
#    집합 연산보다 훨씬 빠르며, "모든 부분집합을 순회"가 range(1 << n)으로 끝난다.
#
# ㊾ 무한대 — float("inf")
#    어떤 실수보다 큰 특별한 값. "아직 도달 불가능한 경로의 비용"의 초기값으로
#    쓴다 — 0이나 -1로 표시하면 진짜 비용 0과 구분되지 않고 min() 비교가 꼬인다.
#    inf는 min()에서 항상 지고, inf와의 비교(c < inf)로 "도달 가능했나"를 물을
#    수 있다. math.inf와 같은 값인데, 이 파일에선 import 없이 되는 float("inf")를 쓴다.
#
# ㊿ while 루프 — "조건이 참인 동안 반복"
#    for는 "목록의 각 원소에 대해"지만, while은 **몇 번 돌지 미리 모를 때** 쓴다.
#    여기서는 Held-Karp의 경로 복원이 그렇다: 마지막 목적지에서 출발점 방향으로
#    "이전 목적지"를 따라 한 칸씩 되감는데, 몇 칸인지는 다 감아봐야 안다.
#        while last is not None:   ← "이전이 없다(출발점에 닿았다)"가 종료 조건
#    조건이 영원히 참이면 무한 루프가 되므로, 루프 몸통 안에서 반드시 조건을
#    변화시키는 줄(last = prev)이 있어야 한다 — 그 줄이 빠지는 것이 이 문법의
#    대표적 실패 시나리오다.
# ────────────────────────────────────────────────────────────────────────────

from app import config, sot_client
from app.tools import query

# ── 상한 상수 ───────────────────────────────────────────────────────────────
# Held-Karp의 상태 수는 2^n × n. n=10이면 10,240 상태로 즉시 끝나지만 n=20이면
# 2천만 상태다 — 지수 알고리즘은 상한이 없으면 언젠가 서버를 세운다.
# 10개 넘는 리스트는 사람도 한 바퀴에 안 도는 규모라 UX상으로도 상한이 맞다.
MAX_EXACT_STOPS = 10

# mock 좌표 휴리스틱에서 층을 1개 이동하는 비용(격자 몇 칸어치로 칠 것인가).
# 30 = 무빙워크로 오르내리는 체감이 매장 절반을 가로지르는 정도라는 가정 —
# 실물 모드에서는 백엔드 A*가 실제 무빙워크 경로로 계산하므로 이 값은 안 쓰인다.
MOCK_FLOOR_CHANGE_COST = 30


# ════════════════════════════════════════════════════════════════════════════
# optimize_route — 방문 순서 최적화 (open TSP, jmy 이관)
# ════════════════════════════════════════════════════════════════════════════

def _choose_destination(sku_id: int) -> dict | None:
    """상품 하나의 '가야 할 위치'를 고른다 — 백엔드 NavigationService와 같은 우선순위.

    우선순위: ① 재고 있는 PICK(집을 수 있는 매대) ② 재고 있는 아무 위치
    ③ 그마저 없으면 첫 위치(빈 매대라도 '자리'는 안내할 수 있다).
    next(제너레이터, 기본값) = 조건에 맞는 **첫** 원소를 찾고 없으면 기본값 —
    for+break를 한 줄로 쓴 것. 전부 훑지 않고 첫 발견에서 멈춘다.
    """
    inv = sot_client.get_inventory(sku_id)
    locations = list(inv.get("locations") or [])
    if not locations:
        return None

    chosen = next((x for x in locations
                   if int(x.get("qty", 0)) > 0 and x.get("tier_role") == "PICK"), None)
    if chosen is None:
        chosen = next((x for x in locations if int(x.get("qty", 0)) > 0), None)
    if chosen is None:
        chosen = locations[0]

    return {
        "sku_id": sku_id,
        "location_id": chosen.get("location_id"),
        "zone_id": chosen.get("zone_id"),
        "floor_no": int(chosen["floor_no"]),
        "x": int(chosen["x"]), "y": int(chosen["y"]),
        "qty": int(chosen.get("qty", 0)),
        "tier_role": chosen.get("tier_role"),
    }


def _product_name(sku_id: int) -> str:
    """이름을 붙일 수 있으면 붙인다 — 실패해도 죽지 않고 번호 문자열로 착지.
    동선 결과는 사용자에게 '1. 물티슈 → 2. 세제'로 나가야지 '1. 101042'로
    나가면 안 되지만, 이름 조회가 안 된다고 동선 계산까지 버리는 건 과하다."""
    try:
        p = sot_client.get_product(sku_id)
        if p:
            return str(p.get("name") or sku_id)
    except Exception:
        pass
    return str(sku_id)


# ── 현재 위치 주입 (2026-08-25) ──────────────────────────────────────────────
# [왜] `optimize_route`의 스키마는 start_floor/x/y를 LLM이 채우게 두고, description은
#   "get_position 결과의 floor_no"라고 적어 두었다. 즉 **LLM에게 "A를 부르고 결과에서
#   숫자 셋을 B에 옮겨 적어라"를 시키고 있었다.** 이건 B안 신원 주입에서 이미 걷어낸
#   것과 같은 부류다 — 회원번호를 LLM이 옮겨 적게 뒀다가 되묻기·보안 구멍이 났다.
#
#   게다가 `get_position`은 아직 스텁(`loop._INFER_STUB`)이라 그 지시를 따르면
#   `not_implemented`가 돌아온다. **막다른 길을 안내하고 있었다.**
#
# [무엇] 루프가 요청 시작에 현재 위치를 등록하고, 아래 `_resolve_start`가 LLM이 안 준
#   경우에만 그것을 쓴다. **칸은 스키마에 그대로 남는다** — "3층 입구에서 출발해서"
#   같은 명시 지정은 계속 가능해야 하므로 지우지 않고 **기본값만** 준다.
#
# [출처가 바뀌어도 이 자리는 안 바뀐다] 지금은 호출자(프론트/백엔드)가 마지막 스캔
#   좌표를 넘긴다. 나중에 `infer.py`의 위치 추정(스캔 앵커 + 보행 그래프 스냅)이
#   서면 **더 정확한 값이 같은 창구로 들어온다.** 주입 지점을 먼저 고정해 두는 이유다.
_CURRENT_POSITION: tuple[int, int, int] | None = None


def set_position(floor: int | None, x: int | None = None, y: int | None = None) -> None:
    """루프가 요청을 시작할 때 현재 위치를 등록한다. 모르면 set_position(None).

    셋 중 하나라도 없으면 등록하지 않는다 — 층만 알고 좌표를 모르는 반쪽 상태로
    경로를 짜면 같은 층 아무 데나에서 출발한 답이 나온다. 그건 없느니만 못하다.
    """
    global _CURRENT_POSITION
    if floor is None or x is None or y is None:
        _CURRENT_POSITION = None
    else:
        _CURRENT_POSITION = (int(floor), int(x), int(y))


def current_position() -> tuple[int, int, int] | None:
    """지금 요청의 위치(없으면 None) — 읽기 전용 공개 창구.

    query.current_member_id()와 같은 이유로 함수 한 겹을 둔다: 밑줄 변수를 다른
    모듈이 집어 쓰면 '내부용'이라는 신호가 죽는다.
    """
    return _CURRENT_POSITION


def _resolve_start(start_location_id, start_floor, start_x, start_y):
    """출발점을 (층, x, y) 튜플로 통일한다. 해석 불가면 None.

    우선순위가 셋이고 **순서에 뜻이 있다**:
      ① LLM이 준 좌표 3종      — 손님이 "3층 입구에서 출발해서"라고 **명시**한 경우.
                                 주입값보다 앞선다. 사람 말이 추정보다 세다.
      ② LLM이 준 location_id   — 좌표를 모를 때의 차선(mock에서만 풀린다)
      ③ **주입된 현재 위치**    — LLM이 아무것도 안 줬을 때의 기본값
    ①이 ③보다 앞이라는 것이 이 함수의 유일한 판단이다.
    """
    if start_floor is not None and start_x is not None and start_y is not None:
        return int(start_floor), int(start_x), int(start_y)
    if start_location_id:
        loc = sot_client.resolve_location(start_location_id)
        if loc:
            return int(loc["floor_no"]), int(loc["x"]), int(loc["y"])
    return _CURRENT_POSITION            # ③ 없으면 None — 호출부가 에러로 돌린다


def _mock_cost(a: tuple, b: tuple) -> int:
    """mock 전용 이동 비용: 맨해튼 거리 + 층 이동 페널티.

    맨해튼 거리 |Δx|+|Δy| = 격자 도시에서 대각선 없이 걷는 거리. 매장 통로가
    격자라 유클리드(직선)보다 이쪽이 실제 보행에 가깝다. 장애물은 모른다 —
    그건 실물 모드에서 백엔드 A*가 맡는 부분이고, mock은 '그럴듯한 순서'까지만.
    """
    af, ax, ay = a          # 튜플 언패킹 — (층, x, y)를 세 변수로 푼다
    bf, bx, by = b
    return abs(ax - bx) + abs(ay - by) + abs(af - bf) * MOCK_FLOOR_CHANGE_COST


def _backend_single_leg(start: tuple, sku_id: int):
    """실물 모드: 백엔드 A*로 '출발점 → 상품 하나'의 실제 보행 비용을 잰다.

    반환 (거리, 도착 좌표) 또는 None(경로 없음). 도착 좌표를 함께 돌려주는
    이유: 다음 구간의 출발점은 매대 좌표가 아니라 **A*가 실제로 도착한
    통행 가능 칸**이어야 한다 — 매대 칸 자체는 밟을 수 없는 장애물이다.
    """
    route = sot_client.get_navigation_route(
        start[0], start[1], start[2],
        [{"skuId": int(sku_id), "label": _product_name(sku_id)}])
    legs = route.get("legs") or []
    if not legs or str(legs[0].get("status")) != "OK":
        return None
    path = legs[-1].get("path") or []
    if not path:
        return None
    p = path[-1]
    endpoint = (int(p["floorNo"]), int(p["x"]), int(p["y"]))
    return int(legs[0].get("distance", route.get("totalDistance", 0))), endpoint


def _held_karp_order(start_cost: list, pair_cost: list):
    """출발점 고정·복귀 없음(open) TSP의 정확해 — Held-Karp 동적 계획법.

    [입력] start_cost[i] = 출발점→목적지 i 비용 / pair_cost[i][j] = i→j 비용
    [출력] (방문 순서 인덱스 리스트, 총비용) 또는 None(연결 불가)

    [로직을 사람 말로] "어떤 목적지들을 이미 돌았고(집합 ㊽), 마지막이 어디였는지"
    만 알면 그 이전에 어떤 순서로 돌았는지는 앞으로의 최적 선택에 영향이 없다 —
    그래서 상태를 (방문집합, 마지막)으로 접고, 작은 집합에서 큰 집합으로
    최저 비용을 쌓아 올린다. 전수(n!) 대신 2^n·n² — n=10에서 3,628,800 → 102,400.
    """
    n = len(start_cost)
    if n == 0:
        return [], 0

    inf = float("inf")                                  # ㊾
    # dp[(mask, last)] = (그 상태까지의 최저 비용, 직전 목적지) — 직전을 함께
    # 저장해야 마지막에 경로를 되감을 수 있다(비용만 남기면 순서를 잃는다).
    dp: dict = {}
    for i, c in enumerate(start_cost):                  # enumerate = (번호, 값) 쌍
        if c < inf:                                     # 출발점에서 닿는 곳만 씨앗으로
            dp[(1 << i, i)] = (c, None)                 # ㊽: 원소 i 하나짜리 집합

    # range(1, 1 << n) = 1부터 2^n-1까지 — 공집합을 뺀 모든 부분집합을 순회.
    # 정수 오름차순이 곧 "작은 집합 → 큰 집합" 순서를 보장하지는 않지만,
    # mask에 원소를 더하면 정수가 반드시 커지므로 갱신 방향(작→큰)은 안전하다.
    for mask in range(1, 1 << n):
        for last in range(n):
            state = dp.get((mask, last))
            if state is None:                           # 이 상태로 못 온다 — 건너뜀
                continue
            base = state[0]
            for nxt in range(n):
                if mask & (1 << nxt):                   # ㊽: 이미 방문한 곳이면
                    continue
                edge = pair_cost[last][nxt]
                if edge == inf:                         # 길이 없으면
                    continue
                nm = mask | (1 << nxt)                  # ㊽: nxt를 방문집합에 추가
                nc = base + edge
                old = dp.get((nm, nxt))
                if old is None or nc < old[0]:          # 더 싼 길이면 갱신
                    dp[(nm, nxt)] = (nc, last)

    full = (1 << n) - 1                                 # 전부 1 = 전 목적지 방문
    endings = [(dp[(full, i)][0], i) for i in range(n) if (full, i) in dp]
    if not endings:
        return None                                     # 어떤 순서로도 전부 못 돈다
    total, last = min(endings)          # 튜플 비교는 첫 원소(비용)부터 — 최저 비용 끝점

    # ── 경로 복원: 끝점에서 "직전"을 따라 출발점까지 되감는다 (㊿ while)
    order_rev = []
    mask = full
    while last is not None:
        order_rev.append(last)
        _, prev = dp[(mask, last)]
        mask ^= 1 << last                               # ㊽: 방문집합에서 last를 끈다
        last = prev
    order_rev.reverse()                 # 되감았으니 뒤집어야 출발→끝 순서가 된다
    return order_rev, int(total)


def _optimize_route(sku_ids: list, start_location_id: str | None = None,
                    start_floor: int | None = None, start_x: int | None = None,
                    start_y: int | None = None) -> dict:
    """방문 순서 최적화의 입구. 실패는 전부 값으로(원칙 ④)."""
    # dict.fromkeys(목록) = 목록의 원소를 키로 하는 dict — 파이썬 dict는 넣은
    # 순서를 기억하므로, 이걸 다시 list로 뜨면 **순서를 보존한 중복 제거**가 된다.
    # set(목록)으로 지우면 순서가 사라져서 같은 입력에 다른 순서가 나올 수 있다.
    sku_ids = list(dict.fromkeys(int(x) for x in sku_ids))
    if len(sku_ids) < 2:
        return {"error": "need_multiple_stops",
                "message": "동선 최적화에는 상품이 2개 이상 필요합니다. 1개면 get_inventory의 위치로 안내하세요."}
    if len(sku_ids) > MAX_EXACT_STOPS:
        return {"error": "too_many_stops", "max_stops": MAX_EXACT_STOPS,
                "message": f"정확 최적화는 한 번에 최대 {MAX_EXACT_STOPS}개까지입니다. 나눠서 요청하세요."}

    start = _resolve_start(start_location_id, start_floor, start_x, start_y)
    if start is None:
        # 주입도 없고 LLM도 안 줬을 때만 여기 온다. **get_position을 부르라고 하지
        # 않는다** — 그건 아직 스텁이라 막다른 길이다(위 주입 블록 주석 참조).
        return {"error": "missing_start_position",
                "message": ("현재 위치를 알 수 없습니다. 손님에게 지금 어디쯤인지"
                            " 물어보거나(예: '몇 층에 계세요?'), 위치 없이 답할 수 있는"
                            " 부분만 답하세요. 입구 좌표를 추측하지 마세요.")}

    destinations, unresolved = [], []
    for sku in sku_ids:
        d = _choose_destination(sku)
        if d is None:
            unresolved.append(sku)      # 위치를 모르는 상품 — 결과에 정직하게 싣는다
        else:
            d["name"] = _product_name(sku)
            destinations.append(d)
    if len(destinations) < 2:
        return {"error": "not_enough_resolved_stops", "unresolved_sku_ids": unresolved,
                "message": "위치를 확인할 수 있는 상품이 2개 미만입니다."}

    # ── mock: 좌표 휴리스틱으로 비용 행렬을 만든다 ──
    if config.USE_MOCK_SOT:
        coords = [(d["floor_no"], d["x"], d["y"]) for d in destinations]
        start_cost = [_mock_cost(start, c) for c in coords]
        inf = float("inf")
        pair_cost = [[inf] * len(coords) for _ in coords]
        for i in range(len(coords)):
            for j in range(len(coords)):
                if i != j:
                    pair_cost[i][j] = _mock_cost(coords[i], coords[j])
        solved = _held_karp_order(start_cost, pair_cost)
        if solved is None:
            return {"error": "route_unreachable", "message": "목적지를 잇는 경로를 찾지 못했습니다."}
        order_idx, total = solved
        ordered = [destinations[i] for i in order_idx]
        return {"ok": True, "mode": "mock_coordinate_heuristic",
                "start": {"floor_no": start[0], "x": start[1], "y": start[2]},
                "visit_order": ordered,
                "floor_order": [d["floor_no"] for d in ordered],
                "estimated_cost": total, "unresolved_sku_ids": unresolved,
                "note": "mock 모드 — 장애물·무빙워크 없는 좌표 휴리스틱 순서입니다."}

    # ── 실물: 백엔드 A*의 실제 보행 비용으로 행렬을 만든다 ──
    # ⚠ 호출이 n²+n번 나간다 — 이 비용이 08/26 층 분해 개조의 이유다(머리 주석).
    n = len(destinations)
    inf = float("inf")
    endpoints = [None] * n
    start_cost = [inf] * n
    for i, d in enumerate(destinations):
        r = _backend_single_leg(start, d["sku_id"])
        if r is not None:
            start_cost[i], endpoints[i] = r
    pair_cost = [[inf] * n for _ in range(n)]
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
        return {"error": "route_unreachable", "unresolved_sku_ids": unresolved,
                "unreachable_sku_ids": [destinations[i]["sku_id"]
                                        for i, c in enumerate(start_cost) if c == inf],
                "message": "현재 위치에서 모든 목적지를 잇는 경로를 찾지 못했습니다."}
    order_idx, optimized_cost = solved
    ordered = [destinations[i] for i in order_idx]

    # 확정된 순서 전체를 한 번 더 보내 실제 경로선(폴리라인)·구간 비용을 받는다 —
    # 프론트 지도에 그릴 재료. 순서는 우리가 정했고 백엔드는 그리기만 한다.
    final_route = sot_client.get_navigation_route(
        start[0], start[1], start[2],
        [{"skuId": d["sku_id"], "label": d["name"]} for d in ordered])

    floor_order = []
    for d in ordered:                   # 연속 중복만 접는다: [2,2,1] → [2,1]
        if not floor_order or floor_order[-1] != d["floor_no"]:
            floor_order.append(d["floor_no"])

    return {"ok": True, "mode": "backend_astar_exact_order",
            "algorithm": "Held-Karp(open TSP) + 백엔드 A* 구간 비용",
            "start": {"floor_no": start[0], "x": start[1], "y": start[2]},
            "visit_order": ordered, "floor_order": floor_order,
            "optimized_cost": optimized_cost,
            "total_distance": int(final_route.get("totalDistance", optimized_cost)),
            "legs": final_route.get("legs", []),
            "unresolved_sku_ids": unresolved}


# ════════════════════════════════════════════════════════════════════════════
# optimize_bundle — 예산 조합 (다중선택 배낭 DP, jmy budget_bundle.py 이관)
# ════════════════════════════════════════════════════════════════════════════

# 목적형 템플릿: "캠핑에 필요한 것"의 품목 사전. priority = 필요도 점수(가격 아님 —
# 어떤 조합이 "더 캠핑다운가"의 잣대이고, 가격은 솔버가 예산으로 따로 다룬다).
# 키워드가 튜플인 이유: 한 필요를 채우는 검색어가 여럿일 수 있다(조명 = 헤드랜턴/랜턴).
NEEDS_CAMPING = (
    {"key": "shelter",   "label": "텐트",   "keywords": ("텐트",),              "priority": 30},
    {"key": "sleep",     "label": "침낭",   "keywords": ("침낭",),              "priority": 28},
    {"key": "light",     "label": "조명",   "keywords": ("헤드랜턴", "랜턴"),    "priority": 20},
    {"key": "cooking",   "label": "조리",   "keywords": ("버너",),              "priority": 18},
    {"key": "water",     "label": "물",     "keywords": ("생수",),              "priority": 12},
    {"key": "cooling",   "label": "보냉",   "keywords": ("아이스박스",),         "priority": 10},
    {"key": "wipes",     "label": "위생",   "keywords": ("물티슈",),            "priority": 8},
    {"key": "tableware", "label": "식기",   "keywords": ("캠핑 식기",),          "priority": 7},
    {"key": "cups",      "label": "컵",     "keywords": ("종이컵",),            "priority": 4},
)
_PURPOSES = {"캠핑": NEEDS_CAMPING, "camping": NEEDS_CAMPING, "캠핑준비": NEEDS_CAMPING}


def _stocked_candidates(need: dict, budget_krw: int, per_need: int = 3) -> list:
    """필요 하나의 '살 수 있는 후보'를 만든다 — 검색 → 재고 확인 → 가격 부착.

    재고 확인을 여기서 하는 이유(jmy 설계 보존): 재고 0인 상품을 조합에 넣으면
    "예산 안에 다 됩니다"라고 말해놓고 매장에서 못 사는 최악의 결과가 된다.
    후보를 per_need개로 끊는 이유: DP 상태 수를 억제한다 — 필요 9 × 후보 3이면
    조합 공간이 4^9라도 DP는 가격 축으로 접혀 즉시 끝난다.
    """
    out = []
    for kw in need["keywords"]:
        try:
            found = sot_client.search_products(keyword=kw)
        except Exception:
            continue                    # 검색 실패는 이 키워드만 포기(전체를 죽이지 않는다)
        for p in found:
            if p.get("lifecycle_status") == "DISCONTINUED":
                continue
            sku = p["sku_id"]
            try:
                inv = sot_client.get_inventory(sku)
            except Exception:
                continue
            total_qty = sum(int(l.get("qty", 0)) for l in inv.get("locations", []))
            if total_qty <= 0:
                continue                # 재고 없는 후보는 처음부터 조합 대상이 아니다
            price = sot_client.get_current_prices([sku]).get(sku)
            if price is None or price["final"] > budget_krw:
                continue                # 단품이 예산을 넘으면 어떤 조합에도 못 들어간다
            out.append({"sku_id": sku, "name": p["name"], "need_key": need["key"],
                        "need_label": need["label"], "priority": need["priority"],
                        "final_price_krw": price["final"], "on_promo": price["on_promo"],
                        "stock_qty": total_qty})
            if len(out) >= per_need:
                return out
    return out


def _better(a: dict, b: dict | None) -> bool:
    """조합 상태 a가 b보다 나은가 — 목적의 사전식(lexicographic) 비교.

    ① 필요도 점수 높은 쪽 ② 같으면 품목 수 많은 쪽 ③ 같으면 총액 싼 쪽.
    튜플 비교가 정확히 이 순서로 작동한다(첫 원소부터, 같으면 다음 원소).
    총액에 -를 붙인 이유: 앞의 둘은 "클수록 좋다"인데 총액만 "작을수록 좋다"라
    부호를 뒤집어 세 축의 방향을 통일했다.
    """
    if b is None:
        return True
    ka = (a["score"], len(a["items"]), -a["total_krw"])
    kb = (b["score"], len(b["items"]), -b["total_krw"])
    return ka > kb


def solve_bundle(candidate_groups, budget_krw: int, max_items: int = 8) -> dict:
    """다중선택 배낭: 필요 그룹마다 0개 또는 1개를 골라 예산 안 최고 점수 조합.

    [로직을 사람 말로] states = {지금까지 쓴 돈: 그 돈으로 만든 최고 조합}.
    그룹을 하나씩 통과시키며 "이 그룹에서 안 산다 / 후보 중 하나를 산다"의
    가지를 전부 뻗되, **같은 금액에 도달한 조합끼리는 최고만 남긴다** — 이
    가지치기가 지수 폭발을 막는 DP의 핵심이다. 상태 키가 '금액'인 이유:
    예산 제약이 금액 축이므로, 같은 금액이면 점수 높은 쪽 외에는 미래가 없다.
    """
    states: dict = {0: {"total_krw": 0, "score": 0, "items": []}}
    for group in candidate_groups:
        next_states = dict(states)      # "이 그룹에서 안 고른다"의 가지 — 복사로 시작
        for state in states.values():
            if len(state["items"]) >= max_items:
                continue
            for item in group:
                cost = state["total_krw"] + int(item["final_price_krw"])
                if cost > budget_krw:
                    continue
                cand = {"total_krw": cost,
                        "score": state["score"] + int(item["priority"]),
                        "items": state["items"] + [item]}
                if _better(cand, next_states.get(cost)):
                    next_states[cost] = cand
        states = next_states

    best = None
    for state in states.values():
        if _better(state, best):
            best = state
    return best or {"total_krw": 0, "score": 0, "items": []}


def _optimize_bundle(budget_krw: int, purpose: str | None = None,
                     candidate_sku_ids: list | None = None,
                     max_items: int | None = None) -> dict:
    """예산 조합의 입구 — 목적형(purpose)과 후보형(candidate_sku_ids) 두 갈래.

    총액·잔액을 여기서 다 계산해 돌려준다(헌법 2) — LLM은 total_krw와
    remaining_krw를 읽기만 한다.
    """
    try:
        budget_krw = int(budget_krw)
    except (TypeError, ValueError):
        return {"error": "bad_budget", "message": "budget_krw는 원 단위 정수여야 합니다."}
    if budget_krw <= 0:
        return {"error": "bad_budget", "message": "budget_krw는 0보다 커야 합니다."}
    try:
        max_items = max(1, min(int(max_items or 8), 10))
    except (TypeError, ValueError):
        max_items = 8

    # ── 갈래 1: 목적형 — 필요 사전에서 후보 그룹을 만든다 ──
    if purpose:
        # .strip()으로 공백을 걷고, 공백 제거판·소문자판까지 시도 — "캠핑 준비"·
        # "Camping" 같은 표기 변주를 사전 키 몇 개로 다 받는 실용적 정규화.
        raw = str(purpose).strip()
        needs = _PURPOSES.get(raw) or _PURPOSES.get(raw.replace(" ", "").lower())
        if not needs:
            return {"error": "unsupported_purpose", "supported_purposes": ["캠핑"],
                    "message": "목적형 예산 세트는 현재 캠핑을 지원합니다. "
                               "다른 목적이면 후보를 직접 골라(candidate_sku_ids) 요청하세요."}
        groups, unavailable = [], []
        for need in needs:
            cands = _stocked_candidates(need, budget_krw)
            groups.append(cands)
            if not cands:
                unavailable.append(need["label"])
        solved = solve_bundle(groups, budget_krw=budget_krw, max_items=max_items)
        chosen_keys = {it["need_key"] for it in solved["items"]}
        not_selected = [n["label"] for n in needs
                        if n["key"] not in chosen_keys and n["label"] not in unavailable]
        # 내부 채점용 필드(priority·need_key)는 LLM에게 안 보낸다 — 점수를 보면
        # "필요도 30점인 텐트"처럼 내부 장부를 사용자에게 읽어주는 사고가 난다.
        items = [{k: v for k, v in it.items() if k not in ("priority", "need_key")}
                 for it in solved["items"]]
        return {"ok": True, "purpose": "캠핑", "budget_krw": budget_krw,
                "total_krw": solved["total_krw"],
                "remaining_krw": budget_krw - solved["total_krw"],
                "item_count": len(items), "items": items,
                "not_selected_needs": not_selected,      # 예산 때문에 빠진 것
                "unavailable_needs": unavailable,        # 매장에 후보가 없던 것
                "note": "재고 1개 이상인 실제 상품만으로, 예산 안 필요도 최고 조합을 계산했습니다."}

    # ── 갈래 2: 후보형 — 준 상품들로만 조합한다 (상품당 그룹 하나 = 각각 살까 말까) ──
    if candidate_sku_ids:
        sku_ids = list(dict.fromkeys(int(s) for s in candidate_sku_ids))
        prices = sot_client.get_current_prices(sku_ids)
        products = {p["sku_id"]: p for p in sot_client.get_products_by_skus(sku_ids)}
        groups = []
        # 탈락 사유를 모아 결과에 싣는다 (08-24 검수 — no silent caps).
        # 조용히 빼면 LLM이 "후보 전부를 검토했다"고 말하게 되는데 거짓이 된다.
        # 사유를 갈라 담는 이유: "가격을 못 찾음"은 조회 문제(재시도 여지)고
        # "단품이 예산 초과"는 사실 전달감이라, LLM이 다르게 말해야 한다.
        excluded_no_price, excluded_over_budget = [], []
        for sku in sku_ids:
            pr = prices.get(sku)
            p = products.get(sku)
            if pr is None or p is None:
                excluded_no_price.append(sku)
                continue
            if pr["final"] > budget_krw:
                excluded_over_budget.append(sku)
                continue
            # priority=1 균일: 목적 사전이 없으니 "몇 개나 담기는가"가 점수가 되고,
            # _better의 3축에 따라 같은 개수면 싼 조합이 이긴다.
            groups.append([{"sku_id": sku, "name": p["name"], "need_key": str(sku),
                            "need_label": p["name"], "priority": 1,
                            "final_price_krw": pr["final"], "on_promo": pr["on_promo"]}])
        solved = solve_bundle(groups, budget_krw=budget_krw, max_items=max_items)
        items = [{k: v for k, v in it.items() if k not in ("priority", "need_key")}
                 for it in solved["items"]]
        # ── 탈락 설명의 재료 (08-27 real_budget FAIL) ────────────────────────
        # [무엇이 문제였나] 후보 둘 중 하나만 담긴 결과를 받은 LLM 이 **왜 둘 다는
        #   안 되는지**를 설명하려고 "5,090+5,890=10,980원"을 스스로 더했다.
        #   10,980 이 원장에 없어 가드가 막았다 — 위 compare 와 같은 뿌리다.
        # [왜 이 값이 필요한가] 솔버는 "하나만 담긴다"는 **결론**을 주는데,
        #   손님이 납득하려면 **기각 사유**가 필요하다. "예산이 8,435원인데 둘 다면
        #   10,980원이라 2,545원 모자라요"가 설득이고, "하나만 담을 수 있어요"는
        #   통보다. 조합 최적화의 결과를 사람에게 설명하는 일은 근본적으로
        #   "선택된 것"이 아니라 "탈락한 것"을 말하는 일이다.
        # [단품 초과와 다르다] `excluded_over_budget_sku_ids` 는 **혼자서도**
        #   예산을 넘는 상품이다. 여기 10,980 은 각각은 되는데 **합쳐서** 넘는
        #   경우라, 사유가 다르고 발화도 달라야 한다.
        priced = [pr["final"] for pr in (prices.get(s) for s in sku_ids) if pr]
        all_total = sum(priced)
        s2 = {"ok": True, "budget_krw": budget_krw, "total_krw": solved["total_krw"],
              "remaining_krw": budget_krw - solved["total_krw"],
              "item_count": len(items), "items": items,
              "candidate_count": len(priced),
              "all_candidates_total_krw": all_total,
              # 넘을 때만 싣는다. 안 넘는데 0 을 실으면 LLM 이 "딱 맞아요"처럼
              # 없는 사실을 읽을 여지가 생긴다.
              "over_budget_by_krw": (all_total - budget_krw
                                     if all_total > budget_krw else None),
              "excluded_no_price_sku_ids": excluded_no_price,
              "excluded_over_budget_sku_ids": excluded_over_budget,
              "note": "지정한 후보 중 예산 안에서 최다 품목·최저 총액 조합입니다."}
        return s2

    return {"error": "missing_input",
            "message": "purpose(목적) 또는 candidate_sku_ids(후보 목록) 중 하나는 필요합니다."}


# ════════════════════════════════════════════════════════════════════════════
# compare_products — 실판매가 정렬 (08-21 인수 신규 도구)
# ════════════════════════════════════════════════════════════════════════════

def _compare_products(sku_ids: list, sort_by: str = "price_asc") -> dict:
    """상품 여러 개를 행사가 반영 실판매가로 정렬한다. LLM 눈대중 비교의 대체물.

    반환 각 행에 정가·할인액·실판매가·행사 여부를 다 싣는 이유: "지금 행사 중이라
    원래 8,900원인데 1,000원 할인된 7,900원"이라는 문장의 재료가 전부 있어야
    LLM이 숫자를 하나도 만들지 않고 그 문장을 조립할 수 있다.
    """
    sku_ids = list(dict.fromkeys(int(s) for s in sku_ids))
    if len(sku_ids) < 2:
        return {"error": "need_multiple", "message": "가격 비교에는 상품이 2개 이상 필요합니다."}
    prices = sot_client.get_current_prices(sku_ids)
    products = {p["sku_id"]: p for p in sot_client.get_products_by_skus(sku_ids)}
    rows, missing = [], []
    for sku in sku_ids:
        pr, p = prices.get(sku), products.get(sku)
        if pr is None or p is None:
            missing.append(sku)
            continue
        rows.append({"sku_id": sku, "name": p["name"], "brand": p.get("brand"),
                     "spec_raw": p.get("spec_raw"),
                     "regular_price_krw": pr["regular"], "discount_krw": pr["discount"],
                     "final_price_krw": pr["final"], "on_promo": pr["on_promo"]})
    rows.sort(key=lambda r: r["final_price_krw"], reverse=(sort_by == "price_desc"))

    # ── 차액 — **솔버가 뺀다** (08-27 실물 골든셋 real_compare FAIL) ──────────
    # [무엇이 문제였나] 위 독스트링은 "LLM이 숫자를 하나도 만들지 않고 그 문장을
    #   조립할 수 있다"를 목표로 선언해 놓고, 정작 **가격 비교에서 손님이 가장
    #   듣고 싶은 수 — 얼마나 싼가 — 를 안 돌려주고 있었다.** 그래서 LLM이
    #   5,890 − 5,090 을 스스로 해서 "800원 더 싸요"라고 말했고, 800이 원장에
    #   없어 가드가 `unsupported (800)` 로 발화를 막았다.
    # [왜 가드를 푸는 쪽이 아닌가] "원장의 두 수를 뺀 값은 봐준다"로 열면,
    #   **LLM의 산술 오류가 그 구멍으로 조용히 통과한다.** 헌법 2(계산은 솔버가)가
    #   존재하는 이유가 바로 그 오류다. 비용이 비대칭이다 — 파생값을 안 주면
    #   발화가 막히는 것으로 끝나지만(눈에 보인다), 구멍을 열면 틀린 값이
    #   손님에게 간다(안 보인다). 그래서 **막는 쪽을 유지하고 재료를 준다.**
    # [왜 '가장 싼 것과의 차이'인가] 3개 이상을 비교할 때 모든 쌍의 차액은
    #   n(n−1)/2 개로 불어나고 대부분 발화에 안 쓰인다. 손님의 질문은 사실상
    #   늘 "뭐가 제일 싸고 얼마나 차이 나냐"라서, 기준점 하나(최저가)로 충분하다.
    # [0 도 싣는다] 최저가 상품 자신의 차액은 0이다. 빼지 않고 남기는 이유는
    #   LLM 이 "같은 값"을 말해야 할 때(동가 상품)도 근거가 있어야 하기 때문.
    cheapest = min(rows, key=lambda r: r["final_price_krw"]) if rows else None
    for r in rows:
        r["diff_from_cheapest_krw"] = r["final_price_krw"] - cheapest["final_price_krw"]
    return {"sort_by": sort_by, "items": rows, "missing_sku_ids": missing,
            "cheapest_sku_id": cheapest["sku_id"] if cheapest else None,
            # 최고가−최저가. "둘 중 뭐가 싸냐"는 2개 비교에서 이 값이 곧 답이다.
            "max_diff_krw": (max(r["final_price_krw"] for r in rows)
                             - cheapest["final_price_krw"]) if rows else None}


# ════════════════════════════════════════════════════════════════════════════
# find_substitutes — 대체 후보 + 순위 (jmy 정렬 규칙 이관)
# ════════════════════════════════════════════════════════════════════════════

def _find_substitutes(sku_id: int) -> dict:
    """대체 후보를 만들고(같은 소분류·유사 가격대·재고 있음) 순위를 매긴다.

    정렬 우선순위(jmy가 실호출로 다듬은 규칙을 그대로 인수):
      ① 개인 반복구매(이 회원이 전에도 산 것 — "늘 사시던" 대체가 최고의 대체)
      ② 행사 중  ③ 실판매가 싼 순  ④ 재구매율 높은 순
    ①의 회원 번호는 query.current_member_id()에서 온다 — LLM이 아니라 서버가
    주입한 신원(B안). 비회원이면 ①만 조용히 꺼지고 나머지 축은 그대로 돈다.

    [규격 파서 예약 — 08/27] 지금은 후보 울타리가 가격대뿐이라 1L의 대체로
    300ml가 올라올 수 있다. 파서가 생기면 후보 필터에 규격 근사가 추가된다.
    """
    org = sot_client.get_product(sku_id)
    if org is None:
        return {"error": "not_found", "sku_id": sku_id, "message": "원 상품을 찾을 수 없습니다."}

    cands = sot_client.get_alternative_candidates(sku_id)
    stocked = []
    for c in cands:
        try:
            inv = sot_client.get_inventory(c["sku_id"])
        except Exception:
            continue
        qty = sum(int(l.get("qty", 0)) for l in inv.get("locations", []))
        if qty > 0:                      # 대체품이 또 품절이면 대체가 아니다
            stocked.append({**c, "stock_qty": qty})
    if not stocked:
        return {"ok": True, "original": {"sku_id": sku_id, "name": org["name"]},
                "substitutes": [], "message": "재고가 있는 대체 후보가 없습니다."}

    sku_list = [c["sku_id"] for c in stocked]
    prices = sot_client.get_current_prices(sku_list)

    # 지표(재구매율)와 개인 이력은 "있으면 순위에 반영"이지 필수가 아니다 —
    # 조회가 실패해도 대체 추천 자체는 나가야 하므로 실패를 빈 값으로 흡수한다.
    metrics = {}
    try:
        for m in sot_client.get_product_metrics(sku_list)["items"]:
            metrics[m["sku_id"]] = m
    except Exception:
        pass
    mine = set()
    member = query.current_member_id()
    if member is not None:
        try:
            mine = {it["sku_id"] for it in
                    sot_client.get_frequent_purchases(member)["items"]}
        except Exception:
            pass

    out = []
    for c in stocked:
        pr = prices.get(c["sku_id"], {})
        m = metrics.get(c["sku_id"], {})
        out.append({
            "sku_id": c["sku_id"], "name": c["name"], "brand": c.get("brand"),
            "final_price_krw": pr.get("final"), "on_promo": pr.get("on_promo", False),
            "discount_krw": pr.get("discount", 0), "stock_qty": c["stock_qty"],
            "repurchase_rate_pct": m.get("repurchase_rate_pct"),
            "personalized": c["sku_id"] in mine,   # 이 회원의 반복구매품이라는 표시
        })
    # 사전식 정렬(㊽ 아님 — _better와 같은 튜플 비교 응용): "좋을수록 앞"이 되게
    # 참/거짓을 not으로 뒤집고(False < True라 not personalized가 참이면 뒤로 밀림),
    # 가격은 그대로(작을수록 앞), 재구매율은 -로 뒤집는다(클수록 앞).
    out.sort(key=lambda s: (not s["personalized"], not s["on_promo"],
                            s["final_price_krw"] if s["final_price_krw"] is not None else float("inf"),
                            -(s["repurchase_rate_pct"] or 0)))
    return {"ok": True,
            "original": {"sku_id": sku_id, "name": org["name"],
                         "lifecycle_status": org.get("lifecycle_status")},
            "substitutes": out,
            "ranking_rule": "개인 반복구매 > 행사 > 실판매가 > 재구매율"}


# ── 디스패치 테이블 + 입구 (query.py와 같은 구조) ────────────────────────────
REGISTRY = {
    "optimize_route":   _optimize_route,
    "optimize_bundle":  _optimize_bundle,
    "compare_products": _compare_products,
    "find_substitutes": _find_substitutes,
    # "compare_unit_price"는 여기 없다 — 규격 파서(08/27)와 함께 온다.
    # 그때까지 루프의 _COMPUTE_STUB이 그 이름을 받는다.
}


def run(tool_name: str, tool_input: dict) -> dict:
    """계산 도구 하나를 실행한다. 예외를 밖으로 던지지 않는다(query.run과 동일 원칙).

    query.run과 달리 인자 정화·신원 주입이 없다 — 계산 도구의 인자(sku_ids·
    budget_krw)는 전부 LLM이 채워야 할 값이라 걸러낼 신원 칸이 없고, 남는 키는
    TypeError로 떨어져 bad_arguments 값이 되어 LLM이 스스로 고쳐 다시 부른다.
    """
    fn = REGISTRY.get(tool_name)
    if fn is None:
        return {"error": "unknown_compute_tool", "message": f"'{tool_name}'은 없는 계산 도구입니다."}
    try:
        return fn(**tool_input)
    except TypeError as e:
        return {"error": "bad_arguments", "message": str(e)}
    except Exception as e:
        return {"error": type(e).__name__, "message": str(e)}


# ── 스모크 (mock 전용·LLM 없음): python -m app.tools.compute ────────────────
if __name__ == "__main__":
    assert config.USE_MOCK_SOT, "스모크는 mock 모드 전용"

    # ① 동선: 물티슈A(2층)·세제(2층)·커피(1층) — 같은 층 둘을 묶고 층 이동이 뒤로 가야 정상
    r = run("optimize_route", {"sku_ids": [101042, 103902, 102301],
                               "start_floor": 2, "start_x": 5, "start_y": 15})
    assert r.get("ok"), r
    assert r["floor_order"][0] == 2, f"2층 출발인데 1층부터 돈다: {r['floor_order']}"
    print("① optimize_route:", [d["name"] for d in r["visit_order"]], "층순서", r["floor_order"])

    # ② 예산 조합(후보형): 30,000원이면 물티슈 리필(행사 7,900)+세제 4L(14,900)까지
    r = run("optimize_bundle", {"budget_krw": 30000,
                                "candidate_sku_ids": [101042, 101043, 102302, 103902]})
    assert r.get("ok") and r["total_krw"] <= 30000, r
    print("② optimize_bundle:", r["item_count"], "개 · 총", r["total_krw"], "원 · 잔액", r["remaining_krw"])

    # ③ 예산 조합(목적형): mock 세계엔 텐트가 없다 — 빈 조합 + unavailable로 정직하게
    r = run("optimize_bundle", {"budget_krw": 50000, "purpose": "캠핑"})
    assert r.get("ok") and "텐트" in r["unavailable_needs"], r
    print("③ optimize_bundle(캠핑): unavailable", len(r["unavailable_needs"]), "종 (mock에서 정상)")

    # ④ 가격 정렬: 리필(행사 6,900)이 최저가여야 한다
    r = run("compare_products", {"sku_ids": [101042, 101043], "sort_by": "price_asc"})
    assert r["cheapest_sku_id"] == 101043 and r["items"][0]["final_price_krw"] == 6900, r
    print("④ compare_products: 최저가", r["items"][0]["name"], r["items"][0]["final_price_krw"], "원")

    # ⑤ 대체 후보: 단종 커피 1kg → 900g이 재고 있는 대체로 나와야 한다
    r = run("find_substitutes", {"sku_id": 103877})
    assert r.get("ok") and r["substitutes"] and r["substitutes"][0]["sku_id"] == 103902, r
    print("⑤ find_substitutes:", r["original"]["name"], "→", r["substitutes"][0]["name"])

    # ⑥ 실패의 값 반환: 출발점 없는 동선 요청
    r = run("optimize_route", {"sku_ids": [101042, 101043]})
    assert r.get("error") == "missing_start_position", r
    print("⑥ 실패 착지: missing_start_position OK")

    print("\ncompute 스모크 6갈래 전부 통과")
