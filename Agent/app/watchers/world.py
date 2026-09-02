# ============================================================================
# StoreFlow 하네스 — 세계 감시자 (자발형 · 신호원=세계, 파일명세 §3의 world)
# ============================================================================
# [한 줄] 백엔드가 흘려보내는 **매대 이벤트**를 지켜보다가, 그 사건에 관심이
#   있는 세션에게 먼저 말을 건다 — **킬링 장면 1**(품절 → 입고 전환)과
#   **위치 이동**(자리가 바뀐 걸 모르면 빈 매대 앞에 선다).
#
# [이 감시자의 본질적 문제 — 사건에는 주인이 없다]
#   행동 감시자는 편했다. VIEW 이벤트에 `sessionId` 가 붙어 오니까 "누구의
#   망설임인가"가 이벤트 안에 있었다. 매대 이벤트는 다르다:
#
#       {"skuId": 101042, "locationId": "F2-B-...", "qty": 40,
#        "taskId": "...", "occurredAt": "..."}      ← 세션이 없다
#
#   당연하다 — 물티슈가 채워진 것은 **매장의 사건**이지 누구의 사건이 아니다.
#   그런데 개입은 세션 단위다. 그래서 이 파일이 답해야 하는 질문이 하나 더 있다:
#
#       > **이 사건이 지금 누구의 관심사인가?**
#
#   전 세션에 뿌리면 안 된다. 물티슈를 찾지도 않은 손님에게 "물티슈 들어왔어요"는
#   개입이 아니라 광고다. 그리고 예절 예산(사안당 1회·총량)이 **의미 없는 알림에
#   먼저 소진**되어 정작 필요한 말을 못 하게 된다.
#
# [답 — 관심 원장(interest registry)]
#   손님이 **그 상품을 물었는데 매대에 없었던** 순간을 기억해 둔다. 그때가
#   에이전트가 *"약 15분 후 보충 예정"* 이라고 **약속한** 순간이고, 그 약속의
#   상대가 곧 이 사건의 주인이다.
#
#       ① 관심 등록   루프가 한 턴을 마치면 원장을 넘긴다 → note_from_ledgers
#       ② 사건 수신   SSE 로 매대 이벤트 → on_event
#       ③ 대조        사건의 sku 를 관심 원장에서 찾는다 → 있으면 그 세션에 개입
#
#   **왜 루프가 "무엇이 관심인지"를 모르게 했나**: `note_from_ledgers` 는 원장을
#   통째로 받아 **여기서** 해석한다. 루프는 "이번 턴에 이런 일이 있었다"만 넘긴다.
#   반대로 짜면(루프가 조건을 판단해서 sku 만 넘기면) 관심의 정의가 바뀔 때마다
#   루프를 열어야 하고, 그러면 하네스의 중심 파일이 감시자 사정을 알게 된다.
#
# [경계] 감지·관심 판정까지만. 예절은 etiquette, 문장은 loop, 전달은 dispatch.
#   SSE 구독은 `behavior._listen_forever` 와 같은 스트림을 쓰므로 **여기서 다시
#   연결하지 않는다** — behavior 가 받은 이벤트를 이 파일로도 넘긴다(아래 fan-out).
#   연결을 둘로 두면 같은 이벤트를 두 번 받고, 백엔드 emitter 도 두 배가 된다.
# ============================================================================
#
# ─── 개념 사전 — 이 파일에 처음 나오는 개념 1개 ─────────────────────────────
# (①~(57): 앞 파일들의 사전은 아는 것으로 전제)
#
# (58) TTL(time to live) 이 붙은 상태 — "언젠가 잊는다"를 자료구조에 새기기
#    관심 원장은 **가만히 두면 무한히 자란다.** 손님이 물어본 상품이 영영 안
#    들어오면 그 항목은 영원히 남고, 세션이 끝나도 남는다. 그래서 항목마다
#    등록 시각을 함께 적고, 조회할 때 오래된 것을 버린다.
#    왜 "지울 때"가 아니라 "읽을 때" 버리나: 지우는 시점을 따로 만들면 그
#    시점을 부르는 코드가 하나 더 필요하고, 그 코드가 안 불리는 경로가 생긴다.
#    읽을 때 버리면 **읽히지 않는 상태는 아무 해도 끼치지 않는다.**
#    안 지키면 어떻게 깨지나: 하루 종일 켜 둔 서버에서 관심 원장이 수천 건이
#    되고, 매대 이벤트마다 그 전부를 훑게 된다(그리고 옛 세션에 개입이 나간다).
# ────────────────────────────────────────────────────────────────────────────
from __future__ import annotations

import asyncio
import time

from app import config, etiquette, prompts, sot_client
from app.watchers import dispatch

