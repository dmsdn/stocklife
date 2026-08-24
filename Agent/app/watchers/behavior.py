# ============================================================================
# Agent 하네스 — 행동 감시자 (자발형 · 신호원=행동)
# ============================================================================

# [한 줄] 백엔드 SSE로 흘러오는 소비자 행동(VIEW·SCAN_ADD…)을 지켜보다가,
# "망설임" 규칙이 차면 예절 허가를 받아 루프를 깨워 먼저 말을 건다 — 장면 2.

# 구조를 셋으로:
# ① 예절(사안당 1회·총량·쿨다운)은 etiquette.py로 — 감시자가 셋이 될 때 총량 제어가 한 곳이어야 하므로 (etiquette.py 머리 주석의 실패 시나리오)
# ② 문장 생성은 Claude 직호출이 아니라 **loop.run_chat 경유**로 — 그래야 자발형 발화에도 가드(원장 대조)가 걸린다.
# ③ 세계 접근은 전부 sot_client로 — 이 파일에 URL·httpx 호출이 없다
# (SSE 구독 딱 하나만 예외로 여기 있다 — 스트림은 조회가 아니라 '구독'이라 sot_client의 요청-응답 모양에 안 맞는다.
# 대신 주소는 sot_client와 같은 config.BACKEND_BASE_URL에서 만든다).

# [감지 규칙 — 전부 config 상수] 90초 창 안 VIEW 3회 이상 + 서로 다른 상품 2개 이상 + 12초 무행동 → 망설임 후보. SCAN_ADD·PURCHASE가 오면 창을 비운다.
# (결정을 내렸으니 더는 망설임이 아니다). LLM은 이 판정에 관여하지 않는다 — 규칙이 거르고, LLM은 걸러진 순간의 문장만 만든다.

# ============================================================================

import asyncio
import json
import time
from datetime import datetime

from app import config, etiquette, prompts, sot_client

# ── 세션별 관찰 상태 ──────────────────
# _VIEWS[세션] = [{"t": 시각(초), "sku": 상품번호}, …]  — 창 안의 VIEW만 유지
# _LAST_EVENT[세션] = 마지막 행동 시각  /  _MEMBER[세션] = 회원 번호(비회원 None)
# _BUSY = 지금 문장을 만드는 중인 세션 — 같은 세션에 개입 둘이 겹쳐 나가는 것을
#         막는 잠금이다(문장 생성이 수 초 걸리는 동안 tick이 또 돌기 때문).
_VIEWS: dict = {}
_LAST_EVENT: dict = {}
_MEMBER: dict = {}
_BUSY: set = set()
_STOP = asyncio.Event()


def _parse_ts(value) -> float:
    """SSE의 occurredAt(ISO 문자열)을 초 단위 숫자로. 없거나 못 읽으면 지금 시각.

    fromisoformat은 "2026-08-21T14:02:10+00:00"류를 datetime으로 읽는다.
    끝의 'Z'(UTC 표기)는 못 읽는 파이썬 판이 있어 +00:00으로 바꿔준다.
    .timestamp() = 그 시각을 1970년 기준 경과 초(float)로 — 창·간격 산술은
    전부 이 숫자로 한다(문자열로는 "12초 지났나"를 못 잰다).
    """
    if not value:
        return time.time()
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return time.time()


def _trim(session_id: str, now: float) -> None:
    """창(90초) 밖으로 밀려난 VIEW를 버린다 — 아까 본 것은 지금의 망설임이 아니다."""
    cutoff = now - config.HESITATION_WINDOW_SEC
    _VIEWS[session_id] = [v for v in _VIEWS.get(session_id, []) if v["t"] >= cutoff]


def on_event(event_type: str, data: dict, now: float | None = None) -> None:
    """행동 이벤트 하나를 상태에 반영한다. SSE 수신 루프(와 스모크)가 부른다.

    판정하지 않는다 — 여기는 기록만. 판정은 tick()이 주기적으로 한다.
    (이벤트마다 판정하면 "12초 무행동" 조건을 검사할 시점이 없다 — 무행동은
    이벤트가 **안 오는** 상태라서, 시계를 가진 쪽이 물어야 한다.)
    """
    session_id = data.get("sessionId")
    if not session_id:
        return                          # 세션 없는 이벤트는 누구의 망설임도 아니다
    ts = _parse_ts(data.get("occurredAt")) if now is None else now
    _LAST_EVENT[session_id] = max(_LAST_EVENT.get(session_id, 0.0), ts)
    if data.get("memberId") is not None:
        _MEMBER[session_id] = int(data["memberId"])

    if event_type == "VIEW" and data.get("skuId") is not None:
        _VIEWS.setdefault(session_id, []).append({"t": ts, "sku": int(data["skuId"])})
        _trim(session_id, ts)
    elif event_type in ("SCAN_ADD", "PURCHASE"):
        # 담았거나 샀다 = 결정을 내렸다. 지금까지의 관찰은 망설임이 아니었다.
        _VIEWS[session_id] = []


