# -*- coding: utf-8 -*-
# ============================================================================
# 자발형 시나리오 — 신호를 각본대로 넣고, 개입이 나야 할 때 나는지 본다
# ============================================================================
# [왜 골든셋으로는 안 되나] 골든셋은 **반응형**을 잰다 — 사용자가 물으면 답이
#   나오고 그 답을 채점한다. 자발형에는 질문이 없다. 재는 대상이 "답이 맞나"가
#   아니라 **"말을 걸었어야 할 때 걸었나, 말았어야 할 때 참았나"** 다.
#   설계서의 평가 이원(반응형=골든셋 / 자발형=시나리오 재생)이 이 자리다.
#
# [무엇을 재나 — 넷]
#   ① 발생   신호가 왔을 때 개입이 났나
#   ② 침묵   관심 없는 신호에 조용했나  ← **이게 더 중요하다.** 자발형의 실패는
#            "말 안 함"이 아니라 "아무 때나 말함"이다
#   ③ 예절   사안당 1회 · 총량 4 · 쿨다운 90초 · 우선순위
#   ④ 묶음   진입 순간에 여럿이 깨면 하나로 묶였나 (킬링 장면 3)
#
# [가상 시계] 모든 감시자 함수가 `now=` 를 받는다. 실제로 90초를 기다리는 대신
#   숫자를 밀어 넣는다 — 쿨다운 검사가 90초 걸리면 아무도 안 돌린다.
#   각본의 `t` 는 상대 초이고, 실행기가 기준 에폭에 더한다.
#
# [무엇을 안 재나] **발화 문장**은 여기서 안 잰다. 지시문까지가 우리 코드이고
#   문장은 LLM 이 만든다 — 그건 `--judge`(과금)의 몫이다. 여기까지는 공짜이고
#   결정적이라 매번 돌릴 수 있다.
#
# [세계 의존] 진입 브리핑(`schedule.on_store_entry`)만 실제 구매 이력을 읽는다.
#   그래서 그 시나리오의 기대는 **항목 이름이 아니라 구조**로 쓴다 — "재구매
#   후보가 1개 이상 묶였나". 이름을 박으면 세계를 다시 구울 때마다 시나리오가
#   깨지는데, 그건 개입 정책이 틀린 게 아니다.
# ============================================================================

# 각본에 쓰는 걸음 종류 (실행기 `scenario_runner._step` 이 해석)
#   interest  [sku,...]            세계 감시자에 "물었는데 없었다" 관심을 등록
#   cart      [sku,...]            "담았다" — 위치 이동의 관심 축
#   shelf     (유형, {"skuId":..}) 매대 이벤트 (runner.fanout)
#   behavior  (유형, {...})        행동 이벤트 (VIEW·SCAN_ADD·PURCHASE)
#   tick      True                 행동 감시자 주기 판정
#   plan      "이름"               체크포인트 — 이 시점의 결정을 그 이름으로 기록
#
# 기대(expect)는 체크포인트 이름 -> 기대 dict.
#   none: True                  개입이 없어야 한다
#   topic_type / mode / items   났다면 이 모양이어야 한다
#   items 는 정확수, items_min 은 하한(세계 의존 시나리오용)
#   not_topic_type              이 유형만 아니면 된다(다른 개입은 허용)
#   includes_topic              묶음 안에 이 사안 키가 들어 있어야 한다

