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
# [08-27 층 분해 완료] optimize_route는 **층 순서 전수(≤3!) × 층내 Held-Karp**다
#   (`_route_floor_decomposed` — 이관 시 예약해 둔 08/26 개조의 실행. 이틀 밀렸다).
#   단일 Held-Karp(층 이동을 비용에 녹임)를 버린 이유는 실물 모드의 A* 호출이
#   n²+n으로 늘어나는 비용 폭발 — 층간 이동이 층내 어떤 걸음보다 비싸 최적해가
#   반드시 층별로 뭉치므로, 같은 층 쌍만 재도 답이 같다(스모크가 일치를 실측).
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

# mock 좌표 휴리스틱에서 층을 **한 층** 오르내리는 수직 이동 자체의 비용.
# 실물 모드에서는 백엔드 A*가 실제 무빙워크 경로로 계산하므로 이 값은 안 쓰인다.
MOCK_FLOOR_CHANGE_COST = 30

# mock의 수직동선(에스컬레이터) 좌표. 세계 생성기의 것과 같은 값이다
# (`sim/world_gen.py`의 TRANSIT = {"ESC": [(88,66), …]}).
#
# ⚠ 08-27에 이 상수가 생긴 이유 — **mock만 순간이동을 허용하고 있었다.**
#   옛 `_mock_cost`는 층 변경을 "어디서든 +30"으로 쳤다. 실제 매장은 층을
#   바꾸려면 **에스컬레이터까지 걸어가서** 타고 **거기서 다시 걸어야** 한다.
#   그 차이가 층 분해의 전제("층간이 층내를 지배한다")를 mock에서만 무너뜨려,
#   분해 답이 전역 최적과 2.8% 확률로 갈렸다(스모크 실측).
#   상수를 키워 덮을 수도 있었지만 그건 숫자로 증상을 가리는 것이고,
#   **기하를 맞추면 원인이 사라진다** — 실물 기하와 같은 이유로 같은 답이 된다.
MOCK_TRANSIT_XY = (88, 66)


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
# [무엇] 루프가 요청 시작에 현재 위치를 등록하고, 아래 `_resolve_start`가 LLM이 안 준
#   경우에만 그것을 쓴다. **칸은 스키마에 그대로 남는다** — "3층 입구에서 출발해서"
#   같은 명시 지정은 계속 가능해야 하므로 지우지 않고 **기본값만** 준다.
#
# [08-27 갱신] `infer.get_position`이 규칙판(스캔 앵커 + 보행 격자 스냅)으로 섰다.
#   주입 창구는 예고대로 그대로다 — 달라진 것은 `_resolve_start`가 실물 모드에서
#   출발 좌표를 **통행 칸으로 스냅**해 넘긴다는 것뿐(매대 칸은 A*가 못 밟는다).
# ⚠ 09-03 — 요청 상태는 **ContextVar** 다, 모듈 전역이 아니다.
#   전에는 `_CURRENT_… = None` 전역이었고 요청마다 덮어썼다. 그런데 요청은 동시에
#   온다: 손님의 채팅(스레드풀)과 그 손님의 진입 브리핑(dispatch 의 to_thread)이
#   **같은 초에** 돌면 브리핑의 set_position(None) 이 채팅의 앵커를 지운다 — 09-03
#   시연 점검에서 스캔 직후 첫 질문("가장 가까운 화장실")만 번번이 "위치 모름"이
#   나온 원인. 손님 둘이 겹치면 **신원까지** 섞인다(남의 member_id 로 이력을 읽는다).
#   contextvars.ContextVar 는 스레드·태스크마다 값이 따로 산다. asyncio.to_thread 와
#   FastAPI 의 스레드풀은 컨텍스트를 **복사해서** 넘기므로 set() 이 새 스레드 안에
#   갇힌다. 읽기는 .get(), 쓰기는 .set() — 함수 껍데기(set_/current_)는 그대로라
#   호출부는 안 바뀐다.
from contextvars import ContextVar
_CURRENT_POSITION: ContextVar = ContextVar("position", default=None)


_POSITION_AGE: ContextVar = ContextVar("position_age", default=None)    # 앵커의 나이(초). set_position 이 채운다


def set_position(floor: int | None, x: int | None = None, y: int | None = None,
                 age_sec: float | None = None) -> None:
    """루프가 요청을 시작할 때 현재 위치를 등록한다. 모르면 set_position(None).

    셋 중 하나라도 없으면 등록하지 않는다 — 층만 알고 좌표를 모르는 반쪽 상태로
    경로를 짜면 같은 층 아무 데나에서 출발한 답이 나온다. 그건 없느니만 못하다.

    age_sec: **마지막 스캔으로부터 몇 초 지났나.** 모르면 None(전과 같음).

    [왜 나이가 필요한가 — 08-28 대조표의 유일한 소득]
      `models/position_filter.py` 가 파티클 필터를 규칙판과 겨뤘다. 결과는
      **가정에 따라 순위가 뒤집혔다**(머무름·이탈을 0으로 두면 필터가 이기고,
      크게 두면 규칙이 이긴다). 우리는 센서가 없어 어느 가정이 맞는지 알 수
      없으므로 **필터를 채택하지 않았다.**

      대신 **모든 설정에서 흔들리지 않은 사실**이 하나 있었다:
      *스캔 직후엔 앵커가 거의 정확하고(≈2m), 시간이 지날수록 급격히 나빠진다.*
      그 사실은 위치를 **옮겨서** 쓰는 게 아니라, **얼마나 믿을지**를 바꿔서
      쓴다. 그러려면 나이가 필요하다.
    """
    if floor is None or x is None or y is None:
        _CURRENT_POSITION.set(None)
        _POSITION_AGE.set(None)
    else:
        _CURRENT_POSITION.set((int(floor), int(x), int(y)))
        _POSITION_AGE.set(None if age_sec is None else float(age_sec))


