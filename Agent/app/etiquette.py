# ============================================================================
# StoreFlow 하네스 — 개입 예절 (헌법 10의 집, 파일명세 §1.7)
# ============================================================================
# [한 줄] 감시자가 "말할 거리"를 만들어 와도 **지금 말해도 되는가**는 여기서만 판정.
#
# [왜 따로 있는가] 개입 예절이 감시자 안에 흩어지면 세 감시자(세계·행동·시간)가
#   각자 자기 카운터로 떠들어 총량 제어가 불가능해진다 — 재고 알림·재구매 알림·
#   예산 경고가 20초 안에 셋 다 뜨면, 그 순간부터 소비자는 말풍선을 **닫는 법**부터
#   찾는다. 말할 권한은 한 곳에서 발급한다.
#   (08-21 ai-server 인수 주의: jmy의 proactive_watcher는 예절 3종을 감시자 안
#   SessionState에 들고 있었다. 감시자가 하나일 땐 문제가 안 보이지만 셋이 되는
#   순간 위 실패 시나리오가 실제가 되므로, 이관하며 이 파일로 떼어냈다.)
#
# [판정 4] ① 사안당 1회 ② 세션 총량 상한 ③ 쿨다운 ④ 우선순위(동점 금지).
#   값과 우선순위 표는 전부 config에 있다 — 여기는 규칙의 "형태"만 안다.
#
# [경계] 여기는 판정만 한다. 감지(무엇이 말할 거리인가)는 watchers/, 문장 생성은
#   loop, 전달은 sot_client.push_proactive_message. 이 파일은 그 넷을 모른다 —
#   아는 것은 "세션별 개입 장부"뿐이다.
# ============================================================================
#
# ─── 개념 사전 — 이 파일에 처음 나오는 개념 1개 ─────────────────────────────
# (①~㊿: 앞 파일들의 사전은 아는 것으로 전제)
#
# (51) 모듈 상태를 dict 하나로 들기 — 상태의 단일 소유
#    _SESSIONS = {세션ID: 장부dict}. 서버가 떠 있는 동안 요청·이벤트를 넘나들며
#    유지되는 상태다(요청마다 새로 시작하는 loop의 ledgers와 대비된다 — 예절은
#    "이 세션에 지금까지 몇 번 말 걸었나"라서 요청보다 수명이 길어야 한다).
#    주의점 둘: ① 서버를 재시작하면 초기화된다 — 예절 카운터는 잃어도 피해가
#    "한 번 더 말 걸 수 있음" 정도라 감수한다(DB에 둘 무게가 아니다).
#    ② 무한히 쌓인다 — 그래서 cleanup()이 오래된 세션을 지운다(메모리 누수 방지).
# ────────────────────────────────────────────────────────────────────────────

import time

from app import config

# (51) 세션별 개입 장부. 장부 한 줄의 모양:
#   {"count": 지금까지 개입 횟수, "last_at": 마지막 개입 시각(초),
#    "topics": 이미 말한 사안 집합, "touched_at": 장부를 마지막으로 만진 시각}
_SESSIONS: dict = {}


def _book(session_id: str) -> dict:
    """세션의 장부를 꺼낸다(없으면 새로 만든다). setdefault 한 줄이 그 일을 다 한다."""
    book = _SESSIONS.setdefault(session_id, {"count": 0, "last_at": 0.0,
                                             "topics": set(), "touched_at": 0.0})
    book["touched_at"] = time.time()
    return book


