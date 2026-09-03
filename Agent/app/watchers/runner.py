# ============================================================================
# StoreFlow 하네스 — 감시자 구동부 (2026-08-27 신설)
# ============================================================================
# [한 줄] SSE 한 줄기를 세 감시자에게 나눠 주고, 주기적으로 판정·발화를 돌린다.
#
# [왜 이 파일이 생겼나 — 08-27에 발견한 것]
#   `behavior.run()` 이 `_tick_forever()` 를 부르는데 **그 함수가 없었다.**
#   그리고 `dispatch.pump()` 를 부르는 곳도 **아무 데도 없었다.**
#
#       감지(tick) → 스테이지 → [ 아무도 안 비운다 ] → 발화 없음
#
#   08-26 개입 스테이징 개편이 `behavior._handle`(감지부터 발화까지 혼자 하던
#   함수)을 `dispatch._deliver` 로 옮기면서, 그 함수를 주기적으로 부르던
#   **구동 루프가 같이 없어졌다.** mock 모드는 `run()` 이 조기 반환이라 안
#   드러났고, 실물에서는 `NameError` 가 배경 태스크 안에서 났다.
#
#   > **부품을 떼어 옮길 때는 그것을 부르던 손도 같이 옮겨야 한다.**
#   > 리팩터가 남기는 전형적인 구멍이고, 조용하다 — 아무 일도 안 일어나는 것이
#   > 정상인 시스템(개입은 원래 가끔 나간다)에서는 **없어진 걸 아무도 모른다.**
#
# [왜 감시자 안이 아니라 밖인가 — 이제 셋이다]
#   구동을 behavior 안에 두면 그 파일이 world·schedule 을 알아야 한다
#   (스테이지를 비울 세션 목록이 셋에 흩어져 있으므로). 그러면 감시자끼리
#   서로를 아는 그물이 된다. 여기 한 곳만 셋을 알고, 감시자는 서로를 모른다 —
#   `main.py` 가 앱의 조립점인 것과 같은 자리다.
#
# [SSE 를 여기로 올린 이유] 스트림 하나에 **행동 이벤트와 매대 이벤트가 같이**
#   온다(백엔드 `AgentEventStreamController` 하나). behavior 가 구독하면
#   매대 이벤트를 behavior 가 받아 world 에 넘기는 이상한 그림이 되고, world 가
#   따로 구독하면 **연결이 둘**이 되어 같은 이벤트를 두 번 받는다.
#   스트림이 공용이면 구독도 공용 자리에 있어야 한다.
# ============================================================================
from __future__ import annotations

import asyncio
import json
import time

from app import config
from app.watchers import behavior, dispatch, schedule, world

# 매대 이벤트 8종 — 이것들은 world 로 간다. 나머지(행동 6종)는 behavior 로.
SHELF_EVENTS = {"SALE", "BELOW_PAR", "TASK_QUEUED", "TASK_STARTED",
                "ITEM_CONFIRMED", "STOCKOUT", "RESTOCK_IN", "MOVE"}

# 진입 증거 — Scan & Go 의 첫 스캔. 매장 안/밖은 관측이 아니라 **행동 증거로
# 추론**한다(설계서 §4.1). 세션이 열린 것만으로는 안 된다 — 집에서 앱을 열어도
# 세션은 열린다.
ENTRY_EVIDENCE = "SCAN_ADD"

_SEEN_SESSIONS: set = set()
_STOP = asyncio.Event()


