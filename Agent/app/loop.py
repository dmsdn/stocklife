# ============================================================================
# StoreFlow 하네스 — 에이전트 루프 (두뇌의 통로 ①)
# ============================================================================
# [역할] 자연어 입력 하나를 받아, LLM이 도구를 골라 부르면 실행해 되먹이고,
#   더 부를 도구가 없어질 때까지 왕복한 뒤 최종 발화를 돌려준다.
#   "자연어 입력은 전부 여기"로 온다 — 반응형 채팅도, 자발형 개입의 문장 생성도.
#
# [왜 main.py(HTTP 층)와 분리하는가]
#   루프는 서버 없이도 돌 수 있어야 한다. 골든셋 러너(eval/)가 HTTP를 거치지
#   않고 run_chat()을 직접 불러 채점한다. 루프가 라우터 안에 있으면
#   평가할 때마다 서버를 띄워야 하고, 트레이스를 뽑을 구멍도 없다.
#
# [안 하는 일 — 경계]
#   · 사실 검증 → guard.py (이 파일은 원장을 "모으기만" 하고 넘긴다)
#   · 개입 판단 → watchers/ + etiquette.py
#   · HTTP 라우팅·세션 저장 → main.py / 백엔드
#
# [구조 한눈에]
#   run_chat()
#     ├─ action.set_consumer_id()      ← 요청의 주인 등록 (보안 설계의 완성)
#     ├─ (최대 MAX_TURNS번 반복)
#     │    ├─ LLM 호출 (도구 목록 = definitions.ALL_TOOLS)
#     │    ├─ 응답 블록 훑기: 발화 후보 / 웹 검색 결과 수확 / 도구 호출 목록
#     │    ├─ stop_reason이 tool_use가 아니면 → 발화 확정, 종료
#     │    └─ 도구 실행(_dispatch) → 결과를 원장에 적고 → 대화에 되먹임
#     └─ 한도 소진 시 → 강제 착지 (도구 금지로 한 번 더 불러 마무리 발화)
# ============================================================================
#
# ─── 개념 사전 — 이 파일에 처음 나오는 개념 11개 (㉙~㊳) ─────────────────────
# (①~㉘: sot_client·definitions·query·action·prompts 의 사전은 아는 것으로 전제)
#
# ㉙ SDK 클라이언트 객체와 지연 초기화(lazy init)
#    anthropic.Anthropic()은 API 호출용 "클라이언트"를 만든다 — 인증키·재시도·
#    연결 관리를 묶은 객체다. 모듈 최상단에서 만들지 않고 _get_client() 안에서
#    처음 쓸 때 한 번만 만드는(그 뒤엔 재사용) 이유 둘:
#    ① import만 하는 상황(골든셋 러너의 문법 검사, guard 단독 테스트)에서
#       API 키가 없어도 파일이 읽히게. ② 클라이언트는 한 번 만들어 재사용하는
#       물건이다(내부에 연결 풀이 있다). action.py의 httpx 함수 안 import와 같은 계열.
#
# ㉚ 대화는 "메시지 목록"이다
#    LLM API에 넘기는 대화는 [{"role": "user", "content": ...}, {"role":
#    "assistant", "content": ...}, ...] 형태의 리스트다. LLM은 상태가 없어서
#    매 호출마다 지금까지의 대화 전체를 다시 보내야 한다. content는 문자열이
#    아니라 **블록들의 리스트**일 수 있다 — 텍스트 블록, 도구 호출 블록,
#    도구 결과 블록이 한 메시지 안에 섞인다. 도구 왕복이란 결국
#    "assistant의 tool_use 블록 ↔ user의 tool_result 블록"을 목록에
#    번갈아 쌓는 일이다.
#
# ㉛ 점 표기 속성 접근 — SDK 응답은 dict가 아니라 객체다
#    우리 mock_data는 dict라 row["name"]으로 꺼냈지만, SDK가 돌려주는 응답은
#    클래스 인스턴스라 response.stop_reason, block.type 처럼 점으로 꺼낸다.
#    dict인지 객체인지에 따라 꺼내는 문법이 다르다는 것("[] vs .")을 알면
#    "왜 어떤 데는 대괄호고 어떤 데는 점인가"가 풀린다.
#
# ㉜ json.dumps — 파이썬 값을 JSON 문자열로
#    dict를 그대로 API에 못 싣는 자리(도구 결과의 content)에는 문자열로 바꿔
#    싣는다. json.dumps(d, ensure_ascii=False)의 ensure_ascii=False는
#    한글을 우유 같은 이스케이프가 아니라 "우유" 그대로 두라는 뜻 —
#    LLM이 읽을 텍스트라 사람이 읽는 형태가 토큰도 적고 정확하다.
#    (json.loads는 반대 방향: JSON 문자열 → 파이썬 값)
#
# ㉝ for ... else — "끝까지 돌았다"의 감지
#    for 루프에 else를 붙이면, break 없이 **끝까지 다 돈 경우에만** else가
#    실행된다. 여기서는 "MAX_TURNS 안에 발화로 끝나면 break, 한도가 다 차도록
#    발화가 안 나오면(else) 강제 착지"라는 두 갈래를 문법 하나로 가른다.
#    낯설지만 이 상황(한도 소진 감지)이 정확히 이 문법의 용도다.
#
# ㉞ 결과를 그 자리에서 dict로 만들어 돌려주기 — return {...}
#    return 뒤에 바로 중괄호를 쓰면, **그 순간 새 dict를 만들어 반환값으로 준다.**
#    미리 변수에 담았다가 돌려주는 것과 결과가 같고, 한 번만 쓸 값이라 이름을
#    붙이지 않는 것뿐이다:
#        d = {"ok": False}   →   return {"ok": False}
#        return d
#    이 파일(과 query·action)의 함수가 거의 다 이 모양인 데는 이유가 있다.
#    **실패를 예외로 던지지 않고 값으로 돌려주기로** 정했기 때문이다(query.py
#    존재 이유 ④). 성공도 dict, 실패도 dict라 부르는 쪽이 분기 없이 받는다.
#
# ㉟ getattr(객체, "이름", 기본값) — 속성을 문자열 이름으로 꺼내기
#    보통은 block.url 처럼 점으로 꺼내지만(㉛), 그 속성이 **없을 수도 있을 때**
#    점 표기는 AttributeError로 죽는다. getattr은 없으면 기본값을 준다:
#        getattr(item, "url", None)   ≒   item.url 이 있으면 그 값, 없으면 None
#    왜 여기서 필요한가: 웹 검색 결과 블록은 우리가 만든 게 아니라 앤트로픽이
#    주는 것이고, 검색 실패·형식 변경 시 모양이 달라질 수 있다. 남이 준 데이터의
#    속성을 점으로 확신하고 꺼내면, 그쪽이 바뀌는 날 우리 루프가 통째로 죽는다.
#
# ㊱ isinstance(값, 타입) — "이 값이 그 타입인가?"
#    isinstance(items, list) = items가 리스트면 True. type(x) == list 보다
#    이걸 쓰는 게 관례다(상속 관계까지 인정해서). 여기서는 getattr로 꺼낸 값이
#    정말 리스트인지 확인하고 나서 for로 돈다 — 리스트가 아닌 것을 for에 넣으면
#    엉뚱하게 돌거나(문자열은 글자 단위로 돈다!) TypeError가 난다.
#
# ㊲ range(N) — 0부터 N-1까지의 숫자 열
#    for turn in range(6): 은 turn이 0,1,2,3,4,5로 여섯 번 도는 것.
#    "몇 번 반복"을 표현하는 기본 문법이다. 목록을 도는 for(개념 ⑥의 list)와
#    달리 **횟수 자체가 목적**일 때 쓴다 — 여기서는 왕복 한도(MAX_TURNS)다.
#
# ㊳ append vs extend — 하나 넣기 / 여러 개 풀어 넣기
#    out.append(x)      → 리스트 끝에 x **하나**를 붙인다.
#    out.extend([a, b]) → 리스트 끝에 a, b를 **풀어서** 붙인다(2개 늘어남).
#    extend 자리에 append를 쓰면 리스트 안에 리스트가 들어가 [[a, b]]가 되고,
#    나중에 원장을 훑을 때 조용히 한 겹 어긋난다. 이 파일에서 웹 결과를 원장에
#    담을 때 extend를 쓰는 이유가 그것이다(결과가 여러 건이라).
# ────────────────────────────────────────────────────────────────────────────

