# ============================================================================
# 모드 1 DES — 오케스트레이터 (이력 빨리감기 = 학습 공장)
# ============================================================================
# [무엇] 모드 0 생성기(catalog·world_gen·members_gen)로 세계를 조립하고, DES 엔진을
#   돌려 세 스트림(구매·매대·행동)을 낳는다. 출력은 둘:
#     ① 전량 CSV.gz  → 학습 저장소(DB에 안 넣음). parquet은 pyarrow 있을 때만
#     ② 데모 슬라이스 SQL → 운영 DB(에이전트 데모용, 화이트리스트 회원 최근 구간)
#
# [출력을 여기 몰아넣는 이유] 엔진(des_engine)을 순수하게 두려고. 모드 2(데모 실시간)는
#   같은 엔진에 출력만 "백엔드 API POST"로 바꿔 재사용한다 — 설계 §8의 다리.
#
# 실행:  python mode1.py                       # 축소 스모크(빠름)
#        python mode1.py --full                # 회원 10,000 × 270일
#        python mode1.py --members 3000 --days 180
# ============================================================================

from __future__ import annotations

import csv
import gzip
import os
import sys
import time
from datetime import datetime, timedelta

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
sys.path.insert(0, os.path.join(_HERE, "..", "catalog"))

import numpy as np                       # noqa: E402

import catalog as cat                    # noqa: E402
import world_gen as world                # noqa: E402
import members_gen as membergen          # noqa: E402
import params as P                       # noqa: E402
import demand                            # noqa: E402
import consume                           # noqa: E402
import replenish                         # noqa: E402
from des_engine import Engine            # noqa: E402

OUT_DIR = os.path.join(_HERE, "out", "mode1")
DEMO_MEMBERS = 30       # 데모 슬라이스에 넣을 회원 수(member_id 앞에서)
DEMO_DAYS = 90          # 데모 슬라이스 최근 구간(일)

# ── 세계 시각 축 ─────────────────────────────────────────────────────────────
# 창 시작 = 기준일 − HISTORY_DAYS. 이력은 [창시작, 기준일) 구간.
_WINDOW_START = datetime(P.BASE_DATE.year, P.BASE_DATE.month, P.BASE_DATE.day) \
    - timedelta(days=P.HISTORY_DAYS)
_EPOCH0 = _WINDOW_START.timestamp()

# 데모 스냅샷 시각 — 마지막 **영업일**의 14:20. DEMO_NOW(config)와 한 쌍이다.
#   종료 상태(마감 후)는 보충 큐가 다 비워져 킬링 장면 1의 표본이 0이 된다
#   (08-27 실측: par 밑 0건). 영업 중의 한 순간을 얼려야 재고 스냅샷·이벤트
#   이력·보충 큐가 **같은 시점**의 것이 된다.
SNAP_HOUR_SEC = 14 * 3600 + 20 * 60
_BASE_DOW = _WINDOW_START.weekday()      # 창 시작 요일(월=0)


def _ts(offset_days: float) -> tuple[float, str]:
    """일 오프셋 실수 → (에폭초, 'YYYY-MM-DD HH:MM:SS.mmm' 문자열)."""
    epoch = _EPOCH0 + offset_days * 86400.0
    dt = datetime.fromtimestamp(epoch)
    return epoch, dt.strftime("%Y-%m-%d %H:%M:%S.") + f"{dt.microsecond // 1000:03d}"


def _rng(*key) -> np.random.Generator:
    """결정적 난수열. 같은 key면 같은 수 — 재생성해도 같은 세계."""
    return np.random.default_rng(np.random.SeedSequence([P.SEED, *key]))


def build_world(n_members: int):
    """모드 0 생성기로 세계를 조립하고 DES가 쓸 인덱스로 가공한다."""
    products, _stats, _n = cat.generate()
    locs = world.gen_locations()
    stocks, configs = world.gen_stock(locs, products)

    # 로케이션 인덱스: loc_id -> (floor, x, y, tier)
    loc_meta = {r[0]: (r[6], r[7], r[8], r[5]) for r in locs}

    # SKU -> PICK/BULK 로케이션, 설정, 초기 재고
    pick_loc, bulk_loc, cfg, stock0 = {}, {}, {}, {}
    for sku, loc_id, qty in stocks:
        f, x, y, tier = loc_meta[loc_id]
        if tier == "PICK":
            pick_loc[sku] = (loc_id, f, x, y)
            stock0[sku] = qty
        else:
            bulk_loc[sku] = (loc_id, f, x, y)
    for sku, loc_id, mn, rep, cap in configs:
        cfg[sku] = (mn, rep, cap)

    l2_by_sku = {r[consume.SKU]: r[consume.L2] for r in products}

    members = membergen.gen_members()[:n_members]

    # ── v2 축: 행사 반응 ────────────────────────────────────────────────────
    # 기본(배율 1.0)에서는 **행사를 만들지도 않는다.** 만들면 `gen_promotions` 의
    # 난수 소비가 끼어들어 v1 이 더 이상 v1 이 아니게 된다.
    on_promo = None
    if P.PROMO_CYCLE_MULT != 1.0:
        _iv: dict = {}
        for _sku, _typ, _disc, _s, _e in membergen.gen_promotions(products):
            # members_gen 은 TIMESTAMP 문자열로 낸다("2026-05-01 07:00:00.000").
            # 창 시작 이후 **일수**로 바꿔 둔다 — basket_at 의 day 와 같은 축.
            _a = (datetime.strptime(_s[:19], "%Y-%m-%d %H:%M:%S") - _WINDOW_START)
            _b = (datetime.strptime(_e[:19], "%Y-%m-%d %H:%M:%S") - _WINDOW_START)
            _iv.setdefault(int(_sku), []).append(
                (_a.total_seconds() / 86400.0, _b.total_seconds() / 86400.0))

        def on_promo(sku, day, _iv=_iv):
            """그 SKU 가 그날 행사 중인가. day 는 창 시작 이후 일수."""
            for a, b in _iv.get(int(sku), ()):
                if a <= day <= b:
                    return True
            return False

        print(f"[v2] 행사 반응 켜짐 — 주기 배율 {P.PROMO_CYCLE_MULT} · "
              f"행사 걸린 SKU {len(_iv):,}종")
    return products, pick_loc, bulk_loc, cfg, stock0, l2_by_sku, members, on_promo