def _candidate(session_id: str, now: float) -> dict | None:
    """망설임 규칙 판정. 조건이 다 차면 개입 후보 dict, 아니면 None.

    후보의 sku 둘은 "가장 많이 본 것, 동률이면 최근 본 것" 순으로 고른다(jmy 규칙
    보존) — 손님이 저울질하는 두 상품이 바로 그 둘일 확률이 가장 높다.
    """
    if session_id in _BUSY:
        return None                     # 이미 이 세션의 문장을 만드는 중
    _trim(session_id, now)
    views = _VIEWS.get(session_id, [])
    if len(views) < config.HESITATION_MIN_VIEWS:
        return None
    distinct = {v["sku"] for v in views}
    if len(distinct) < config.HESITATION_MIN_DISTINCT_SKUS:
        return None
    if now - _LAST_EVENT.get(session_id, 0.0) < config.HESITATION_IDLE_SEC:
        return None                     # 아직 화면을 넘기는 중일 수 있다

    # sku별 (본 횟수, 마지막 본 시각)을 만들어 정렬 기준으로 쓴다.
    counts: dict = {}
    last_seen: dict = {}
    for v in views:
        counts[v["sku"]] = counts.get(v["sku"], 0) + 1
        last_seen[v["sku"]] = max(last_seen.get(v["sku"], 0.0), v["t"])
    ranked = sorted(distinct, key=lambda s: (counts[s], last_seen[s]), reverse=True)
    top2 = tuple(ranked[:2])
    # 사안 키: 같은 두 상품 조합은 순서와 무관하게 같은 사안이어야 하므로 정렬해 붙인다.
    topic_key = "hesitation:" + ":".join(str(s) for s in sorted(top2))
    return {"topic_type": "HESITATION_HELP", "topic_key": topic_key,
            "session_id": session_id, "member_id": _MEMBER.get(session_id),
            "sku_ids": top2}


def tick(now: float | None = None) -> list[dict]:
    """전 세션을 한 바퀴 판정하고, **예절 허가까지 받은** 후보 목록을 돌려준다.

    now 인자는 스모크·시나리오 재생용 가짜 시계 구멍(etiquette.permit과 동일).
    반환만 하고 실행하지 않는 이유: 문장 생성(비동기·수 초)과 규칙 판정(즉시)을
    갈라놔야 판정 로직을 LLM 없이 검증할 수 있다 — 평가 하네스가 이 함수까지만
    부르면 자발형 감지의 회귀 테스트가 된다.
    """
    if now is None:
        now = time.time()
    allowed = []
    # list(...)로 키 목록을 떠놓고 도는 이유: 도는 중에 _VIEWS가 바뀌어도
    # (다른 스레드의 on_event) "돌면서 수정" 오류가 안 나게.
    for session_id in list(_VIEWS.keys()):
        cand = _candidate(session_id, now)
        if cand is None:
            continue
        verdict = etiquette.permit(session_id, cand["topic_type"],
                                   cand["topic_key"], now=now)
        if verdict["allowed"]:
            allowed.append(cand)
        # 거절 사유는 조용히 삼키지 않는다 — 단, 매 틱 찍으면 로그가 홍수가 되므로
        # 쿨다운·중복 거절은 침묵하고, 이상 사유(unknown_topic_type)만 찍는다.
        elif verdict["reason"].startswith("unknown"):
            print(f"[behavior] 예절 거절(이상): {verdict['reason']}")
    return allowed