SCENARIOS = [
    # ── 킬링 장면 1 — 재고 전환 ────────────────────────────────────────────
    {"id": "restock_turn",
     "why": "물었을 때 없던 물건이 채워지면 묻지 않았는데 알린다. "
            "자발형의 존재 이유 자체 — 이게 안 되면 챗봇이다",
     "session": "scen-restock", "member": 1001,
     "steps": [
         {"t": 0, "interest": [200001]},
         {"t": 30, "shelf": ("RESTOCK_IN", {"skuId": 200001, "locationId": 1})},
         {"t": 31, "plan": "보충직후"},
     ],
     "expect": {"보충직후": {"topic_type": "AVAILABILITY_CHANGE",
                             "mode": "single", "items": 1}}},

    {"id": "restock_silent",
     "why": "침묵 시험. 아무도 안 물어본 물건이 채워졌다. 매장에서는 1분에 "
            "수십 건이 일어난다 — 전부 알리면 알림이 소음이 되고, 정작 킬링 "
            "장면 1이 왔을 때 손님은 이미 창을 닫아 놨다",
     "session": "scen-silent", "member": 1001,
     "steps": [
         {"t": 0, "interest": [200001]},
         {"t": 30, "shelf": ("RESTOCK_IN", {"skuId": 999999, "locationId": 1})},
         {"t": 31, "plan": "남의보충"},
     ],
     "expect": {"남의보충": {"none": True}}},

    {"id": "sale_is_not_good_news",
     "why": "침묵 시험. SALE 은 보충이 아니다 — 팔린 것은 좋아진 것이 아니다. "
            "매대 이벤트를 뭉뚱그려 구독하면 팔릴 때마다 '있습니다'라고 한다",
     "session": "scen-sale", "member": 1001,
     "steps": [
         {"t": 0, "interest": [200001]},
         {"t": 10, "shelf": ("SALE", {"skuId": 200001, "locationId": 1})},
         {"t": 11, "plan": "판매직후"},
     ],
     "expect": {"판매직후": {"none": True}}},

    {"id": "restock_once_per_topic",
     "why": "같은 상품이 두 번 채워져도 두 번 말하지 않는다(사안당 1회). "
            "보충은 백룸 입고·매대 진열로 여러 이벤트가 연달아 오므로, 이 "
            "규칙이 없으면 한 번의 좋은 소식이 서너 번의 알림이 된다",
     "session": "scen-once", "member": 1001,
     "steps": [
         {"t": 0, "interest": [200001]},
         {"t": 30, "shelf": ("RESTOCK_IN", {"skuId": 200001, "locationId": 1})},
         {"t": 31, "plan": "첫번째"},
         {"t": 200, "interest": [200001]},
         {"t": 210, "shelf": ("RESTOCK_IN", {"skuId": 200001, "locationId": 1})},
         {"t": 211, "plan": "두번째"},
     ],
     "expect": {"첫번째": {"topic_type": "AVAILABILITY_CHANGE", "items": 1},
                "두번째": {"none": True}}},

    {"id": "cooldown_holds",
     "why": "서로 다른 사안이라도 90초 안에 연달아 말하지 않는다. 총량이 "
            "남아 있어도 연속 발화는 수다스럽다",
     "session": "scen-cool", "member": 1001,
     "steps": [
         {"t": 0, "interest": [200001, 200002]},
         {"t": 30, "shelf": ("RESTOCK_IN", {"skuId": 200001, "locationId": 1})},
         {"t": 31, "plan": "첫개입"},
         {"t": 40, "shelf": ("RESTOCK_IN", {"skuId": 200002, "locationId": 2})},
         {"t": 41, "plan": "쿨다운중"},
     ],
     "expect": {"첫개입": {"topic_type": "AVAILABILITY_CHANGE"},
                "쿨다운중": {"none": True}}},

    # ── 킬링 장면 2 — 망설임 개입 ──────────────────────────────────────────
    {"id": "hesitation",
     "why": "같은 칸의 두 상품을 번갈아 보다 손이 멈췄다. 그 진열대 앞에 "
            "서 있는 30초가 개입의 유일한 창이다",
     "session": "scen-hes", "member": 1001,
     "steps": [
         {"t": 0, "behavior": ("VIEW", {"skuId": 200001})},
         {"t": 2, "behavior": ("VIEW", {"skuId": 200002})},
         {"t": 4, "behavior": ("VIEW", {"skuId": 200001})},
         {"t": 20, "tick": True},
         {"t": 21, "plan": "망설임"},
     ],
     "expect": {"망설임": {"topic_type": "HESITATION_HELP", "items": 1}}},

    {"id": "hesitation_resolved",
     "why": "침묵 시험. 번갈아 보다가 하나를 담았다 = 결정을 내렸다. 이미 "
            "정한 사람에게 '이쪽이 12% 싸요'는 훈수다",
     "session": "scen-hes2", "member": 1001,
     "steps": [
         {"t": 0, "behavior": ("VIEW", {"skuId": 200001})},
         {"t": 2, "behavior": ("VIEW", {"skuId": 200002})},
         {"t": 4, "behavior": ("VIEW", {"skuId": 200001})},
         {"t": 6, "behavior": ("SCAN_ADD", {"skuId": 200001})},
         {"t": 20, "tick": True},
         {"t": 21, "plan": "담은뒤"},
     ],
     # SCAN_ADD 가 진입 브리핑을 일으키므로 '망설임이 아닌 것'만 확인한다.
     "expect": {"담은뒤": {"not_topic_type": "HESITATION_HELP"}},
     "needs_world": True},

    {"id": "hesitation_still_browsing",
     "why": "침묵 시험. 아직 화면을 넘기는 중(무행동 12초 미만)이면 끼어들지 "
            "않는다. 조건이 다 찼는데 시간만 안 찬 경우다",
     "session": "scen-hes3", "member": 1001,
     "steps": [
         {"t": 0, "behavior": ("VIEW", {"skuId": 200001})},
         {"t": 2, "behavior": ("VIEW", {"skuId": 200002})},
         {"t": 4, "behavior": ("VIEW", {"skuId": 200001})},
         {"t": 9, "tick": True},
         {"t": 10, "plan": "아직보는중"},
     ],
     "expect": {"아직보는중": {"none": True}}},

    {"id": "hesitation_one_sku",
     "why": "침묵 시험. 한 상품만 여러 번 본 것은 저울질이 아니라 상세를 "
            "읽는 중이다(서로 다른 sku 2개가 조건)",
     "session": "scen-hes4", "member": 1001,
     "steps": [
         {"t": 0, "behavior": ("VIEW", {"skuId": 200001})},
         {"t": 2, "behavior": ("VIEW", {"skuId": 200001})},
         {"t": 4, "behavior": ("VIEW", {"skuId": 200001})},
         {"t": 20, "tick": True},
         {"t": 21, "plan": "한상품만"},
     ],
     "expect": {"한상품만": {"none": True}}},

    # ── 킬링 장면 3 — 진입 브리핑 ──────────────────────────────────────────
    {"id": "entry_brief",
     "why": "매장에 들어서면 먼저 말을 건다. 진입은 세션당 한 번뿐이라 "
            "쿨다운에 밀리면 다음 기회가 없다 — 그래서 묶음으로 나간다",
     "session": "scen-entry", "member": 1001,
     "steps": [
         {"t": 0, "behavior": ("SCAN_ADD", {"skuId": 200001})},
         {"t": 1, "plan": "진입"},
     ],
     # 세계 의존 — 회원 1001 의 재구매 후보 수는 세계가 정한다. 하한만 본다.
     "expect": {"진입": {"topic_type": "STORE_ENTRY_BRIEF",
                         "mode": "bundle", "items_min": 1}},
     "needs_world": True},

    {"id": "entry_bundles_world_signal",
     "why": "진입 순간에 세계 감시자도 깼다. 예절이 하나만 남기면 둘 중 하나가 "
            "사라진다 — 묶음이 아니면 킬링 장면 3이 구조적으로 안 난다(08-26)",
     "session": "scen-bundle", "member": 1001,
     "steps": [
         {"t": 0, "interest": [200001]},
         {"t": 1, "shelf": ("RESTOCK_IN", {"skuId": 200001, "locationId": 1})},
         {"t": 1, "behavior": ("SCAN_ADD", {"skuId": 200002})},
         {"t": 2, "plan": "진입묶음"},
     ],
     "expect": {"진입묶음": {"mode": "bundle", "topic_type": "STORE_ENTRY_BRIEF",
                             "items_min": 2, "includes_topic": "avail:200001"}},
     "needs_world": True},

    {"id": "entry_once",
     "why": "침묵 시험. 두 번째 SCAN_ADD 는 진입이 아니다. 세션 안에서 "
            "브리핑이 반복되면 그건 브리핑이 아니라 잔소리다",
     "session": "scen-entry2", "member": 1001,
     "steps": [
         {"t": 0, "behavior": ("SCAN_ADD", {"skuId": 200001})},
         {"t": 1, "plan": "첫진입"},
         {"t": 300, "behavior": ("SCAN_ADD", {"skuId": 200002})},
         {"t": 301, "plan": "두번째스캔"},
     ],
     "expect": {"첫진입": {"topic_type": "STORE_ENTRY_BRIEF"},
                "두번째스캔": {"none": True}},
     "needs_world": True},

    # ── 위치 이동 ──────────────────────────────────────────────────────────
    {"id": "moved_in_cart",
     "why": "담을 예정인 물건의 자리가 바뀌었다. 모르면 빈 매대 앞에 선다 — "
            "그래서 우선순위가 가장 높다(50)",
     "session": "scen-move", "member": 1001,
     "steps": [
         {"t": 0, "cart": [200001]},
         {"t": 30, "shelf": ("MOVE", {"skuId": 200001, "locationId": 77})},
         {"t": 31, "plan": "이동"},
     ],
     "expect": {"이동": {"topic_type": "LOCATION_MOVED", "items": 1}}},

    {"id": "moved_not_mine",
     "why": "침묵 시험. 내 장바구니에 없는 물건의 이동은 내 일이 아니다",
     "session": "scen-move2", "member": 1001,
     "steps": [
         {"t": 0, "cart": [200001]},
         {"t": 30, "shelf": ("MOVE", {"skuId": 999999, "locationId": 77})},
         {"t": 31, "plan": "남의이동"},
     ],
     "expect": {"남의이동": {"none": True}}},

    # ── 총량 ───────────────────────────────────────────────────────────────
    {"id": "budget_cap",
     "why": "쿨다운을 다 지켜도 세션당 4회를 넘지 않는다. 15분 데모에서 "
            "5회째부터는 '살아있다'가 '수다스럽다'로 넘어간다",
     "session": "scen-budget", "member": 1001,
     "steps": [
         {"t": 0, "interest": [200001, 200002, 200003, 200004, 200005]},
         {"t": 100, "shelf": ("RESTOCK_IN", {"skuId": 200001, "locationId": 1})},
         {"t": 101, "plan": "1회"},
         {"t": 300, "shelf": ("RESTOCK_IN", {"skuId": 200002, "locationId": 2})},
         {"t": 301, "plan": "2회"},
         {"t": 500, "shelf": ("RESTOCK_IN", {"skuId": 200003, "locationId": 3})},
         {"t": 501, "plan": "3회"},
         {"t": 700, "shelf": ("RESTOCK_IN", {"skuId": 200004, "locationId": 4})},
         {"t": 701, "plan": "4회"},
         {"t": 900, "shelf": ("RESTOCK_IN", {"skuId": 200005, "locationId": 5})},
         {"t": 901, "plan": "5회"},
     ],
     "expect": {"1회": {"topic_type": "AVAILABILITY_CHANGE"},
                "2회": {"topic_type": "AVAILABILITY_CHANGE"},
                "3회": {"topic_type": "AVAILABILITY_CHANGE"},
                "4회": {"topic_type": "AVAILABILITY_CHANGE"},
                "5회": {"none": True}}},

    # ── 관심의 수명 ────────────────────────────────────────────────────────
    {"id": "interest_expires",
     "why": "침묵 시험. 30분 전에 물어본 물건이 이제 채워졌다. 그 손님은 "
            "이미 잊었거나 대체품을 샀다 — 지금 알리면 뜬금없다",
     "session": "scen-ttl", "member": 1001,
     "steps": [
         {"t": 0, "interest": [200001]},
         {"t": 2000, "shelf": ("RESTOCK_IN", {"skuId": 200001, "locationId": 1})},
         {"t": 2001, "plan": "만료후"},
     ],
     "expect": {"만료후": {"none": True}}},
]


