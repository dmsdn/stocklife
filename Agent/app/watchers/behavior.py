# ============================================================================
# StoreFlow 하네스 — 행동 감시자 (자발형 · 신호원=행동, 파일명세 §3의 behavior)
# ============================================================================
# [한 줄] 백엔드 SSE로 흘러오는 소비자 행동(VIEW·SCAN_ADD…)을 지켜보다가,
#   "망설임" 규칙이 차면 예절 허가를 받아 루프를 깨워 먼저 말을 건다 — 장면 2.
#
# [출처: 2026-08-21 ai-server 인수] 감지 규칙·SSE 구독·재연결 백오프는 jmy의
#   proactive_watcher.py에서 왔다(실구동으로 튜닝된 값 — config의 HESITATION_*).
#   옮기며 구조를 셋으로 갈랐다:
#   ① 예절(사안당 1회·총량·쿨다운)은 etiquette.py로 — 감시자가 셋이 될 때
#      총량 제어가 한 곳이어야 하므로 (etiquette.py 머리 주석의 실패 시나리오).
#   ② 문장 생성은 Claude 직호출이 아니라 **loop.run_chat 경유**로 — 그래야
#      자발형 발화에도 가드(원장 대조)가 걸린다. ai-server판은 가드가 없어
#      watcher가 지어낸 값을 잡을 장치가 없었다.
#   ③ 세계 접근은 전부 sot_client로 — 이 파일에 URL·httpx 호출이 없다
#      (SSE 구독 딱 하나만 예외로 여기 있다 — 스트림은 조회가 아니라 '구독'이라
#      sot_client의 요청-응답 모양에 안 맞는다. 대신 주소는 sot_client와 같은
#      config.BACKEND_BASE_URL에서 만든다).
#
# [감지 규칙 — 전부 config 상수] 90초 창 안 VIEW 3회 이상 + 서로 다른 상품 2개
#   이상 + 12초 무행동 → 망설임 후보. SCAN_ADD·PURCHASE가 오면 창을 비운다
#   (결정을 내렸으니 더는 망설임이 아니다). LLM은 이 판정에 관여하지 않는다 —
#   규칙이 거르고, LLM은 걸러진 순간의 문장만 만든다.
# ============================================================================
#
# ─── 개념 사전 — 이 파일에 처음 나오는 개념 3개 (52)~(54) ────────────────────
# (①~(51): 앞 파일들의 사전은 아는 것으로 전제)
#
# (52) async def / await — 협력적 동시성
#    async def 함수는 부르는 즉시 실행되지 않고 "코루틴"(중단·재개 가능한 일감)이
#    된다. 그 안의 await 지점마다 "여기서 기다리는 동안 다른 일감이 돌아도 된다"고
#    **자리를 비켜준다** — 스레드 없이 한 줄에서 여러 기다림(SSE 수신 + 주기 평가)을
#    겹치는 방식이고, FastAPI의 이벤트 루프(main.py ㊻)가 그 회전판이다.
#    주의: async 함수 안에서 **오래 걸리는 동기 코드**를 그냥 부르면 회전판이
#    통째로 멈춘다 — 그래서 (53)이 필요하다.
#
# (53) asyncio.to_thread(함수, 인자…) — 동기 코드를 회전판 밖에서
#    loop.run_chat은 동기 함수고 LLM 호출로 수 초를 그냥 서서 기다린다. async
#    안에서 직접 부르면 그 수 초 동안 SSE 수신까지 멈춘다. to_thread는 그 함수를
#    별도 일꾼(스레드)에 맡기고 자기는 await로 비켜서 있는다 — "동기 세계와
#    비동기 세계의 다리". jmy판도 같은 이유로 이걸 썼다.
#
# (54) asyncio.Event / create_task / gather — 신호기·일감 등록·동시 대기
#    Event  : 켜짐/꺼짐 신호 하나. stop()이 set()하면 모든 루프가 이를 보고 끝낸다.
#    create_task : 코루틴을 "지금부터 배경에서 돌려라"로 등록한다(등록만 하고 지나감).
#    gather : 여러 코루틴을 한꺼번에 돌리고 전부 끝날 때까지 기다린다 —
#             여기서는 수신 루프와 평가 루프 둘을 나란히 돌리는 데 쓴다.
# ────────────────────────────────────────────────────────────────────────────

import asyncio
import json
import time
from datetime import datetime

from app import config, etiquette, prompts, sot_client
from app.watchers import dispatch