async def _handle(cand: dict) -> None:
    """허가된 후보 하나를 발화까지 완주시킨다: 문장 생성(루프) → 가드 → 전달 → 기록."""
    from app import guard, loop         # 지연 import — 감지·판정 스모크는 LLM 없이 돌아야 한다
    session_id = cand["session_id"]
    _BUSY.add(session_id)
    try:
        # 상품 이름을 붙여 지시문을 만든다. 이름 조회가 실패해도 번호로 진행 —
        # 개입 기회는 시간 창이 좁아서(손님이 곧 이동한다) 완벽보다 제때가 낫다.
        names = []
        for sku in cand["sku_ids"]:
            p = await asyncio.to_thread(sot_client.get_product, sku)      # (53)
            names.append(f"{p['name']}(sku {sku})" if p else f"sku {sku}")
        message = prompts.PROACTIVE_HESITATION.format(sku_list=" / ".join(names))

        # 문장은 반드시 루프가 만든다 — 도구로 사실을 확인하고 원장을 남기는
        # 유일한 경로다. 동기 함수라 (53)으로 회전판 밖에서 돌린다.
        # allow_actions=False: 손님이 시키지 않았으므로 장바구니 조작을 **경로에서**
        # 잠근다(프롬프트 금지는 지침일 뿐 — loop.run_chat의 인자 주석, 08-24 검수).
        result = await asyncio.to_thread(
            loop.run_chat, message,
            cand["member_id"], session_id, None, allow_actions=False)

        verdict = guard.check(result["reply"], result["ledgers"])
        if not verdict["ok"]:
            # 자발형은 재생성하지 않는다(반응형의 정책 ⓒ와 다른 점): 손님이 묻지도
            # 않은 말을 두 번 비용 들여 다듬을 가치가 없다 — 이번 개입을 버리고,
            # 기록도 안 남긴다(예절 예산을 안 깎아야 다음 기회가 산다).
            print(f"[behavior] 가드 차단 — 개입 폐기: {[v['reason'] for v in verdict['violations']]}")
            return
        pushed = await asyncio.to_thread(
            sot_client.push_proactive_message, session_id, result["reply"])
        if not pushed.get("ok"):
            print(f"[behavior] 전달 실패 — 기록 안 함: {pushed}")
            return
        etiquette.record(session_id, cand["topic_key"])
        _VIEWS[session_id] = []         # 같은 관찰 묶음으로 재개입하지 않도록 비운다
        print(f"[behavior] HESITATION_HELP 발화 완료 session={session_id} sku={cand['sku_ids']}")
    except Exception as e:
        print(f"[behavior] 개입 처리 실패 session={session_id}: {type(e).__name__}: {e}")
    finally:
        _BUSY.discard(session_id)       # remove와 달리 없어도 조용히 — 예외 경로에서도 잠금 해제


async def _tick_forever() -> None:
    """주기 평가 루프. WATCH_TICK_SEC마다 규칙을 재평가하고 허가된 개입을 띄운다."""
    while not _STOP.is_set():
        try:
            for cand in tick():
                asyncio.create_task(_handle(cand))          # (54) 배경 일감으로 등록
            etiquette.cleanup()
            # 오래된 관찰 상태도 함께 청소 (etiquette의 세션 장부와 같은 TTL).
            now = time.time()
            for sid in [s for s, t in _LAST_EVENT.items()
                        if now - t > config.WATCH_SESSION_TTL_SEC]:
                _VIEWS.pop(sid, None); _LAST_EVENT.pop(sid, None); _MEMBER.pop(sid, None)
        except Exception as e:
            print(f"[behavior] tick 실패: {type(e).__name__}: {e}")
        try:
            # sleep 대신 "stop 신호를 최대 N초 기다리기" — 종료 신호가 오면
            # N초를 다 안 기다리고 즉시 깬다(서버 내리는 데 2초씩 끌지 않게).
            await asyncio.wait_for(_STOP.wait(), timeout=config.WATCH_TICK_SEC)
        except asyncio.TimeoutError:
            pass                        # 타임아웃 = 신호 없음 = 다음 바퀴로 (정상)