def permit(session_id: str, topic_type: str, topic_key: str,
           now: float | None = None) -> dict:
    """개입 허가 판정. 감시자가 후보를 만들 때마다 부른다.

    [입력]
      topic_type : 개입 유형 — config.INTERVENTION_PRIORITY의 키여야 한다
                   (예: "HESITATION_HELP"). 없는 유형은 즉시 거절 — 우선순위를
                   못 매기는 개입을 통과시키면 ④번 판정이 구멍 난다.
      topic_key  : 사안의 식별자. 유형+대상을 붙여 만든다
                   (예: "hesitation:101042:101043" — 같은 두 상품 조합은 같은 사안).
      now        : 판정 시각(초). 평소엔 안 넘긴다(지금 시각 사용) — 시나리오
                   재생 평가가 가짜 시계를 넘기기 위한 구멍이다.
    [출력] {"allowed": bool, "reason": str} — 거절 사유를 값으로 주는 이유는
      감시자 로그에서 "왜 조용했는가"를 추적하기 위해서다(조용한 실패 방지).
    """
    if topic_type not in config.INTERVENTION_PRIORITY:
        return {"allowed": False, "reason": f"unknown_topic_type:{topic_type}"}
    if now is None:
        now = time.time()
    book = _book(session_id)

    # ① 사안당 1회 — 같은 얘기를 두 번 꺼내는 순간 도우미가 아니라 스팸이 된다.
    if config.INTERVENTION_ONCE_PER_TOPIC and topic_key in book["topics"]:
        return {"allowed": False, "reason": "topic_already_done"}
    # ② 세션 총량 — 15분 데모에서 3~4회가 "살아있다"와 "수다스럽다"의 경계(config 주석).
    if book["count"] >= config.INTERVENTION_MAX_PER_SESSION:
        return {"allowed": False, "reason": "session_quota_exhausted"}
    # ③ 쿨다운 — 직전 개입과의 최소 간격. 연달아 말하면 총량이 남아도 시끄럽다.
    if book["last_at"] and now - book["last_at"] < config.INTERVENTION_COOLDOWN_SEC:
        return {"allowed": False, "reason": "cooldown"}

    return {"allowed": True, "reason": "ok"}


def pick(candidates: list[dict]) -> dict | None:
    """같은 순간 후보가 여럿일 때 하나를 고른다 — ④ 우선순위 판정.

    candidates 각 원소는 {"topic_type": ..., ...} 를 가진 dict.
    우선순위 값이 큰 것 하나만 살아남는다 — 동시에 둘을 말하면 총량이 두 배로
    깎이고, 손님은 둘 다 안 읽는다. config의 표가 동점을 두지 않으므로
    (같은 입력 = 같은 승자) 시나리오 재생 평가가 재현 가능하다.
    """
    ranked = [c for c in candidates
              if c.get("topic_type") in config.INTERVENTION_PRIORITY]
    if not ranked:
        return None
    # max(목록, key=함수) = key 값이 가장 큰 원소 하나. 우선순위 표에서 유형의
    # 점수를 꺼내 비교한다 — 표에 없는 유형은 위에서 이미 걸렀다.
    return max(ranked, key=lambda c: config.INTERVENTION_PRIORITY[c["topic_type"]])


def record(session_id: str, topic_key: str, now: float | None = None,
           also: tuple | list = ()) -> None:
    """개입이 **실제로 나간 뒤** 장부에 적는다. permit과 짝이지만 자동이 아니다.

    허가와 기록을 나눈 이유: 허가를 받고도 개입이 무산될 수 있다 — 문장 생성이
    가드에 막히거나 백엔드 전달이 실패하면 말은 안 나간 것이다. 그때 카운터를
    깎으면 조용히 예산만 새서, 정작 말해야 할 순간에 총량이 바닥난다.
    """
    if now is None:
        now = time.time()
    book = _book(session_id)
    book["count"] += 1
    book["last_at"] = now
    book["topics"].add(topic_key)
    # 묶음이면 안의 각 항목도 **개별 사안으로** 적는다 — 안 적으면 브리핑에서
    # 이미 말한 "샴푸 살 때 됐어요"가 30분 뒤 단독 개입으로 또 나온다.
    # count 는 안 올린다: 개입은 한 번이었고, 예산은 개입을 센다.
    for k in also:
        book["topics"].add(k)


