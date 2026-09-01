# -*- coding: utf-8 -*-
# ============================================================================
# 시나리오 재생 — 자발형 평가 하네스 (골든셋의 짝)
# ============================================================================
#   python -m eval.scenario_runner              전부
#   python -m eval.scenario_runner --only entry_brief
#   python -m eval.scenario_runner --list
#   python -m eval.scenario_runner --brief      지시문까지 만들어 본다(느림·SoT 조회)
#   python -m eval.scenario_runner --judge      발화까지 만들어 심판에게 채점 ⚠과금
#
# [무엇을 하나] 각본(`eval/scenarios.py`)의 신호를 **가상 시계**로 감시자에게
#   먹이고, 체크포인트마다 `dispatch.plan()` 이 낸 결정을 기대와 맞춘다.
#
# [왜 plan 까지만 부르나] `plan` 은 **동기이고 LLM·네트워크가 없다** — 그
#   함수의 독스트링이 스스로 "평가 하네스가 여기까지만 부르면 자발형 판정의
#   회귀 테스트가 된다"고 적어 뒀다. 그 이음매를 그대로 쓴다.
#   그 뒤(`_deliver`)는 문장 생성이라 과금이고 비결정적이다.
#
# [가상 시계가 새는 곳을 막았다] 08-28에 `dispatch.plan(now=)` 를 뚫었다.
#   `behavior.tick`·`etiquette.permit`·`world.tick` 은 이미 `now` 를 받는데
#   `plan` 만 실시간이었다. 한 곳만 실시간이면 **쿨다운 검사가 항상 통과한다** —
#   각본이 t=41 이라고 믿는 동안 etiquette 은 실제 경과 0.01초를 보기 때문이다.
#
# [세 층으로 나뉜다 — 비용이 층마다 다르다]
#   (기본)    신호 → 결정.        LLM·네트워크 없음. **공짜·결정적.** 매번 돌린다
#   --brief   → 지시문.           SoT 조회만(백엔드 필요). 조립기 누락을 잡는다
#   --judge   → 발화 → 채점.      ⚠ **과금.** 루프 + 심판이 개입마다 붙는다
#
#   층을 나눈 이유는 **매번 돌릴 수 있는 것을 매번 돌리기 위해서**다. 전부
#   과금이면 "나중에 돌리자"가 되고, 그러면 회귀를 잡는 시점이 마감 직전이 된다.
#
# [독립성] 시나리오마다 감시자·예절을 전부 reset 한다. 안 하면 앞 시나리오의
#   개입 장부가 남아 뒤 시나리오가 **쿨다운에 걸려 조용해지고**, 그게 "침묵
#   시험 통과"로 보인다. 통과처럼 보이는 오염이 제일 나쁘다.
# ============================================================================
import asyncio
import sys
import time

sys.path.insert(0, __file__.rsplit("eval", 1)[0])   # Agent/ 를 임포트 경로에

# ⚠ **순서가 뜻을 가진다** (`tool_check.py` §도 같은 규약).
#   `config` 는 import 시점에 환경변수를 읽어 상수를 굳힌다. 그래서 `load_env()`
#   보다 먼저 import 하면 `.env` 의 `USE_MOCK_SOT=false` 를 못 보고 **mock 이
#   기본값으로 굳는다.** 08-28에 실제로 그랬다 — 실행기가 "mock=True" 라고
#   찍으면서 실물 백엔드가 떠 있는 채로 mock 세계를 재고 있었고, 진입 브리핑
#   시나리오 셋이 "재구매 후보 0개"로 실패했다. 정책이 아니라 **검사기가 다른
#   세계를 보고 있었다.**
from app import env                                  # noqa: E402
env.use_utf8_stdout()
env.load_env()

from app import config, etiquette                    # noqa: E402  ← load_env() 뒤여야 한다
from app.watchers import behavior, dispatch, runner, schedule, world  # noqa: E402
from eval import scenarios as S                      # noqa: E402


def _reset_all() -> None:
    """감시자 넷 + 예절을 초기 상태로. 시나리오 사이의 오염을 끊는다."""
    runner.reset()          # 안에서 world·behavior·schedule 을 다 비운다
    etiquette.reset()
    # ⚠ `dispatch.reset()` 은 **부르지 않는다.** 그것은 지시문 조립기 등록
    #   (`_BUILDERS`)까지 지우는데, 등록은 `world.py`·`schedule.py` 가 import
    #   될 때 한 번뿐이라 **되살아나지 않는다.** 지우고 나면 그 뒤의 모든 개입이
    #   "조립기 미등록 — 개입 폐기"로 조용히 사라진다. 08-28 `--brief` 에서
    #   실제로 그렇게 전부 폐기됐다. 잠금(`_BUSY`)은 `_deliver` 만 세우는데
    #   평가는 그것을 안 부르므로 애초에 비어 있다.


