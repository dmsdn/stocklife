# ============================================================================
# StoreFlow 하네스 — 시간 감시자 (자발형 · 신호원=시간, 파일명세 §3의 schedule)
# ============================================================================
# [한 줄] 아무 신호도 안 오는데 **스스로 깨어나** 재구매 시점을 알린다.
#   진입 순간이면 묶음 브리핑으로(**킬링 장면 3**), 매장 밖이면 푸시로.
#
# [셋 중 가장 이상한 감시자] 행동은 브라우저가 깨우고 세계는 백엔드가 깨운다.
#   시간은 **아무도 안 깨운다.** 그래서 이 파일만 "언제 물어볼 것인가"를 스스로
#   정해야 하고, 그 결정이 곧 개입의 품질이 된다 — 너무 자주 물으면 소음이고,
#   너무 뜸하면 살 때를 지나친다.
#
# [접점이 모델을 가른다 — 이 파일의 핵심 계약]
#   같은 "재구매 시점"인데 **매장 안과 밖이 다른 질문**이다.
#
#     밖 → P(산다)              `unconditional` — "곧 살 때 됩니다"
#     안 → P(산다 | 방문했다)    `conditional`   — 손님이 이미 왔으므로 방문 항이 1
#
#   실측으로 둘이 **1.3~2.4배** 다르다(경과 16~24일에 0.211 vs 0.506).
#   접점을 안 가르면 둘 중 하나가 틀린 답을 낸다. 다행히 우리는 가를 필요가
#   없다 — `infer.predict_repurchase` 가 **세션 유무로 자동으로 고른다**
#   (`query.current_session_id()`). 이 파일이 할 일은 **부르는 맥락을 맞게
#   만드는 것**뿐이다: 진입 브리핑은 세션 안에서, 밖 푸시는 세션 없이.
#
# [이득의 창 — 언제 말할 자격이 있나 (08-26 R 검증 A-5 【정책】)]
#   시평별 IPCW 채점에서 개인화 이득은 **경과 10~47일**에 몰려 있다. 90일 넘는
#   시평에서는 이 모델이 전체 평균과 구분되지 않는다(90일 Brier 0.0252 vs
#   널 0.0259 · 130일은 널이 오히려 낫다).
#   → **"당신은 90일 안에 99.5% 사십니다"는 개인화처럼 들리지만 정보량이 0이다.**
#   반응형(손님이 물었을 때)은 곡선에 note 를 달아 조심하게 하는 것으로 족하지만,
#   **자발형은 다르다** — 묻지도 않았는데 정보량 0인 말을 거는 것은 소음이다.
#   그래서 여기서는 창 밖이면 **후보를 아예 안 만든다.**
#
# [경계] 판정까지만. 예절은 etiquette, 문장은 loop, 전달은 dispatch.
#   이 파일에는 HTTP 도, 프롬프트 문자열도 없다(지시문 템플릿은 prompts).
# ============================================================================
#
# ─── 개념 사전 — 이 파일에 처음 나오는 개념 1개 ─────────────────────────────
# (①~(58): 앞 파일들의 사전은 아는 것으로 전제)
#
# (59) 기회의 창(window of opportunity)을 코드에 박기
#    "언제 말해도 되는가"를 **상수 두 개의 구간**으로 두고, 그 밖이면 후보를
#    만들지 않는다. if 한 줄이지만 성격이 다르다 — 이건 성능 튜닝이 아니라
#    **검증에서 나온 경계**다(창 밖에서는 모델이 널과 구분 안 됨). 그래서 값
#    옆에 근거를 적고, 바꾸려면 검증을 다시 하게 만든다.
#    안 지키면 어떻게 깨지나: 90일 지난 품목이 전부 후보가 되어 진입 브리핑이
#    "살 때 되신 것 17개"가 된다. 하나도 안 읽히고, 개입 예산만 태운다.
# ────────────────────────────────────────────────────────────────────────────
from __future__ import annotations

import asyncio
import time