import json

from app import config, prompts
from app.tools import action, compute, definitions, infer, query


# ── 계산·추론 스텁 ──────────────────────────────────────────────────────────
# 실행부가 아직 없는 것들. 스키마(definitions)에는 있어서 LLM이 고를 수 있으므로,
# 골랐을 때 "아직 준비 안 됨"을 **값으로** 돌려줘야 한다 — 조용히 빼면 LLM이
# unknown_tool을 맞고, 그렇다고 지어내게 둘 수도 없다. 실행부가 생기면 그 이름을
# 여기서 빼고 해당 REGISTRY로 옮긴다(아래 검산이 겹침·누락을 잡는다).
#
# 08-21 ai-server 인수로 계산 4종 중 3종(route·bundle·substitutes)이 compute.py
# 실물로 옮겨 갔다. compare_unit_price만 남은 이유: 규격 파서(08/27 예정)가
# 없이는 "100ml당"의 분모를 만들 수 없다 — 파서 없는 단위가격은 지어낸 숫자다.
#
# frozenset = 수정 불가능한 집합(개념 ⑥의 set 중 못 바꾸는 판). 왜 set인가:
# `name in _COMPUTE_STUB` 검사가 즉시 끝나기 때문이다(리스트면 처음부터 훑는다).
# 왜 frozen인가: 이건 **고정된 명단**이지 실행 중에 늘었다 줄었다 할 것이 아니라서,
# 실수로 .add()를 부르면 그 자리에서 에러가 나는 편이 낫다.
_COMPUTE_STUB = frozenset({
    "compare_unit_price",
})
# 추론 5종은 08-25에 `tools/infer.py`가 생기며 **스텁을 벗었다.**
# 다만 "실물이다"와 "답할 수 있다"는 다르다 — infer가 자산 유무·입력 가용성을
# 스스로 보고 error를 돌려준다(가용예측은 큐 창구가 없어 아직 못 답한다).
# 그래서 여기서 갈라 두지 않고 **레지스트리 하나로** 보낸다.
_INFER_STUB = frozenset()