def fanout(event_type: str, data: dict, now: float | None = None) -> None:
    """이벤트 한 건을 갈래에 맞게 넘긴다. **여기가 유일한 분기점이다.**

    [순서에 뜻이 있다] 진입 감지를 behavior 보다 **먼저** 한다. 첫 SCAN_ADD 는
      진입 증거이면서 동시에 "결정을 내렸다"(망설임 해제) 신호인데, behavior 가
      먼저 처리하면 관찰 창이 비워지는 것뿐이라 순서가 무관해 보인다. 그런데
      진입 브리핑은 **그 순간에만** 유효해서(다음 기회가 없다) 먼저 스테이지에
      올라가 있어야 같은 틱의 다른 후보와 묶인다.
    """
    if now is None:
        now = time.time()
    if event_type in SHELF_EVENTS:
        world.tick(event_type, data, now=now)
        return

    sid = data.get("sessionId")
    # ⚠ 09-03: **기록이 먼저, 판단은 그다음.** 전에는 진입 브리핑(on_store_entry)을 먼저
    #   돌리고 behavior.on_event 를 뒤에 불렀다. 그런데 on_store_entry 는 재구매 모델과
    #   백엔드 조회를 돌리느라 몇 초가 걸리고, 그동안 이 세션의 **스캔 앵커(_ANCHOR)가
    #   아직 안 적혀** 있다 — 스캔 6초 뒤 첫 질문("가장 가까운 화장실")이 번번이 "위치
    #   모름"이던 원인(시연 점검 09-03). on_event 는 기록만 하므로(판정은 tick) 먼저
    #   불러도 묶음 순서에 영향이 없다 — 위 docstring 의 "진입이 먼저 스테이지에" 는
    #   같은 틱의 **판정** 순서 이야기지 기록 순서가 아니다.
    behavior.on_event(event_type, data, now=now)
    if event_type == ENTRY_EVIDENCE and sid and sid not in _SEEN_SESSIONS:
        _SEEN_SESSIONS.add(sid)
        try:
            schedule.on_store_entry(sid, data.get("memberId"), now=now)
        except Exception as e:                                  # noqa: BLE001
            # 브리핑을 못 만들어도 장보기는 계속돼야 한다. 조용히 삼키지는 않는다.
            print(f"[runner] 진입 브리핑 실패 session={sid}: {type(e).__name__}: {e}")


def sessions() -> list:
    """스테이지를 비울 대상 — 세 감시자가 아는 세션의 합집합.

    합집합인 이유: 세계 감시자가 깨운 세션은 행동 감시자가 모를 수 있다
    (물어만 보고 아무것도 안 본 손님). 한쪽 목록만 쓰면 그 세션의 스테이지가
    **영영 안 비워진다** — 개입이 사라지고, 대기열은 자란다.
    """
    return list(set(behavior.sessions()) | set(world.sessions()) | _SEEN_SESSIONS)


async def _tick_forever() -> None:
    """주기 판정 + 스테이지 배출. **08-27 에 없어진 것을 여기 다시 세운다.**

    행동 감시자만 주기 판정이 필요하다(무행동 12초는 이벤트가 **안 오는** 상태라
    시계를 가진 쪽이 물어야 한다). 세계는 사건이 깨우고, 시간은 진입이 깨운다.
    그다음 `dispatch.pump` 가 세션마다 하나씩 내보낸다.
    """
    while not _STOP.is_set():
        try:
            behavior.tick()
            await dispatch.pump(sessions())
        except Exception as e:                                  # noqa: BLE001
            # 한 틱의 실패가 감시를 끝내면 안 된다 — 다음 틱에 다시 시도한다.
            print(f"[runner] 틱 실패: {type(e).__name__}: {e}")
        try:
            await asyncio.wait_for(_STOP.wait(), timeout=config.WATCH_TICK_SEC)
        except asyncio.TimeoutError:
            pass