from app import config, etiquette, prompts, sot_client
from app.watchers import dispatch

# (59) 이득의 창 — 경과일이 이 구간 안일 때만 "살 때 됐다"가 성립한다.
#   하한 10일: 그 전에는 아직 쓰고 있다(주기가 짧은 품목도 대개 열흘은 간다).
#   상한 47일: R 검증에서 개인화 이득이 사라지기 시작하는 지점.
GAIN_WINDOW_DAYS = (10.0, 47.0)

# 진입 브리핑에 올릴 품목 수 상한. `etiquette.compose` 의 BUNDLE_MAX_ITEMS 와
# **다른 손잡이**다 — 이건 "재구매 후보를 몇 개까지 만드나"이고, 저건 "묶음에
# 몇 항목까지 담나"다. 여기서 3을 만들어도 위치 이동이 함께 오면 저기서 잘린다.
ENTRY_MAX_ITEMS = 3

# 진입 브리핑에 올릴 **자리 이동** 항목 수 상한. 재구매(3)보다 적다 —
# 자리가 바뀐 게 셋이면 그건 브리핑이 아니라 안내 방송이다.
MOVED_MAX_ITEMS = 2
# "늘 사시던"의 기준. 한 번 산 것은 습관이 아니다(소비주기가 간격을 못 재는
# 것과 같은 선). 두 번부터가 습관이다.
HABIT_MIN_BUYS = 2
# 자리 이동을 얼마나 거슬러 볼 것인가의 **상한**. 실제 창은 「지난 구매 이후」로
# 잡고(아래 _moved_items), 그게 터무니없이 길어지는 것만 여기서 막는다.
# 90일: 데모 슬라이스의 이력 길이 — 그보다 앞은 우리 세계에 없다.
MOVED_LOOKBACK_MAX_DAYS = 90

# 매장 밖 푸시를 몇 시간마다 볼 것인가. 하루 한 번꼴 — 소비주기는 주 단위라
# 더 자주 봐야 할 이유가 없고, 자주 보면 같은 사안에 쿨다운만 태운다.
OUTSIDE_TICK_SEC = 6 * 3600

_SEEN_ENTRY: set = set()          # 진입 브리핑을 이미 낸 세션(세션당 한 번)
_STOP = asyncio.Event()


def _in_gain_window(days_since_last) -> bool:
    """경과일이 이득의 창 안인가. None(이력 없음)이면 False.

    ⚠ 이력이 없는 품목은 여기서 **조용히 빠진다.** 콜드스타트("비슷한 가구의
      분들은 보통 N일 주기")는 값이 있지만 statement 종류가 다르고(조건부 확률이
      아니라 전형 주기) 아직 서빙이 막혀 있다 — 실행계획 09/02 후보.
    """
    if days_since_last is None:
        return False
    lo, hi = GAIN_WINDOW_DAYS
    return lo <= float(days_since_last) <= hi


def _due_items(member_id: int, session_id: str | None) -> list[dict]:
    """그 회원의 재구매 후보를 만든다. **모델은 우리가 안 고른다.**

    `infer.predict_repurchase` 가 세션 유무를 보고 conditional/unconditional 을
    스스로 고른다. 그래서 이 함수는 **부르는 맥락만 맞추면** 된다 —
    진입 브리핑은 세션을 심어 두고 부르고, 밖 푸시는 세션 없이 부른다.

    [왜 도구를 직접 부르나] 감시자가 `sot_client` 를 부르는 것과 같은 층이다 —
      개입할지 **판정**하려면 사실이 필요하고, 판정은 감시자의 일이다.
      (문장을 만드는 것은 여전히 루프다. 여기서 만든 것은 후보일 뿐이다.)
    """
    from app.tools import infer, query as _q

    prev = (_q.current_member_id(), _q.current_session_id())
    try:
        # 신원을 심어 두고 부른다 — 도구가 LLM 손이 안 닿는 경로로 신원을 받는
        # 그 구조(B안)를 감시자도 그대로 쓴다.
        _q.set_identity(member_id, session_id)
        res = infer.predict_repurchase()
    finally:
        _q.set_identity(*prev)         # 남의 요청 상태를 건드린 채로 나가지 않는다

    if res.get("error"):
        return []
    out = []
    for it in res.get("items", []):
        if not _in_gain_window(it.get("days_since_last")):
            continue
        out.append({"sku_id": int(it["sku_id"]),
                    "days_since_last": it.get("days_since_last"),
                    "typical_cycle_days": it.get("typical_cycle_days")})
    return out[:ENTRY_MAX_ITEMS]