# ── 자체 검산: 우리 도구 23 전부에 실행 경로(실물 또는 스텁)가 있는가 ─────────
# definitions에 선언만 있고 실행부가 없는 도구가 생기면, LLM이 그걸 고르는 순간
# unknown_tool로 착지가 이상해진다. 조용히 망가지는 유형이라 import 시점에 잡는다.
# set(어떤_dict) = 그 dict의 **키만** 모은 집합. |는 합집합(둘을 합친 집합).
# 즉 "실행 경로가 있는 도구 이름 전부"를 한 덩어리로 만든 것.
_EXECUTABLE = (set(query.REGISTRY) | set(compute.REGISTRY) | set(action.REGISTRY)
               | _COMPUTE_STUB | set(infer.REGISTRY))
# 집합 컴프리헨션(개념 ⑭): TOOLS 목록의 각 스키마에서 "name" 값만 뽑아 집합으로.
_DECLARED = {t["name"] for t in definitions.TOOLS}
assert _EXECUTABLE == _DECLARED, \
    f"선언과 실행 경로 불일치: 선언만 {_DECLARED - _EXECUTABLE} / 실행만 {_EXECUTABLE - _DECLARED}"
assert not _COMPUTE_STUB & (set(query.REGISTRY) | set(compute.REGISTRY)
                            | set(action.REGISTRY) | set(infer.REGISTRY)), \
    "스텁과 실물 레지스트리에 같은 이름이 있다 — 실물이 생겼으면 스텁에서 빼라"


