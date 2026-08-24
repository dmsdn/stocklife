# ============================================================================
# Agent 하네스 — 개입 정책
# ============================================================================

# [한 줄] 감시자가 "말할 거리"를 만들어 와도 **지금 말해도 되는가**는 여기서만 판정.

# [왜 따로 있는가] 개입 예절이 감시자 안에 흩어지면 세 감시자(세계·행동·시간)가 각자 자기 카운터로 떠들어 총량 제어가 불가능해진다
# 재고 알림·재구매 알림·예산 경고가 20초 안에 셋 다 뜨면, 그 순간부터 소비자는 말풍선을 **닫는 법**부터 찾는다. 말할 권한은 한 곳에서 발급한다.

# [판정 4] ① 사안당 1회 ② 세션 총량 상한 ③ 쿨다운 ④ 우선순위(동점 금지).
#  값과 우선순위 표는 전부 config에 있다 — 여기는 규칙의 "형태"만 안다.

# [경계] 여기는 판정만 한다.
# 감지(무엇이 말할 거리인가)는 watchers/, 문장 생성은 loop, 전달은 sot_client.push_proactive_message. 이 파일은 그 넷을 모른다 — 아는 것은 "세션별 개입 장부"뿐이다.
# ============================================================================

import time

from app import config

# 세션별 개입 장부. 장부 한 줄의 모양:
# {"count": 지금까지 개입 횟수, "last_at": 마지막 개입 시각(초),
# "topics": 이미 말한 사안 집합, "touched_at": 장부를 마지막으로 만진 시각}
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


def record(session_id: str, topic_key: str, now: float | None = None) -> None:
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


def cleanup(now: float | None = None) -> int:
    """오래 조용한 세션의 장부를 지운다. 감시자의 주기 작업이 부른다. 반환 = 지운 수."""
    if now is None:
        now = time.time()
    stale = [sid for sid, b in _SESSIONS.items()
             if now - b["touched_at"] > config.WATCH_SESSION_TTL_SEC]
    for sid in stale:
        # dict.pop(키, None) = 지우되 없어도 조용히 — 순회 중 목록을 떠놨으므로
        # (stale는 별도 리스트) "돌면서 지우기" 오류(RuntimeError)가 안 난다.
        _SESSIONS.pop(sid, None)
    return len(stale)


def reset() -> None:
    """장부 전체 초기화 — 테스트·시나리오 재생 전용. 운영 코드는 부르지 않는다."""
    _SESSIONS.clear()


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
    print("etiquette 스모크 5갈래 전부 통과")
