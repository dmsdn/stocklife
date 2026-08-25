# ===============================================
# Agent 하네스 - Agent 루프
# ===============================================

# "LLM은 함수를 실행할 수 없다." 도구 19개를 스키마로 보여줘도 LLM이 할 수 있는 것은  "get_inventory를 sku_id=101042로 불러줘"라고 말하는 것까지가 전부
# 실제로 부르고, 결과를 다시 물어다 주는 심부름꾼이 필요함 (loop.py)

# [역할] 자연어 입력을 받아, LLM이 도구를 골라 부르면 실행해 되먹이고, 더 부를 도구가 없어질 때까지 왕복한 뒤 최종 발화를 돌려줌
# 자연어 입력이 전부 이 파일로 옴(반응형 채팅 + 자발형 개입의 문장생성)

# [main.py(HTTP 층)와 분리하는 이유]
# 루프는 서버 없이도 돌 수 있어야 함. 골든셋 러너(eval/)가 HTTP를 거치지 않고 run_chat()을 직접 불러 채점
# 루프가 라우터 안에 있으면 평가할 때마다 서버를 띄워야 하고, 트레이스를 뽑을 구멍도 없음

# [구조 한눈에]
#   run_chat()
#     ├─ action.set_consumer_id()      ← 요청의 주인 등록 (보안 설계의 완성)
#     ├─ (최대 MAX_TURNS번 반복)
#     │    ├─ LLM 호출 (도구 목록 = definitions.ALL_TOOLS)
#     │    ├─ 응답 블록 훑기: 발화 후보 / 웹 검색 결과 수확 / 도구 호출 목록
#     │    ├─ stop_reason이 tool_use가 아니면 → 발화 확정, 종료
#     │    └─ 도구 실행(_dispatch) → 결과를 원장에 적고 → 대화에 되먹임
#     └─ 한도 소진 시 → 강제 착지 (도구 금지로 한 번 더 불러 마무리 발화)

# ===============================================

import json

from app import config, prompts
from app.tools import definitions, query, compute, action

# ===============================================

# 계산 및 추론 스텁
# 실행부가 아직 없는 9종. 스키마(definitions)에는 있어서 LLM이 고를 수 있으므로,  골랐을 때 "아직 준비 안 됨"을 **값으로** 돌려줘야 함
# 실행중에 증감되는 집합이 아니기 때문에 frozenset
# 조용히 빼면 LLM이 unknown_tool을 맞고, 그렇다고 지어내게 둘 수도 없다. C단계에서 compute.py / infer.py 가 생기면 이 집합은 비고, 아래 _dispatch의 스텁 분기가 안 타게 됨
_COMPUTE_STUB = frozenset({
    "compare_unit_price"
})
_INFER_STUB = frozenset({
    "predict_availability", "predict_repurchase", "get_position",
    "match_preferences", "identify_product_photo",
})

# ===============================================

# 자체 검산: 도구 23전부에 실행경로(or 스텁)가 있는가
# definitions에 선언만 있고 실행부가 없는 도구가 생기면, LLM이 그걸 고르는 순간 unknown_tool로 착지가 이상해짐. 조용히 망가지는 유형이므로 import시점에 잡음

# set(특정_dict): 그 dict의 키만 모은 집합이 됨
_EXECUTABLE = (set(query.REGISTRY) | set(compute.REGISTRY) | set(action.REGISTRY) | _COMPUTE_STUB | _INFER_STUB)
_DECLARED = {t["name"] for t in definitions.TOOLS}

assert _EXECUTABLE == _DECLARED, f"선언과 실행 경로 불일치: 선언만 {_DECLARED - _EXECUTABLE} / 실행만 {_EXECUTABLE - _DECLARED}"
assert not (_COMPUTE_STUB | _INFER_STUB) & (set(query.REGISTRY) | set(compute.REGISTRY)
                                            | set(action.REGISTRY)), \
    "스텁과 실물 레지스트리에 같은 이름이 있다 — 실물이 생겼으면 스텁에서 빼라"

# ===============================================