def _moved_items(member_id: int) -> list[dict]:
    """**늘 사시던 것 중 자리가 바뀐 것.** 킬링 장면 3의 나머지 반쪽.

    [왜 여기가 맡나 — 세계 감시자로는 안 되는 이유]
      `world.on_event` 의 MOVE 갈래는 **장바구니에 든 물건**에만 반응한다
      (`_CART_SKUS`). 그건 그것대로 맞다 — 담을 예정인 물건의 자리가 바뀌면
      즉시 알려야 한다(모르면 빈 매대 앞에 선다).
      그런데 진입 브리핑이 말하려는 것은 **"늘 사시던"** 이다. 진입 순간엔
      장바구니가 비어 있으므로 그 갈래로는 **영영 안 나온다.**
      08-28 까지 장면 3의 절반이 구조적으로 빠져 있었다.

    [창을 어떻게 잡나 — 「지난번 오셨을 때와 달라진 것」]
      상수로 "최근 7일" 같은 걸 박으면 두 가지가 틀린다: 자주 오는 손님에게는
      이미 본 변화를 또 말하고, 오랜만에 온 손님에게는 그 사이의 변화를 놓친다.
      그래서 **마지막 구매 이후**를 창으로 쓴다. 그 손님이 마지막으로 이 매장의
      상태를 본 시각이 그때이기 때문이다.
      ⚠ 상한을 두는 이유: 1년 만에 온 손님에게 1년치 이동을 다 말할 수는 없다.

    [반환] [{"sku_id", "location_id"} …] — 없으면 빈 목록.
    """
    hist = sot_client.get_purchase_history(member_id) or []
    if not hist:
        return []

    counts: dict[int, int] = {}
    for r in hist:
        v = r.get("sku_id")
        if v is not None:
            counts[int(v)] = counts.get(int(v), 0) + 1
    habit = [k for k, c in counts.items() if c >= HABIT_MIN_BUYS]
    if not habit:
        return []

    # 마지막 구매 시각 → 지금까지 몇 시간. `get_purchase_history` 는 시각
    # **오름차순**이 계약이라 마지막 행이 가장 최근이다(sot_client 독스트링).
    last = hist[-1].get("purchased_at")
    hours = MOVED_LOOKBACK_MAX_DAYS * 24
    if last:
        try:
            from datetime import datetime
            t = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
            if t.tzinfo is not None:
                t = t.replace(tzinfo=None)
            gap = (config.DEMO_NOW - t).total_seconds() / 3600.0
            # 하한 24시간: 방금 사고 나간 손님에게도 "어제 바뀌었어요"는 유효하다.
            hours = max(24.0, min(float(hours), gap))
        except Exception:                                      # noqa: BLE001
            pass                                                # 못 읽으면 상한 그대로

    # ⚠ sku 를 통째로 넘기면 질의가 커진다. 습관 상위 몇 개로 좁힌다 —
    #   많이 산 순이면 "늘 사시던"에 가장 가깝다.
    top = sorted(habit, key=lambda k: -counts[k])[:50]
    events = sot_client.get_change_events(top, within_hours=int(hours)) or []

    out, seen = [], set()
    for e in events:
        if e.get("event_type") != "MOVE":
            continue                       # RESTOCK_IN·STOCKOUT 은 브리핑거리가 아니다
        sku = e.get("sku_id")
        if sku is None or int(sku) in seen:
            continue                       # 같은 상품이 두 번 옮겨졌어도 한 번만
        seen.add(int(sku))
        out.append({"sku_id": int(sku), "location_id": e.get("location_id")})
        if len(out) >= MOVED_MAX_ITEMS:
            break
    return out