# ── 관심 원장 ────────────────────────────────────────────────────────────────
# _INTEREST[session_id][sku_id] = {"t": 등록시각, "member_id": …, "name": …}
_INTEREST: dict = {}
# 위치 이동은 관심과 무관하게 **그 세션이 담은 물건**이면 알려야 한다.
# _CART_SKUS[session_id] = {sku_id, …} — 루프가 본 장바구니·스캔 기록에서 모은다.
_CART_SKUS: dict = {}
_MEMBER: dict = {}

# 관심이 유효한 시간(초). 30분 = 장보기 한 바퀴. 이보다 오래된 물음에
# "지금 들어왔어요"라고 답하면 손님은 이미 그 상품을 잊었거나 매장을 떠났다.
INTEREST_TTL_SEC = 1800

# 어떤 매대 이벤트가 "다시 살 수 있게 됐다"를 뜻하나.
#   ITEM_CONFIRMED = 보충 확정(리드타임의 종점) · RESTOCK_IN = 백룸 입고.
#   ⚠ `SALE` 은 여기 없다 — 팔린 것은 좋아진 것이 아니다.
#   ⚠ `TASK_QUEUED`·`TASK_STARTED` 도 없다 — **아직 안 채워졌다.** 그걸로 말하면
#     "곧 채워질 예정"을 두 번 말하는 꼴이고, 손님이 갔다가 헛걸음한다.
REFILL_EVENTS = ("ITEM_CONFIRMED", "RESTOCK_IN")


def _prune(session_id: str, now: float) -> dict:
    """(58) 읽을 때 오래된 관심을 버리고 남은 것을 돌려준다."""
    items = _INTEREST.get(session_id, {})
    alive = {s: v for s, v in items.items() if now - v["t"] <= INTEREST_TTL_SEC}
    if alive:
        _INTEREST[session_id] = alive
    else:
        _INTEREST.pop(session_id, None)
    return alive


def note_from_ledgers(session_id: str, member_id, ledgers: dict,
                      now: float | None = None) -> int:
    """루프가 한 턴을 마치고 **원장을 통째로** 넘긴다. 반환 = 새로 등록된 관심 수.

    [무엇을 관심으로 보나 — 두 갈래]
      ① `predict_availability` 를 불렀다 → 그 sku 는 **매대에 없어서** 언제
         채워지는지를 물은 것이다. 에이전트가 시점을 말했든 못 말했든, 손님이
         그것을 기다린다는 사실은 같다.
      ② `get_inventory` 결과의 PICK 수량이 0 이었다 → 물었는데 없었다.
         ①이 안 불린 경우(모델 미적재·큐 창구 없음)를 여기서 줍는다.

    [왜 루프가 아니라 여기서 해석하나] 관심의 정의는 **이 감시자의 사정**이다.
      루프에 조건을 박으면 정의가 바뀔 때마다 하네스의 중심 파일을 연다.

    [부작용] `_INTEREST`·`_CART_SKUS`·`_MEMBER` 를 채운다. 조회는 하지 않는다 —
      상품 이름은 개입을 만들 때 그때 조회한다(등록 시점에 하면 관심이 쌓일수록
      턴이 느려지고, 대부분은 개입까지 못 간다).
    """
    if not session_id:
        return 0
    if now is None:
        now = time.time()
    if member_id is not None:
        _MEMBER[session_id] = int(member_id)

    added = 0
    for row in list(ledgers.get("infer", [])) + list(ledgers.get("sot", [])):
        tool, inp, res = row.get("tool"), row.get("input") or {}, row.get("result") or {}
        sku = None
        if tool == "predict_availability":                       # ①
            sku = inp.get("sku_id")
        elif tool == "get_inventory":                            # ②
            locs = (res or {}).get("locations") or []
            pick = next((L for L in locs if L.get("tier_role") == "PICK"), None)
            if pick is not None and int(pick.get("qty") or 0) == 0:
                sku = inp.get("sku_id") or (res or {}).get("sku_id")
        elif tool in ("add_to_cart", "get_session_cart"):
            # 담은 물건은 **위치 이동**의 관심 대상이다(관심 원장과 다른 축 —
            # 이건 "없어서 기다리는 것"이 아니라 "가지러 갈 것"이라서).
            for s in _cart_skus_of(inp, res):
                _CART_SKUS.setdefault(session_id, set()).add(s)
            continue
        if sku is None:
            continue
        book = _INTEREST.setdefault(session_id, {})
        if int(sku) not in book:
            added += 1
        # 다시 물었으면 시각을 갱신한다 — 관심이 살아 있다는 증거다.
        book[int(sku)] = {"t": now, "member_id": _MEMBER.get(session_id)}
    _prune(session_id, now)
    return added