# ── 스테이징 — 같은 순간의 후보를 모았다가 한 번에 판정한다 (08-26 ③) ────────
# [무엇을 고치는 코드인가] 여기까지의 permit/pick 은 **후보가 하나씩 온다**는 전제
#   위에 있다. 감시자가 후보를 만들면 그 자리에서 허가를 받고 말한다. 감시자가
#   하나일 때는 맞는 그림이었다.
#
#   그런데 **진입 순간은 여러 감시자가 동시에 깬다.** 자리가 바뀐 상품(50),
#   품절이던 게 들어온 것(40), 살 때 된 것(20) — 셋 다 진입 직후에 유효하다.
#   pick()은 하나만 남기므로 20짜리는 진다. 그리고 진입 브리핑은 **진입 순간에만**
#   유효해서, 쿨다운(90초)에 밀리는 사이 손님은 이미 매대 사이에 있다.
#
#       시점이 고정  +  우선순위 최하위  ⇒  다음 기회가 없다
#
#   **킬링 장면 3이 다른 장면에 밀려 안 나오는 구조**이고, 데모 당일에 터진다.
#
# [왜 우선순위를 올리는 것으로 안 고치나] STORE_ENTRY_BRIEF 를 55로 올리면
#   장면 3은 살지만 **위치 이동을 뒤로 미룬다** — 손님이 빈 매대 앞에 서게 되는,
#   손해가 가장 큰 쪽이다. 순서를 바꾸는 것으로는 못 푼다.
#
# [그래서 무엇을 하나] 진입 순간에는 **고르지 않고 묶는다.**
#     "안녕하세요. 살 때 되신 물티슈랑 샴푸가 있고,
#      지난번 찾으시던 A도 어제 들어왔어요."
#   여러 자산이 할 말이 있는 것은 진입에서 **자연스럽다.** 하나의 인사말로 묶는
#   편이 UX도 낫고 **예산도 1만 쓴다**(permit은 개입 횟수를 센다 — 품목 수가 아니다).
#
# [가드는 안 고쳐도 된다 — 08-26 실측] 묶으면 한 문장에 이력 원장(재구매)과 매대
#   원장(가용예측)이 섞인다. 처음엔 이게 A안의 대가라고 봤는데, guard.check 를
#   읽어 보니 **이미 다출처 발화가 정상 경로**였다:
#     · check(reply, ledgers) 는 턴 단위 원장 **합집합**을 받는다 — 주장을 개별
#       도구에 귀속시키지 않는다
#     · _FACT_RULES 가 사실 종류마다 복수 출처를 허용한다(price: sot·compute)
#     · 오늘도 "12,900원이고 15분 뒤 보충됩니다"는 sot+infer 가 섞인 발화다
#   묶음 브리핑은 구조적으로 이것과 같다. **가드 변경 0.**
#
# [이 파일이 여전히 모르는 것] 문장 생성·전달·감지는 그대로 밖의 일이다.
#   스테이지는 "누가 말할 차례인가"를 정하는 **장부의 연장**이지 발화 경로가 아니다.

# 세션별 후보 대기열. {세션ID: [후보dict, ...]}
#   장부(_SESSIONS)와 따로 두는 이유: 장부는 "이미 말한 것"의 기록이라 수명이
#   길고(TTL 30분), 스테이지는 "아직 안 말한 것"이라 **한 틱만 살면 된다.**
#   같은 dict에 섞으면 cleanup이 둘을 같은 잣대로 지우게 된다.
_STAGE: dict = {}


def stage(session_id: str, candidate: dict) -> None:
    """감시자가 후보를 **넣기만** 한다. 여기서는 판정도 발화도 하지 않는다.

    [무엇을 받나] candidate 는 최소 {"topic_type", "topic_key"} 를 가진 dict.
      진입 순간의 후보는 여기에 **"moment": "entry"** 를 달아 온다.

    [왜 감시자가 moment 를 다나] 매장 안/밖은 관측이 아니라 **행동 증거로 추론**
      한다(설계서 §4.1의 맥락 축). 그 추론 결과를 들고 있는 것은 진입을 감지한
      감시자뿐이다. 다른 감시자는 진입인지 몰라도 되고, 알 방법도 없다.
      세션이 열린 시각으로 대신 판정하려다 접었다 — 손님이 **집에서 앱을 여는**
      경우에도 진입 창이 열려 매장 밖에 브리핑이 나간다.

    [부작용] _STAGE 를 바꾼다. 반환값이 없는 이유는 "넣었다"는 사실 말고
      돌려줄 것이 없어서다 — 허가는 drain 이 낸다.
    """
    _STAGE.setdefault(session_id, []).append(candidate)


def compose(candidates: list[dict], max_items: int | None = None) -> list[dict]:
    """같은 순간의 후보를 **한 번의 개입으로 묶는다.** pick() 의 짝이 아니라 대안이다.

        pick     하나만 남긴다  — 서로 무관한 시점에 각각 말할 때
        compose  여럿을 묶는다  — **같은 순간에 다 말해야 의미가 있을 때**(진입)

    [순서] 우선순위 내림차순. 묶어도 순서는 있다 — 손해가 큰 것(위치 이동)을
      앞에 두어야 손님이 끝까지 안 읽어도 중요한 것이 전달된다.
    [상한] config.BUNDLE_MAX_ITEMS. 예산과 **무관한 별도 손잡이**다 —
      permit 은 개입 횟수를 세므로 세 품목을 말해도 count 는 1이다. 상한의 근거는
      예산이 아니라 발화 길이·신뢰(한 번에 다섯을 말하면 하나도 안 읽는다).
    [반환] 잘라낸 후보 목록. 빈 목록일 수 있다(전부 유형 표에 없을 때).
    """
    if max_items is None:
        max_items = config.BUNDLE_MAX_ITEMS
    ranked = [c for c in candidates
              if c.get("topic_type") in config.INTERVENTION_PRIORITY]
    # sorted(..., reverse=True) 로 큰 값부터. pick 의 max()와 같은 표를 쓴다 —
    # 두 함수가 다른 기준으로 정렬하면 "묶을 때와 고를 때의 중요도가 다른" 셈이 된다.
    ranked.sort(key=lambda c: config.INTERVENTION_PRIORITY[c["topic_type"]],
                reverse=True)
    return ranked[:max_items]


