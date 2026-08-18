import json

from app import config, prompts
from app.tools import definitions, query, action

_COMPUTE_STUB = frozenset({
    "optimize_route", "optimize_bundle", "compare_unit_price", "find_substitutes",
})
_INFER_STUB = frozenset([
    "predict_availability", "predict_repurchase", "get_position",
    "match_preferences", "identify_product_photo",
])

_EXECUTABLE = set(query.REGISTRY) | set(action.REGISTRY) | _COMPUTE_STUB | _INFER_STUB
_DECLARED = {t["name"] for t in definitions.TOOLS}
assert _EXECUTABLE == _DECLARED, f"선언과 실행 경로 불일치: 선언만 {_DECLARED - _EXECUTABLE} / 실행만 {_EXECUTABLE-_DECLARED}"
assert not (_COMPUTE_STUB | _INFER_STUB) & (set(query.REGISTRY) | set(action.REGISTRY)), \
    "스텁과 실물 레지스트리에 같은 이름이 있다 — 실물이 생겼으면 스텁에서 빼라"

#===============================================

#LLM 클라이언트

_client = None

def _get_client():
    global _client
    if _client is None:
        import anthropic
        _client = anthropic.Anthropic()
    return _client

#===============================================
# 도구 실행 + 출처 판정

def _dispatch(name: str, tool_input: dict) -> tuple[dict, str]:
    if name in query.REGISTRY:
        return query.run(name, tool_input), "slot"

    if name in action.REGISTRY:
        try:
            return action. REGISTRY[name](**tool_input), "sot"
        except TypeError as e:
            return {"ok": False, "error": "bad_arguments", "message": str(e)}, "sot"

    if name in _COMPUTE_STUB:
        return {"error": "not_implemented", "message": f"{name}은 아직 준비 중인 기능입니다." "이 기능 없이 답할 수 있는 부분만 답하세요"}, "compute"
    if name in _INFER_STUB:
        return {"error": "not_implemented", "message": f"{name}은(는) 아직 준비중인 기능입니다." "이 기능없이 답할 수 있는 부분만 답하세요"}, "infer"

    return {"error": "unknown_tool", "message": f"'{name}'은 없는 도구 입니다."}, "sot"

def _harvest_web_results(block) -> list[dict]:
    items = getattr(block, "content", None)
    if not isinstance(items,list):
        return []
    out = []
    for item in items:
        url = getattr(item, "url", None)
        if url:
            out.append({"url": url, "title": getattr(item, "title", None)})
    return out

#===============================================

# 루프 본체

def run_chat(message: str,
             consumer_id: int | None = None,
             session_id: str | None = None,
             history: list[dict] | None = None) -> dict:

    action.set_consumer_id(consumer_id)

    messages = list(history or [])[-20:]
    messages.append({"role": "user", "content": message})

    system_prompt = prompts.build_system_prompt()

    ledgers = {"sot": [], "compute": [], "infer": [], "web": []}
    actions_done = []
    trace = []
    reply = None

    client = _get_client()

    for turn in  range(config.MAX_TURNS):
        response = client.messages.create(
            model=config.LLM_MODEL,
            max_tokens=config.LLM_MAX_TOKENS,
            system=system_prompt,
            messages=messages,
            tools=definitions.ALL_TOOLS,
        )

        messages.append({"role": "assistant", "content": response.content})

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

        trace.append({"turn": turn, "stop_reason": response.stop_reason,
                      "tools": [b.name for b in tool_calls],
                      "web_results": len(ledgers["web"])})

        if response.stop_reason != "tool_use":
            reply = last_text
            break

        results_content = []
        for call in tool_calls:
            result, source = _dispatch(call.name, dict(call.input))
            ledgers[source].append({"tool": call.name, "input": dict(call.input), "result": result })

            if call.name in action.MUTATING_TOOLS and result.get("ok"):
                actions_done.append({"type": call.name, "input": dict(call.input)})
            results_content.append({"type": "tool_result",
                                    "tool_use_id": call.id,
                                    "content": json.dumps(result, ensure_ascii = False),
                                    })
        messages.append({"role": "user", "content": results_content})

    else:
        messages.append({"role": "user", "content": "(도구하용 한도에 도달했습니다. 지금가지의 도구 결과만으로 간결히 마무리해 주세요. "
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
        trace.append({"turn": config.MAX_TURNS, "stop_reason": "forced_landing", "tools": [], "web_results": len(ledgers["web"])})

        return {
            "reply": reply or "죄송합니다, 지금은 답변을 만들지 못했습니다.",
            "actions": actions_done,
            "ledgers": ledgers,
            "trace": trace,
            "session_id": session_id,
        }