def _pick_member() -> int:
    """구매 이력이 있는 회원을 **지금 세계에서** 뽑는다.

    [왜 각본에 안 박나] mock 회원은 9001·9002 이고 실물 시드는 1001~ 이다.
    한쪽을 박으면 다른 쪽에서 진입 브리핑이 **재구매 후보 0개**로 조용해지는데,
    그건 정책이 틀린 게 아니라 그 세계에 그 사람이 없는 것이다. 그 둘을 못
    가르면 시나리오가 "침묵 시험"으로 보이면서 통과한다 — 제일 나쁜 실패다.
    (`tool_check`·`infer_check` 과 같은 규율. 이 함정을 오늘 세 번째 밟았다.)
    """
    from app import sot_client
    cands = ([9001, 9002] if config.USE_MOCK_SOT else []) + list(range(1001, 1031))
    for mid in cands:
        try:
            if sot_client.get_purchase_history(mid):
                return mid
        except Exception:                                       # noqa: BLE001
            continue
    return cands[0]


def _deliver_sim(sid: str, decision: dict, t: float) -> None:
    """발화가 **나간 것으로 친다** — `dispatch._deliver` 의 부작용만 흉내낸다.

    [왜 필요한가] 개입 장부(`etiquette.record`)는 발화가 성공한 뒤에 적힌다.
      일부러 그렇게 만들었다 — 가드에 막히거나 전달이 실패한 개입까지 장부에
      적으면, 다시 말할 기회를 잃고도 근거가 사라진다.
      그런데 평가는 `plan` 까지만 부르므로 **장부가 영영 안 적힌다.** 그러면
      쿨다운·총량·사안당1회가 전부 무력해지고, 예절 시나리오가 통째로
      "개입이 또 났다"로 깨진다. 08-28에 실제로 그렇게 깨졌다.

    ⚠ `_deliver` 의 **부작용만** 베낀다(장부 + on_delivered). 문장 생성·가드·
      SSE 전송은 안 한다 — 그건 과금이고 비결정적이라 애초에 잘라낸 부분이다.
      베낀 것이 어긋나면 평가가 거짓말을 하므로, `_deliver` 를 고치면 여기도 본다.
    """
    etiquette.record(sid, decision["topic_key"], now=t,
                     also=[c["topic_key"] for c in decision["items"]])
    for cand in decision["items"]:
        done = cand.get("on_delivered")
        if done:
            done(cand)


def _ledger(tool: str, inp: dict) -> dict:
    """루프가 넘기는 원장 모양을 흉내낸다.

    실제 원장은 `loop` 이 도구 호출마다 쌓는 dict 다. 여기서 필요한 것은
    `world.note_from_ledgers` 가 읽는 칸(tool·input·result)뿐이라 그것만 만든다.
    ⚠ 값을 지어내지 않는다 — 관심 등록은 **어떤 도구를 불렀나**로만 판정하므로
      result 를 비워도 판정이 같다. 채우면 그 값이 진짜인 척하게 된다.
    """
    return {"tool": tool, "input": inp, "result": {}}


def _step(sc: dict, st: dict, t: float) -> None:
    """각본 한 걸음을 감시자에게 먹인다."""
    sid, mid = sc["session"], sc["_member"]

    if "interest" in st:
        # "물었는데 없었다" — predict_availability 를 부른 흔적으로 등록한다.
        rows = [_ledger("predict_availability", {"sku_id": s}) for s in st["interest"]]
        world.note_from_ledgers(sid, mid, {"infer": rows}, now=t)

    if "cart" in st:
        # "담았다" — 위치 이동 개입의 대상 축(관심과 다른 장부)
        rows = [_ledger("add_to_cart", {"sku_id": s}) for s in st["cart"]]
        world.note_from_ledgers(sid, mid, {"sot": rows}, now=t)

    if "shelf" in st:
        evt, data = st["shelf"]
        runner.fanout(evt, dict(data), now=t)

    if "behavior" in st:
        evt, data = st["behavior"]
        # 세션·회원은 각본이 매번 적지 않아도 되게 여기서 채운다.
        runner.fanout(evt, {"sessionId": sid, "memberId": mid, **data}, now=t)

    if st.get("tick"):
        behavior.tick(now=t)