def on_store_entry(session_id: str, member_id, now: float | None = None) -> list[dict]:
    """손님이 매장에 들어섰다 — **킬링 장면 3**의 방아쇠.

    [진입을 누가 알려 주나] 이 파일은 모른다. 매장 안/밖은 관측이 아니라
      **행동 증거로 추론**하고(설계서 §4.1), 그 증거(첫 스캔)를 보는 것은 행동
      감시자다. 그래서 진입 감지는 밖에서 부르고 여기는 **무엇을 말할지**만 정한다.

    [세션당 한 번] 진입은 세션당 한 번이다. 두 번 부르면 두 번째는 빈 목록이다 —
      재진입(새 세션)이면 새 세션 id 라 다시 열린다(etiquette 의 `entry:{세션}`
      키와 같은 감각).

    [moment="entry" 가 핵심] 이 표시가 있어야 `etiquette.drain` 이 **묶음**으로
      간다. 없으면 `pick()` 이 돌아 우선순위 20 짜리가 늘 지고, **장면 3이
      구조적으로 안 나온다**(08-26 ③ 결정이 고친 바로 그 자리).
    """
    if now is None:
        now = time.time()
    if not session_id or member_id is None:
        return []                      # 비회원은 재구매 이력이 없다
    if session_id in _SEEN_ENTRY:
        return []
    _SEEN_ENTRY.add(session_id)

    staged = []
    for it in _due_items(int(member_id), session_id):
        cand = {"topic_type": "STORE_ENTRY_BRIEF",
                "topic_key": f"rp:{member_id}:{it['sku_id']}",
                "moment": "entry",             # ← 묶음으로 가는 표시
                "session_id": session_id, "member_id": int(member_id),
                "sku_id": it["sku_id"],
                "days_since_last": it["days_since_last"],
                "typical_cycle_days": it["typical_cycle_days"]}
        verdict = etiquette.permit(session_id, cand["topic_type"],
                                   cand["topic_key"], now=now)
        if verdict["allowed"]:
            etiquette.stage(session_id, cand)
            staged.append(cand)

    # 늘 사시던 것의 자리가 바뀌었다면 **같은 묶음에** 넣는다.
    #   topic_key 를 world 와 같은 `loc:{sku}` 로 맞춘다 — 진입 브리핑에서 말한
    #   것을 나중에 장바구니에 담았다고 또 말하면 안 된다. 예절의 사안 장부가
    #   같은 키를 보고 걸러 준다(사안당 1회).
    for mv in _moved_items(int(member_id)):
        cand = {"topic_type": "LOCATION_MOVED",
                "topic_key": f"loc:{mv['sku_id']}",
                "moment": "entry",
                "session_id": session_id, "member_id": int(member_id),
                "sku_id": mv["sku_id"], "location_id": mv.get("location_id")}
        verdict = etiquette.permit(session_id, cand["topic_type"],
                                   cand["topic_key"], now=now)
        if verdict["allowed"]:
            etiquette.stage(session_id, cand)
            staged.append(cand)
    return staged