def _cart_skus_of(inp: dict, res: dict) -> list:
    """장바구니 관련 도구 입출력에서 sku 번호만 긁어낸다(모양이 둘이라 둘 다 본다)."""
    out = []
    if inp.get("sku_id") is not None:
        out.append(int(inp["sku_id"]))
    for it in (res or {}).get("items") or []:
        if it.get("sku_id") is not None:
            out.append(int(it["sku_id"]))
    return out


def on_event(event_type: str, data: dict, now: float | None = None) -> list[dict]:
    """매대 이벤트 하나를 받아 **개입 후보를 만든다.** 예절 판정은 tick 이 한다.

    [왜 여기서 바로 스테이지에 안 넣나] 행동 감시자는 "이벤트 기록 → 주기 판정"
      이었다(무행동 12초를 재려면 시계가 필요하니까). 세계 사건은 반대다 —
      **사건 자체가 판정 시점**이라 미룰 이유가 없다. 다만 예절 허가는 tick 과
      같은 경로로 받아야 총량 제어가 한 곳에 남으므로, 후보만 만들어 돌려준다.

    [반환] 후보 목록(0~N). 관심 있는 세션이 여럿이면 여럿이다.
    """
    if now is None:
        now = time.time()
    sku = data.get("skuId")
    if sku is None:
        return []
    sku = int(sku)
    out = []

    if event_type in REFILL_EVENTS:
        # 킬링 장면 1 — 물었을 때 없었던 그 손님에게만.
        for sid in list(_INTEREST.keys()):
            book = _prune(sid, now)
            if sku in book:
                out.append({
                    "topic_type": "AVAILABILITY_CHANGE",
                    # 사안 키에 sku 를 넣어 **상품마다 한 번**이 되게 한다.
                    # 세션을 넣지 않는 이유: permit 이 이미 세션별 장부라
                    # 넣으면 같은 정보가 두 번 들어간다.
                    "topic_key": f"avail:{sku}",
                    "session_id": sid, "member_id": book[sku].get("member_id"),
                    "sku_id": sku, "location_id": data.get("locationId"),
                    "on_delivered": _forget_interest,
                })

    elif event_type == "MOVE":
        # 자리가 바뀌었다 — 담을 예정인 물건이면 알려야 한다. 우선순위 50 으로
        # 가장 높다: 모르면 **빈 매대 앞에 선다**(손해가 가장 크다).
        for sid, skus in list(_CART_SKUS.items()):
            if sku in skus:
                out.append({
                    "topic_type": "LOCATION_MOVED",
                    "topic_key": f"loc:{sku}",
                    "session_id": sid, "member_id": _MEMBER.get(sid),
                    "sku_id": sku, "location_id": data.get("locationId"),
                })
    return out


def _forget_interest(cand: dict) -> None:
    """전달 성공 뒤 그 관심을 지운다 — 같은 기다림으로 두 번 말하지 않게."""
    book = _INTEREST.get(cand["session_id"])
    if book:
        book.pop(cand.get("sku_id"), None)


def tick(event_type: str, data: dict, now: float | None = None) -> list[dict]:
    """사건 하나를 후보로 바꾸고 **예절 허가까지** 받아 스테이지에 넣는다.

    behavior.tick 과 짝이 되는 자리다. 다른 점은 인자다 — 행동은 시계가 깨우고
    (주기 평가), 세계는 **사건이 깨운다**(이벤트 주도). 그래서 이쪽은 주기가 없다.
    """
    if now is None:
        now = time.time()
    allowed = []
    for cand in on_event(event_type, data, now=now):
        verdict = etiquette.permit(cand["session_id"], cand["topic_type"],
                                   cand["topic_key"], now=now)
        if verdict["allowed"]:
            etiquette.stage(cand["session_id"], cand)
            allowed.append(cand)
        elif verdict["reason"].startswith("unknown"):
            print(f"[world] 예절 거절(이상): {verdict['reason']}")
    return allowed


# ── 지시문 조립 ──────────────────────────────────────────────────────────────
async def _build_availability(cand: dict) -> str | None:
    """킬링 장면 1의 지시문. **사실 확인은 여기서 하지 않는다** — 루프가 도구로 한다.

    [왜 여기서 재고를 안 읽나] 읽어서 지시문에 숫자를 박으면, 루프가 그 숫자를
      그대로 옮겨 적고 **원장에는 그 숫자가 없다** — 가드가 막는다(또는 더
      나쁘게, 사건과 발화 사이에 재고가 또 바뀌어 거짓이 된다).
      지시문은 **무엇을 말할지**만 정하고, 숫자는 루프가 도구로 확인한다.
    """
    p = await asyncio.to_thread(sot_client.get_product, cand["sku_id"])
    name = f"{p['name']}(sku {cand['sku_id']})" if p else f"sku {cand['sku_id']}"
    return prompts.PROACTIVE_RESTOCKED.format(product=name)