def _check(exp: dict, got) -> list[str]:
    """기대 하나를 결정 하나와 맞춘다. 반환 = 어긋난 것들(빈 리스트면 통과)."""
    bad = []
    if exp.get("none"):
        if got is not None:
            bad.append(f"개입이 없어야 하는데 {got['topic_type']} 이 났다")
        return bad

    if got is None:
        # `not_topic_type` 만 걸린 기대는 **침묵으로도 충족된다** — "그 유형만
        # 아니면 된다"는 뜻이지 "뭐라도 나야 한다"가 아니다.
        if set(exp) <= {"not_topic_type"}:
            return bad
        want = exp.get("topic_type") or "개입"
        return [f"{want} 이 나야 하는데 아무것도 안 났다"]

    if "not_topic_type" in exp and got["topic_type"] == exp["not_topic_type"]:
        bad.append(f"{exp['not_topic_type']} 이 나면 안 되는데 났다")
    if "topic_type" in exp and got["topic_type"] != exp["topic_type"]:
        bad.append(f"유형 {exp['topic_type']} 기대 · 실제 {got['topic_type']}")
    if "mode" in exp and got["mode"] != exp["mode"]:
        bad.append(f"모드 {exp['mode']} 기대 · 실제 {got['mode']}")
    n = len(got["items"])
    if "items" in exp and n != exp["items"]:
        bad.append(f"항목 {exp['items']}개 기대 · 실제 {n}개")
    if "items_min" in exp and n < exp["items_min"]:
        bad.append(f"항목 {exp['items_min']}개 이상 기대 · 실제 {n}개")
    if "includes_topic" in exp:
        keys = [c.get("topic_key") for c in got["items"]]
        if exp["includes_topic"] not in keys:
            bad.append(f"묶음에 {exp['includes_topic']} 가 없다 (실제 {keys})")
    return bad


async def _utterance(decision: dict) -> str | None:
    """지시문 → **실제 발화**. `dispatch._deliver` 의 ②③ 을 그대로 밟는다.

    [왜 _deliver 를 그냥 안 부르나] 그 함수는 ⑤ 전달까지 간다 — 평가가
      백엔드에 말풍선을 밀어 넣으면 안 된다. 그렇다고 여기서 Claude 를 직접
      부르면 **원장이 안 생겨 가드가 볼 것이 없다**(08-21 ai-server 인수 때
      바로잡은 자리와 같은 함정). 그래서 ②③ 만 베끼고 ④가드는 결과에 실어
      심판이 아니라 **기계가** 판정하게 둔다.

    ⚠ `_deliver` 의 ②③ 을 고치면 여기도 본다. 베낀 것이 어긋나면 평가가
      실제로 나갈 발화가 아닌 것을 채점한다.
    """
    from app import guard, loop, prompts
    from app.watchers import dispatch as D

    parts = []
    for cand in decision["items"]:
        t = await D._build_one(cand)
        if t:
            parts.append(t)
    if not parts:
        return None
    if decision["mode"] == "bundle":
        listed = "\n".join(f"{i+1}. {t}" for i, t in enumerate(parts))
        message = prompts.PROACTIVE_BUNDLE.format(items=listed)
    else:
        message = parts[0]

    member_id = decision["items"][0].get("member_id")
    result = await asyncio.to_thread(
        loop.run_chat, message, member_id, "scen-judge", None,
        allow_actions=False)                 # 손님이 시키지 않았다 — 경로에서 잠근다
    gv = guard.check(result["reply"], result["ledgers"])
    if not gv["ok"]:
        # 가드에 막힌 발화는 **실제로는 안 나간다.** 그것을 심판에게 보내면
        # 나가지도 않을 문장에 점수를 매기게 된다. 사실을 그대로 돌려준다.
        return "⛔ 가드 차단: " + ", ".join(v["reason"] for v in gv["violations"])
    return result["reply"]


async def _briefs(decision: dict) -> list[str]:
    """지시문을 실제로 조립해 본다(--brief). LLM 은 안 부른다 — SoT 조회뿐.

    [왜 따로 두나] 지시문 조립은 상품명을 읽으므로 **백엔드(또는 mock)가 필요**
      하고 느리다. 판정 회귀는 그것 없이 돌아야 매번 돌릴 수 있다.
    [무엇을 잡나] 등록되지 않은 topic_type(빌더가 없어 개입이 조용히 증발),
      상품 조회 실패, 템플릿의 빈칸 누락.
    """
    out = []
    for cand in decision["items"]:
        try:
            txt = await dispatch._build_one(cand)
            out.append(txt or f"⚠ 지시문 없음 ({cand['topic_type']})")
        except Exception as e:                                  # noqa: BLE001
            out.append(f"⚠ 조립 실패 {type(e).__name__}: {e}")
    return out