# ── 세션별 관찰 상태 (etiquette (51)과 같은 모듈 상태 패턴) ──────────────────
# _VIEWS[세션] = [{"t": 시각(초), "sku": 상품번호}, …]  — 창 안의 VIEW만 유지
# _LAST_EVENT[세션] = 마지막 행동 시각  /  _MEMBER[세션] = 회원 번호(비회원 None)
# _BUSY = 지금 문장을 만드는 중인 세션 — 같은 세션에 개입 둘이 겹쳐 나가는 것을
#         막는 잠금이다(문장 생성이 수 초 걸리는 동안 tick이 또 돌기 때문).
_VIEWS: dict = {}
_LAST_EVENT: dict = {}
_MEMBER: dict = {}
_BUSY: set = set()
_STOP = asyncio.Event()                                     # (54)


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
    # on_delivered: **전달에 성공한 뒤에만** 디스패처가 부른다. 관찰 창 비우기를
    # 여기서 하지 않는 이유 — 가드에 막히거나 전달이 실패한 개입까지 관찰을
    # 지우면, 다시 말할 기회를 잃고도 근거가 사라진다(record 를 미루는 것과 같은 계열).
    return {"topic_type": "HESITATION_HELP", "topic_key": topic_key,
            "session_id": session_id, "member_id": _MEMBER.get(session_id),
            "sku_ids": top2, "on_delivered": _clear_views}


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
        # permit 은 여기서 **미리거르기**로만 쓴다 — 예산·쿨다운에 걸린 후보를
        # 스테이지에 넣어 봐야 디스패처가 또 거절할 뿐이다. 권위 있는 판정은
        # 발화 직전(dispatch._deliver)에 한 번 더 한다: tick 과 발화 사이에
        # 다른 개입이 나가 예산이 바뀔 수 있다.
        verdict = etiquette.permit(session_id, cand["topic_type"],
                                   cand["topic_key"], now=now)
        if verdict["allowed"]:
            # 08-26 ③ — 여기서 바로 말하지 않는다. 진입 순간이면 다른 감시자의
            # 후보와 **묶여야** 하는데, 그러려면 한자리에 모여야 한다.
            etiquette.stage(session_id, cand)
            allowed.append(cand)
        # 거절 사유는 조용히 삼키지 않는다 — 단, 매 틱 찍으면 로그가 홍수가 되므로
        # 쿨다운·중복 거절은 침묵하고, 이상 사유(unknown_topic_type)만 찍는다.
        elif verdict["reason"].startswith("unknown"):
            print(f"[behavior] 예절 거절(이상): {verdict['reason']}")
    return allowed


async def _build_hesitation(cand: dict) -> str | None:
    """망설임 개입의 **지시문만** 만든다. 발화 파이프라인은 dispatch 가 갖는다.

    [08-26에 무엇이 바뀌었나] 전에는 이 자리에 `_handle`이 있어서 지시문 조립부터
      루프·가드·전달·기록까지 혼자 했다. 그 구조에서는 **진입 순간에 다른 감시자와
      묶일 수가 없다** — 각자 자기 말을 자기가 내보내니까. 파이프라인을
      `dispatch._deliver` 로 옮기고, 여기에는 이 감시자만 아는 것 하나를 남겼다:
      **"망설임을 어떻게 말로 옮기나."**

    [반환] 루프에 넣을 지시문 문자열. 만들지 못하면 None(디스패처가 조용히 뺀다).

    [부작용] 없다 — SoT 조회는 읽기뿐이다. 관찰 창 비우기는 **전달에 성공한 뒤**
      디스패처가 `on_delivered` 로 부른다(실패한 개입이 관찰까지 지우면, 다시
      말할 기회를 잃고도 근거가 사라진다).
    """
    names = []
    for sku in cand["sku_ids"]:
        # 이름 조회가 실패해도 번호로 진행 — 개입 기회는 시간 창이 좁아서
        # (손님이 곧 이동한다) 완벽보다 제때가 낫다.
        p = await asyncio.to_thread(sot_client.get_product, sku)      # (53)
        names.append(f"{p['name']}(sku {sku})" if p else f"sku {sku}")
    return prompts.PROACTIVE_HESITATION.format(sku_list=" / ".join(names))


def _clear_views(cand: dict) -> None:
    """전달 성공 뒤 관찰 창을 비운다 — 같은 관찰 묶음으로 재개입하지 않게."""
    _VIEWS[cand["session_id"]] = []


# (57) 디스패처에 자기 유형을 등록한다. import 시점에 한 번 — 의존 방향이
#   감시자 → 디스패처 한쪽이라 순환 import 가 안 생긴다.
dispatch.register("HESITATION_HELP", _build_hesitation)


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
    from app.env import use_utf8_stdout
    use_utf8_stdout()          # 로그의 한글이 cp949 콘솔에서 안 터지게
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

    # ⑥ **전 경로 통합** (08-26 ③) — tick 이 스테이지에 넣고, 디스패처가
    #    세션별로 하나의 결정을 만든다. 진입 후보가 섞이면 **묶여야** 한다.
    reset(); etiquette.reset()
    on_event("VIEW", {"sessionId": S, "skuId": 101042, "memberId": 9001}, now=t0)
    on_event("VIEW", {"sessionId": S, "skuId": 101043}, now=t0 + 4)
    on_event("VIEW", {"sessionId": S, "skuId": 101042}, now=t0 + 8)
    assert len(tick(now=t0 + 21)) == 1, "망설임 후보가 안 떴다"
    # 같은 순간 시간 감시자가 진입 브리핑을 넣었다고 치자 (08/28에 실물이 온다)
    etiquette.stage(S, {"topic_type": "STORE_ENTRY_BRIEF", "moment": "entry",
                        "topic_key": "rp:9001:101042", "session_id": S,
                        "member_id": 9001})
    got = dispatch.plan([S])
    assert len(got) == 1, got                      # 세션당 **한 줄**
    d = got[0][1]
    assert d["mode"] == "bundle" and len(d["items"]) == 2, d
    # 우선순위 내림차순: 망설임(30) > 진입브리핑(20)
    assert [i["topic_type"] for i in d["items"]] == [
        "HESITATION_HELP", "STORE_ENTRY_BRIEF"], d["items"]
    print("⑥ 묶음:", " + ".join(i["topic_type"] for i in d["items"]))

    # ⑦ 묶음이 나가면 예산은 1만 쓰고, 안의 사안은 각각 재발화가 막힌다
    etiquette.record(S, d["topic_key"],
                     also=[i["topic_key"] for i in d["items"]], now=t0 + 22)
    assert etiquette._SESSIONS[S]["count"] == 1
    assert not etiquette.permit(S, "HESITATION_HELP",
                                "hesitation:101042:101043", now=t0 + 300)["allowed"]

    reset(); etiquette.reset()
    print("behavior 스모크 7갈래 전부 통과 (감지+예절+스테이징 — 발화 생성은 실호출 영역)")