def _member_prefs(member_row, all_l2) -> dict:
    """회원별 취향 가중(l2 -> 0~). 소수 카테고리를 편애하게 만든다(취향의 흔적)."""
    mid = member_row[0]
    rng = _rng(mid, 7)
    prefs = {l2: 0.2 for l2 in all_l2}
    n_fav = int(rng.integers(4, 9))
    for l2 in rng.choice(list(all_l2), size=min(n_fav, len(all_l2)), replace=False):
        prefs[l2] = float(rng.uniform(1.5, 4.0))
    return prefs


def run(n_members: int, n_days: int):
    t_wall = time.perf_counter()
    (products, pick_loc, bulk_loc, cfg, stock0, l2_by_sku, members,
     on_promo) = build_world(n_members)
    all_l2 = sorted(set(l2_by_sku.values()))
    window_days = float(n_days)

    # 판매 대상 후보 = 재고/설정이 다 있는 SKU만(신선식품 등 일부는 PICK만 있을 수 있음)
    sellable = [r for r in products if r[consume.SKU] in pick_loc and r[consume.SKU] in cfg]

    # ── 가변 상태 ────────────────────────────────────────────────────────────
    stock = dict(stock0)                 # sku -> 현재 PICK 재고
    # pending: sku -> (경로유형, 예상소요초). 원래 set이었는데 dict으로 넓혔다.
    # `in`·`len`·중복 큐 방지는 그대로 동작하고, **큐의 구성**을 함께 들고 있게 된다.
    # (왜 필요한지는 queue_task의 「큐의 구성」 블록에 적었다.)
    # ⚠ set→dict은 **기록만 늘린 것**이다. 난수를 새로 뽑지 않으므로 세계는 비트 단위로
    #   같다 — `history_seed.sql`이 이미 백엔드에 나가 있어서 이 조건이 필수다.
    pending = {}                         # 보충 작업이 떠 있는 sku(중복 큐 방지)
    refill_n = {}                        # sku -> 지금까지 보충 횟수(깊은 보충 판정용)
    floors = sorted({v[1] for v in pick_loc.values()})
    staff = replenish.StaffPool(floors, _rng(999))
    # 벌크가 지하에 있는 품목(깊은 보충이 층간이 되는 것) — 정수 해시로 결정적 배정.
    # 파이썬 hash()는 실행마다 달라져(PYTHONHASHSEED) 세계가 안 흔들리게 산술 해시를 쓴다.
    basement = {s for s in pick_loc
                if ((s * 1103515245 + 12345) % 1000) / 1000.0 < P.BASEMENT_SKU_FRAC}

    purchases, shelf_ev, consumer_ev = [], [], []
    task_meta = {}                       # task_id -> {큐 시각·경로유형·완료 여부}(중도절단용)
    counters = {"pid": 0, "eid_s": 0, "eid_c": 0, "task": 0,
                "sale": 0, "stockout": 0, "lost": 0}

    # 인기 가중(파레토) — 비회원은 인기 품목에 몰린다. 결정적 순열로 순위를 매기고
    # zipf 가중(1/rank^alpha)을 준다. 이게 있어야 인기 매대가 자주 비어 결품이 생긴다.
    _perm = _rng(0, 55).permutation(len(sellable))
    pop_w = np.empty(len(sellable))
    pop_w[_perm] = 1.0 / np.power(np.arange(1, len(sellable) + 1), P.POP_ZIPF_ALPHA)
    pop_w = pop_w / pop_w.sum()

    # ── 회원 상태 + 방문 이벤트 ──────────────────────────────────────────────
    states = {}
    eng = Engine()

    # 스냅샷 그릇. 핸들러는 **복사만** 한다 — RNG 를 안 만지므로 이 이벤트가
    # 있어도 이력 스트림은 바이트 단위로 그대로다(결정성 유지).
    snap = {"stock": None, "ts": None}

    def on_snapshot(engine, data):
        snap["stock"] = dict(stock)
        # 대기 중 SKU 집합 — 슬라이스가 이들의 매대 이벤트를 포함해야
        # pending API 의 queuedAt(대기 원점)이 데모 SKU 밖에서도 채워진다
        snap["pending_skus"] = set(pending.keys())
        off = (engine.now - _EPOCH0) / 86400.0
        snap["ts"] = _ts(off)[1]

    total_member_visits = 0
    for m in members:
        mid = m[0]
        rng = _rng(mid, 1)
        prefs = _member_prefs(m, all_l2)
        st = consume.build_member_state(rng, m, sellable, l2_by_sku, prefs)
        states[mid] = st
        exp = P.base_visits_per_member(m[1], m[4]) * (window_days / P.HISTORY_DAYS)
        offs = demand.sample_visit_offsets(_rng(mid, 2), exp, int(window_days), _BASE_DOW)
        for off in offs:
            eng.schedule(_EPOCH0 + off * 86400.0, "MEMBER_VISIT", (mid, off))
            total_member_visits += 1

    # 비회원 방문(잠재 수요) — 회원 방문의 GUEST_DEMAND_MULT배. 매대만 깎고 구매는 없음.
    exp_guest = total_member_visits * P.GUEST_DEMAND_MULT
    guest_offs = demand.sample_visit_offsets(_rng(0, 3), exp_guest, int(window_days), _BASE_DOW)
    sell_skus = np.array([r[consume.SKU] for r in sellable])
    for gi, off in enumerate(guest_offs):
        eng.schedule(_EPOCH0 + off * 86400.0, "GUEST_VISIT", (gi, off))

    # ── 매대 깎기 + 보충 스케줄 (공통) ───────────────────────────────────────
    def deplete(sku, qty, t, off):
        """SALE로 매대를 깎고, par 밑이면 보충을 건다. STOCKOUT·중도절단 처리 포함."""
        counters["sale"] += 1
        loc_id, f, x, y = pick_loc[sku]
        cur = stock.get(sku, 0)
        sold = min(qty, cur)
        cur -= sold
        stock[sku] = cur
        _, ts = _ts(off)
        counters["eid_s"] += 1
        shelf_ev.append((counters["eid_s"], "SALE", sku, loc_id, sold, None, ts, None))
        if sold < qty:                              # 못 판 수량 = lost sale(학습 전용)
            counters["lost"] += qty - sold
        if cur == 0:
            counters["stockout"] += 1
            counters["eid_s"] += 1
            shelf_ev.append((counters["eid_s"], "STOCKOUT", sku, loc_id, 0, None, ts, None))
        mn, rep, cap = cfg[sku]
        if cur < mn and sku not in pending:         # par 밑 + 작업 없음 → 보충 투입
            # 값은 바로 아래 queue_task가 채운다(경로유형이 거기서 정해진다).
            # 그 사이에 pending을 읽는 코드가 없으므로 None이 새어 나가지 않는다.
            pending[sku] = None
            counters["eid_s"] += 1
            shelf_ev.append((counters["eid_s"], "BELOW_PAR", sku, loc_id, cur, None, ts, None))
            queue_task(sku, t, off)

    def queue_task(sku, t, off):
        """보충 작업 하나를 만들어 직원에 배정하고 완료(또는 교대 절단)를 예약한다.

        deplete(첫 투입)와 REQUEUE(교대 종료로 포기된 작업의 재투입)가 공유한다 —
        재투입은 **새 task_id**를 받는다(원 기록은 절단된 채로 남아야 하므로).
        """
        loc_id, f, x, y = pick_loc[sku]
        _, ts = _ts(off)
        counters["task"] += 1
        task_id = f"T{counters['task']:07d}"
        # 경로유형 — 보통은 바로 위 BULK에서 내려 채운다(수직·빠름). BULK가 비어
        # 있으면(PATH_DEEP_PROB) 깊은 보충: 백룸 수평, 지하 벌크 품목이면 층간.
        refill_n[sku] = refill_n.get(sku, 0) + 1
        hmult = 1.0
        if staff.rng.random() >= P.PATH_DEEP_PROB:
            tsec, kind = float(P.BACKROOM_VERTICAL_SEC), "VERTICAL"
        else:
            hmult = P.DEEP_HANDLING_MULT
            horiz = (abs(x) + abs(y)) * P.CELL_METERS / P.WALK_SPEED_MPS
            if sku in basement:
                tsec, kind = horiz + P.FLOOR_CHANGE_SEC, "FLOOR"
            else:
                tsec, kind = horiz, "HORIZONTAL"
        # ── 큐의 구성 ────────────────────────────────────────────────────────
        # [왜] `qlen`은 "내 앞에 몇 건"만 센다. **그것들이 얼마나 걸릴지는 모른다.**
        #   같은 qlen=13이라도 앞이 전부 VERTICAL(백룸 수직·빠름)이면 금방 빠지고,
        #   FLOOR(층간)면 오래 걸린다. 대기시간은 건수가 아니라 **일의 양**이 정한다.
        #
        # [근거 — 추측이 아니라 실측에서 왔다] `models/hazard_link.py` 전량 실행:
        #   보정 중간대역이 logit +6.9%p / cloglog +15.0%p 로 **양쪽 다** 어긋났고,
        #   능선 세기를 1e-6~100으로 흔들어도 값이 안 변했다. 링크도 정칙화도
        #   설명이 아니면 남는 것은 **공변량이 모자라다**는 것이다.
        #
        # [서빙에서도 알 수 있나 — 이게 통과 조건이다]
        #   학습에만 있고 서빙엔 없는 값을 넣으면 배포 때 그 칸이 빈다.
        #   서빙 시 하네스는 백엔드에서 "지금 par 밑인 SKU 목록"을 받고, 각 SKU의
        #   BULK 재고 유무(→ 경로유형)와 위치(→ 이동시간)를 안다. 그러므로 아래 넷은
        #   **예측 시점에 재구성 가능**하다.
        #
        # ⚠ 앞 작업들의 **실현된** 소요(wait/handling)를 쓰면 누출이다 — 그건 예측
        #   시점에 아직 일어나지 않았다. 여기서 쓰는 것은 **기댓값**뿐이다:
        #   E[하역] = K·θ·hmult (감마 분포의 평균). 난수를 뽑지 않는다.
        exp_sec = tsec + P.HANDLING_GAMMA_K * P.HANDLING_GAMMA_THETA * hmult
        pending[sku] = (kind, exp_sec)              # 자기 자신도 큐의 일부다
        q_kind = {"VERTICAL": 0, "HORIZONTAL": 0, "FLOOR": 0}
        q_work = 0.0
        for _k, _e in pending.values():
            q_kind[_k] += 1
            q_work += _e

        # v3 축 — 이동 잡음. 기본(sd=0)에서는 `if` 가 거짓이라 **난수를 안 뽑는다.**
        # 로그정규로 곱하는 이유: 이동시간은 음수가 될 수 없고 실제 산포도
        # "평균의 ±몇 %" 형태라, 덧셈 잡음보다 곱셈 잡음이 맞는다.
        # μ = −σ²/2 로 잡아 **평균을 보존한다**(E[exp(X)] = 1) — 안 그러면
        # 잡음을 켜는 것만으로 이동시간 평균이 올라가, 축의 효과와 섞인다.
        if P.TRAVEL_NOISE_SD > 0:
            _sd = P.TRAVEL_NOISE_SD
            tsec *= float(np.exp(staff.rng.normal(-0.5 * _sd * _sd, _sd)))

        start, finish, wait, handling = staff.assign(t, f, tsec, hmult)
        # ── 예측 시점 공변량 ──
        # 학습의 X는 **작업이 큐에 들어간 순간 알 수 있는 것**만이어야 한다.
        # wait/travel/handling은 리드타임의 **구성요소**라 X에 넣으면 커닝이다
        # (lead = wait+travel+handling이므로 완벽 예측이 되고 아무것도 안 배운다).
        # 실제 서빙에서 predict_availability(sku_id, location_id)가 불릴 때 하네스가
        # 알 수 있는 것과 같은 집합으로 맞춘다:
        #   · kind      경로유형 — BULK 재고 유무로 백엔드가 판정 가능
        #   · hour/dow  시각·요일 — 직원 교대·혼잡의 대리 변수
        #   · qlen      **그 순간 떠 있는 보충 작업 수** = 대기의 지배 변수.
        #               서빙 시엔 "지금 par 밑인 SKU 수"로 같은 값을 얻는다
        #   · l2        소분류 — 품목군별 하역 난이도
        _dt = datetime.fromtimestamp(_EPOCH0 + off * 86400.0)
        task_meta[task_id] = {"sku": sku, "queued_off": off, "kind": kind,
                              "wait": wait, "travel": tsec, "handling": handling,
                              "hour": _dt.hour, "dow": _dt.weekday(),
                              "qlen": len(pending), "l2": l2_by_sku.get(sku, ""),
                              "q_vert": q_kind["VERTICAL"], "q_horiz": q_kind["HORIZONTAL"],
                              "q_floor": q_kind["FLOOR"], "q_work": q_work,
                              "done": False, "cens": None}
        counters["eid_s"] += 1
        shelf_ev.append((counters["eid_s"], "TASK_QUEUED", sku, loc_id, None, task_id, ts, None))

        # ── 중도절단 ① 교대 종료 ──
        # 작업이 폐점을 물면 그 직원의 교대가 끝난다 → 포기. 원 기록은 "폐점까지
        # 관측했다"는 우측 절단으로 남고, 다음 개점에 **새 작업**으로 재투입된다.
        # 오래 걸리는 작업일수록 경계를 물 확률이 높아 **정보성 절단**이 된다.
        close_t = replenish.close_epoch_of(start)
        if P.SHIFT_END_CENSORS and finish > close_t:
            observed = max(0.0, close_t - start)     # 관측된 작업시간(하한)
            task_meta[task_id]["cens"] = ("SHIFT_END", observed)
            staff.free_at(close_t)                   # 직원은 폐점에 퇴근
            eng.schedule(replenish.shift_to_open(close_t + 1.0), "REQUEUE", sku)
            return
        eng.schedule(finish, "RESTOCK", (sku, task_id))

    # ── 핸들러 ───────────────────────────────────────────────────────────────
    def on_member_visit(engine, data):
        mid, off = data
        st = states[mid]
        rng = _rng(mid, int(off * 1000) + 5)
        basket = consume.basket_at(rng, st, off, on_promo=on_promo)
        if not basket:
            return
        t = engine.now
        _, ts = _ts(off)
        session = f"S{mid}-{int(off)}"
        basket_id = f"B{counters['pid']:08d}-{mid}"
        # 검색 한 번(선택)
        if rng.random() < P.SEARCH_PROB:
            counters["eid_c"] += 1
            consumer_ev.append((counters["eid_c"], "SEARCH", session, mid, None, None, ts, None))
        for sku, qty in basket:
            loc_id, f, x, y = pick_loc[sku]
            # VIEW(선택) → SCAN_ADD(위치 앵커) → 가끔 SCAN_REMOVE(망설임)
            if rng.random() < P.VIEW_PER_BASKET_ITEM:
                counters["eid_c"] += 1
                consumer_ev.append((counters["eid_c"], "VIEW", session, mid, sku, loc_id, ts, None))
            counters["eid_c"] += 1
            consumer_ev.append((counters["eid_c"], "SCAN_ADD", session, mid, sku, loc_id, ts, None))
            if rng.random() < P.HESITATION_PROB:
                counters["eid_c"] += 1
                consumer_ev.append((counters["eid_c"], "SCAN_REMOVE", session, mid, sku, loc_id, ts, None))
            # 구매 기록(회원) — 구매 시점 단가 동결
            price = _price_of(sku)
            counters["pid"] += 1
            purchases.append((counters["pid"], basket_id, mid, sku, qty, price, ts))
            # 매대 깎기(회원 몫)
            deplete(sku, qty, t, off)
        # 결제 이벤트
        counters["eid_c"] += 1
        # ⚠ payload 는 **JSON 컬럼**이다(schema_v2: "SEARCH의 질의문, PURCHASE의
        #   basket_id 등"). basket_id 를 맨 문자열로 넣으면 MySQL 이
        #   `Invalid JSON text: "Invalid value." at position 0` 으로 적재를 거부한다
        #   — 08-26에 실제로 history_seed 적재가 여기서 멈췄다.
        #   parquet/csv 로만 쓸 때는 안 드러나고 **DB에 넣는 순간** 터지는 종류다.
        #   객체로 감싸는 이유: 나중에 칸을 더할 수 있다(순수 문자열 "..." 도 유효한
        #   JSON 이지만 확장하려면 형태를 바꿔야 한다).
        consumer_ev.append((counters["eid_c"], "PURCHASE", session, mid, None, None, ts,
                            '{"basket_id": "%s"}' % basket_id))

    def on_guest_visit(engine, data):
        gi, off = data
        rng = _rng(0, 4, gi)
        t = engine.now
        _, ts = _ts(off)
        session = f"G{gi}"
        k = int(rng.integers(1, 5))
        picks = rng.choice(sell_skus, size=k, replace=False, p=pop_w)
        for sku in picks:
            sku = int(sku)
            loc_id, f, x, y = pick_loc[sku]
            counters["eid_c"] += 1
            consumer_ev.append((counters["eid_c"], "SCAN_ADD", session, None, sku, loc_id, ts, None))
            deplete(sku, int(1 + rng.poisson(P.QTY_LAMBDA)), t, off)

    def on_requeue(engine, data):
        """교대 종료로 포기된 매대를 다음 개점에 새 작업으로 재투입한다."""
        sku = data
        if sku not in pending:          # 그새 다른 경로로 채워졌으면 할 일 없음
            return
        off = (engine.now - _EPOCH0) / 86400.0
        queue_task(sku, engine.now, off)

    def on_restock(engine, data):
        sku, task_id = data
        loc_id, f, x, y = pick_loc[sku]
        mn, rep, cap = cfg[sku]
        stock[sku] = min(cap, rep)                  # 목표량까지 채움(용량 상한)
        pending.pop(sku, None)                      # set일 때의 discard와 같은 동작
        meta = task_meta.get(task_id)
        off = (engine.now - _EPOCH0) / 86400.0
        _, ts = _ts(off)

        # ── 중도절단 ③ 이벤트 누락 ──
        # 재고는 **실제로** 채워졌지만 RESTOCK_IN 로그만 유실된다. 데이터 관점에서는
        # 완료를 관측하지 못한 절단 — 현실 로그의 결측을 모델이 견디는지 시험한다.
        if staff.rng.random() < P.RESTOCK_LOG_DROP_PROB:
            if meta:
                meta["cens"] = ("LOG_LOST", (off - meta["queued_off"]) * 86400.0)
            return                                  # 이벤트를 안 남긴다
        if meta:
            meta["done"] = True
        counters["eid_s"] += 1
        payload = None
        if meta:
            payload = ('{"lead_sec": %.1f, "path": "%s", "wait_sec": %.1f, "handling_sec": %.1f}'
                       % ((off - meta["queued_off"]) * 86400.0, meta["kind"],
                          meta["wait"], meta["handling"]))
        shelf_ev.append((counters["eid_s"], "RESTOCK_IN", sku, loc_id, rep, task_id, ts, payload))

    _price_cache = {r[consume.SKU]: r[consume.PRICE] for r in products}

    def _price_of(sku):
        return _price_cache.get(sku, 0)

    eng.on("MEMBER_VISIT", on_member_visit)
    eng.on("GUEST_VISIT", on_guest_visit)
    eng.on("RESTOCK", on_restock)
    eng.on("SNAPSHOT", on_snapshot)    # ── 스냅샷 날 = 창 안의 **마지막 토요일** 14:20 (08-27 확정) ──
    # 처음엔 마지막 영업일(수요일)로 했다가 두 번 접었다:
    #   · 종료 상태(마감 후): 큐가 다 비워져 par 밑 0건 — 무균 매장
    #   · 평일 14:20: 실측 순간 큐 0~5건 — 승무원 5명이 금방 비운다(ρ≈0.4)
    # 큐 L=75(리틀 법칙)는 주말·저녁·밤샘이 만든 **평균**이지 평일 낮의 순간이
    # 아니다. 킬링 장면 1("약 15분 후 보충")은 혼잡이 있어야 성립하고, 이 세계의
    # 혼잡은 주말 오후다(av-fig5 · 도착 배율 1.5~1.6). 실측: 토 14:20 큐 96건.
    _snap_day = int(window_days) - 1
    while (_WINDOW_START + timedelta(days=_snap_day)).weekday() != 5:   # 5 = 토
        _snap_day -= 1
    eng.schedule(_EPOCH0 + _snap_day * 86400 + SNAP_HOUR_SEC, "SNAPSHOT", None)
    eng.on("REQUEUE", on_requeue)

    # ── 구동 ─────────────────────────────────────────────────────────────────
    window_end = _EPOCH0 + window_days * 86400.0
    eng.run(until=window_end)

    # ── 중도절단 ② 관측 창 종료 ──
    # 창 끝까지 완료도 절단도 안 된 작업 = 아직 떠 있는 채로 관측이 끝났다.
    for tid, m in task_meta.items():
        if not m["done"] and m["cens"] is None:
            obs = max(0.0, window_days * 86400.0 - m["queued_off"] * 86400.0)
            m["cens"] = ("WINDOW_END", obs)
    censored = [tid for tid, m in task_meta.items() if m["cens"] is not None]

    _write_outputs(purchases, shelf_ev, consumer_ev, censored, task_meta, members,
                   snap["ts"], snap.get("pending_skus") or set())
    _write_stock_sync(snap["stock"] or stock, pick_loc, cfg, snap["ts"])
    _summary(counters, purchases, shelf_ev, consumer_ev, task_meta, censored,
             total_member_visits, len(guest_offs), time.perf_counter() - t_wall,
             n_members, n_days)