def tick_outside(member_ids, now: float | None = None) -> list[dict]:
    """매장 **밖** 재구매 알림 후보. `unconditional` 모델이 쓰인다(세션 없음).

    ⚠ **전달 채널이 아직 없다.** 매장 밖은 웹이 닫혀 있어 SSE 말풍선이 안 닿고,
      푸시 인프라 채택은 팀 미결이다(CLAUDE.md §7.5). 그래서 이 함수는 후보를
      만들되 **스테이지에 넣지 않는다** — 넣으면 디스패처가 열린 세션이 없는
      곳에 밀어 넣으려다 조용히 실패하고, 예절 예산만 깎인다.

    [그래도 지금 쓰는 이유] 채널이 생기면 붙일 자리를 **비워 두는 것**과
      **모양을 확정해 두는 것**은 다르다. 후보 모양·창 판정·모델 선택이 여기서
      이미 검증되면, 그날 하는 일은 `stage()` 한 줄을 켜는 것뿐이다.
    """
    if now is None:
        now = time.time()
    out = []
    for mid in member_ids:
        for it in _due_items(int(mid), None):          # 세션 없음 → unconditional
            out.append({"topic_type": "REPURCHASE_DUE",
                        "topic_key": f"rp:{mid}:{it['sku_id']}",
                        "session_id": None, "member_id": int(mid),
                        "sku_id": it["sku_id"],
                        "days_since_last": it["days_since_last"],
                        "channel": "push_unavailable"})
    return out


# ── 지시문 조립 ──────────────────────────────────────────────────────────────
async def _build_repurchase(cand: dict) -> str | None:
    """재구매 항목의 지시문. 묶음이면 이것들이 번호로 이어 붙는다.

    [숫자를 지시문에 넣는다 — 세계 감시자와 반대다] 세계 사건은 발화 시점에
      값이 또 바뀔 수 있어서 루프가 도구로 다시 확인해야 했다. 경과일·주기는
      **과거 이력의 요약**이라 초 단위로 안 변한다. 그리고 루프가 이걸 다시
      부르면 진입 브리핑 3항목에 도구 호출이 3번 더 붙어 말풍선이 늦는다.
      ⚠ 대신 **원장에 없는 숫자**가 되므로, 발화에 그대로 인용되면 가드가 막는다.
      그래서 지시문이 *"숫자는 참고만 하고 확인이 필요하면 도구로"* 라고 적는다.
    """
    p = await asyncio.to_thread(sot_client.get_product, cand["sku_id"])
    name = f"{p['name']}(sku {cand['sku_id']})" if p else f"sku {cand['sku_id']}"
    cycle = cand.get("typical_cycle_days")
    return prompts.PROACTIVE_REPURCHASE.format(
        product=name,
        elapsed=cand.get("days_since_last"),
        cycle=(f"{cycle}일" if cycle else "이력이 적어 미상"))


dispatch.register("STORE_ENTRY_BRIEF", _build_repurchase)
dispatch.register("REPURCHASE_DUE", _build_repurchase)


def reset() -> None:
    """진입 기록 초기화 — 테스트·시나리오 재생 전용."""
    _SEEN_ENTRY.clear()


def stop() -> None:
    _STOP.set()