# ── 프롬프트 캐싱 (08-21 ai-server 인수 — agent_chat.py의 cache_control) ────
# LLM API는 "요청의 앞부분이 직전 요청과 완전히 같으면" 그 부분의 처리 결과를
# 재사용(캐시)할 수 있는데, 공짜가 아니라 **우리가 경계 표시를 찍어야** 한다.
# cache_control이 그 표시다: 이 항목까지가 캐시 단위라는 뜻.
# 도구 23개의 스키마는 요청마다 완전히 같으므로 캐싱의 이상적 대상이다 —
# 매 왕복(한 대화에 최대 6번)마다 같은 스키마 수천 토큰을 다시 읽히는 값을 아낀다.
#
# 표시는 우리 도구의 마지막 항목에 찍는다(서버 도구는 형식이 달라 안 찍는다 —
# 캐시 경계 뒤에 남는 건 서버 도구 선언 하나뿐이라 손해가 미미하다).
# [dict(t) for t in …] 로 얕은 복사를 뜨는 이유: definitions.ALL_TOOLS 원본에
# 키를 꽂으면 definitions의 검산("키는 name·description·input_schema 셋뿐")과
# 충돌하고, 무엇보다 선언 파일이 실행 중에 변형되는 것 자체가 사고의 씨앗이다.
_CACHED_TOOLS = [dict(t) for t in definitions.ALL_TOOLS]
_CACHED_TOOLS[len(definitions.TOOLS) - 1] = {
    **_CACHED_TOOLS[len(definitions.TOOLS) - 1],
    "cache_control": {"type": "ephemeral"},
}


# ── LLM 클라이언트 (개념 ㉙) ────────────────────────────────────────────────
_client = None          # 모듈 상태 — 처음 쓸 때 채워지고 그 뒤엔 재사용


def _get_client():
    """anthropic 클라이언트를 처음 한 번만 만들어 돌려준다.

    import를 함수 안에서 하는 이유는 action.py의 httpx와 같다 — 패키지나
    API 키(ANTHROPIC_API_KEY 환경변수) 없이도 이 모듈이 import되게.
    골든셋 러너가 _dispatch만 검사할 때 LLM 호출부는 필요 없다.
    """
    global _client                       # ㉕: 모듈 상태 _client를 바꾸겠다는 선언
    if _client is None:
        import anthropic                 # 키는 SDK가 환경변수에서 스스로 읽는다
        _client = anthropic.Anthropic()
    return _client


# ── 도구 실행 + 출처 판정 ───────────────────────────────────────────────────

def _dispatch(name: str, tool_input: dict) -> tuple[dict, str]:
    """도구 하나를 실행하고 (결과, 출처)를 돌려준다.

    출처(source)는 가드의 원장 칸 이름이다(설계서 §6.6.1):
      · 조회 10 → "sot"   — 매장 사실. 가격·재고·위치·지표는 여기서만 나올 수 있다
      · 액션 3  → "sot"   — 담기 결과(장바구니 상태)도 백엔드가 확인해준 매장 사실
      · 계산 5  → "compute" / 추론 5 → "infer"
    웹 검색은 여기 안 온다 — 서버 도구는 앤트로픽이 실행하므로 우리 디스패치에
    도착하지 않고, 결과 블록을 응답에서 수확해 "web" 원장에 적는다(run_chat).
    """
    # `name in REGISTRY` = dict의 **키 중에** 그 이름이 있는지 확인(개념 ⑥).
    # 값이 아니라 키를 본다 — REGISTRY는 {도구이름: 함수} 표이기 때문(개념 ⑲).
    if name in query.REGISTRY:
        # query.run이 인자 정화·예외 흡수까지 다 한다 — 여기서 중복하지 않는다.
        # return이 값 두 개를 쉼표로 돌려주면 파이썬은 그걸 튜플로 묶는다(개념 ⑥).
        # 받는 쪽에서 `result, source = _dispatch(...)`로 한 번에 풀어 쓴다.
        return query.run(name, tool_input), "sot"

    if name in compute.REGISTRY:
        # compute.run도 예외 흡수·bad_arguments 변환을 스스로 한다(그 파일의 입구).
        # 출처는 "compute" — 가드가 이 원장의 숫자(총액·순서·거리)를 발화와 대조한다.
        return compute.run(name, tool_input), "compute"

    if name in action.REGISTRY:
        try:                                        # 개념 ⑱
            # REGISTRY[name] = 함수 자체를 꺼낸 것(개념 ⑲). 뒤에 (**tool_input)을
            # 붙여야 비로소 실행된다. **는 dict를 낱개 인자로 푸는 것(개념 ⑰).
            return action.REGISTRY[name](**tool_input), "sot"
        except TypeError as e:
            # LLM이 필수 인자를 빠뜨린 경우 (query.run과 같은 처리를 여기서).
            # str(e)는 예외 객체가 담고 있는 설명 문장을 문자열로 꺼내는 것 —
            # 그걸 그대로 LLM에게 돌려줘야 무엇이 모자랐는지 알고 다시 부른다.
            return {"ok": False, "error": "bad_arguments", "message": str(e)}, "sot"

    if name in _COMPUTE_STUB:
        return {"error": "not_implemented",
                "message": f"{name}은(는) 아직 준비 중인 기능입니다. "
                           "이 기능 없이 답할 수 있는 부분만 답하세요."}, "compute"
    if name in infer.REGISTRY:
        # 추론 결과의 출처는 항상 "infer"다. 가드의 원장은 **매장 사실을 sot에서만**
        # 인정하므로 이 값으로 "재고가 있다/없다"를 주장할 수 없다(설계서 §6.6.1).
        return infer.run(name, tool_input), "infer"

    # 스키마에 없는 이름을 LLM이 지어낸 경우(환각) — 드물지만 값으로 되돌린다
    return {"error": "unknown_tool", "message": f"'{name}'은 없는 도구입니다."}, "sot"