def play(sc: dict, want_brief: bool, want_judge: bool = False) -> dict:
    """시나리오 하나를 재생하고 결과를 돌려준다."""
    _reset_all()
    sc = dict(sc, _member=_pick_member())      # 회원은 각본이 아니라 세계가 정한다
    base = time.time()
    got: dict = {}
    briefs: dict = {}
    says: dict = {}

    for st in sc["steps"]:
        t = base + st["t"]
        _step(sc, st, t)
        if "plan" in st:
            # 체크포인트. plan 은 스테이지를 **비우므로** 여기서 결정이 확정된다.
            decisions = dispatch.plan(runner.sessions(), now=t)
            mine = [d for s, d in decisions if s == sc["session"]]
            got[st["plan"]] = mine[0] if mine else None
            if want_brief and mine:
                briefs[st["plan"]] = asyncio.run(_briefs(mine[0]))
            if want_judge and mine:
                says[st["plan"]] = asyncio.run(_utterance(mine[0]))
            # 결정이 났으면 **나간 것으로 친다.** 안 그러면 다음 체크포인트의
            # 쿨다운·총량이 0인 상태로 판정된다(위 `_deliver_sim` 참조).
            for s_id, d in decisions:
                _deliver_sim(s_id, d, t)

    fails = []
    for name, exp in sc["expect"].items():
        for msg in _check(exp, got.get(name)):
            fails.append(f"[{name}] {msg}")
    return {"id": sc["id"], "ok": not fails, "fails": fails,
            "got": got, "briefs": briefs, "says": says}


def main() -> int:
    args = sys.argv[1:]
    if "--list" in args:
        for sc in S.SCENARIOS:
            mark = "🌍" if sc.get("needs_world") else "  "
            print(f"{mark} {sc['id']:28s} {sc['why'][:56]}")
        print("\n🌍 = 실제 구매 이력을 읽는다(백엔드 또는 mock 필요)")
        return 0

    only = None
    if "--only" in args:
        only = args[args.index("--only") + 1]
    want_brief = "--brief" in args
    want_judge = "--judge" in args

    todo = S.SCENARIOS if only is None else [s for s in S.SCENARIOS if s["id"] == only]
    if not todo:
        print(f"그런 시나리오가 없다: {only}")
        return 2

    print(f"■ 시나리오 재생 — {len(todo)}건 · mock={config.USE_MOCK_SOT} · "
          f"회원 {_pick_member()}"
          f"{' · 지시문 조립 포함' if want_brief else ''}")
    print(f"  예절: 총량 {config.INTERVENTION_MAX_PER_SESSION} · "
          f"쿨다운 {config.INTERVENTION_COOLDOWN_SEC}초 · "
          f"사안당1회 {config.INTERVENTION_ONCE_PER_TOPIC}\n")

    n_ok = 0
    judged: dict = {}
    for sc in todo:
        r = play(sc, want_brief, want_judge)
        if r["ok"]:
            n_ok += 1
            shape = " · ".join(
                f"{k}={'침묵' if v is None else v['topic_type']}"
                for k, v in r["got"].items())
            print(f"  ✅ {sc['id']:28s} {shape}")
        else:
            print(f"  ❌ {sc['id']:28s} {sc['why'][:50]}")
            for f in r["fails"]:
                print(f"       {f}")
        for name, texts in r["briefs"].items():
            for t in texts:
                print(f"       지시문[{name}] {t[:100]}")
        for name, say in r["says"].items():
            if not say:
                continue
            print(f"       발화[{name}] {say[:120]}")
            if say.startswith("⛔"):
                continue                    # 안 나갈 문장은 채점하지 않는다
            from eval.judge import DIMENSIONS, judge_once
            v = judge_once("(자발형 — 손님이 묻지 않았다)", say,
                           situation=sc["why"])
            for k, _ in DIMENSIONS:
                sc_ = (v.get(k) or {}).get("점수")
                if isinstance(sc_, int):
                    judged.setdefault(k, []).append(sc_)
                    if sc_ <= 2:
                        print(f"         ⚠ {k} {sc_}: "
                              f"{(v.get(k) or {}).get('근거', '')[:80]}")

    if judged:
        print("\n■ 발화 채점 (자발형은 **묻지 않은 말**이라 어조·간결이 특히 중요하다)")
        for k, xs in judged.items():
            print(f"  {k:6s} {sum(xs) / len(xs):.2f}  (n={len(xs)} 최저 {min(xs)})")

    print(f"\n■ {n_ok}/{len(todo)} PASS")
    if n_ok < len(todo):
        print("  자발형이 어긋났다. 감시자·예절 중 어디인지는 실패한 시나리오의 "
              "why 가 가리킨다 — 침묵 시험이 깨졌으면 수다스러워진 것이고, "
              "발생 시험이 깨졌으면 신호가 안 닿은 것이다.")
    return 0 if n_ok == len(todo) else 1


if __name__ == "__main__":
    raise SystemExit(main())