def position_age() -> float | None:
    """마지막 스캔으로부터 경과 초. 모르면 None."""
    return _POSITION_AGE.get()


def current_position() -> tuple[int, int, int] | None:
    """지금 요청의 위치(없으면 None) — 읽기 전용 공개 창구.

    query.current_member_id()와 같은 이유로 함수 한 겹을 둔다: 밑줄 변수를 다른
    모듈이 집어 쓰면 '내부용'이라는 신호가 죽는다.
    """
    return _CURRENT_POSITION.get()


def _resolve_start(start_location_id, start_floor, start_x, start_y):
    """출발점을 (층, x, y) 튜플로 통일한다. 해석 불가면 None.

    우선순위가 셋이고 **순서에 뜻이 있다**:
      ① LLM이 준 좌표 3종      — 손님이 "3층 입구에서 출발해서"라고 **명시**한 경우.
                                 주입값보다 앞선다. 사람 말이 추정보다 세다.
      ② LLM이 준 location_id   — 좌표를 모를 때의 차선(mock에서만 풀린다)
      ③ **주입된 현재 위치**    — LLM이 아무것도 안 줬을 때의 기본값
    ①이 ③보다 앞이라는 것이 이 함수의 유일한 판단이다.
    """
    start = None
    if start_floor is not None and start_x is not None and start_y is not None:
        start = (int(start_floor), int(start_x), int(start_y))
    elif start_location_id:
        loc = sot_client.resolve_location(start_location_id)
        if loc:
            start = (int(loc["floor_no"]), int(loc["x"]), int(loc["y"]))
    if start is None:
        start = _CURRENT_POSITION.get()  # ③ 없으면 None — 호출부가 에러로 돌린다
    # 실물 모드에서는 출발점을 통행 칸으로 스냅한다(08-27). 주입값은 스캔한
    # **매대의** 좌표인데 매대 칸은 장애물이라, 그대로 넘기면 백엔드 A*가
    # "출발점이 통행 불가"로 경로를 못 만든다. 스냅 로직은 위치추정 자산의
    # 것을 그대로 쓴다(infer.snap_to_walkable) — 두 벌이면 격자가 갈린다.
    if start is not None and not config.USE_MOCK_SOT:
        from app.tools import infer     # 함수 안 import — 모듈 순환을 피한다
        sx, sy, _snapped = infer.snap_to_walkable(*start)
        start = (start[0], sx, sy)
    return start


def _mock_cost(a: tuple, b: tuple) -> int:
    """mock 전용 이동 비용: 맨해튼 거리, 층이 다르면 **에스컬레이터 경유**.

    맨해튼 거리 |Δx|+|Δy| = 격자 도시에서 대각선 없이 걷는 거리. 매장 통로가
    격자라 유클리드(직선)보다 이쪽이 실제 보행에 가깝다. 장애물은 모른다 —
    그건 실물 모드에서 백엔드 A*가 맡는 부분이고, mock은 '그럴듯한 순서'까지만.

    [층이 다르면] 사람은 층 경계를 아무 데서나 못 넘는다 — 수직동선이 하나뿐이라
    **거기까지 걸어가서 → 타고 → 거기서 다시 걷는다.** 그래서 비용이 세 토막이고,
    층을 바꾸는 값이 위치에 따라 달라진다(구석에서 층을 바꾸면 훨씬 비싸다).
    장애물을 모르는 것과 달리 이건 **근사가 아니라 구조**라, mock에도 넣는다 —
    빼면 mock에서만 층 섞기가 이득이 되어 층 분해의 전제가 깨진다.
    """
    af, ax, ay = a          # 튜플 언패킹 — (층, x, y)를 세 변수로 푼다
    bf, bx, by = b
    if af == bf:
        return abs(ax - bx) + abs(ay - by)
    tx, ty = MOCK_TRANSIT_XY
    return (abs(ax - tx) + abs(ay - ty)                     # ① 동선까지 걸어가고
            + abs(af - bf) * MOCK_FLOOR_CHANGE_COST         # ② 층을 오르내리고
            + abs(tx - bx) + abs(ty - by))                  # ③ 거기서 다시 걷는다


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