def drain(session_id: str, now: float | None = None) -> dict | None:
    """스테이지를 비우고 **지금 내보낼 개입 하나**를 만든다. 없으면 None.

    [반환 모양]
      {"mode": "bundle"|"single",     묶음인가 단일인가
       "topic_type": str,             예산을 쓸 유형 (묶음이면 STORE_ENTRY_BRIEF)
       "topic_key": str,              장부에 적을 대표 키
       "items": [후보dict, ...]}      묶음이면 여럿, 단일이면 1개

    [왜 dict 을 돌려주고 발화는 안 하나] 이 파일은 판정만 한다(파일명세 §1.7의
      경계). 문장 생성은 loop, 전달은 sot_client 다. 그리고 **판정과 발화를
      갈라놔야 LLM 없이 예절을 회귀 테스트할 수 있다**(behavior.tick 과 같은 이유).

    [비우는 것이 먼저다] 허가가 안 나도 스테이지는 비운다. 안 비우면 다음 틱에
      같은 후보가 또 올라와 대기열이 무한히 자란다 — 쿨다운에 걸린 세션일수록
      더 빨리 자란다(말을 못 하니까). 개입 기회는 시간 창이 좁아서, 이번에 못
      나간 후보는 **다음에 나가도 이미 의미가 없는 경우가 대부분**이다.
    """
    cands = _STAGE.pop(session_id, [])
    if not cands:
        return None
    if now is None:
        now = time.time()

    # 진입 후보가 하나라도 섞여 있으면 묶음이다. any(...)는 하나라도 참이면 참 —
    # 전부 진입일 필요가 없다(진입 순간에 세계 감시자가 깬 것도 같이 묶는 게 요점).
    if any(c.get("moment") == "entry" for c in cands):
        items = compose(cands)
        if not items:
            return None
        # 묶음은 유형·키가 **하나**다. 예산 1을 쓰고, 장부에도 한 줄로 적힌다.
        # 키에 세션을 넣는 이유: 진입은 세션당 한 번이므로 재진입(새 세션)이면
        # 다시 말해도 된다. member 를 넣으면 다음 방문에 영영 침묵한다.
        return {"mode": "bundle", "topic_type": "STORE_ENTRY_BRIEF",
                "topic_key": f"entry:{session_id}", "items": items}

    one = pick(cands)
    if one is None:
        return None
    return {"mode": "single", "topic_type": one["topic_type"],
            "topic_key": one["topic_key"], "items": [one]}


def clear_stage(session_id: str | None = None) -> None:
    """스테이지를 버린다. session_id 가 None 이면 전부 — 테스트·재생 전용."""
    if session_id is None:
        _STAGE.clear()
    else:
        _STAGE.pop(session_id, None)


def cleanup(now: float | None = None) -> int:
    """오래 조용한 세션의 장부를 지운다. 감시자의 주기 작업이 부른다. 반환 = 지운 수."""
    if now is None:
        now = time.time()
    stale = [sid for sid, b in _SESSIONS.items()
             if now - b["touched_at"] > config.WATCH_SESSION_TTL_SEC]
    for sid in stale:
        _STAGE.pop(sid, None)       # 장부를 지우면 대기열도 같이 — 안 지우면 누수
        # dict.pop(키, None) = 지우되 없어도 조용히 — 순회 중 목록을 떠놨으므로
        # (stale는 별도 리스트) "돌면서 지우기" 오류(RuntimeError)가 안 난다.
        _SESSIONS.pop(sid, None)
    return len(stale)


def reset() -> None:
    """장부 전체 초기화 — 테스트·시나리오 재생 전용. 운영 코드는 부르지 않는다."""
    _SESSIONS.clear()
    _STAGE.clear()