def _harvest_web_results(block) -> list[dict]:
    """웹 검색 결과 블록에서 (url, 제목)만 뽑아 원장용으로 다듬는다.

    전문(全文)이 아니라 url·제목만 적는 이유: 원장은 "LLM이 어떤 출처를
    봤는가"의 장부지 본문 보관소가 아니다. 가드는 '웹에서 온 사실이 매장
    사실 자리에 쓰였나'를 보면 되고, 그 판정에 본문 전체는 필요 없다.
    getattr(x, "url", None)은 속성이 없으면 None을 주는 안전한 접근(개념 ⑤의
    None 관례) — 검색 실패 블록 등 모양이 다른 블록이 와도 죽지 않는다.
    """
    # block.content를 안전하게 꺼낸다(㉟). 점 표기(block.content)로 꺼내면
    # 그 속성이 없는 블록이 왔을 때 AttributeError로 루프 전체가 죽는다.
    items = getattr(block, "content", None)

    # 꺼낸 값이 정말 리스트인지 확인(㊱). 검색이 실패하면 content 자리에
    # 에러 객체나 문자열이 올 수 있는데, 문자열을 for로 돌면 **글자 하나씩**
    # 돌아버려 엉뚱한 원장이 쌓인다. 아니면 빈 리스트로 조용히 착지한다.
    if not isinstance(items, list):
        return []                     # ㉞: 빈 목록을 값으로 돌려준다(예외 아님)

    out = []                          # 결과를 모을 빈 리스트
    for item in items:                # 검색 결과 한 건씩
        url = getattr(item, "url", None)
        if url:                       # url이 없는 항목(광고·안내 블록 등)은 건너뛴다
            # 원장 한 줄 = {url, title} dict 하나(㉞). title도 없을 수 있어 getattr.
            out.append({"url": url, "title": getattr(item, "title", None)})   # ㊳
    return out


# ── 루프 본체 ───────────────────────────────────────────────────────────────