# ── 스모크 (LLM·네트워크 없음): python -m app.watchers.schedule ─────────────
if __name__ == "__main__":
    from app.env import use_utf8_stdout
    use_utf8_stdout()

    # (59) 이득의 창 — 이 판정만은 도구 없이 검증할 수 있다
    assert not _in_gain_window(None), "이력 없음은 후보가 아니다"
    assert not _in_gain_window(3), "3일 만에 '살 때 됐다'는 안 된다"
    assert _in_gain_window(10) and _in_gain_window(47), "경계는 포함이다"
    assert not _in_gain_window(90), "90일은 널과 구분 안 됨 — 후보에서 빠져야"

    # 진입은 세션당 한 번 (회원/세션이 없으면 아예 안 만든다)
    etiquette.reset(); reset()
    assert on_store_entry("", 9001) == [], "세션 없이 진입이 성립하면 안 된다"
    assert on_store_entry("s1", None) == [], "비회원은 재구매 이력이 없다"

    # 가짜 도구로 후보 조립까지 — 실물 모델·백엔드 없이 구조만 검증한다
    import app.watchers.schedule as _self
    _self._due_items = lambda mid, sid: [
        {"sku_id": 101042, "days_since_last": 41.0, "typical_cycle_days": 37.0},
        {"sku_id": 101043, "days_since_last": 12.0, "typical_cycle_days": 14.0}]
    _self._moved_items = lambda mid: []           # 자리 이동은 따로 잰다
    got = _self.on_store_entry("s2", 9001, now=1000.0)
    assert len(got) == 2, got
    assert all(c["moment"] == "entry" for c in got), "묶음 표시가 빠졌다"
    assert _self.on_store_entry("s2", 9001, now=1000.0) == [], "세션당 한 번이 안 걸렸다"

    # 진입 후보는 etiquette 에서 **묶음**으로 나와야 한다 (장면 3)
    d = etiquette.drain("s2", now=1000.0)
    assert d is not None and d["mode"] == "bundle", d
    assert d["topic_type"] == "STORE_ENTRY_BRIEF" and d["topic_key"] == "entry:s2"

    # 자리 이동이 **같은 묶음에** 들어간다 — 장면 3의 나머지 반쪽
    etiquette.reset(); reset()
    _self._due_items = lambda mid, sid: [
        {"sku_id": 101042, "days_since_last": 41.0, "typical_cycle_days": 37.0}]
    _self._moved_items = lambda mid: [{"sku_id": 101055, "location_id": "F1-A-R02-B03-L1"}]
    got = _self.on_store_entry("s3", 9001, now=2000.0)
    assert len(got) == 2, got
    kinds = {c["topic_type"] for c in got}
    assert kinds == {"STORE_ENTRY_BRIEF", "LOCATION_MOVED"}, kinds
    assert all(c["moment"] == "entry" for c in got), "자리 이동도 묶음이어야 한다"
    d3 = etiquette.drain("s3", now=2000.0)
    assert d3 is not None and d3["mode"] == "bundle" and len(d3["items"]) == 2, d3

    # 같은 사안을 두 번 말하지 않는다 — world 와 topic_key 가 같아야 걸린다.
    # ⚠ 허가만으로는 안 걸린다. 장부는 **실제로 나간 뒤**에 적힌다
    #   (etiquette.record — 허가받고도 가드에 막히면 말은 안 나간 것이다).
    #   그래서 전달까지 흉내 내고 나서 확인한다.
    etiquette.reset(); reset()
    _self._due_items = lambda mid, sid: []
    _self._moved_items = lambda mid: [{"sku_id": 101055, "location_id": "F1-A-R02-B03-L1"}]
    _self.on_store_entry("s4", 9001, now=3000.0)
    d4 = etiquette.drain("s4", now=3000.0)
    assert d4 is not None, "자리 이동 하나만 있어도 묶음이 나와야 한다"
    etiquette.record("s4", d4["topic_key"], now=3000.0,
                     also=[i["topic_key"] for i in d4["items"]])
    again = etiquette.permit("s4", "LOCATION_MOVED", "loc:101055", now=3001.0)
    assert not again["allowed"], "진입에서 말한 자리 이동을 또 말하면 안 된다"
    assert again["reason"] == "topic_already_done", again

    # 밖 푸시는 후보만 만들고 **스테이지에 안 넣는다**(채널이 없다)
    #   ⚠ 앞 갈래에서 _due_items 를 빈 목록으로 바꿔 놨다 — 되돌려 놓고 잰다.
    #     (스텁을 공유하는 스모크는 이런 순서 의존을 만든다. 되돌리는 한 줄이
    #      다음 갈래를 남의 준비에 안 기대게 한다.)
    _self._due_items = lambda mid, sid: [
        {"sku_id": 101042, "days_since_last": 41.0, "typical_cycle_days": 37.0},
        {"sku_id": 101043, "days_since_last": 12.0, "typical_cycle_days": 14.0}]
    etiquette.reset(); reset()
    outs = _self.tick_outside([9001], now=1000.0)
    assert len(outs) == 2 and outs[0]["channel"] == "push_unavailable"
    assert etiquette.drain("s2") is None, "채널도 없는데 스테이지에 들어갔다"

    etiquette.reset(); reset()
    print("schedule 스모크 11갈래 전부 통과")