# ── 스모크 (LLM·네트워크 없음): python -m app.etiquette ─────────────────────
if __name__ == "__main__":
    reset()
    t0 = 1000.0    # 가짜 시계 — 실제 시간을 기다리지 않고 쿨다운·총량을 검증한다

    # ① 첫 개입 허가 → 기록 → 같은 사안 재시도는 거절
    assert permit("s1", "HESITATION_HELP", "hes:1:2", now=t0)["allowed"]
    record("s1", "hes:1:2", now=t0)
    assert permit("s1", "HESITATION_HELP", "hes:1:2", now=t0 + 200)["reason"] == "topic_already_done"

    # ② 쿨다운: 90초 안 다른 사안은 거절, 지나면 허가
    assert permit("s1", "HESITATION_HELP", "hes:3:4", now=t0 + 30)["reason"] == "cooldown"
    assert permit("s1", "HESITATION_HELP", "hes:3:4", now=t0 + 91)["allowed"]

    # ③ 총량: 4회 채우면 다섯 번째는 거절
    for i in range(3):
        record("s1", f"hes:{i}:x", now=t0 + 100 * (i + 2))
    assert permit("s1", "HESITATION_HELP", "hes:9:9", now=t0 + 999)["reason"] == "session_quota_exhausted"

    # ④ 우선순위: 자리 이동(50) > 망설임(30) — 동시 후보에서 자리 이동이 이긴다
    win = pick([{"topic_type": "HESITATION_HELP"}, {"topic_type": "LOCATION_MOVED"}])
    assert win["topic_type"] == "LOCATION_MOVED"

    # ⑤ 모르는 유형은 거절 + 청소 동작
    assert not permit("s2", "NO_SUCH_TYPE", "x")["allowed"]
    reset()

    # ── 스테이징 5갈래 (08-26 ③) ──────────────────────────────────────────
    S = "sess-demo"
    ENTRY = {"topic_type": "STORE_ENTRY_BRIEF", "topic_key": "rp:9001:101042",
             "moment": "entry"}
    LOC = {"topic_type": "LOCATION_MOVED", "topic_key": "loc:101055"}
    AVAIL = {"topic_type": "AVAILABILITY_CHANGE", "topic_key": "av:101088"}
    HES = {"topic_type": "HESITATION_HELP", "topic_key": "hes:1:2"}

    # ⑥ **문제의 재현** — 예전 방식(pick)이면 진입 브리핑이 진다.
    #    이 줄이 통과한다는 것은 ③ 결정이 실재한 문제를 고쳤다는 뜻이다.
    assert pick([LOC, AVAIL, ENTRY])["topic_type"] == "LOCATION_MOVED"

    # ⑦ 같은 후보를 스테이지에 넣으면 **묶인다** — 셋 다 살고, 순서는 우선순위순
    for c in (LOC, AVAIL, ENTRY):
        stage(S, c)
    out = drain(S)
    assert out["mode"] == "bundle" and len(out["items"]) == 3
    assert [i["topic_type"] for i in out["items"]] == [
        "LOCATION_MOVED", "AVAILABILITY_CHANGE", "STORE_ENTRY_BRIEF"]
    assert out["topic_key"] == f"entry:{S}"

    # ⑧ 묶음은 **예산을 1만** 쓴다. 그리고 안의 항목이 개별 사안으로도 적혀
    #    브리핑에서 말한 것이 나중에 단독 개입으로 또 나오지 않는다.
    assert permit(S, out["topic_type"], out["topic_key"])["allowed"]
    record(S, out["topic_key"], also=[i["topic_key"] for i in out["items"]])
    assert _SESSIONS[S]["count"] == 1                      # 3이 아니다
    assert not permit(S, "REPURCHASE_DUE", "rp:9001:101042")["allowed"]

    # ⑨ 진입이 아니면 예전처럼 하나만 고른다
    reset()
    for c in (HES, LOC):
        stage(S, c)
    assert drain(S)["topic_type"] == "LOCATION_MOVED"

    # ⑩ 대기열이 자라지 않는다 — 허가와 **무관하게** 비운다
    reset()
    stage(S, ENTRY); stage(S, LOC)
    drain(S)
    assert not _STAGE.get(S)
    assert drain(S) is None
    # 상한: 진입 후보가 넘쳐도 BUNDLE_MAX_ITEMS 로 잘린다
    for i in range(6):
        stage(S, {"topic_type": "AVAILABILITY_CHANGE", "topic_key": f"av:{i}",
                  "moment": "entry"})
    assert len(drain(S)["items"]) == config.BUNDLE_MAX_ITEMS
    reset()
    print("etiquette 스모크 10갈래 전부 통과 (예절 5 + 스테이징 5)")