async def _build_moved(cand: dict) -> str | None:
    """위치 이동 지시문. 새 위치도 루프가 `get_inventory` 로 확인하게 둔다."""
    p = await asyncio.to_thread(sot_client.get_product, cand["sku_id"])
    name = f"{p['name']}(sku {cand['sku_id']})" if p else f"sku {cand['sku_id']}"
    return prompts.PROACTIVE_MOVED.format(product=name)


dispatch.register("AVAILABILITY_CHANGE", _build_availability)
dispatch.register("LOCATION_MOVED", _build_moved)


def sessions() -> list:
    """지금 관심이 걸린 세션 목록 — dispatch.pump 에 넘길 대상."""
    return list(set(_INTEREST) | set(_CART_SKUS))


def reset() -> None:
    """관심 원장 초기화 — 테스트·시나리오 재생 전용."""
    _INTEREST.clear()
    _CART_SKUS.clear()
    _MEMBER.clear()


# ── 스모크 (LLM·네트워크 없음): python -m app.watchers.world ────────────────
if __name__ == "__main__":
    from app.env import use_utf8_stdout
    use_utf8_stdout()
    etiquette.reset(); reset()
    S, T0 = "sess-w", 1000.0

    # ① 관심이 없으면 사건이 와도 아무 일도 없다 — 광고를 막는 첫 관문
    assert on_event("ITEM_CONFIRMED", {"skuId": 101042}, now=T0) == []

    # ② 매대 0 을 확인한 턴이 관심을 등록한다
    led = {"sot": [{"tool": "get_inventory", "input": {"sku_id": 101042},
                    "result": {"locations": [{"tier_role": "PICK", "qty": 0},
                                             {"tier_role": "BULK", "qty": 40}]}}],
           "infer": [], "compute": [], "web": []}
    assert note_from_ledgers(S, 9001, led, now=T0) == 1

    # ③ 그 sku 가 채워지면 그 세션에만 후보가 선다
    got = on_event("ITEM_CONFIRMED", {"skuId": 101042}, now=T0 + 60)
    assert len(got) == 1 and got[0]["session_id"] == S, got
    assert got[0]["topic_type"] == "AVAILABILITY_CHANGE"

    # ④ 다른 상품 사건은 남의 일이다
    assert on_event("ITEM_CONFIRMED", {"skuId": 999999}, now=T0 + 60) == []

    # ⑤ SALE·TASK_QUEUED 로는 말하지 않는다 (아직 안 채워졌다 / 좋아진 게 아니다)
    assert on_event("SALE", {"skuId": 101042}, now=T0 + 60) == []
    assert on_event("TASK_QUEUED", {"skuId": 101042}, now=T0 + 60) == []

    # ⑥ (58) TTL — 30분이 지난 관심은 잊는다
    assert on_event("ITEM_CONFIRMED", {"skuId": 101042},
                    now=T0 + INTEREST_TTL_SEC + 1) == []

    # ⑦ predict_availability 만으로도 관심이 선다 (재고 조회 없이)
    reset()
    led2 = {"infer": [{"tool": "predict_availability", "input": {"sku_id": 101043},
                       "result": {"curve": []}}],
            "sot": [], "compute": [], "web": []}
    assert note_from_ledgers(S, 9001, led2, now=T0) == 1
    assert len(on_event("ITEM_CONFIRMED", {"skuId": 101043}, now=T0 + 10)) == 1

    # ⑧ 위치 이동은 **담은 물건**에만. 관심 원장과 축이 다르다
    reset()
    led3 = {"sot": [{"tool": "add_to_cart", "input": {"sku_id": 101055},
                     "result": {"ok": True}}],
            "infer": [], "compute": [], "web": []}
    note_from_ledgers(S, 9001, led3, now=T0)
    assert on_event("MOVE", {"skuId": 101042}, now=T0) == []          # 안 담은 것
    mv = on_event("MOVE", {"skuId": 101055}, now=T0)
    assert len(mv) == 1 and mv[0]["topic_type"] == "LOCATION_MOVED"

    # ⑨ 예절을 거쳐 스테이지에 들어간다 — 그리고 같은 사안은 한 번만
    etiquette.reset(); reset()
    note_from_ledgers(S, 9001, led, now=T0)
    assert len(tick("ITEM_CONFIRMED", {"skuId": 101042}, now=T0 + 10)) == 1
    etiquette.record(S, "avail:101042", now=T0 + 10)
    note_from_ledgers(S, 9001, led, now=T0 + 20)
    assert tick("ITEM_CONFIRMED", {"skuId": 101042}, now=T0 + 20) == [], "사안당 1회가 안 걸렸다"

    etiquette.reset(); reset()
    print("world 스모크 9갈래 전부 통과")