def _held_karp_endings(start_cost: list, pair_cost: list):
    """출발점 고정·복귀 없음(open) TSP의 정확해 — Held-Karp 동적 계획법.

    [입력] start_cost[i] = 출발점→목적지 i 비용 / pair_cost[i][j] = i→j 비용
    [출력] {끝점 i: (총비용, 방문 순서)} — **가능한 끝점 전부** — 또는 None(연결 불가)

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

    # ── 경로 복원: 끝점에서 "직전"을 따라 출발점까지 되감는다 (㊿ while)
    def _rewind(last):
        order_rev, mask = [], full
        while last is not None:
            order_rev.append(last)
            _, prev = dp[(mask, last)]
            mask ^= 1 << last                           # ㊽: 방문집합에서 last를 끈다
            last = prev
        order_rev.reverse()             # 되감았으니 뒤집어야 출발→끝 순서가 된다
        return order_rev

    # **끝점별로 전부** 돌려준다(08-27 층 분해). dp[(full, i)]는 "i에서 끝나는
    # 최적 경로"를 이미 다 갖고 있다 — 최소 하나만 뽑아 버리면 그 정보가 죽는데,
    # 층을 이을 때는 "층내에서 조금 손해라도 다음 층으로 건너가기 좋은 끝점"이
    # 전체 최적일 수 있어서 끝점 선택을 여기서 확정하면 안 된다(끝점 근시).
    return {i: (int(dp[(full, i)][0]), _rewind(i))
            for i in range(n) if (full, i) in dp} or None


def _held_karp_order(start_cost: list, pair_cost: list):
    """`_held_karp_endings`의 최솟값 판 — 단일 층 등 "끝점이 자유"일 때 쓴다."""
    ends = _held_karp_endings(start_cost, pair_cost)
    if not ends:
        return None
    if not isinstance(ends, dict):                      # n=0 특례 ([], 0)
        return ends
    cost, order = min(ends.values())                    # 튜플 비교 — 비용부터
    return order, cost


def _route_floor_decomposed(start: tuple, destinations: list, leg):
    """층 분해 동선 풀이 — **층 순서 전수(≤3!) × 층내 Held-Karp** (08-27, 파일명세 §2.4 출하 사양).

    [왜 분해하나] 단일 Held-Karp는 n=10에서 구간 비용이 n²+n = 110개 필요하다.
    실물 모드에서 구간 하나 = 백엔드 A* 호출 하나라 이 개수가 곧 지연시간이다.
    그런데 층간 이동(에스컬레이터 왕복 보행 + 수직)이 층내 걸음을 지배해서
    **최적해는 층별로 뭉친다.** 실측(08-27 스모크 1,200시행 — mock 기하 400 +
    실물 기하 400 + **실배치 400**): 분해해가 단일 전역 Held-Karp와 **전부
    일치**했다. 실배치분은 난수 좌표가 아니라 실 시드(`world_seed.sql`의
    `locations`·`map_cells`·`stocks`)로 잰 것이다 — 층 지름이 166~168인데
    층간은 에스컬레이터 왕복이라 전제가 넉넉히 성립한다.
    ⚠ 이건 정리(theorem)가 아니라 **이 매장 비용 구조의 성질**이다 — 층간이
    싸지면(계단이 매대 옆에 있는 매장) 깨진다. 실제로 mock이 층 변경을
    "어디서든 +30"으로 치던 동안은 2.8%가 어긋났고, 기하를 맞추자 0이 됐다.
    그 도메인 사실을 구조로 옮기면: 층의 방문 순서만 전수로 돌리고(판매층 ≤3,
    3! = 6가지), 층 안에서만 Held-Karp를 풀면 된다. 같은 층 쌍만 재므로 쌍
    구간이 n(n−1)에서 Σ nf(nf−1)로 준다 — n=10이 두 층에 5·5면 90 → 40.

    [부수 효과] Held-Karp의 상태 수도 2^n에서 2^nf로 준다.
    [더 줄일 길 둘 — 열린 결정] ① 게이트 분해: 수직동선이 하나뿐이라 층간
    비용은 "게이트까지 + 수직 + 게이트부터"로 정확히 갈라진다 — 백엔드 A*가
    좌표형 stop을 받아야 가능(§2.4의 시설 경유와 같은 요청). ② 체인 배칭:
    navigation_route가 stops 목록을 받으므로 행렬 한 줄을 POST 하나로 받을
    수 있다 — HTTP 왕복이 n²에서 n으로.

    [leg 계약] leg(출발튜플, 목적지dict) → (비용, 도착튜플) 또는 None(경로 없음).
      mock = 좌표 휴리스틱(공짜) · 실물 = 백엔드 A*(비싸다 — 그래서 memo).
      층간 비용은 따로 안 잰다 — 다음 층 첫 목적지로 가는 leg 하나에 수직
      이동까지 포함돼 있다(A*가 층간 경로를 알고, mock은 층 페널티 상수).

    [반환] (방문 순서 인덱스, 총비용) 또는 None(어떤 층 순서로도 전부 못 돈다).
    """
    from itertools import permutations                  # 표준 라이브러리 — 순열 생성기

    inf = float("inf")
    floors = sorted({d["floor_no"] for d in destinations})
    by_floor = {f: [i for i, d in enumerate(destinations) if d["floor_no"] == f]
                for f in floors}

    # (출발튜플, sku) → leg 결과 메모. 층 순서 후보끼리 같은 구간을 다시 재는
    # 것을 막는다 — 실물에서 이 dict의 미스 수가 곧 A* 호출 수다.
    memo: dict = {}

    def cached_leg(pt: tuple, i: int):
        key = (pt, destinations[i]["sku_id"])
        if key not in memo:
            memo[key] = leg(pt, destinations[i])
        return memo[key]

    def solve_floor(entry: tuple, f: int):
        """진입점 하나에서 층 f의 전 목적지를 도는 층내 Held-Karp.

        반환 {끝점의 도착 칸: (층내 비용, 이 층의 방문 순서)} 또는 None.
        """
        idxs = by_floor[f]
        # ① 진입 비용: 진입점 → 이 층의 각 목적지 (다른 층이면 수직 포함)
        sc, eps = [], []
        for i in idxs:
            r = cached_leg(entry, i)
            sc.append(r[0] if r else inf)
            eps.append(r[1] if r else None)
        # ② 층내 쌍 비용: i의 도착 칸 → j. 같은 층 안에서만 잰다 — 여기가
        #    분해의 절약분이다(다른 층끼리의 쌍은 아예 안 잰다).
        m = len(idxs)
        pc = [[inf] * m for _ in range(m)]
        for a in range(m):
            if eps[a] is None:
                continue                                # 진입 못 한 곳 — 나가는 변 없음
            for b in range(m):
                if a == b:
                    pc[a][b] = 0
                    continue
                r = cached_leg(eps[a], idxs[b])
                if r is not None:
                    pc[a][b] = r[0]
        ends = _held_karp_endings(sc, pc)
        if not ends:
            return None
        out = {}
        for k, (cost, sub) in ends.items():
            if eps[k] is None:
                continue                                # 도착 칸을 모르는 끝점은 못 잇는다
            cand = (cost, [idxs[t] for t in sub])
            if eps[k] not in out or cand[0] < out[eps[k]][0]:
                out[eps[k]] = cand
        return out or None

    # ── 층 사이를 **끝점 전체에 대한 DP**로 잇는다 ──────────────────────────
    # 그리디(층내 최소 끝점 하나만 다음 층에 넘기기)는 **끝점 근시**다 — 층내에서
    # 조금 손해라도 다음 층 진입이 싼 끝점이 전체 최적일 수 있다. 실측(08-27
    # 스모크): 그리디는 무작위 배치의 24%에서 묶음 최적을 놓쳤다(최대 +30%).
    # 상태를 "이 층을 어느 칸에서 끝냈나"로 두면 층 순서가 고정된 하에서 정확하다.
    best = None                                         # (총비용, 순서)
    for perm in permutations(floors):
        states = {start: (0, [])}                       # 끝 칸 → (누적 비용, 누적 순서)
        for f in perm:
            nxt: dict = {}
            for ep, (cum, order) in states.items():
                sub = solve_floor(ep, f)
                if sub is None:
                    continue
                for ep2, (cost, sub_order) in sub.items():
                    cand = (cum + cost, order + sub_order)
                    if ep2 not in nxt or cand[0] < nxt[ep2][0]:
                        nxt[ep2] = cand
            if not nxt:
                states = None                           # 이 층 순서로는 전부 못 돈다
                break
            states = nxt
        if states:
            total, order = min(states.values())
            if best is None or total < best[0]:
                best = (total, order)
    if best is None:
        return None
    return best[1], int(best[0])


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

    # ── mock: 좌표 휴리스틱 leg — 분해 구조는 실물과 **같은 코드**를 탄다 ──
    # 실물만 분해하고 mock을 단일 Held-Karp로 두면, 골든셋·스모크가 검증하는
    # 코드와 데모가 도는 코드가 갈린다(같은 이유의 사고: 러너 utf-8, .env).
    if config.USE_MOCK_SOT:
        def _leg(pt, d):
            c = (d["floor_no"], d["x"], d["y"])
            return _mock_cost(pt, c), c
        solved = _route_floor_decomposed(start, destinations, _leg)
        if solved is None:
            return {"error": "route_unreachable", "message": "목적지를 잇는 경로를 찾지 못했습니다."}
        order_idx, total = solved
        ordered = [destinations[i] for i in order_idx]
        return {"ok": True, "mode": "mock_coordinate_heuristic",
                "algorithm": "층 분해(층 순서 전수) + 층내 Held-Karp",
                "start": {"floor_no": start[0], "x": start[1], "y": start[2]},
                "visit_order": ordered,
                "floor_order": [d["floor_no"] for d in ordered],
                "estimated_cost": total, "unresolved_sku_ids": unresolved,
                "note": "mock 모드 — 장애물·무빙워크 없는 좌표 휴리스틱 순서입니다."}

    # ── 실물: 백엔드 A* leg — 층 분해가 호출 수를 n²+n → Σnf(nf−1)+α로 줄인다 ──
    def _leg(pt, d):
        return _backend_single_leg(pt, d["sku_id"])

    solved = _route_floor_decomposed(start, destinations, _leg)
    if solved is None:
        return {"error": "route_unreachable", "unresolved_sku_ids": unresolved,
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
            "algorithm": "층 분해(층 순서 전수) + 층내 Held-Karp + 백엔드 A* 구간 비용",
            "start": {"floor_no": start[0], "x": start[1], "y": start[2]},
            "visit_order": ordered, "floor_order": floor_order,
            "optimized_cost": optimized_cost,
            "total_distance": int(final_route.get("totalDistance", optimized_cost)),
            "legs": _fold_legs(final_route.get("legs", [])),
            "unresolved_sku_ids": unresolved}


def _fold_legs(legs: list) -> list:
    """구간에서 **폴리라인을 접는다** — 칸 수만 남기고 좌표 열은 버린다.

    [무엇이 문제였나 — 08-28 B 실측]
      경로 도구 출력 19,286자 중 `legs[].path` 가 **18,691자(97%)** 였다.
      A* 가 지나간 격자 칸이 구간당 277개씩 실린다.

      ⚠ 그리고 **그 값이 가는 곳은 LLM 뿐이다.** `main.py` 의 `ChatResponse` 는
      `reply` 와 `actions` 만 실어 보내므로 **프론트는 이 폴리라인을 못 받는다.**
      지도에 선을 그리려면 프론트가 백엔드 A* 창구를 직접 부르는 것이 맞고,
      그게 원래 구조다(우리는 추론·판단 전용 — 헌법 4).

      그래서 이 필드는 **경로 질문마다 Claude 입력에 12,000 토큰**을 밀어
      넣고 있었다. 값도 안 쓰이고, 문맥만 묽어진다.

    [왜 LLM 이 이걸 쓰면 안 되나] 발화가 인용해야 하는 것은 `visit_order`·
      `floor_order`·`total_distance` 다. 폴리라인을 읽고 길을 설명하기 시작하면
      **솔버가 낸 순서를 LLM 이 다시 해석하는 것**이라, 헌법 2 가 막으려던
      바로 그 자리다.

    ⚠ **내부 계산은 안 건드린다.** `_backend_single_leg` 가 `path[-1]` 로 도착
      좌표를 쓰는데, 그건 **백엔드 응답을 직접** 읽으므로 여기서 접어도 산다
      (이 함수는 우리 반환값을 만드는 자리다).
    """
    out = []
    for leg in legs or []:
        folded = {k: v for k, v in leg.items() if k != "path"}
        p = leg.get("path") or []
        if p:
            # 칸 수는 남긴다 — "얼마나 걷나"의 근거가 되고, 없으면 LLM 이
            # total_distance 만으로 구간을 못 가른다.
            folded["path_steps"] = len(p)
        out.append(folded)
    return out


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
    ka, kb = _bundle_key(a), _bundle_key(b)
    return ka > kb


def _walk_penalty(items) -> int:
    """이 조합을 사려면 밟아야 하는 층·존의 **개수**로 만든 벌점.

    [왜 층에 10배인가] 층 이동은 무빙워크 90초 고정이고 층내 통로 이동은
      몇 걸음이다(`params.FLOOR_CHANGE_SEC`). 존 하나와 층 하나가 같은
      무게일 수는 없다. 10은 정확한 환산비가 아니라 **순서를 고정하는 값**이다
      — 층을 하나 아끼려고 존을 아홉 개 늘리는 일은 실제로 안 일어난다.

    [왜 실제 경로 길이가 아닌가] 경로 길이를 넣으면 조합 문제 안에 TSP 가
      들어온다. 우리 매장에서 걸음의 지배항은 층 이동이고(`route_check` 가
      실 좌표로 확인한 성질), 층·존 개수는 그 지배항의 대리값이다.

    [없으면 0] 후보에 floor 칸이 없는 경우(후보형 호출 등)에는 벌점이 0이라
      **전과 똑같이 동작한다.** 새 정보가 있을 때만 쓰는 규율.
    """
    fl = {i.get("floor") for i in items if i.get("floor") is not None}
    zn = {(i.get("floor"), i.get("zone")) for i in items if i.get("floor") is not None}
    return 10 * len(fl) + len(zn)


def _bundle_key(st):
    """조합의 정렬 키. **필요도가 절대 우선**이고, 동점일 때만 동선을 본다.

    [왜 가중합이 아니라 사전식인가 — 08-28 대조표]
      "필요도 − 0.3×층수" 같은 가중합은 가중치를 정당화할 수 없다. 필요도 1점이
      층 이동 몇 번어치인지 아무도 모르고, 가중치가 조금만 틀리면 **필요한
      물건을 층 하나 아끼려고 버린다** — 손님에게 최악이다.
      사전식은 그 질문을 없앤다: 필요도는 양보하지 않고, 같을 때만 동선을 본다.

    [이 한 줄이 CP-SAT 을 대신한다] `models/bundle_cpsat.py` 가 같은 문제를
      CP-SAT 사전식 2단계로 풀어 비교했다(120 인스턴스, 실 시드):
        DP            방문 층 2.08 · 존 3.53
        DP+타이브레이크  방문 층 1.91 · 존 3.38   ← 이 키
        CP-SAT 다목적   방문 층 1.91 · 존 3.38   ← **같다**
      전역 최적화가 얻는 이득을 **전부** 이 지역 타이브레이크가 얻었다.
      그래서 서빙에 ortools 를 들이지 않는다 — 대조표에만 남긴다.
      ⚠ 이 동치는 우리 인스턴스의 성질이지 정리가 아니다. 필요 개수가 크게
        늘거나 매장 배치가 바뀌면 다시 재라(`python models/bundle_cpsat.py`).
    """
    return (st["score"], -_walk_penalty(st["items"]),
            len(st["items"]), -st["total_krw"])


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
                # ⚠ `_better` 는 동선 벌점을 포함한다. 같은 금액·같은 점수면
                #   **층을 덜 밟는 조합**이 살아남는다.
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
                # ⚠ **빠진 것을 말하라는 규율을 결과에 싣는다** (㉠ 08-31).
                #   갈래가 있다 — 예산에 다 들어가면 할 말이 없다. 정의에 두면
                #   세 번 중 두 번은 헛것이고, **여기 있으면 실제로 빠졌을 때만**
                #   발화 직전에 온다(compare_products 의 행사 안내와 같은 계열).
                #   ⚠ 그리고 이름을 준다 — "빠진 게 있다"까지만 말하면 LLM 이
                #   무엇이었는지 되짚어야 한다.
                **({"read_as": (
                    "**예산 때문에 빠진 것이 있습니다** — "
                    + ", ".join(str(x) for x in (not_selected or [])[:4])
                    + ". 그 사실을 짧게라도 함께 말하세요. 빼놓고 조합만 대면 "
                      "손님은 그것까지 담긴 줄 압니다.")}
                   if not_selected else {}),
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
    # ── 행사 안내 규율을 **결과로 옮긴다** (㉠ 08-29) ────────────────────────
    # [왜] 이 규율은 **갈래가 있다** — 행사 중인 상품이 하나도 없으면 할 말이
    #   없다. 도구 정의에 두면 행사가 없는 판에서도 매번 실려서 세 번 중 두
    #   번은 헛것이다(tier·basis 와 같은 성질). 결과에 실으면 **행사가 실제로
    #   있을 때만** 발화 직전에 온다 — 짧아지면서 동시에 가까워진다.
    # [왜 이름을 세나] "행사 상품이 있다"까지만 말하면 LLM 이 어느 것인지
    #   되짚어야 한다. 이름을 주면 문장의 주어가 그대로 온다.
    promo = [r["name"] for r in rows if r.get("on_promo")]
    return {"sort_by": sort_by, "items": rows, "missing_sku_ids": missing,
            "cheapest_sku_id": cheapest["sku_id"] if cheapest else None,
            **({"read_as": (
                f"**행사 중인 상품이 있습니다** — {', '.join(promo)}. "
                "'원래 O원인데 O원 할인된 O원'처럼 **행사 사실을 함께 말하세요.** "
                "regular_price_krw · discount_krw · final_price_krw 가 그 문장의 "
                "재료이고, 셋 다 원장에 있으니 아무 수도 만들지 마세요.")}
               if promo else {}),
            # 최고가−최저가. "둘 중 뭐가 싸냐"는 2개 비교에서 이 값이 곧 답이다.
            "max_diff_krw": (max(r["final_price_krw"] for r in rows)
                             - cheapest["final_price_krw"]) if rows else None}



# ════════════════════════════════════════════════════════════════════════════
# compare_unit_price — 단위가격 비교 (2026-08-27, 계산 5/5 완성)
# ════════════════════════════════════════════════════════════════════════════
#
# [왜 규격 파서가 없나] 이 도구의 계획은 원래 "정규식+사전 파서로 spec_raw 를
#   해석한다"였다. 08-27 에 실데이터를 열어 보고 **파서를 안 쓰기로 했다** —
#   카탈로그 4,970개 전부가 `spec.quantity` 에 축과 값을 이미 갖고 있고, 복합
#   규격("900ml × 3입" → volume_ml 2700)까지 접혀 있다. 파싱은 우리가 만든
#   정보를 문자열로 납작하게 만든 뒤 다시 세우는 일이었다.
#   자세히는 `sot_client.spec_quantity` 독스트링.
#
# [그래서 이 파일이 푸는 문제는 나눗셈이 아니라 **축**이다]
#   축이 여섯이다 — weight_g · volume_ml · count_ea · count_roll · count_sheet
#   · count_tab. 500g 과 24롤은 **비교 대상이 아니다.** 무게와 개수는 서로
#   환산할 수 없고(밀도를 모른다), "1롤"과 "1개"도 다른 것이다.
#
# [기준량을 도구가 정한다 — LLM 이 아니라] 스키마에 `basis` 칸이 없는 것이
#   설계다. 손님이 "100ml당"이라 물어도 데이터가 g 이면 g 으로 답해야 한다.
#   칸을 열어 두면 LLM 이 ml 을 넘기고 **g 데이터에 ml 라벨이 붙는다** —
#   도구가 거짓말을 하는 것이고, 신원·좌표를 LLM 이 옮겨 적게 두지 않는 것과
#   같은 계열이다(B안). 축은 손님의 선호가 아니라 **데이터의 사실**이다.
#   ⚠ 실제로 스텁 시절에도 LLM 은 스스로 바로잡았다 —
#     *"100ml당(정확히는 100g당, 두 상품 다 g 단위예요)"*. 도구가 축을 정확히
#     돌려주기만 하면 발화는 이미 된다.

# 축 → (기준량, 사람이 읽는 이름). 100g·100ml 은 **한국 마트가 실제로 쓰는
# 기준**이라 우리 발명이 아니다 — 손님이 이미 아는 잣대를 쓰는 것이 요점.
# 개수 축은 1단위가 자연스럽다("1롤당 490원").
UNIT_BASIS = {
    "weight_g":    (100, "100g"),
    "volume_ml":   (100, "100ml"),
    "count_ea":    (1,   "1개"),
    "count_roll":  (1,   "1롤"),
    "count_sheet": (1,   "1매"),
    "count_tab":   (1,   "1정"),
}


def _compare_unit_price(sku_ids: list) -> dict:
    """같은 축끼리 단위가격을 내고 정렬한다. 축이 다르면 **비교하지 않는다.**

    [반환]
      groups[]           축 하나짜리 비교 묶음. 2개 이상일 때만 만든다
        axis · basis · basis_label · items[] · cheapest_sku_id · max_diff_krw
      ungrouped[]        축에 짝이 없어 비교 못 한 상품 (조용히 버리지 않는다)
      unmeasurable[]     수량을 모르는 상품 (spec 이 없거나 깨짐)
      missing_sku_ids[]  아예 못 찾은 상품

    [왜 그룹을 여럿 돌려주나] 입력이 섞이면(무게 2 + 부피 2) 한 그룹만 내고
    나머지를 버리는 것이 제일 나쁘다 — LLM 이 "비교했다"고 말하는데 절반이
    빠진 상태가 된다(08-24 no silent caps). 그룹을 다 주면 발화가 두 문장이
    될 뿐이고, 그게 정직하다.

    [실판매가 기준] 정가로 나누면 **행사 중인 상품이 손해로 보인다.**
    손님이 계산대에서 낼 금액이 비교의 기준이어야 한다(`_compare_products` 와 같은 규율).
    """
    sku_ids = list(dict.fromkeys(int(s) for s in sku_ids))
    if len(sku_ids) < 2:
        return {"error": "need_multiple",
                "message": "단위가격 비교에는 상품이 2개 이상 필요합니다."}

    prices = sot_client.get_current_prices(sku_ids)
    products = {p["sku_id"]: p for p in sot_client.get_products_by_skus(sku_ids)}

    rows, missing, unmeasurable = [], [], []
    for sku in sku_ids:
        pr, p = prices.get(sku), products.get(sku)
        if pr is None or p is None:
            missing.append(sku)
            continue
        q = sot_client.spec_quantity(p.get("spec"))
        if q is None or q["axis"] not in UNIT_BASIS:
            # 수량을 모르면 나눗셈이 성립하지 않는다. **추측하지 않는다** —
            # 여기서 1로 채우면 "1개당 12,900원"이라는 그럴듯한 거짓이 나간다.
            unmeasurable.append({"sku_id": sku, "name": p.get("name"),
                                 "spec_raw": p.get("spec_raw"),
                                 "reason": "unknown_quantity"})
            continue
        rows.append({"sku_id": sku, "name": p["name"], "brand": p.get("brand"),
                     "spec_raw": p.get("spec_raw"), "category_l2": p.get("category_l2"),
                     "axis": q["axis"], "quantity": q["value"],
                     "final_price_krw": pr["final"], "on_promo": pr["on_promo"],
                     "regular_price_krw": pr["regular"], "discount_krw": pr["discount"]})

    # ── 축별로 가른다 ────────────────────────────────────────────────────────
    by_axis: dict = {}
    for r in rows:
        by_axis.setdefault(r["axis"], []).append(r)

    groups, ungrouped = [], []
    for axis, items in by_axis.items():
        if len(items) < 2:
            # 짝이 없다. 단위가격 자체는 낼 수 있지만 **비교가 아니다** —
            # 값은 실어 보내되 그룹으로 만들지 않는다.
            for r in items:
                basis, label = UNIT_BASIS[axis]
                ungrouped.append({**r, "unit_price_krw": _unit_price(r, basis),
                                  "basis_label": label,
                                  "reason": "no_peer_in_same_axis"})
            continue
        basis, label = UNIT_BASIS[axis]
        for r in items:
            r["unit_price_krw"] = _unit_price(r, basis)
        items.sort(key=lambda r: r["unit_price_krw"])
        cheap = items[0]["unit_price_krw"]
        for r in items:
            # 파생값은 솔버가 만든다 — LLM 이 빼면 가드가 막고, 열어 주면
            # 산술 오류가 그 구멍으로 샌다(_compare_products 의 같은 주석).
            r["diff_from_cheapest_krw"] = r["unit_price_krw"] - cheap
        # ── 소분류가 섞였나 — **거부가 아니라 표시** ─────────────────────────
        # [왜 거부하지 않나] 축이 다른 것과 L2 가 다른 것은 **층이 다르다.**
        #   축은 환산이 **정의되지 않는다**(무게↔부피는 밀도를 알아야 한다) —
        #   수학이 막는 것이라 솔버가 거부하는 게 맞다.
        #   L2 는 계산이 되고 값도 옳다(라면 491원/개 · 타프 27,690원/개 —
        #   둘 다 진짜 개당 가격이다). 의심스러운 것은 **그 비교에 뜻이 있나**이고,
        #   그건 계산이 아니라 이해다 → 헌법 2 상 LLM 의 몫이다.
        # [그래서 재료를 준다] 이름·소분류·플래그를 실어 보내면 LLM 이
        #   "라면과 캠핑 타프를 개당으로 견주는 건 뜻이 없다"고 판단할 수 있다.
        #   여기서 우리가 막으면 *"라면이랑 즉석밥 중 개당 뭐가 싸?"* 같은
        #   **손님이 일부러 시킨 비교**까지 같이 죽는다(과잉 거부).
        l2s = {r.get("category_l2") for r in items if r.get("category_l2")}
        groups.append({
            "axis": axis, "basis": basis, "basis_label": label,
            "items": items, "cheapest_sku_id": items[0]["sku_id"],
            "max_diff_krw": items[-1]["unit_price_krw"] - cheap,
            "mixed_l2": len(l2s) > 1,
            "categories": sorted(l2s),
            **({"caution": "소분류가 서로 달라 개당 비교의 뜻이 약할 수 있습니다. "
                           "품목 성격이 다르면 단위가격 우열을 단정하지 마세요."}
               if len(l2s) > 1 else {}),
        })
    # 그룹이 여럿이면 큰 것부터 — 발화의 주어가 될 묶음이 먼저 온다
    groups.sort(key=lambda g: len(g["items"]), reverse=True)

    out = {"groups": groups, "ungrouped": ungrouped,
           "unmeasurable": unmeasurable, "missing_sku_ids": missing}
    # ⚠ 규율을 **결과에 실어 보낸다**(08-28 B 요청 — query._search_products 의
    #   같은 주석 참조). 지금까지 "축이 안 맞아 보여도 일단 부른다"·"빠진 것을
    #   조용히 버리지 마라"가 도구 정의에만 있었는데, 정의는 문맥 맨 앞이라
    #   발화 시점과 멀고 축약 대상이다. read_as 는 결과에 붙어 발화 직전에 온다.
    if groups and (ungrouped or unmeasurable):
        # 이 갈래가 제일 위험하다 — **비교가 성립했으므로** LLM 이 "비교했다"고
        # 말하는데, 빠진 상품이 있다는 사실이 발화에서 사라진다(no silent caps).
        out["read_as"] = (
            "일부만 견줬습니다. **빠진 상품을 반드시 함께 말하세요** — "
            f"축이 안 맞아 못 견준 것 {len(ungrouped)}개"
            f"{f' · 규격을 몰라 못 견준 것 {len(unmeasurable)}개' if unmeasurable else ''}"
            "가 있습니다. 그 사실 없이 결과만 대면 손님은 전부 비교된 줄 압니다.")
    if not groups:
        # 비교가 하나도 성립 안 했다. **왜인지와 대안을 값으로 준다** —
        # 그냥 에러만 주면 LLM 이 "비교할 수 없습니다"로 끝내는데,
        # 총액 비교는 축과 무관하게 언제나 가능하다.
        out["error"] = "no_comparable_pair"
        out["message"] = (
            "단위가 서로 달라 단위가격을 견줄 수 없습니다"
            f"({', '.join(sorted({r['axis'] for r in rows})) or '수량 미상'}). "
            "무게·부피·개수는 서로 환산할 수 없습니다. "
            "단위가격을 지어내지 마세요.")
        # ── 거부로 끝내지 않는다 — **답할 수 있는 것을 이름으로 준다** ────────
        # [왜] "비교할 수 없습니다"로 끝나면 손님은 빈손이다. 단위가 달라 못 하는
        #   것은 **단위가격 하나**이고, 같은 질문 의도("뭘 사는 게 나은가")에
        #   답할 수 있는 자산이 우리에게 더 있다.
        # [왜 도구가 부르지 않고 이름만 주나] 도구가 다른 도구를 부르면 그
        #   조합이 코드에 굳는다 — 무엇을 이어 붙일지는 대화 맥락이 정하는 일이라
        #   **루프의 판단**이다(두뇌의 통로 2개 중 에이전트 경로). 도구는 재료와
        #   선택지를 주고 판단을 넘긴다.
        out["alternatives"] = [
            {"tool": "compare_products",
             "why": "총액 기준 비교는 단위와 무관하게 언제나 가능합니다."},
            {"tool": "predict_repurchase",
             "why": "그 손님이 전에 산 품목이면 '보통 며칠 주기로 사는가'로 "
                    "도울 수 있습니다(이력이 없으면 no_history 가 옵니다)."},
        ]
    return out


def _unit_price(r: dict, basis: int) -> int:
    """기준량당 실판매가. 반올림은 **표시 단위(원)에서 한 번만** 한다.

    원/g 로 두면 29.58 같은 소수가 나와 발화가 어색하고, 그렇다고 원 단위로
    먼저 반올림하면(30원/g) 100g 에서 42원이 틀어진다 — **곱한 뒤 반올림**한다.
    """
    return round(r["final_price_krw"] * basis / r["quantity"])


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

    [규격 근사 — 08/28] 후보 울타리가 가격대뿐이면 1L 의 대체로 300ml 이
    올라온다. 상류 `spec.quantity` 를 그대로 받아(파서 없이) 원본과 크기를
    견준다. 예약해 뒀던 "파서가 생기면"은 틀린 전제였다 — 상류에 이미 구조가
    있었고, 창구가 그 칸을 안 실어 주고 있었을 뿐이다.

    ⚠ **거르지 않고 표시한다.** 규격이 안 맞는다고 조용히 빼면 "대체품이
      없습니다"가 되는데, 실제로 맞는 답은 *"1kg 은 없고 1.5kg 은 있어요"* 다.
      순위에서 뒤로 밀고 `size_match` 로 사실을 실어 보낸다 — 무엇을 뺐는지
      LLM 이 알아야 손님에게 그 사실을 말할 수 있다.
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

    # ── 규격 근사 ────────────────────────────────────────────────────────
    # 원본의 수량 축·값. 없으면(축을 모르면) 크기 판정을 통째로 끈다 —
    # 모르는 것을 "다름"으로 적으면 멀쩡한 후보가 뒤로 밀린다.
    org_q = sot_client.spec_quantity(org.get("spec"))

    def _size(c):
        """(등급, 배율) — 등급이 작을수록 좋은 대체다.

        경계 근거: 0.8~1.25 는 **같은 규격의 표기 차이**가 들어가는 폭이고
        (900g vs 1kg), 0.5~2.0 은 "한 단계 큰/작은 것"이다. 그 밖이면 크기가
        다른 물건이라 대체라고 부르기 어렵다 — 그래도 빼지는 않는다.
        """
        if org_q is None:
            return 0, None                       # 판정 불가 → 순위에 영향 없음
        q = sot_client.spec_quantity(c.get("spec"))
        if q is None or q["axis"] != org_q["axis"] or not org_q["value"]:
            return 3, None                       # 축이 다르면 견줄 수 없다
        ratio = q["value"] / org_q["value"]
        if 0.8 <= ratio <= 1.25:
            return 0, ratio
        if 0.5 <= ratio <= 2.0:
            return 1, ratio
        return 2, ratio

    _LABEL = {0: "same", 1: "close", 2: "different", 3: "incomparable"}

    out = []
    for c in stocked:
        pr = prices.get(c["sku_id"], {})
        m = metrics.get(c["sku_id"], {})
        tier, ratio = _size(c)
        out.append({
            "sku_id": c["sku_id"], "name": c["name"], "brand": c.get("brand"),
            "final_price_krw": pr.get("final"), "on_promo": pr.get("on_promo", False),
            "discount_krw": pr.get("discount", 0), "stock_qty": c["stock_qty"],
            "repurchase_rate_pct": m.get("repurchase_rate_pct"),
            "personalized": c["sku_id"] in mine,   # 이 회원의 반복구매품이라는 표시
            "size_match": _LABEL[tier] if org_q else "unknown",
            "size_ratio": round(ratio, 2) if ratio else None,
            "_size_tier": tier,                    # 정렬용 — 반환 직전에 뺀다
        })
    # 사전식 정렬(㊽ 아님 — _better와 같은 튜플 비교 응용): "좋을수록 앞"이 되게
    # 참/거짓을 not으로 뒤집고(False < True라 not personalized가 참이면 뒤로 밀림),
    # 가격은 그대로(작을수록 앞), 재구매율은 -로 뒤집는다(클수록 앞).
    # ⚠ **크기가 행사보다 앞선다**(08-28 개정). 300ml 이 행사 중이어도 1L 의
    #   대체가 아니다 — 손님이 원한 것은 그 양이지 그 가격이 아니다.
    #   개인 반복구매는 크기보다 앞에 둔다: 그 손님이 늘 다른 용량을 사 왔다면
    #   그건 이미 그 사람의 선택이다.
    out.sort(key=lambda s: (not s["personalized"], s["_size_tier"], not s["on_promo"],
                            s["final_price_krw"] if s["final_price_krw"] is not None else float("inf"),
                            -(s["repurchase_rate_pct"] or 0)))
    for r in out:
        r.pop("_size_tier", None)
    return {"ok": True,
            "original": {"sku_id": sku_id, "name": org["name"],
                         "spec_quantity": org_q,
                         "lifecycle_status": org.get("lifecycle_status")},
            "substitutes": out,
            "ranking_rule": "개인 반복구매 > 규격 근사 > 행사 > 실판매가 > 재구매율",
            "read_as": ("size_match 가 same 이 아니면 **용량이 다르다는 사실을 "
                        "먼저 말하세요** — '1kg 은 없고 1.5kg 은 있어요'. "
                        "그 말 없이 값만 대면 손님이 같은 것으로 압니다. "
                        "unknown 은 규격 정보가 없어 못 견준 것이지 같다는 뜻이 "
                        "아닙니다.")}


# ── 디스패치 테이블 + 입구 (query.py와 같은 구조) ────────────────────────────
REGISTRY = {
    "optimize_route":   _optimize_route,
    "optimize_bundle":  _optimize_bundle,
    "compare_products": _compare_products,
    "find_substitutes": _find_substitutes,
    "compare_unit_price": _compare_unit_price,   # 08-27 실물화 — 계산 5/5
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
