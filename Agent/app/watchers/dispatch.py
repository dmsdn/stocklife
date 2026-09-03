# ============================================================================
# StoreFlow 하네스 — 개입 디스패처 (파일명세 §3의 dispatch, 08-26 ③ 결정)
# ============================================================================
# [한 줄] 스테이지에 쌓인 후보를 **세션마다 하나의 개입으로** 내보낸다:
#         허가 → 지시문 조립 → 루프(문장 생성) → 가드 → 전달 → 기록.
#
# [왜 감시자에서 떼어냈나] 08-25까지는 `behavior.py`가 감지부터 발화까지 혼자
#   완주했다. 감시자가 하나일 때는 맞는 그림이었다. 그런데 셋이 되면 —
#
#     손님이 매장에 들어온다
#       세계 감시자   "B 자리가 바뀌었어요"      (LOCATION_MOVED 50)
#       세계 감시자   "품절이던 A 들어왔어요"    (AVAILABILITY_CHANGE 40)
#       시간 감시자   "살 때 되신 것 2개 있어요" (STORE_ENTRY_BRIEF 20)
#
#   셋이 **각자 발화하면** 진입 3초 만에 말풍선이 세 번 뜬다. 그렇다고
#   `etiquette.pick()`으로 하나만 고르면 20짜리 브리핑이 늘 진다 —
#   그리고 브리핑은 **진입 순간에만** 유효해서 다음 기회가 없다.
#   **킬링 장면 3이 구조적으로 안 나온다.**
#
#   → 감시자는 후보를 `etiquette.stage()`에 **넣기만** 하고, 이 파일이 세션별로
#     한 번 모아 판정한다. 진입 순간이면 묶고, 아니면 하나만 고른다.
#     (`watchers/__init__.py`가 이미 적어 둔 규율 — "감시자는 판정까지만 한다,
#      말할 권한은 etiquette가 발급한다" — 의 실행부다.)
#
# [이 파일이 유형을 모르는 이유] 지시문을 어떻게 쓸지는 **그 감시자만 안다**
#   (망설임은 두 상품 이름이 필요하고, 진입 브리핑은 재구매 목록이 필요하다).
#   그래서 지시문 조립은 `register()`로 감시자가 등록한 함수에 맡긴다.
#   여기가 아는 것은 파이프라인의 **형태**뿐이다 — 유형이 늘어도 이 파일은 그대로다.
#
# [경계] 감지는 watchers/의 각 파일, 예절 판정은 etiquette, 문장은 loop,
#   사실 검증은 guard, 전달은 sot_client. 이 파일은 그 다섯을 **순서대로 부를 뿐**
#   이고 어느 것의 내부도 모른다.
# ============================================================================
#
# ─── 개념 사전 — 이 파일에 처음 나오는 개념 1개 ─────────────────────────────
# (①~(56): 앞 파일들의 사전은 아는 것으로 전제)
#
# (57) 함수를 값으로 등록하는 표 (registry / dispatch table)
#    `_BUILDERS = {"HESITATION_HELP": 어떤함수}` 처럼 **문자열 → 함수**를 담아 두고
#    나중에 `_BUILDERS[유형](후보)`로 부른다. 파이썬에서 함수는 값이라 dict에
#    그냥 넣을 수 있다(자바의 인터페이스+구현 클래스 한 벌이 여기선 dict 한 줄이다).
#    왜 if/elif 사슬 대신 이걸 쓰나: 유형이 늘 때 **이 파일을 안 고쳐도 되게**
#    하려고다. if 사슬이면 감시자를 추가할 때마다 디스패처를 열어야 하고,
#    그러면 "디스패처가 모든 유형을 안다"는 결합이 생긴다.
#    안 지키면 어떻게 깨지나: 세계·시간 감시자를 붙이는 08/28에 이 파일이
#    세 갈래 if로 부풀고, 유형 하나를 빠뜨리면 **조용히 발화가 사라진다**
#    (else 가지가 없으면 아무 일도 안 일어난다 — 예외도 안 난다).
# ────────────────────────────────────────────────────────────────────────────
from __future__ import annotations

import asyncio
import json
import os
import time
from collections import deque

from app import config, etiquette, prompts, sot_client