# ── 프롬프트 캐싱 ( agent_chat.py의 cache_control) ────
# LLM API는 "요청의 앞부분이 직전 요청과 완전히 같으면" 그 부분의 처리 결과를 재사용(캐시)할 수 있는데, 공짜가 아니라 **우리가 경계 표시를 찍어야** 한다.
# cache_control이 그 표시다: 이 항목까지가 캐시 단위라는 뜻.
# 도구 23개의 스키마는 요청마다 완전히 같으므로 캐싱의 이상적 대상이다 — 매 왕복(한 대화에 최대 6번)마다 같은 스키마 수천 토큰을 다시 읽히는 값을 아낀다.

# 표시는 우리 도구의 마지막 항목에 찍는다(서버 도구는 형식이 달라 안 찍는다 — 캐시 경계 뒤에 남는 건 서버 도구 선언 하나뿐이라 손해가 미미하다).
# [dict(t) for t in …] 로 얕은 복사를 뜨는 이유: definitions.ALL_TOOLS 원본에 키를 꽂으면
# definitions의 검산("키는 name·description·input_schema 셋뿐")과 충돌하고, 무엇보다 선언 파일이 실행 중에 변형되는 것 자체가 사고의 씨앗이다.
_CACHED_TOOLS = [dict(t) for t in definitions.ALL_TOOLS]
_CACHED_TOOLS[len(definitions.TOOLS) - 1] = {
    **_CACHED_TOOLS[len(definitions.TOOLS) - 1],
    "cache_control": {"type": "ephemeral"},
}

# LLM 클라이언트

_client = None


def _get_client():
    global _client
    if _client is None:
        import anthropic
        # API호출을 담당하는 객체를 만듦
        _client = anthropic.Anthropic()
    return _client


# ===============================================
# 도구 실행 + 출처 판정

# 이름을 실행으로 바꾸는 통역기
# return 튜플의 두번째 값이 이 함수의 진짜 존재 이유 "출처라벨"
# "sot": 도구유형[조회7·액션3] ⇒ 매장 사실: 가격·재고·위치는 여기서만 나올 수 있음
# "compute": 도구유형[계산4] ⇒ 단위가격·방문순서
# "infer": 도구유형[추론5] ⇒ "보충 확률·재구매 시점"
# "web": 도구유형[웹검색] ⇒ "이 함수에 오지 않음, 응답블록에서 수확"
def _dispatch(name: str, tool_input: dict) -> tuple[dict, str]:
    if name in query.REGISTRY:
        return query.run(name, tool_input), "sot"

    if name in compute.REGISTRY:
        # compute.run도 예외 흡수·bad_arguments 변환을 스스로 한다(그 파일의 입구).
        # 출처는 "compute" — 가드가 이 원장의 숫자(총액·순서·거리)를 발화와 대조한다.
        return compute.run(name, tool_input), "compute"

    if name in action.REGISTRY:
        try:
            # REGISTRY[name]은 함수 자체를 꺼낸 것, 뒤에 (...)를 붙여야 실행됨. **은 dict를 낱개 인자로 푸는 것
            return action.REGISTRY[name](**tool_input), "sot"
        except TypeError as e:
            return {"ok": False, "error": "bad_arguments", "message": str(e)}, "sot"

    if name in _COMPUTE_STUB:
        return {"error": "not_implemented", "message": f"{name}은(는) 아직 준비 중인 기능입니다. " "이 기능 없이 답할 수 있는 부분만 답하세요."}, "compute"
    if name in _INFER_STUB:
        return {"error": "not_implemented", "message": f"{name}은(는) 아직 준비 중인 기능입니다. " "이 기능 없이 답할 수 있는 부분만 답하세요."}, "infer"

    return {"error": "unknown_tool", "message": f"'{name}'은 없는 도구입니다."}, "sot"

# 웹에서 받은 데이터 다루기
def _harvest_web_results(block) -> list[dict]:
    items = getattr(block, "content", None)
    if not isinstance(items, list):
        return []
    out = []
    for item in items:
        # url:LLM이 어떤 출처를 봤는가 (본문 보관 X)
        url = getattr(item, "url", None)
        if url:
            out.append({"url": url, "title": getattr(item, "title", None)})
    return out