async def _listen_forever() -> None:
    """백엔드 SSE 를 상시 구독한다(behavior 에서 올려 온 것 — 스트림이 공용이라).

    SSE 형식: "event: VIEW / data: {...} / 빈 줄". 빈 줄이 한 건의 끝이라,
    줄을 모으다가 빈 줄에서 완성해 `fanout` 으로 넘긴다.
    """
    import os

    import httpx
    backoff = 1.0
    url = config.BACKEND_BASE_URL + "/internal/events/stream"
    headers = {"X-Internal-Service-Key": os.environ.get("INTERNAL_SERVICE_KEY", "")}
    # read=None = 수신 타임아웃 없음. SSE 는 "다음 이벤트까지 무한정 기다리는"
    # 것이 정상이라, 조회용 타임아웃을 걸면 조용한 매장에서 주기적으로 끊긴다.
    timeout = httpx.Timeout(connect=5.0, read=None, write=5.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        while not _STOP.is_set():
            try:
                async with client.stream("GET", url, headers=headers) as resp:
                    resp.raise_for_status()
                    print(f"[runner] SSE 연결됨: {url}")
                    backoff = 1.0
                    name, lines = None, []
                    async for line in resp.aiter_lines():
                        if _STOP.is_set():
                            return
                        if line == "":                  # 빈 줄 = 한 건 완성
                            if name and lines:
                                try:
                                    data = json.loads("\n".join(lines))
                                except json.JSONDecodeError:
                                    pass                # 깨진 이벤트는 버린다
                                else:
                                    if name != "connected":
                                        fanout(name, data)
                            name, lines = None, []
                        elif line.startswith("event:"):
                            name = line[6:].strip()
                        elif line.startswith("data:"):
                            lines.append(line[5:].strip())
            except asyncio.CancelledError:
                raise                                   # 종료 신호는 삼키면 안 된다
            except Exception as e:                      # noqa: BLE001
                print(f"[runner] SSE 끊김: {type(e).__name__}: {e} "
                      f"({backoff:.0f}초 뒤 재연결)")
                try:
                    await asyncio.wait_for(_STOP.wait(), timeout=backoff)
                except asyncio.TimeoutError:
                    pass
                backoff = min(backoff * 2, 15.0)        # 백엔드 재시작 배려


async def run() -> None:
    """감시 전체 — main.py 의 lifespan 이 배경 일감으로 등록한다.

    mock 모드에서는 **틱만 돈다.** SSE 를 줄 백엔드가 없으니 구독은 건너뛰지만,
    시나리오 재생(`fanout` 직접 호출)이 스테이지에 넣은 것은 배출돼야 한다 —
    안 그러면 mock 에서 자발형을 끝까지 검증할 방법이 없다.
    """
    _STOP.clear()
    if config.USE_MOCK_SOT:
        print("[runner] mock 모드 — SSE 없이 틱만 (시나리오 주입 전용)")
        await _tick_forever()
        return
    await asyncio.gather(_listen_forever(), _tick_forever())


def stop() -> None:
    _STOP.set()
    behavior.stop()
    schedule.stop()


def reset() -> None:
    """테스트·시나리오 재생 전용."""
    _SEEN_SESSIONS.clear()
    behavior.reset()
    world.reset()
    schedule.reset()


# ── 스모크 (LLM·네트워크 없음): python -m app.watchers.runner ───────────────
if __name__ == "__main__":
    from app import etiquette
    from app.env import use_utf8_stdout
    use_utf8_stdout()
    etiquette.reset(); reset(); dispatch.reset()
    T = 7000.0

    # ① 매대 이벤트는 world 로 — 관심이 없으면 아무 일도 없다
    fanout("ITEM_CONFIRMED", {"skuId": 101042}, now=T)
    assert dispatch.plan(sessions()) == []

    # ② 행동 이벤트는 behavior 로 (VIEW 가 관찰에 쌓인다)
    S = "sess-r"
    fanout("VIEW", {"sessionId": S, "skuId": 101042, "memberId": 9001}, now=T)
    assert S in behavior.sessions(), "VIEW 가 행동 감시자에 안 갔다"

    # ③ 첫 SCAN_ADD 가 진입을 깨운다 — 두 번째는 안 깨운다
    calls = []
    _orig = schedule.on_store_entry
    schedule.on_store_entry = lambda sid, mid, now=None: calls.append(sid) or []
    fanout("SCAN_ADD", {"sessionId": S, "skuId": 101042, "memberId": 9001}, now=T + 1)
    fanout("SCAN_ADD", {"sessionId": S, "skuId": 101043, "memberId": 9001}, now=T + 2)
    assert calls == [S], f"진입이 세션당 한 번이 아니다: {calls}"
    schedule.on_store_entry = _orig

    # ④ 세션 목록은 세 감시자의 합집합이다
    etiquette.reset(); reset()
    world.note_from_ledgers("w-only", 9001,
                            {"infer": [{"tool": "predict_availability",
                                        "input": {"sku_id": 101042}, "result": {}}],
                             "sot": [], "compute": [], "web": []}, now=T)
    fanout("VIEW", {"sessionId": "b-only", "skuId": 101042}, now=T)
    got = set(sessions())
    assert {"w-only", "b-only"} <= got, f"합집합이 아니다: {got}"

    # ⑤ 끝까지 — 관심 등록 → 매대 사건 → 스테이지 → plan 이 결정을 만든다
    #    (여기까지가 LLM 없이 검증 가능한 자발형의 전 구간이다)
    etiquette.reset(); reset()
    world.note_from_ledgers(S, 9001,
                            {"infer": [{"tool": "predict_availability",
                                        "input": {"sku_id": 101042}, "result": {}}],
                             "sot": [], "compute": [], "web": []}, now=T)
    fanout("ITEM_CONFIRMED", {"skuId": 101042}, now=T + 5)
    plans = dispatch.plan(sessions())
    assert len(plans) == 1, plans
    sid, d = plans[0]
    assert sid == S and d["topic_type"] == "AVAILABILITY_CHANGE", d
    print("⑤ 장면 1 전 구간:", d["mode"], d["topic_key"])

    etiquette.reset(); reset(); dispatch.reset()
    print("runner 스모크 5갈래 전부 통과")