# ── 결정 테이프 (09-02 · 제안 ④) — 개입하지 **않기로 한 결정**까지 남긴다 ─────
#
# [왜] `permit()` 은 거절 사유를 값으로 돌려주는데(독스트링: "감시자 로그에서
#   '왜 조용했는가'를 추적하기 위해서"), 받는 쪽이 그걸 버리고 있었다 —
#   `unknown` 만 찍고 cooldown·topic_already_done·session_quota_exhausted 는
#   아무 데도 안 남았다. 악기는 있는데 테이프가 없는 상태.
#   튜터 감사 연구(T4)의 결론이 정확히 이 자리다: *"시스템이 하지 않기로 한
#   결정에 대해 무엇을 기록하는지가, 나중에 물을 수 있는 것의 한계를 정한다."*
#   그 표(어느 게이트가 노출을 지배하나 — 그쪽 실측은 쿨다운 58.1%)를 우리
#   파이프라인에서 만들려면 이 기록이 분모다.
#
# [무엇을 남기나] `_deliver` 의 관문마다 한 줄:
#   permit_denied / permit_ok / no_brief / guard_block / push_fail /
#   delivered / crash. 후보 생성(plan)은 규칙이라 결정적이고 재생 가능하므로
#   여기서는 안 적는다 — 비결정적인 것(LLM·가드·전달)이 시작되는 지점부터다.
#   ⚠ drain 내부의 우선순위 탈락(pick)은 이 테이프 밖이다 — 그건 「후보 간
#   경쟁」이지 「게이트 거절」이 아니고, plan 재생으로 언제든 복원된다.
#
# [어디에] 메모리 deque(최근 500 — 서빙이 무한히 자라면 안 된다) + 환경변수
#   `DECISION_TAPE` 에 경로를 주면 JSONL 로도 쌓는다(연구·장기 계측용).
#   기본은 파일 없음 — 서빙 경로에 말 없는 파일쓰기를 늘리지 않는다.
TAPE: deque = deque(maxlen=500)
_TAPE_PATH = os.environ.get("DECISION_TAPE", "")


