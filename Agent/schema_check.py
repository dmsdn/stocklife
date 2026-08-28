# ============================================================================
# 스키마 ↔ 서명 전수 대조 — LLM 에게 광고한 인자가 실재하는가 (2026-08-27 신설)
# ============================================================================
# [왜 만들었나 — 실제로 무엇이 죽어 있었나]
#   `predict_availability` 의 input_schema 가 `location_id` 를 **required 로**
#   걸어 두고 있었다. 그런데 함수 서명은 `predict_availability(sku_id)` 뿐이다.
#   결과: LLM 이 스키마를 **정확히 지킬수록 반드시 실패한다.** 실물 골든셋에서
#   모델은 이 도구를 두 번 부르고 두 번 다 `bad_arguments` 로 튕긴 뒤
#   "정확한 보충 시점은 확인이 어렵네요"로 물러섰다 — **킬링 장면 1 이 통째로
#   죽어 있었다.**
#
# [왜 아무도 못 봤나 — 이게 이 검사기의 존재 이유다]
#   ① 루프가 예외를 흡수한다(`run()` 의 try/except). 도구가 죽어도 대화는 산다.
#      살려 두는 설계 자체는 옳다 — 도구 하나 때문에 손님과의 대화를 끊을 수는
#      없다. 대신 **실패가 조용해진다.**
#   ② LLM 이 실패를 우아하게 덮는다. "확인이 어렵네요"는 그럴듯해서 사람이
#      읽어도 고장으로 안 보인다.
#   ③ 골든셋이 그 발화를 PASS 로 줬다. 확률을 요구하지 않았기 때문인데,
#      기대치를 **되는 것에 맞춰** 썼던 탓이다(스텁 시절에 쓴 케이스).
#   세 겹이 겹쳐서, **아무 데서도 빨간불이 안 켜졌다.**
#
# [왜 스텁 시절 스키마가 남았나] 스키마는 구현보다 먼저 쓴다(도구를 설계하고
#   나서 만든다). 구현이 바뀌어도 스키마는 안 따라간다 — 둘을 묶는 것이
#   사람의 기억뿐이면 반드시 어긋난다. 그 기억을 코드로 옮긴 것이 이 파일이다.
#
# [무엇을 보나 — 방향이 다르면 심각도가 다르다]
#   🔴 스키마에 있는데 함수가 안 받는다   → **반드시 실패한다.** 위의 그 버그.
#   🔴 required 인데 함수 인자에 없다     → 위와 같되 더 확실히 죽는다.
#   🟡 함수는 필수로 받는데 스키마에 없다 → LLM 이 채울 방법이 없다.
#      단 `member_id`·`session_id`·`consumer_id` 는 **일부러 뺀 것**이다
#      (08-20 B안 확장: 신원은 LLM 이 아니라 `set_identity` 가 주입한다.
#      LLM 이 넘기면 남의 장바구니를 조회하는 문이 열린다). 그래서 면제.
#   🟢 함수에 기본값이 있고 스키마에 없다 → 정상(선택 인자를 안 광고한 것).
#
# 실행 (Agent/ 에서):  python schema_check.py
#   종료 코드 0 = 이상 없음 / 1 = 🔴 있음. CI 에 걸 수 있다.
# ============================================================================
from __future__ import annotations

import inspect
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.env import use_utf8_stdout                              # noqa: E402

use_utf8_stdout()

from app.tools import action, compute, definitions, infer, query  # noqa: E402

# 신원은 세션이 주입한다 — 스키마에 없는 것이 **설계**다(위 🟡 항 참조).
INJECTED = {"member_id", "session_id", "consumer_id"}


def _registries() -> dict:
    """도구 이름 → 실행 함수. 네 모듈의 REGISTRY 를 하나로 합친다.

    합치는 이유: 대조는 **이름 하나에 스키마 하나·함수 하나**를 맞추는 일인데,
    모듈이 넷이라 각각 돌면 "어느 모듈에도 없는 이름"을 못 잡는다.
    합쳐 두면 그 결번이 바로 드러난다(아래 🔴 no_impl).
    """
    reg = {}
    for mod in (query, compute, infer, action):
        r = getattr(mod, "REGISTRY", None)
        if isinstance(r, dict):
            for name, fn in r.items():
                reg[name] = (mod.__name__.rsplit(".", 1)[-1], fn)
    return reg


def check() -> int:
    reg = _registries()
    tools = definitions.TOOLS
    red, yellow = [], []

    for t in tools:
        name = t["name"]
        schema = t.get("input_schema", {})
        props = set(schema.get("properties", {}))
        required = set(schema.get("required", []))

        if name not in reg:
            red.append((name, "no_impl", "정의는 있는데 실행 함수가 없다"))
            continue
        modname, fn = reg[name]

        sig = inspect.signature(fn)
        params = sig.parameters
        # **kwargs 를 받으면 무엇이든 통과하므로 대조가 무의미하다.
        takes_kwargs = any(p.kind == p.VAR_KEYWORD for p in params.values())
        accepted = {k for k, p in params.items()
                    if p.kind in (p.POSITIONAL_OR_KEYWORD, p.KEYWORD_ONLY)}
        needed = {k for k, p in params.items()
                  if p.default is p.empty
                  and p.kind in (p.POSITIONAL_OR_KEYWORD, p.KEYWORD_ONLY)}

        if not takes_kwargs:
            for p in sorted(props - accepted):
                red.append((name, "ghost_param",
                            f"스키마가 `{p}` 를 광고하는데 {modname} 함수는 안 받는다"
                            + (" (required 라 **항상** 실패)" if p in required else "")))
        for p in sorted(needed - props - INJECTED):
            yellow.append((name, "unfillable",
                           f"함수가 `{p}` 를 필수로 받는데 스키마에 없다"))

    impl_only = sorted(set(reg) - {t["name"] for t in tools})

    print(f"도구 정의 {len(tools)}종 · 실행 함수 {len(reg)}종\n")
    for tag, rows in (("🔴", red), ("🟡", yellow)):
        for nm, kind, msg in rows:
            print(f"{tag} {nm:28} {msg}")
    if impl_only:
        # 실행 함수만 있고 정의가 없는 것 — 죽은 코드거나, 정의를 빠뜨린 것.
        # 🔴 는 아니다(LLM 이 못 부를 뿐 아무것도 안 깨진다).
        print(f"\n(정의 없는 실행 함수 {len(impl_only)}종: {', '.join(impl_only)})")
    if not red and not yellow:
        print("이상 없음 — 광고한 인자가 전부 실재하고, 필수 인자가 전부 광고돼 있다.")
    return 1 if red else 0


if __name__ == "__main__":
    sys.exit(check())