# ===============================================

# 루프 본체

def run_chat(message: str,
             consumer_id: int | None = None,
             session_id: str | None = None,
             history: list[dict] | None = None,
             allow_actions: bool = True,
             position: tuple[int, int, int] | None = None) -> dict:

    # 요청의 주인을 등록. 액션도구의 consumer_id는 LLM이 아닌 여기서 주입 (보안설계)
    action.set_consumer_id(consumer_id)
    query.set_identity(consumer_id, session_id)
    # 위치도 같은 부류다(08-25). LLM이 좌표를 옮겨 적게 두지 않는다 —
    # optimize_route의 start_* 칸은 남아 있지만 **비우는 것이 기본**이고
    # compute._resolve_start가 이 값을 채운다. 자세히는 compute.py의 주입 블록.
    # position이 None이면 등록도 None — 그 경우 경로 도구가 "위치를 모른다"고
    # 답하고, 손님에게 되묻는다(입구를 추측하지 않는다).
    compute.set_position(*(position or (None, None, None)))

    #대화목록 조립 .history는 프론트가 보낸 그대로 받되, 뒤에서 20건만 추출
    messages = list(history or [])[-20:]            # history가 None이면 빈리스트를 사용 / 새로운 리스트를 생성: 부르는 쪽이 준 리스트를 여기서 직접 고치면 남의 물건을 몰래 바꾸는 것이 됨
    messages.append({"role": "user", "content": message})

    system_prompt = prompts.build_system_prompt(
        is_member=consumer_id is not None,
        has_session=session_id is not None,
    )

    # 시스템 프롬프트도 캐시 표시를 찍는다(모듈 위 _CACHED_TOOLS 주석 참조).
    # 문자열 대신 "블록 리스트" 형태로 넘겨야 표시를 찍을 자리가 생긴다.
    # 프롬프트는 (회원 여부 × 세션 여부) 4가지 판뿐이라 판마다 따로 캐시가 잡힌다.
    system_blocks = [{"type": "text", "text": system_prompt,
                      "cache_control": {"type": "ephemeral"}}]

    # 이번 대화의 장부들. 함수 안 지역 변수인 이유: 요청마다 새로 시작해야 함. 모듈 전역에 두면 앞 사람의 원장이 다음 사람에게 새어들어감.
    ledgers = {"sot": [], "compute": [], "infer": [], "web": []}
    actions_done = []
    trace = []
    reply = None

    client = _get_client()

    for turn in range(config.MAX_TURNS):
        # client.messages.create(...)가 실제 LLM API 호출. 매번 도구 전체(ALL_TOOLS)를 줌.
        # 대화에 tool_use 블록이 쌓인 뒤에는 tools없이 부르면 API가 거부하므로, 도구 목록은 왕복 내내 동일하게 유지
        response = client.messages.create(
            model=config.LLM_MODEL,
            max_tokens=config.LLM_MAX_TOKENS,
            system=system_blocks,
            messages=messages,
            tools=_CACHED_TOOLS,
        )

        # LLM의 응답을 그대로 발화에 쌓음: 다음 호출 때 LLM이 자기가 어떤 도구를 왜 불렀는지 기억하는 유일한 방법
        # response.content는 한 턴의 답변 조각들 ⇒ 매번 새 봉투
        # messages가 지금까지의 모든 턴의 대화 전체 ⇒ 턴마다 쌓임
        # ① LLM이 방금 한 말을 대화에 기록
        messages.append({"role": "assistant", "content": response.content})

        # 응답 블록 훑기
        # 한 응답(LLM 1번 호출) 안에 여러 블록이 섞여 들어올 수 있는데, 블록 마다 type이 있고, 그 type에 따라 할 일이 갈림
        last_text = None
        text_parts = []                 # 한 응답의 text 블록 조각들(순서대로)
        tool_calls = []
        for block in response.content:
            if block.type == "text":
                # 덮어쓰지 않고 모은다. 블록 경계가 낱말 한가운데("6,900원"|"으로")에
                # 떨어지므로 구분자 없이 붙여야 원문이 복원된다.
                text_parts.append(block.text)
                last_text = "".join(text_parts)
            elif block.type == "web_search_tool_result":
                ledgers["web"].extend(_harvest_web_results(block))          # append를 쓰면 리스트안에 리스트가 들어감. 검색결과가 여러건이므로 extend 사용
            elif block.type == "tool_use":
                if block.name in definitions.SERVER_TOOL_NAMES:            # 서버도구가 이 타입으로 들어오면 여기서 실행하면 안 되므로 continue
                    continue
                tool_calls.append(block)

        # 이번 턴의 기록 한 줄. 블록 목록에서 이름만 뽑아 새 리스트로 만듦. 트레이스에는 블록 통째가 아닌 이름만 남김
        trace.append({"turn": turn, "stop_reason": response.stop_reason,
                      "tools": [b.name for b in tool_calls],
                      "web_results": len(ledgers["web"])})

        # 종료 판정: stop_reason이 "tool_use"면 LLM이 도구 결과를 기다리는 중이고, 그 외면 발화로 끝냈다는 뜻
        if response.stop_reason != "tool_use":
            reply = last_text
            break

        # 도구 실행: 결과를 원장에 적고 대화에 되먹임 -> 한 턴에 여러 도구를 요청할 수 있어 전부 실행하여 모음
        results_content = []
        for call in tool_calls:
            if not allow_actions and call.name in action.MUTATING_TOOLS:
                result, source = {"ok": False, "error": "actions_not_allowed",
                                  "message": "자발형 개입에서는 장바구니를 조작할 수 "
                                             "없습니다. 실행하지 말고 제안만 하세요."}, "sot"
            else:
                result, source = _dispatch(call.name, dict(call.input))
            # 출처 4칸 중 이번의 출처 칸을 골라 그 리스트에 한 줄 추가
            ledgers[source].append({"tool": call.name, "input": dict(call.input), "result": result})
            # 상태를 바꾼 액션은 성공했을 때만 프론트에 알림
            if call.name in action.MUTATING_TOOLS and result.get("ok"):
                actions_done.append({"type": call.name, "input": dict(call.input)})
            results_content.append({"type": "tool_result",
                                    "tool_use_id": call.id,
                                    "content": json.dumps(result, ensure_ascii=False),
                                    })
        # ② 우리가 실행한 도구 결과를 대화에 기록
        messages.append({"role": "user", "content": results_content})

    else:
        #  강제 착지. MAX_TURNS를 다 쓰고도 발화가 안 나옴
        #  도구를 더 주면 계속 부를 수 있으므로, tool_choice로 도구 사용을 막고 한 번만 더 불러 지금까지 결과로 마무리"를 강제. 무한 왕복(비용·지연 폭주)의 방어선
        messages.append({"role": "user", "content": "(도구 사용 한도에 도달했습니다. 지금까지의 도구 결과만으로 간결히 마무리해 주세요. "
                                                    "확인 못 한 것은 모른다고 말하세요.)"})
        response = client.messages.create(
            model=config.LLM_MODEL,
            max_tokens=config.LLM_MAX_TOKENS,
            system=system_blocks,
            messages=messages,
            tools=_CACHED_TOOLS,  # 대화에 tool 블록이 있어 목록은 필수
            tool_choice={"type": "none"},
        )
        landing_parts = [b.text for b in response.content if b.type == "text"]
        if landing_parts:
            reply = "".join(landing_parts)
        trace.append({"turn": config.MAX_TURNS, "stop_reason": "forced_landing", "tools": [],
                      "web_results": len(ledgers["web"])})

    return {
        "reply": reply or "죄송합니다, 지금은 답변을 만들지 못했습니다.",
        "actions": actions_done,
        "ledgers": ledgers,
        "trace": trace,
        "session_id": session_id,
    }