def _tape(stage: str, session_id: str, decision: dict | None, **extra) -> None:
    rec = {"ts": round(time.time(), 3), "stage": stage, "session": session_id}
    if decision:
        rec["topic_type"] = decision.get("topic_type")
        rec["topic_key"] = decision.get("topic_key")
        rec["mode"] = decision.get("mode")
    rec.update(extra)
    TAPE.append(rec)
    if _TAPE_PATH:
        try:
            with open(_TAPE_PATH, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        except OSError as e:
            # 테이프가 개입을 죽이면 안 된다 — 기록 실패는 경고로 끝낸다.
            print(f"[tape] 기록 실패({type(e).__name__}) — 개입은 계속한다")


# ── 발화기 이음매 (09-02 · 제안 ④) — runner 의 `--chat` 과 같은 계열 ─────────
#
# [왜] 자발형 파이프라인에서 LLM 이 하는 일은 ③문장 생성뿐이다. 후보는
#   규칙(감시자)이, 허가는 규칙(예절)이 정하므로, **발화기만 갈아끼우면
#   후보 집합이 고정된 통제 실험**이 된다 — Claude 와 우리 모델(T17)을 같은
#   게이트 뒤에 세우고 가드 탈락률·전달 수만 비교할 수 있다.
# [계약] `loop.run_chat` 과 같은 서명이어야 한다 — 특히 `allow_actions=False`
#   키워드를 받아야 한다(자발형은 경로에서 액션을 잠근다). 어댑터가 이 인자를
#   버리면 **잠금이 조용히 풀린다.**
_CHAT = None


def set_chat(fn) -> None:
    """발화기를 갈아끼운다(None 이면 기본 loop.run_chat). 평가·실험 전용."""
    global _CHAT
    _CHAT = fn

# (57) 유형 → 지시문 조립 함수. 감시자가 자기 것을 register()로 넣는다.
#   함수의 모양: async def build(cand: dict) -> str | None
#   None을 돌려주면 "이 후보는 지시문을 못 만들었다" — 조용히 뺀다(묶음이면
#   나머지로 계속, 단일이면 개입 취소).
_BUILDERS: dict = {}

# 같은 세션에 개입이 겹쳐 도는 것을 막는 잠금. 문장 생성이 수 초 걸리므로
# 그 사이 다음 틱이 또 발화를 시작하면 말풍선이 두 번 뜬다.
_BUSY: set = set()


def register(topic_type: str, builder) -> None:
    """감시자가 자기 유형의 지시문 조립 함수를 등록한다. import 시점에 부른다.

    [왜 등록인가] 이 파일이 `from app.watchers import behavior`를 하면 순환
      import가 된다(behavior도 dispatch를 부르므로). 등록으로 뒤집으면
      **의존 방향이 한쪽**이 된다 — 감시자 → 디스패처.
    """
    _BUILDERS[topic_type] = builder


async def _build_one(cand: dict) -> str | None:
    """후보 하나의 지시문. 등록된 조립 함수가 없으면 None.

    [조용한 실패를 막는다] 등록이 안 된 유형은 **경고를 찍고** None을 돌려준다.
      아무 말 없이 건너뛰면 "왜 이 감시자만 말을 안 하지"를 못 찾는다.
    """
    build = _BUILDERS.get(cand.get("topic_type"))
    if build is None:
        print(f"[dispatch] 지시문 조립기 미등록 — 개입 폐기: {cand.get('topic_type')}")
        return None
    try:
        return await build(cand)
    except Exception as e:
        print(f"[dispatch] 지시문 조립 실패 {cand.get('topic_key')}: "
              f"{type(e).__name__}: {e}")
        return None


async def _deliver(session_id: str, decision: dict) -> bool:
    """개입 하나를 발화까지 완주시킨다. 반환 = 실제로 말이 나갔나.

    [순서가 곧 규율이다]
      ① 허가   — 예산·쿨다운·중복. 여기서 막히면 아무 비용도 안 든다
      ② 지시문 — 묶음이면 항목별로 만들어 하나로 합친다
      ③ 문장   — **반드시 루프가 만든다.** 도구로 사실을 확인하고 원장을 남기는
                 유일한 경로다. 여기서 Claude를 직접 부르면 가드가 볼 원장이 없다
                 (08-21 ai-server 인수 때 바로잡은 자리).
      ④ 가드   — 원장 대조. 막히면 **버린다**(재생성하지 않는다)
      ⑤ 전달   — 백엔드를 통해 말풍선으로
      ⑥ 기록   — 전달이 성공한 **뒤에만**. 앞당기면 실패한 개입이 예산을 먹는다
    """
    if session_id in _BUSY:
        return False
    verdict = etiquette.permit(session_id, decision["topic_type"],
                               decision["topic_key"])
    if not verdict["allowed"]:
        # 사유를 **버리지 않는다** — cooldown 인지 총량인지 중복인지가 남아야
        # "왜 조용했는가"를 나중에 셀 수 있다(테이프 머리말 참조).
        _tape("permit_denied", session_id, decision, reason=verdict["reason"])
        if verdict["reason"].startswith("unknown"):
            print(f"[dispatch] 예절 거절(이상): {verdict['reason']}")
        else:
            print(f"[dispatch] 예절 거절 session={session_id} "
                  f"유형={decision['topic_type']} 사유={verdict['reason']}")
        return False
    _tape("permit_ok", session_id, decision)

    _BUSY.add(session_id)
    try:
        from app import guard, loop        # 지연 import — 판정 스모크는 LLM 없이 돈다

        parts = []
        for cand in decision["items"]:
            text = await _build_one(cand)
            if text:
                parts.append(text)
        if not parts:
            _tape("no_brief", session_id, decision)
            return False                   # 하나도 못 만들었으면 개입 자체가 없다

        if decision["mode"] == "bundle":
            # 항목을 번호 매겨 한 지시문으로. 묶음 전용 프롬프트가 "하나의
            # 인사말로 묶어라"와 "확인 안 되는 항목은 조용히 빼라"를 건다.
            listed = "\n".join(f"{i+1}. {t}" for i, t in enumerate(parts))
            message = prompts.PROACTIVE_BUNDLE.format(items=listed)
        else:
            message = parts[0]

        member_id = decision["items"][0].get("member_id")
        # allow_actions=False: 손님이 시키지 않았으므로 장바구니 조작을 **경로에서**
        # 잠근다(프롬프트 금지는 지침일 뿐 — 08-24 검수).
        # ⚠ member_id 는 **세계 축**이다(SSE 의 memberId). consumer_id 자리에 넣으면
        #   run_chat 이 OFFSET 을 한 번 더 더해 없는 회원이 된다(09-03 시연 점검 —
        #   구매 115건 손님의 브리핑이 "아직 취향 파악은 초반" 으로 나가던 원인).
        result = await asyncio.to_thread(
            _CHAT or loop.run_chat, message, None, session_id, None,
            allow_actions=False, member_id=member_id)

        gv = guard.check(result["reply"], result["ledgers"])
        if not gv["ok"]:
            # 자발형은 재생성하지 않는다(반응형의 정책 ⓒ와 다른 점): 손님이 묻지도
            # 않은 말을 두 번 비용 들여 다듬을 가치가 없다. 기록도 안 남긴다 —
            # 예절 예산을 안 깎아야 다음 기회가 산다.
            print(f"[dispatch] 가드 차단 — 개입 폐기: "
                  f"{[v['reason'] for v in gv['violations']]}")
            _tape("guard_block", session_id, decision,
                  reasons=[v["reason"] for v in gv["violations"]])
            return False

        pushed = await asyncio.to_thread(
            sot_client.push_proactive_message, session_id, result["reply"])
        if not pushed.get("ok"):
            print(f"[dispatch] 전달 실패 — 기록 안 함: {pushed}")
            _tape("push_fail", session_id, decision)
            return False

        # 묶음이면 안의 각 항목도 **개별 사안으로** 장부에 적는다. 안 적으면
        # 브리핑에서 말한 "샴푸 살 때 됐어요"가 30분 뒤 단독 개입으로 또 나온다.
        etiquette.record(session_id, decision["topic_key"],
                         also=[c["topic_key"] for c in decision["items"]])
        # 개입이 실제로 나간 뒤에만 감시자의 관찰 상태를 비운다(같은 관찰로 재개입 방지).
        for cand in decision["items"]:
            done = cand.get("on_delivered")
            if done:
                done(cand)
        print(f"[dispatch] {decision['mode']} 발화 완료 session={session_id} "
              f"유형={decision['topic_type']} 항목={len(decision['items'])}")
        # 09-03 시연 점검: 브리핑 **내용**이 세션마다 달라지는데(같은 회원인데 어제는
        # 재구매, 오늘은 "아직 잘 모르지만…") 테이프에 글자 수만 있어 왜인지 못 봤다.
        # 루프가 부른 도구 이름과 발화 앞부분을 같이 적는다 — 후보(items)와 발화가
        # 어긋난 자리를 테이프만으로 가를 수 있게.
        _tape("delivered", session_id, decision, chars=len(result["reply"] or ""),
              items=[c.get("topic_key") for c in decision["items"]],
              tools=[t for turn in (result.get("trace") or []) for t in (turn.get("tools") or [])],
              reply=(result["reply"] or "")[:160])
        return True
    except Exception as e:
        print(f"[dispatch] 개입 처리 실패 session={session_id}: "
              f"{type(e).__name__}: {e}")
        _tape("crash", session_id, decision, error=type(e).__name__)
        return False
    finally:
        _BUSY.discard(session_id)          # 예외 경로에서도 잠금 해제


def plan(session_ids, now: float | None = None) -> list[tuple]:
    """스테이지를 비우고 세션별 결정을 만든다 — **발화는 하지 않는다.**

    [왜 pump와 나누나] 여기까지는 동기이고 LLM·네트워크가 없다. 평가 하네스가
      이 함수까지만 부르면 **자발형 판정의 회귀 테스트**가 된다
      (behavior.tick을 감지/발화로 나눈 것과 같은 이유).
    [반환] [(세션ID, 결정dict), ...] — 결정의 모양은 etiquette.drain 참조.
    [now] 가짜 시계 구멍(behavior.tick·etiquette.permit 과 같은 계열). 안 주면
      실시간이다. 시나리오 재생이 쿨다운 90초를 **실제로 기다리지 않으려면**
      여기까지 시계가 이어져야 한다 — 한 곳만 실시간이면 그 지점에서 각본이 샌다.
    """
    out = []
    for sid in list(session_ids):
        d = etiquette.drain(sid, now=now)
        if d is not None:
            out.append((sid, d))
    return out


async def pump(session_ids) -> int:
    """plan한 것을 배경 일감으로 띄운다. 반환 = 띄운 개입 수(전달 성공 수가 아니다).

    [왜 await로 기다리지 않나] 문장 생성이 수 초 걸린다. 여기서 기다리면 감시자의
      틱 주기(2초)가 밀려 다음 신호를 놓친다 — 개입 기회는 시간 창이 좁다.
    """
    decisions = plan(session_ids)
    for sid, d in decisions:
        asyncio.create_task(_deliver(sid, d))          # (54)
    return len(decisions)


def reset() -> None:
    """등록·잠금 초기화 — 테스트 전용. 운영 코드는 부르지 않는다."""
    _BUILDERS.clear()
    _BUSY.clear()
    TAPE.clear()
    set_chat(None)


# ── 스모크 (LLM·네트워크 없음 — plan까지): python -m app.watchers.dispatch ──
if __name__ == "__main__":
    from app.env import use_utf8_stdout
    use_utf8_stdout()          # 로그의 한글이 cp949 콘솔에서 안 터지게
    etiquette.reset(); reset()
    S = "sess-demo"
    ENTRY = {"topic_type": "STORE_ENTRY_BRIEF", "topic_key": "rp:9001:101042",
             "moment": "entry", "session_id": S, "member_id": 9001}
    LOC = {"topic_type": "LOCATION_MOVED", "topic_key": "loc:101055",
           "session_id": S, "member_id": 9001}
    HES = {"topic_type": "HESITATION_HELP", "topic_key": "hes:1:2",
           "session_id": S, "member_id": 9001}

    # ① 스테이지가 비면 계획도 없다
    assert plan([S]) == []

    # ② 진입 후보가 섞이면 묶음 하나로 계획된다 (세션당 **한 줄**)
    for c in (LOC, ENTRY):
        etiquette.stage(S, c)
    got = plan([S])
    assert len(got) == 1, got
    sid, d = got[0]
    assert sid == S and d["mode"] == "bundle" and len(d["items"]) == 2

    # ③ plan은 스테이지를 비운다 — 안 비우면 다음 틱에 또 계획된다
    assert plan([S]) == []

    # ④ 진입이 아니면 하나만
    etiquette.stage(S, HES); etiquette.stage(S, LOC)
    _, d2 = plan([S])[0]
    assert d2["mode"] == "single" and d2["topic_type"] == "LOCATION_MOVED"

    # ⑤ 여러 세션이 섞여도 세션마다 한 줄
    etiquette.reset()
    etiquette.stage("a", dict(HES, session_id="a"))
    etiquette.stage("b", dict(LOC, session_id="b"))
    assert len(plan(["a", "b", "c"])) == 2

    # ⑥ 등록 안 된 유형은 조용히 사라지지 않는다 (경고 + 개입 폐기)
    async def _t():
        etiquette.reset(); reset()
        etiquette.stage(S, HES)
        sid, d = plan([S])[0]
        assert await _deliver(sid, d) is False, "미등록인데 발화가 나갔다"
        # 실패했으니 예산도 안 깎여야 한다
        assert etiquette.permit(S, "HESITATION_HELP", "hes:9:9")["allowed"]

    asyncio.run(_t())

    # ⑦ 테이프 — 거절 사유가 **남는다** (⑥까지의 침묵이 이제 기록이다)
    async def _t7():
        etiquette.reset(); reset()
        etiquette.record(S, "hes:1:2")             # 이미 말한 사안으로 만든다
        etiquette.stage(S, HES)
        sid, d = plan([S])[0]
        assert await _deliver(sid, d) is False
        assert TAPE[-1]["stage"] == "permit_denied", TAPE[-1]
        assert TAPE[-1]["reason"] == "topic_already_done", TAPE[-1]

    asyncio.run(_t7())

    # ⑧ 발화기 이음매 — LLM 없이 가짜 발화기로 ①~⑥ 전 관문을 완주한다.
    #   mock 전달(print)까지 실제 코드가 돌므로, 이 스모크가 통과하면
    #   「후보 고정 + 발화기 교체」 실험의 배선이 산 것이다.
    async def _t8():
        etiquette.reset(); reset()

        async def _b(cand):
            return "손님께 자리 변경을 알려 드리세요."
        register("LOCATION_MOVED", _b)

        def _fake_chat(message, consumer_id=None, session_id=None, history=None,
                       allow_actions=True, position=None, member_id=None):
            # 09-03: 자발형은 member_id= 로 온다 — 스텁도 같은 서명을 가져야 이음매가 검사된다
            assert member_id is not None and consumer_id is None, "자발형 신원 축이 바뀌었다"

            assert allow_actions is False, "자발형 잠금이 이음매에서 풀렸다"
            return {"reply": "찾으시는 상품의 자리가 바뀌었어요.",
                    "trace": [], "ledgers": {}}
        set_chat(_fake_chat)
        etiquette.stage(S, LOC)
        sid, d = plan([S])[0]
        assert await _deliver(sid, d) is True, TAPE[-1]
        stages = [r["stage"] for r in TAPE]
        assert stages == ["permit_ok", "delivered"], stages

    asyncio.run(_t8())
    etiquette.reset(); reset()
    print("dispatch 스모크 8갈래 전부 통과")