# ── 출력 ────────────────────────────────────────────────────────────────────
def _write_stock_sync(stock, pick_loc, cfg, snap_ts=None):
    """DES **종료 시점**의 PICK 재고를 운영 DB에 맞추는 UPDATE 묶음.

    [왜 필요한가 — 08-27 실연동에서 잡은 시점 불일치]
      운영 DB의 stocks 는 world_seed 의 **t=0 스냅샷**이고, shelf_events 는
      DES 가 굴린 **90일 이력**이다. 이력의 끝(= config.DEMO_NOW 직전)에서
      매장은 이미 다른 상태다 — 실측으로 par 밑 매대 271곳 중 228곳이
      BELOW_PAR 이력이 **없는** t=0 잔재였다. 그러면 /internal/replenishment/
      pending 의 queuedAt 이 전부 null 이라(대기 원점 없음) 가용예측이 낙관
      쪽으로 기운다. 재고 스냅샷과 이벤트 이력은 **한 시점의 것**이어야 한다.

    [왜 UPDATE 이고 INSERT 가 아닌가] stocks 행 자체(어느 매대에 어느 SKU)는
      world_seed 가 만든 그대로다 — 바뀐 것은 수량뿐이다. DELETE+INSERT 로
      갈면 world_seed 와의 결정적 재생성 관계가 끊긴다.

    [BULK 은 안 만진다] DES 는 보충 시 PICK 을 목표량까지 채우되 BULK 을
      깎지 않는다(단순화 — replenish 주석). BULK 수량은 t=0 그대로가 맞다.

    [적재 순서] world_seed → history_seed → **stock_sync** (이 파일이 마지막).
      순서를 바꾸면 t=0 수량으로 되돌아간다. db/README_시드적재.md 에 등재.
    """
    path = os.path.join(OUT_DIR, "stock_sync.sql")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(f"-- DES 스냅샷({snap_ts or '종료'}) 시점의 PICK 재고 동기화\n")
        f.write("-- 적재 순서: world_seed -> history_seed -> 이 파일 (마지막)\n")
        f.write("START TRANSACTION;\n")
        n_low = 0
        for sku in sorted(stock):
            loc_id = pick_loc[sku][0]
            qty = int(stock[sku])
            if qty < cfg[sku][0]:
                n_low += 1
            f.write(f"UPDATE stocks SET qty={qty} "
                    f"WHERE sku_id={sku} AND location_id='{loc_id}';\n")
        f.write("COMMIT;\n")
    print(f"  stock_sync.sql        PICK {len(stock):,}건 (par 밑 {n_low:,}건)")


