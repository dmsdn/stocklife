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

from app import config, etiquette, prompts, sot_client

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
        if verdict["reason"].startswith("unknown"):
            print(f"[dispatch] 예절 거절(이상): {verdict['reason']}")
        return False

    _BUSY.add(session_id)
    try:
        from app import guard, loop        # 지연 import — 판정 스모크는 LLM 없이 돈다

        parts = []
        for cand in decision["items"]:
            text = await _build_one(cand)
            if text:
                parts.append(text)
        if not parts:
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
        result = await asyncio.to_thread(
            loop.run_chat, message, member_id, session_id, None,
            allow_actions=False)

        gv = guard.check(result["reply"], result["ledgers"])
        if not gv["ok"]:
            # 자발형은 재생성하지 않는다(반응형의 정책 ⓒ와 다른 점): 손님이 묻지도
            # 않은 말을 두 번 비용 들여 다듬을 가치가 없다. 기록도 안 남긴다 —
            # 예절 예산을 안 깎아야 다음 기회가 산다.
            print(f"[dispatch] 가드 차단 — 개입 폐기: "
                  f"{[v['reason'] for v in gv['violations']]}")
            return False

        pushed = await asyncio.to_thread(
            sot_client.push_proactive_message, session_id, result["reply"])
        if not pushed.get("ok"):
            print(f"[dispatch] 전달 실패 — 기록 안 함: {pushed}")
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
        return True
    except Exception as e:
        print(f"[dispatch] 개입 처리 실패 session={session_id}: "
              f"{type(e).__name__}: {e}")
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
    etiquette.reset(); reset()
    print("dispatch 스모크 6갈래 전부 통과")