async def _listen_forever() -> None:
    """백엔드 SSE(/internal/events/stream)를 상시 구독한다. 끊기면 지수 백오프 재연결.

    SSE(Server-Sent Events) 형식: 한 이벤트가 "event: VIEW\\n data: {...json...}\\n
    빈 줄" 로 온다 — 빈 줄이 이벤트의 끝 표시라서, 줄을 모으다가 빈 줄에서
    한 건을 완성해 on_event로 넘긴다(jmy의 파서를 그대로 인수).
    """
    import httpx, os
    backoff = 1.0
    url = config.BACKEND_BASE_URL + "/internal/events/stream"
    headers = {"X-Internal-Service-Key": os.environ.get("INTERNAL_SERVICE_KEY", "")}
    # read=None = 수신 타임아웃 없음. SSE는 "다음 이벤트까지 무한정 기다리는" 것이
    # 정상 상태라, 조회용 타임아웃을 걸면 조용한 매장에서 주기적으로 끊긴다.
    timeout = httpx.Timeout(connect=5.0, read=None, write=5.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        while not _STOP.is_set():
            try:
                async with client.stream("GET", url, headers=headers) as resp:
                    resp.raise_for_status()
                    print(f"[behavior] SSE 연결됨: {url}")
                    backoff = 1.0       # 연결 성공 — 다음 실패는 다시 1초부터
                    event_name, data_lines = None, []
                    async for line in resp.aiter_lines():   # (52) 줄 단위 비동기 수신
                        if _STOP.is_set():
                            return
                        if line == "":                      # 빈 줄 = 이벤트 한 건 완성
                            if event_name and data_lines:
                                try:
                                    data = json.loads("\n".join(data_lines))
                                except json.JSONDecodeError:
                                    pass                    # 깨진 이벤트는 버린다
                                else:
                                    if event_name != "connected":
                                        on_event(event_name, data)
                            event_name, data_lines = None, []
                        elif line.startswith("event:"):
                            event_name = line[6:].strip()
                        elif line.startswith("data:"):
                            data_lines.append(line[5:].strip())
            except asyncio.CancelledError:
                raise                   # 서버 종료의 취소 신호는 삼키면 안 된다
            except Exception as e:
                print(f"[behavior] SSE 끊김: {type(e).__name__}: {e} ({backoff:.0f}초 뒤 재연결)")
                try:
                    await asyncio.wait_for(_STOP.wait(), timeout=backoff)
                except asyncio.TimeoutError:
                    pass
                backoff = min(backoff * 2, 15.0)   # 1→2→4→…→15초 상한 (백엔드 재시작 배려)


async def run() -> None:
    """감시자 본체 — main.py의 lifespan이 배경 일감으로 등록한다.

    mock 모드에서는 아무것도 안 하고 끝난다: SSE를 줄 백엔드가 없어서 연결
    실패 로그만 쌓인다. 자발형의 mock 검증은 SSE가 아니라 on_event/tick을
    직접 부르는 시나리오 재생(08/29)으로 한다.
    """
    if config.USE_MOCK_SOT:
        print("[behavior] mock 모드 — SSE 구독 없이 대기(시나리오 주입 전용)")
        return
    _STOP.clear()
    await asyncio.gather(_listen_forever(), _tick_forever())    # (54)


def stop() -> None:
    """종료 신호. lifespan의 내려가는 길이 부른다."""
    _STOP.set()


def reset() -> None:
    """관찰 상태 초기화 — 테스트·시나리오 재생 전용."""
    _VIEWS.clear(); _LAST_EVENT.clear(); _MEMBER.clear(); _BUSY.clear()


# ── 스모크 (LLM·네트워크 없음 — 감지+예절까지): python -m app.watchers.behavior ──
if __name__ == "__main__":
    etiquette.reset(); reset()
    t0 = 5000.0
    S = "sess-demo"

    # ① VIEW 3회(상품 2종) 직후에는 무행동 조건 미달 → 후보 없음
    on_event("VIEW", {"sessionId": S, "skuId": 101042, "memberId": 9001}, now=t0)
    on_event("VIEW", {"sessionId": S, "skuId": 101043}, now=t0 + 4)
    on_event("VIEW", {"sessionId": S, "skuId": 101042}, now=t0 + 8)
    assert tick(now=t0 + 9) == [], "무행동 12초 전에 개입이 떴다"

    # ② 12초 무행동이 지나면 후보 발생 + 예절 허가 — 많이 본 101042가 앞에
    cands = tick(now=t0 + 21)
    assert len(cands) == 1 and cands[0]["sku_ids"][0] == 101042, cands
    assert cands[0]["member_id"] == 9001 and cands[0]["topic_key"] == "hesitation:101042:101043"
    print("② 망설임 감지:", cands[0]["topic_key"])

    # ③ 개입이 나갔다고 기록하면 같은 사안은 다시 안 뜬다 (사안당 1회)
    etiquette.record(S, cands[0]["topic_key"], now=t0 + 21)
    _VIEWS[S] = []                       # _handle이 하는 창 비우기를 흉내
    on_event("VIEW", {"sessionId": S, "skuId": 101042}, now=t0 + 30)
    on_event("VIEW", {"sessionId": S, "skuId": 101043}, now=t0 + 34)
    on_event("VIEW", {"sessionId": S, "skuId": 101042}, now=t0 + 38)
    assert tick(now=t0 + 200) == [], "같은 두 상품 조합에 재개입했다"

    # ④ SCAN_ADD가 오면 관찰이 리셋된다 (결정 내림 = 망설임 아님)
    reset(); etiquette.reset()
    on_event("VIEW", {"sessionId": S, "skuId": 101042}, now=t0)
    on_event("VIEW", {"sessionId": S, "skuId": 101043}, now=t0 + 3)
    on_event("VIEW", {"sessionId": S, "skuId": 101042}, now=t0 + 6)
    on_event("SCAN_ADD", {"sessionId": S, "skuId": 101042}, now=t0 + 8)
    assert tick(now=t0 + 30) == [], "담은 뒤에도 망설임으로 봤다"

    # ⑤ 창 밖으로 밀려난 VIEW는 세지 않는다 (90초 창)
    reset(); etiquette.reset()
    on_event("VIEW", {"sessionId": S, "skuId": 101042}, now=t0)
    on_event("VIEW", {"sessionId": S, "skuId": 101043}, now=t0 + 100)
    on_event("VIEW", {"sessionId": S, "skuId": 101042}, now=t0 + 104)
    assert tick(now=t0 + 120) == [], "90초 밖 VIEW가 횟수에 끼었다"

    print("behavior 스모크 5갈래 전부 통과 (감지+예절 — 발화 생성은 실호출 영역)")