def run_chat(message: str,
             consumer_id: int | None = None,
             session_id: str | None = None,
             history: list[dict] | None = None,
             allow_actions: bool = True,
             position: tuple[int, int, int] | None = None) -> dict:
    """자연어 입력 하나를 대화 한 번으로 완주시킨다. main.py가 부르는 유일한 입구.

    [입력]
      message     : 사용자 발화 (프론트 → 백엔드 → 우리)
      consumer_id : 백엔드가 JWT로 확인해 넘겨준 회원 번호. 비회원이면 None
      session_id  : 채팅 세션 식별자 (트레이스에 남긴다)
      history     : 이전 대화 [{"role": "user"|"assistant", "content": str}, ...]
                    — 백엔드 DTO 계약상 최대 20건. 방어적으로 뒤에서 자른다
      allow_actions: False면 액션 도구(장바구니 3종)를 **실행하지 않고** 값 오류로
                    되돌린다. 자발형 개입(감시자 → 이 함수)의 안전장치다(08-24 검수).
                    왜 프롬프트 금지만으로 부족한가 — 프롬프트는 지침이지 장벽이
                    아니다. LLM이 무시하고 add_to_cart를 부르면 실행은 즉시
                    일어나고, 그 뒤 가드가 발화를 버려도 **장바구니는 이미 바뀐
                    뒤**다. 반응형은 정책 ⓒ("actions 있으면 재생성 금지")가 이
                    비대칭을 막지만 자발형엔 그 방어가 없었다. 손님이 시키지 않은
                    상태 변경은 헌법 10의 정신(개입은 말까지) 위반이라, 구조로
                    막는다 — B안과 같은 계열(지침이 아니라 경로를 잠근다).
      position    : 현재 위치 (층, x, y). 호출자가 마지막 스캔 좌표를 넘긴다.
                    모르면 None — 경로 도구가 되묻는다. 나중에 infer.py의 위치
                    추정이 서면 **더 정확한 값이 같은 창구로** 들어온다.
    [출력] dict:
      reply   : 최종 발화 (가드 통과 전 — guard.py가 이걸 받아 검사한다)
      actions : 이번 대화에서 실행된 상태 변경 목록 (프론트 화면 갱신용, B안)
      ledgers : 출처별 사실 원장 {"sot": [...], "compute": [...], "infer": [...], "web": [...]}
      trace   : 왕복 기록 (골든셋 채점·디버깅의 재료)
    """
    # ① 이 요청의 주인을 등록한다. 액션의 consumer_id도, 조회·추론의
    #    member_id·session_id도 LLM이 아니라 여기서 주입된다 — definitions의
    #    해당 스키마에 그 칸들이 없는 이유의 완성(B안 확장, 08-20).
    action.set_consumer_id(consumer_id)
    query.set_identity(consumer_id, session_id)
    # 위치도 같은 부류다(08-25). LLM이 좌표를 옮겨 적게 두지 않는다 —
    # optimize_route의 start_* 칸은 남아 있지만 **비우는 것이 기본**이고
    # compute._resolve_start가 이 값을 채운다. 자세히는 compute.py의 주입 블록.
    # position이 None이면 등록도 None — 그 경우 경로 도구가 "위치를 모른다"고
    # 답하고, 손님에게 되묻는다(입구를 추측하지 않는다).
    compute.set_position(*(position or (None, None, None)))

    # ② 대화 목록 조립 (개념 ㉚). history는 프론트가 보낸 그대로 받되
    #    뒤에서 20건만 — 오래된 대화보다 최근 대화가 판단에 중요하다(query.py의
    #    이력 자르기와 같은 방향 감각).
    # `history or []` = history가 None이면 빈 리스트를 쓴다는 관용구.
    #   파이썬은 None·빈 리스트를 "거짓"으로 보므로, or의 왼쪽이 거짓이면
    #   오른쪽 값이 된다. `if history is None: history = []`를 한 줄로 쓴 것.
    # list(...)로 새 리스트를 만드는 이유: 부르는 쪽이 준 리스트를 우리가 직접
    #   고치면 **남의 물건을 몰래 바꾸는 것**이 된다(같은 리스트를 공유하므로).
    # [-20:]는 뒤에서 20개(개념 ⑳의 음수 판) — 최근 대화가 판단에 중요하다.
    messages = list(history or [])[-20:]
    messages.append({"role": "user", "content": message})   # 이번 발화를 맨 뒤에

    # 회원·세션의 **존재 여부만** 프롬프트에 알린다(번호는 안 싣는다 —
    # 신원값은 위 ①의 주입 경로로만 흐른다). 이게 없으면 비회원인데 이력
    # 기반 계획을 세웠다가 no_member를 맞고 되돌아오는 왕복이 낭비된다.
    system_prompt = prompts.build_system_prompt(
        is_member=consumer_id is not None,
        has_session=session_id is not None,
    )
    # 시스템 프롬프트도 캐시 표시를 찍는다(모듈 위 _CACHED_TOOLS 주석 참조).
    # 문자열 대신 "블록 리스트" 형태로 넘겨야 표시를 찍을 자리가 생긴다.
    # 프롬프트는 (회원 여부 × 세션 여부) 4가지 판뿐이라 판마다 따로 캐시가 잡힌다.
    system_blocks = [{"type": "text", "text": system_prompt,
                      "cache_control": {"type": "ephemeral"}}]

    # ③ 이번 대화의 장부들. 함수 안 지역 변수인 이유: 요청마다 새로 시작해야
    #    한다. 모듈 전역에 두면 앞 사람의 원장이 다음 사람에게 새어 들어간다.
    ledgers = {"sot": [], "compute": [], "infer": [], "web": []}
    actions_done = []           # 실행된 액션 (프론트에 돌려줄 것)
    trace = []                  # 턴별 기록
    reply = None

    client = _get_client()

    for turn in range(config.MAX_TURNS):                      # 개념 ㉝의 for
        # ── LLM 호출. 매번 도구 전체(우리 23 + 웹 검색)를 준다.
        # 대화에 tool_use 블록이 쌓인 뒤에는 tools 없이 부르면 API가 거부하므로
        # 도구 목록은 왕복 내내 동일하게 유지한다. _CACHED_TOOLS = ALL_TOOLS에
        # 캐시 경계 표시를 찍은 복사본(모듈 위) — 내용은 같다.
        response = client.messages.create(
            model=config.LLM_MODEL,
            max_tokens=config.LLM_MAX_TOKENS,
            system=system_blocks,
            messages=messages,
            tools=_CACHED_TOOLS,
        )

        # LLM의 응답을 그대로 대화에 쌓는다 — 다음 호출 때 LLM이 자기가
        # 어떤 도구를 왜 불렀는지 기억하는 유일한 방법이다(LLM은 무상태).
        messages.append({"role": "assistant", "content": response.content})

        # ── 응답 블록 훑기 (개념 ㉛: SDK 객체라 점으로 접근)
        # 한 응답 안에 여러 블록이 섞여 온다(개념 ㉚). 블록마다 type이 있고,
        # 그 type에 따라 우리가 할 일이 갈린다 — 그래서 if/elif 분류가 된다.
        last_text = None        # 이번 턴의 발화 후보(없으면 None)
        text_parts = []         # 한 응답의 text 블록 조각들 — 순서대로 모은다
        tool_calls = []         # 이번 턴에 LLM이 요청한 "우리" 도구들
        for block in response.content:
            if block.type == "text":
                # 덮어쓰지 않고 **모은다**. 한 응답에 text 블록이 여럿 올 수 있고
                # (서버 도구·인용이 끼면 흔하다), 덮어쓰면 앞 조각이 통째로 사라진다.
                # 블록 경계는 낱말 한가운데에도 떨어지므로("6,900원" | "으로 가장
                # 저렴하고") 구분자 없이 붙여야 원문이 복원된다.
                text_parts.append(block.text)
                last_text = "".join(text_parts)
            elif block.type == "web_search_tool_result":
                # 서버 도구의 결과는 이미 응답 안에 들어 있다(앤트로픽이 실행).
                # 우리는 실행할 게 없고, 출처 장부에 적기만 한다.
                # 결과가 **여러 건**이라 append가 아니라 extend다(㊳).
                ledgers["web"].extend(_harvest_web_results(block))
            elif block.type == "tool_use":
                if block.name in definitions.SERVER_TOOL_NAMES:
                    # continue = 이번 항목은 건너뛰고 for의 다음 바퀴로.
                    # 방어선: 서버 도구가 이 타입으로 오면 우리가 실행하려 들면 안 된다
                    continue
                tool_calls.append(block)        # 블록 하나를 통째로 보관(㊳)
            # server_tool_use(검색어 블록) 등 나머지 타입은 기록 대상 아님

        # 이번 턴의 기록 한 줄. [b.name for b in tool_calls]는 리스트 컴프리헨션
        # (개념 ⑬) — 블록 목록에서 이름만 뽑아 새 리스트로. 트레이스에는 블록
        # 통째가 아니라 이름만 남긴다(골든셋이 채점하는 것이 "도구 시퀀스"라서).
        trace.append({"turn": turn, "stop_reason": response.stop_reason,
                      "tools": [b.name for b in tool_calls],
                      "web_results": len(ledgers["web"])})   # len() = 개수

        # ── 종료 판정. stop_reason이 "tool_use"면 LLM이 도구 결과를 기다리는
        # 중이고, 그 외("end_turn" 등)면 발화로 끝냈다는 뜻이다.
        if response.stop_reason != "tool_use":
            reply = last_text
            break

        # ── 도구 실행 → 결과를 원장에 적고 대화에 되먹인다.
        # 한 턴에 여러 도구를 요청할 수 있어(병렬 호출) 전부 실행해 모은다.
        results_content = []
        for call in tool_calls:
            # _dispatch는 값 두 개를 돌려준다 → 쉼표로 한 번에 받아 푼다(언패킹).
            # dict(call.input)로 새 dict를 뜨는 이유: SDK가 준 객체를 그대로
            # 원장에 넣으면 나중에 SDK 쪽이 바뀔 때 원장까지 흔들린다. 우리 장부에는
            # 우리가 만든 평범한 dict만 남긴다.
            if not allow_actions and call.name in action.MUTATING_TOOLS:
                # 실행 전에 막는다 — _dispatch까지 가면 이미 백엔드 호출이다.
                # 오류를 값으로 돌려주는 이유는 query.run 원칙 ④와 같다:
                # LLM이 이 결과를 보고 "담아드릴까요?"라는 제안으로 착지한다.
                result, source = {"ok": False, "error": "actions_not_allowed",
                                  "message": "자발형 개입에서는 장바구니를 조작할 수 "
                                             "없습니다. 실행하지 말고 제안만 하세요."}, "sot"
            else:
                result, source = _dispatch(call.name, dict(call.input))
            # ledgers[source] = 4칸 중 이번 출처 칸을 골라, 그 리스트에 한 줄 추가.
            # 칸 이름이 문자열로 오므로 dict를 대괄호로 골라내는 것(개념 ⑥).
            ledgers[source].append({"tool": call.name,
                                    "input": dict(call.input),
                                    "result": result})
            # 상태를 바꾼 액션은 성공했을 때만 프론트에 알린다 — 실패한 담기를
            # 알리면 화면이 없는 항목을 그리려 든다.
            # result.get("ok") = dict에서 "ok" 키를 꺼내되 **없으면 None**을 준다.
            # result["ok"]로 꺼내면 조회 도구 결과처럼 그 키가 아예 없는 dict에서
            # KeyError로 죽는다. .get은 "있으면 값, 없으면 없음"이라 안전하다.
            if call.name in action.MUTATING_TOOLS and result.get("ok"):
                actions_done.append({"type": call.name, "input": dict(call.input)})
            results_content.append({
                "type": "tool_result",
                "tool_use_id": call.id,     # 어느 호출의 답인지 짝을 맞추는 표
                "content": json.dumps(result, ensure_ascii=False),   # 개념 ㉜
            })
        messages.append({"role": "user", "content": results_content})

    else:                                                     # 개념 ㉝: 한도 소진
        # ── 강제 착지. MAX_TURNS를 다 쓰고도 발화가 안 나왔다 — 도구를 더 주면
        # 계속 부를 수 있으므로, tool_choice로 도구 사용을 막고 한 번만 더 불러
        # "지금까지 결과로 마무리"를 강제한다. 무한 왕복(비용·지연 폭주)의 방어선.
        messages.append({"role": "user", "content":
                         "(도구 사용 한도에 도달했습니다. 지금까지의 도구 결과만으로 "
                         "간결히 마무리해 주세요. 확인 못 한 것은 모른다고 말하세요.)"})
        response = client.messages.create(
            model=config.LLM_MODEL,
            max_tokens=config.LLM_MAX_TOKENS,
            system=system_blocks,
            messages=messages,
            tools=_CACHED_TOOLS,                  # 대화에 tool 블록이 있어 목록은 필수
            tool_choice={"type": "none"},         # 단, 이번 턴엔 못 쓰게 잠근다
        )
        # 여기도 같은 이유로 이어 붙인다(위 text_parts 주석 참조).
        landing_parts = [b.text for b in response.content if b.type == "text"]
        if landing_parts:
            reply = "".join(landing_parts)
        trace.append({"turn": config.MAX_TURNS, "stop_reason": "forced_landing",
                      "tools": [], "web_results": len(ledgers["web"])})

    return {
        "reply": reply or "죄송합니다, 지금은 답변을 만들지 못했습니다.",
        "actions": actions_done,
        "ledgers": ledgers,
        "trace": trace,
        "session_id": session_id,
    }