def _write_csv_gz(path, header, rows):
    with gzip.open(path, "wt", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def _write_outputs(purchases, shelf_ev, consumer_ev, censored, task_meta, members,
                   snap_ts=None, pending_skus=None):
    os.makedirs(OUT_DIR, exist_ok=True)
    _write_csv_gz(os.path.join(OUT_DIR, "purchases.csv.gz"),
                  ["purchase_id", "basket_id", "member_id", "sku_id", "qty",
                   "unit_price_krw", "purchased_at"], purchases)
    _write_csv_gz(os.path.join(OUT_DIR, "shelf_events.csv.gz"),
                  ["event_id", "event_type", "sku_id", "location_id", "qty",
                   "task_id", "occurred_at", "payload"], shelf_ev)
    _write_csv_gz(os.path.join(OUT_DIR, "consumer_events.csv.gz"),
                  ["event_id", "event_type", "session_id", "member_id", "sku_id",
                   "location_id", "occurred_at", "payload"], consumer_ev)
    # 리드타임 학습 테이블(중도절단 플래그 포함) — 가용예측이 바로 먹는 형태
    # 생존분석이 바로 먹는 형태: (duration, event) 쌍.
    #   event=1(완료) → duration = 실제 리드타임
    #   event=0(절단) → duration = **관측된 하한**(그 이상 걸렸다는 것만 안다)
    # censor_reason을 남기는 이유: 원천마다 절단의 성격이 다르다(SHIFT_END는 정보성).
    #
    # ⚠ true_lead_sec = **잠재 리드타임**(절단 안 됐다면 걸렸을 시간). 시뮬만이 아는 값.
    #   **학습에 쓰면 커닝이다** — 절단 처리를 배우게 하려고 절단을 만들었는데 정답을
    #   같이 주면 그 이론 지점이 사라진다. 오직 검증(verify_history ⑤-b)이
    #   "절단이 정보성인가"를 판정할 때만 쓴다. 학습 경로는 duration_sec·event만 읽는다.
    lead_rows = []
    for tid, m in task_meta.items():
        if m["done"]:
            dur = round(m["wait"] + m["travel"] + m["handling"], 1)
            ev, reason = 1, ""
        else:
            dur = round(m["cens"][1], 1)
            ev, reason = 0, m["cens"][0]
        true_lead = round(m["wait"] + m["travel"] + m["handling"], 1)
        lead_rows.append((tid, m["sku"], m["kind"], m["hour"], m["dow"],
                          m["qlen"], m["q_vert"], m["q_horiz"], m["q_floor"],
                          round(m["q_work"], 1), m["l2"],
                          round(m["wait"], 1), round(m["travel"], 1),
                          round(m["handling"], 1), dur, ev, reason, true_lead))
    _write_csv_gz(os.path.join(OUT_DIR, "lead_times.csv.gz"),
                  # X 후보(예측 시점에 아는 것):
                  #   path_type · hour · dow · l2
                  #   qlen                      큐 길이(건수)
                  #   q_vertical/horizontal/floor  큐의 **구성**(경로유형별 건수)
                  #   q_work_sec                큐에 쌓인 **예상 작업량**(초, 기댓값)
                  # y: (duration_sec, event) — 생존분석의 (기간, 사건) 쌍
                  # 진단 전용(학습 금지): wait/travel/handling_sec · true_lead_sec
                  ["task_id", "sku_id", "path_type", "hour", "dow", "qlen",
                   "q_vertical", "q_horizontal", "q_floor", "q_work_sec", "l2",
                   "wait_sec", "travel_sec", "handling_sec",
                   "duration_sec", "event", "censor_reason", "true_lead_sec"], lead_rows)
    _write_demo_slice(purchases, shelf_ev, consumer_ev, members, snap_ts, pending_skus)


def _sqlstr(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("\\", "\\\\").replace("'", "''") + "'"


def _write_demo_slice(purchases, shelf_ev, consumer_ev, members, snap_ts=None,
                      pending_skus=None):
    """데모 회원(앞 DEMO_MEMBERS명) × 최근 DEMO_DAYS일만 SQL로. 운영 DB 적재용.

    [상한 컷 — 08-27] snap_ts(마지막 영업일 14:20) **이후** 행은 버린다.
      DEMO_NOW 가 그 시각이므로 이후 행은 DB 관점에서 "미래"다 — 남겨 두면
      재구매 도구가 미래 구매를 이력으로 읽고(경과일이 음수), 보충 큐는
      "이미 채워졌는데 par 밑" 같은 자기모순 상태를 보인다.
    """
    demo_ids = {m[0] for m in members[:DEMO_MEMBERS]}
    cut = (P.BASE_DATE - timedelta(days=DEMO_DAYS)).isoformat()
    hi = snap_ts or "9999"

    def recent(ts):
        return cut <= ts <= hi

    pur = [r for r in purchases if r[2] in demo_ids and recent(r[6])]
    demo_skus = {r[3] for r in pur}
    con = [r for r in consumer_ev if (r[3] in demo_ids) and recent(r[6])]
    # 매대 이벤트는 두 집합의 합이다 (08-27 확장):
    #   demo_skus     데모 회원이 산 상품 — 대화 맥락의 재료
    #   pending_skus  스냅샷 순간 보충 대기 중이던 상품 — 이들의 BELOW_PAR 가
    #                 슬라이스에 없으면 pending API 의 queuedAt 이 null 이 되어
    #                 95건 중 78건이 "대기 원점 모름"으로 착지했다(08-27 실측).
    #                 95개 SKU × 90일 이벤트라 슬라이스는 수천 행만 는다.
    # ⚠ pending SKU 는 **작업 수명주기 이벤트만** 넣는다. SALE 까지 넣으면
    #   인기 상품 95종의 90일 판매 행이 통째로 딸려와 슬라이스가 16.6→36MB 로
    #   뛴다(08-27 실측). queuedAt 에 필요한 것은 BELOW_PAR 계열뿐이다.
    _pend = (pending_skus or set()) - demo_skus
    _task_ev = {"BELOW_PAR", "TASK_QUEUED", "RESTOCK_IN", "STOCKOUT"}
    she = [r for r in shelf_ev if recent(r[6])
           and (r[2] in demo_skus
                or (r[2] in _pend and r[1] in _task_ev))]

    path = os.path.join(OUT_DIR, "history_seed.sql")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("-- 모드 1 데모 슬라이스 — 회원 %d명 × 최근 %d일 (운영 DB용)\n"
                % (len(demo_ids), DEMO_DAYS))
        f.write("-- 전량은 out/mode1/*.csv.gz (학습 저장소, DB에 넣지 않음)\n\n")

        def block(table, cols, rows, fmt):
            if not rows:
                return
            f.write(f"INSERT INTO {table} ({cols}) VALUES\n")
            f.write(",\n".join(fmt(r) for r in rows) + ";\n\n")

        block("purchases",
              "purchase_id, basket_id, member_id, sku_id, qty, unit_price_krw, purchased_at",
              pur, lambda r: "(%d,%s,%d,%d,%d,%d,%s)" % (
                  r[0], _sqlstr(r[1]), r[2], r[3], r[4], r[5], _sqlstr(r[6])))
        block("consumer_events",
              "event_id, event_type, session_id, member_id, sku_id, location_id, occurred_at, payload",
              con, lambda r: "(%d,%s,%s,%s,%s,%s,%s,%s)" % (
                  r[0], _sqlstr(r[1]), _sqlstr(r[2]), _sqlstr(r[3]), _sqlstr(r[4]),
                  _sqlstr(r[5]), _sqlstr(r[6]), _sqlstr(r[7])))
        block("shelf_events",
              "event_id, event_type, sku_id, location_id, qty, task_id, occurred_at, payload",
              she, lambda r: "(%d,%s,%d,%s,%s,%s,%s,%s)" % (
                  r[0], _sqlstr(r[1]), r[2], _sqlstr(r[3]), _sqlstr(r[4]),
                  _sqlstr(r[5]), _sqlstr(r[6]), _sqlstr(r[7])))


def _summary(c, purchases, shelf_ev, consumer_ev, task_meta, censored,
             mv, gv, secs, n_members, n_days):
    import statistics as stt
    leads = [m["wait"] + m["travel"] + m["handling"]
             for m in task_meta.values() if m["done"]]
    by_kind = {}
    for m in task_meta.values():
        if m["done"]:
            by_kind.setdefault(m["kind"], []).append(m["wait"] + m["travel"] + m["handling"])
    print("=" * 64)
    print(f"모드 1 완료 — 회원 {n_members} · {n_days}일 · {secs:.1f}초")
    print("=" * 64)
    print(f"방문   회원 {mv:,} · 비회원 {gv:,}")
    print(f"구매   {len(purchases):,} 행")
    print(f"매대   {len(shelf_ev):,} 행 (SALE {c['sale']:,} · STOCKOUT {c['stockout']:,} · lost {c['lost']:,})")
    print(f"행동   {len(consumer_ev):,} 행")
    print(f"보충   작업 {len(task_meta):,} · 완료 {len(leads):,} · 중도절단 {len(censored):,}")
    if leads:
        print(f"리드타임 중앙값 {stt.median(leads):.0f}초 (min {min(leads):.0f} · max {max(leads):.0f})")
        for k in ("VERTICAL", "HORIZONTAL", "FLOOR"):
            if by_kind.get(k):
                print(f"   {k:<11s} 중앙값 {stt.median(by_kind[k]):.0f}초 · n {len(by_kind[k]):,}")
    print(f"\n출력 → {OUT_DIR}")
    print("  전량 CSV.gz 4종 + 데모 슬라이스 history_seed.sql")


if __name__ == "__main__":
    full = "--full" in sys.argv
    nm = 10000 if full else 1200
    nd = 270 if full else 120
    if "--members" in sys.argv:
        nm = int(sys.argv[sys.argv.index("--members") + 1])
    if "--days" in sys.argv:
        nd = int(sys.argv[sys.argv.index("--days") + 1])
    run(nm, nd)