def by_id(scenario_id: str):
    """id 로 하나 꺼낸다 — `--only` 가 쓴다."""
    return next((s for s in SCENARIOS if s["id"] == scenario_id), None)


# ── 자체 검산 ───────────────────────────────────────────────────────────────
# 각본은 조용히 망가진다(프롬프트와 같은 계열). 체크포인트 이름과 기대의 키가
# 어긋나면 그 시나리오는 **아무것도 안 재면서 통과한다.** 그게 제일 나쁜 상태다.
_ids = [s["id"] for s in SCENARIOS]
assert len(_ids) == len(set(_ids)), "시나리오 id 중복"
for _s in SCENARIOS:
    _cps = [st["plan"] for st in _s["steps"] if "plan" in st]
    assert _cps, f"{_s['id']}: 체크포인트가 없다 — 아무것도 안 잰다"
    assert set(_cps) == set(_s["expect"]), \
        f"{_s['id']}: 체크포인트 {_cps} 와 기대 {list(_s['expect'])} 가 어긋난다"
    _ts = [st["t"] for st in _s["steps"]]
    assert _ts == sorted(_ts), f"{_s['id']}: t 가 역행한다 — 가상 시계는 되감지 않는다"
    assert _s.get("why"), f"{_s['id']}: why 가 없다"

# 침묵 시험이 1/3 이상이어야 한다 — 자발형의 실패는 "말 안 함"이 아니라
# "아무 때나 말함"이다. 발생 시나리오만 쌓이면 수다스러운 에이전트가 만점을 받는다.
_silent = sum(1 for s in SCENARIOS if any(e.get("none") for e in s["expect"].values()))
assert _silent >= len(SCENARIOS) // 3, \
    f"침묵 시험이 {_silent}/{len(SCENARIOS)} 뿐 — 발생만 재면 수다가 만점을 받는다"
