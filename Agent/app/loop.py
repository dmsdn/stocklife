# ===============================================
# Agent 판단 핵 - Agent 루프
# ===============================================

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
from app.tools import definitions, query, action

# ===============================================

# 계산 및 추론 스텁
# 실행부가 아직 없는 9종. 스키마(definitions)에는 있어서 LLM이 고를 수 있으므로,  골랐을 때 "아직 준비 안 됨"을 **값으로** 돌려줘야 gka
# 조용히 빼면 LLM이 unknown_tool을 맞고, 그렇다고 지어내게 둘 수도 없다. C단계에서 compute.py / infer.py 가 생기면 이 집합은 비고, 아래 _dispatch의 스텁 분기가 안 타게 됨
_COMPUTE_STUB = frozenset({
    "optimize_route", "optimize_bundle", "compare_unit_price", "find_substitutes",
})
_INFER_STUB = frozenset({
    "predict_availability", "predict_repurchase", "get_position",
    "match_preferences", "identify_product_photo",
})

# ===============================================

# 자체 검산: 도구 19전부에 실행경로(or 스텁)가 있는가
# definitions에 선언만 있고 실행부가 없는 도구가 생기면, LLM이 그걸 고르는 순간 unknown_tool로 착지가 이상해짐. 조용히 망가지는 유형이므로 import시점에 잡음
_EXECUTABLE = set(query.REGISTRY) | set(action.REGISTRY) | _COMPUTE_STUB | _INFER_STUB
_DECLARED = {t["name"] for t in definitions.TOOLS}

assert _EXECUTABLE == _DECLARED, f"선언과 실행 경로 불일치: 선언만 {_DECLARED - _EXECUTABLE} / 실행만 {_EXECUTABLE - _DECLARED}"
assert not (_COMPUTE_STUB | _INFER_STUB) & (set(query.REGISTRY) | set(action.REGISTRY)), \
    "스텁과 실물 레지스트리에 같은 이름이 있다 — 실물이 생겼으면 스텁에서 빼라"

# ===============================================

# LLM 클라이언트

_client = None


def _get_client():
    global _client
    if _client is None:
        import anthropic
        _client = anthropic.Anthropic()
    return _client


# ===============================================
# 도구 실행 + 출처 판정

def _dispatch(name: str, tool_input: dict) -> tuple[dict, str]:
    if name in query.REGISTRY:
        return query.run(name, tool_input), "sot"

    if name in action.REGISTRY:
        try:
            return action.REGISTRY[name](**tool_input), "sot"
        except TypeError as e:
            return {"ok": False, "error": "bad_arguments", "message": str(e)}, "sot"

    if name in _COMPUTE_STUB:
        return {"error": "not_implemented", "message": f"{name}은 아직 준비 중인 기능입니다." "이 기능 없이 답할 수 있는 부분만 답하세요"}, "compute"
    if name in _INFER_STUB:
        return {"error": "not_implemented", "message": f"{name}은(는) 아직 준비 중인 기능입니다." "이 기능 없이 답할 수 있는 부분만 답하세요"}, "infer"

    return {"error": "unknown_tool", "message": f"'{name}'은 없는 도구입니다."}, "sot"


def _harvest_web_results(block) -> list[dict]:
    items = getattr(block, "content", None)
    if not isinstance(items, list):
        return []
    out = []
    for item in items:
        url = getattr(item, "url", None)
        if url:
            out.append({"url": url, "title": getattr(item, "title", None)})
    return out


# ===============================================

# 루프 본체

def run_chat(message: str,
             consumer_id: int | None = None,
             session_id: str | None = None,
             history: list[dict] | None = None) -> dict:

    # 요청의 주인을 등록. 액션도구의 consumer_id는 LLM이 아닌 여기서 주입
    action.set_consumer_id(consumer_id)

    #대화목록 조립 .history는 프론트가 보낸 그대로 받되, 뒤에서 20건만 추출
    messages = list(history or [])[-20:]
    messages.append({"role": "user", "content": message})

    system_prompt = prompts.build_system_prompt()

    # 이번 대화의 장부들. 함수 안 지역 변수인 이유: 요청마다 새로 시작해야 함. 모듈 전역에 두면 앞 사람의 원장이 다음 사람에게 새어들어감.
    ledgers = {"sot": [], "compute": [], "infer": [], "web": []}
    actions_done = []
    trace = []
    reply = None

    client = _get_client()

    for turn in range(config.MAX_TURNS):
        # LLM 호출. 매번 도구 전체(ALL_TOOLS)를 줌.
        # 대화에 tool_use 블록이 쌓인 뒤에는 tools없이 부르면 API가 거부하므로, 도구 목록은 왕복 내내 동일하게 유지
        response = client.messages.create(
            model=config.LLM_MODEL,
            max_tokens=config.LLM_MAX_TOKENS,
            system=system_prompt,
            messages=messages,
            tools=definitions.ALL_TOOLS,
        )

        # LLM의 응답을 그대로 발화에 쌓음: 다음 호출 때 LLM이 자기가 어떤 도구를 왜 불렀는지 기억하는 유일한 방법
        messages.append({"role": "assistant", "content": response.content})

        # 응답 블록 훑기
        # 한 응답(LLM 1번 호출) 안에 여러 블록이 섞여 들어올 수 있는데, 블록 마다 type이 있고, 그 type에 따라 할 일이 갈림
        last_text = None
        tool_calls = []
        for block in response.content:
            if block.type == "text":
                last_text = block.text
            elif block.type == "web_search_tool_result":
                ledgers["web"].extend(_harvest_web_results(block))
            elif block.type == "tool_use":
                if block.name in definitions.SERVER_TOOL_NAMES:
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
            result, source = _dispatch(call.name, dict(call.input))
            ledgers[source].append({"tool": call.name, "input": dict(call.input), "result": result})
            # 상태를 바꾼 액션은 성공했을 때만 프론트에 알림
            if call.name in action.MUTATING_TOOLS and result.get("ok"):
                actions_done.append({"type": call.name, "input": dict(call.input)})
            results_content.append({"type": "tool_result",
                                    "tool_use_id": call.id,
                                    "content": json.dumps(result, ensure_ascii=False),
                                    })
        messages.append({"role": "user", "content": results_content})

    else:
        #  강제 착지. MAX_TURNS를 다 쓰고도 발화가 안 나옴
        #  도구를 더 주면 계속 부를 수 있으므로, tool_choice로 도구 사용을 막고 한 번만 더 불러 지금까지 결과로 마무리"를 강제. 무한 왕복(비용·지연 폭주)의 방어선
        messages.append({"role": "user", "content": "(도구 사용 한도에 도달했습니다. 지금까지의 도구 결과만으로 간결히 마무리해 주세요. "
                                                    "확인 못 한 것은 모른다고 말하세요.)"})
        response = client.messages.create(
            model=config.LLM_MODEL,
            max_tokens=config.LLM_MAX_TOKENS,
            system=system_prompt,
            messages=messages,
            tools=definitions.ALL_TOOLS,  # 대화에 tool 블록이 있어 목록은 필수
            tool_choice={"type": "none"},
        )
        for block in response.content:
            if block.type == "text":
                reply = block.text
        trace.append({"turn": config.MAX_TURNS, "stop_reason": "forced_landing", "tools": [],
                      "web_results": len(ledgers["web"])})

    return {
        "reply": reply or "죄송합니다, 지금은 답변을 만들지 못했습니다.",
        "actions": actions_done,
        "ledgers": ledgers,
        "trace": trace,
        "session_id": session_id,
    }
