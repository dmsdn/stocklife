# ============================================================================
# 소비주기 자산 — 재구매 간격의 person-period 변환기 (입력 공장)
# ============================================================================
# [무엇을 하나] `purchases.csv.gz`(구매 1건 = 1행)를 **(회원,SKU) 간격 × 시간구간**
#   = 1행인 긴 표로 펼친다. 가용예측의 `person_period.py`와 같은 골격이되
#   **단위가 "작업"이 아니라 "간격"** 이고, 같은 쌍에서 간격이 **반복**된다.
#
#   변환 전 (구매 단위)                    변환 후 (간격 × 구간)
#   ──────────────────────                ─────────────────────────────────
#   (m=1001, sku=207851)                  간격#0  bin=0(0~5일)   y=0
#     2025-11-16 · 2025-12-18 · 2026-01-20        bin=1(5~10일)  y=0
#                                                  ...
#                                                  bin=5(24~34일) y=1  ← 32일에 재구매
#                                          간격#1  ... y=1  ← 33일에 재구매
#                                          간격#2(절단) 마지막 구매~창끝, y=1 없음
#
# [가용예측과 다른 점 셋 — 여기서 실수가 난다]
#   ① **반복 사건**: 같은 쌍의 간격들은 독립이 아니다. 은닉 frailty가 공유된다.
#      → 교차검증 분리 단위를 **회원**으로 둔다(설계 결정 ①). 쌍으로 자르는 것도
#        모자라다 — 취향(prefs)이 그 회원의 습관 SKU 집합 전체를 정하므로
#        같은 회원의 **다른 SKU도 정보를 흘린다.**
#   ② **좌측절단**: `consume.py`가 `last_day = -uniform(0,cyc)`로 창 시작 전에 이미
#      산 것으로 초기화한다. 즉 각 쌍의 **첫 구매는 진짜 첫 구매가 아니라 진행 중이던
#      간격의 끝**이다. → 첫 구매까지는 간격으로 세지 않는다(설계 결정 ④).
#   ③ **우측절단이 14%**: 쌍마다 "마지막 구매 ~ 창 끝"이 미완 간격으로 남는다.
#      버리면 **긴 주기가 표본에서 빠져 낙관 편향**이 된다(가용예측과 같은 논리).
#
# [(a)와 (b)를 위해 남기는 것]
#   각 간격에 그 시점까지의 **과거 간격 개수(past_n)와 로그평균(past_log_mean)** 을
#   싣는다. 반드시 **그 간격 이전의 것만** — 이후를 섞으면 미래를 보는 것이다.
#     (a) 원시 과거평균을 그대로 공변량으로     → 표본 크기를 무시한다
#     (b) 경험적 베이즈로 축소한 과거평균       → 관측이 적으면 모집단으로 끌어당긴다
#   축소에 필요한 분산성분(sigma2_w, tau2)은 **학습 분할에서만** 추정해야 하므로
#   이 파일은 재료(past_n·past_log_mean)만 싣고 축소는 학습 단계에서 한다.
#
# [X에 넣지 않는 것] 간격 길이 자체(duration)·event·window_end.
#   앞은 정답이고 뒤 둘은 정답의 구성요소다. `_FORBIDDEN`이 코드로 막는다.
#
# 실행:  python repurchase_period.py
#        python repurchase_period.py --members 2000    # 축소 스모크
# ============================================================================

from __future__ import annotations

import csv
import gzip
import os
import sys
from collections import defaultdict
from datetime import datetime

import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "sim"))
sys.path.insert(0, os.path.join(_HERE, "..", "catalog"))
sys.modules.pop("catalog", None)

PURCHASES = os.path.join(_HERE, "..", "sim", "out", "mode1", "purchases.csv.gz")
OUT_DIR = os.path.join(_HERE, "out")

# 구간 경계(일). 로그 간격에 가깝게 — 간격 중앙이 31.9일이고 꼬리가 길다(95% 73.9,
# 절단은 270일까지). 균등 간격으로 자르면 앞쪽에 몰리고 꼬리가 텅 빈다.
BIN_EDGES = [0, 5, 10, 16, 24, 34, 47, 65, 90, 130, 200, float("inf")]

# X로 쓰면 안 되는 칸 — 정답이거나 그 구성요소다. 주석이 아니라 코드로 막는다.
#
# ⚠ [A-2 · 08-25] 이름이 **실제 저장 키와 같아야** 검사가 작동한다. 처음엔
#   `duration_days`·`window_end`처럼 실제로 없는 이름을 적어 두어, 교집합이 늘 비고
#   **어떤 입력에도 "누출 없음 OK"가 찍혔다.** 경보기가 꺼져 있었던 것이다.
#   가용예측의 person_period.py는 실제 CSV 열 이름을 써서 작동한다 — 그 차이였다.
_FORBIDDEN = {"dur", "event", "start", "win_end", "last_bin", "true_cycle", "frailty"}
# 설계행렬이 실제로 쓰는 칸. 검산은 "FEATURES와 _FORBIDDEN이 겹치지 않는가"를 본다 —
# 저장 키 목록이 아니라 **쓰는 칸**을 검사해야 의미가 있다(저장은 진단용도 포함).
FEATURE_KEYS = {"l2", "qty", "past_n", "past_log_mean",
                "hh", "hh_na", "pet", "pet_na", "child", "child_na", "car", "car_na"}


def _day(s: str) -> float:
    d = datetime.fromisoformat(s)
    return d.toordinal() + (d.hour * 3600 + d.minute * 60 + d.second) / 86400.0


def bin_of(days: float, edges=BIN_EDGES) -> int:
    for i in range(len(edges) - 1):
        if edges[i] <= days < edges[i + 1]:
            return i
    return len(edges) - 2


def load_pairs(path=PURCHASES, max_members=None):
    """(회원,SKU) → [(구매일, 수량), ...] 정렬본. 창 끝(최종 구매일의 상한)도 돌려준다."""
    if not os.path.exists(path):
        raise SystemExit(f"입력이 없습니다: {path}\n  먼저 sim/mode1.py --full 을 돌리세요.")
    # [A-4 · 08-25] 창 끝을 **관측 최대값이 아니라 설계 창**에서 정한다.
    #   전에는 max(구매 시각)을 썼는데, 그러면 절단 시각이 표본에 의존해서
    #   회원 수를 늘리면 절단 정의가 조용히 달라진다. BASE_DATE는 세계의 "현재"고
    #   이력은 [BASE-270, BASE) 이므로 창 끝은 BASE_DATE다.
    import catalog as _cat
    win_end = float(_cat.BASE_DATE.toordinal())
    pairs = defaultdict(list)
    seen_members = set()
    obs_max = 0.0
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            m = r["member_id"]
            if not m:                      # 비회원은 이력이 없다(W-10)
                continue
            if max_members is not None:
                if m not in seen_members:
                    if len(seen_members) >= max_members:
                        continue
                    seen_members.add(m)
            d = _day(r["purchased_at"])
            obs_max = max(obs_max, d)
            pairs[(int(m), int(r["sku_id"]))].append((d, int(r["qty"])))
    for v in pairs.values():
        v.sort()
    if obs_max > win_end:      # 설계 창 밖의 구매가 있으면 세계 쪽이 틀린 것이다
        raise SystemExit(f"창 밖 구매 발견: 관측 최대 {obs_max} > 설계 창 끝 {win_end}")
    return pairs, win_end


def build(pairs, win_end, l2_by_sku, axes_by_member, edges=BIN_EDGES):
    """간격 표(compact)와 person-period 인덱스를 만든다.

    반환 iv_* 는 **간격 단위**(1행 = 1간격), pp_* 는 **구간 단위**(1행 = 1구간).
    구간 표를 통째로 float 행렬로 만들면 1,300만 행 × 80열이라 메모리를 넘긴다.
    → 간격 표만 들고 있다가 학습 단계에서 구간으로 펼친다.
    """
    l2_codes = {v: i for i, v in enumerate(sorted(set(l2_by_sku.values())))}

    iv_dur, iv_event, iv_member, iv_pair = [], [], [], []
    iv_start = []                      # 간격 시작일(절대). 방문 이력과 붙이는 열쇠
    iv_l2, iv_qty = [], []
    iv_pastn, iv_pastlm = [], []
    iv_hh, iv_hhna, iv_pet, iv_petna = [], [], [], []
    iv_child, iv_childna, iv_car, iv_carna = [], [], [], []

    for pid, ((m, sku), rows) in enumerate(pairs.items()):
        l2 = l2_by_sku.get(sku)
        if l2 is None:
            continue
        ax = axes_by_member.get(m)
        if ax is None:
            continue
        hh, pet, child, car = ax

        logs = []                       # 이 쌍의 **과거** 간격 로그값 (확장 윈도우)
        n = len(rows)
        for i in range(n):
            start_d, qty = rows[i]
            if i + 1 < n:
                dur = rows[i + 1][0] - start_d
                ev = 1
            else:
                dur = win_end - start_d          # 우측절단: 창 끝까지 관측
                ev = 0
            if dur <= 0:
                continue

            iv_dur.append(dur); iv_event.append(ev); iv_start.append(start_d)
            iv_member.append(m); iv_pair.append(pid)
            iv_l2.append(l2_codes[l2]); iv_qty.append(qty)
            # ⚠ 과거 통계는 **이 간격 이전 것만**. 아래 append 순서가 그 보증이다
            #   (logs에 지금 간격을 넣는 것은 기록을 마친 뒤).
            iv_pastn.append(len(logs))
            iv_pastlm.append(float(np.mean(logs)) if logs else 0.0)
            iv_hh.append(0.0 if hh is None else float(hh))
            iv_hhna.append(1.0 if hh is None else 0.0)
            iv_pet.append(0.0 if pet is None else float(pet))
            iv_petna.append(1.0 if pet is None else 0.0)
            iv_child.append(0.0 if child is None else float(child))
            iv_childna.append(1.0 if child is None else 0.0)
            iv_car.append(0.0 if car is None else float(car))
            iv_carna.append(1.0 if car is None else 0.0)

            if ev == 1:
                logs.append(float(np.log(dur)))   # 완료 간격만 과거 통계에 넣는다
                                                  # (절단은 하한만 알아 평균을 왜곡)

    d = dict(
        dur=np.asarray(iv_dur, dtype=np.float32),
        start=np.asarray(iv_start, dtype=np.float64),   # float32면 일 단위 정밀도가 깨진다
                                                        # (ordinal이 73만대라 유효숫자 부족)
        event=np.asarray(iv_event, dtype=np.int8),
        member=np.asarray(iv_member, dtype=np.int32),
        pair=np.asarray(iv_pair, dtype=np.int32),
        l2=np.asarray(iv_l2, dtype=np.int16),
        qty=np.asarray(iv_qty, dtype=np.float32),
        # [A-5 · 08-25] dow 제거 — 계산해서 싣기만 하고 어떤 설계행렬에도 안 들어갔다.
        #   요일 효과가 필요해지면 그때 FEATURE_KEYS와 함께 되살린다.
        past_n=np.asarray(iv_pastn, dtype=np.int16),
        past_log_mean=np.asarray(iv_pastlm, dtype=np.float32),
        hh=np.asarray(iv_hh, dtype=np.float32),
        hh_na=np.asarray(iv_hhna, dtype=np.float32),
        pet=np.asarray(iv_pet, dtype=np.float32),
        pet_na=np.asarray(iv_petna, dtype=np.float32),
        child=np.asarray(iv_child, dtype=np.float32),
        child_na=np.asarray(iv_childna, dtype=np.float32),
        car=np.asarray(iv_car, dtype=np.float32),
        car_na=np.asarray(iv_carna, dtype=np.float32),
        last_bin=np.asarray([bin_of(x, edges) for x in iv_dur], dtype=np.int8),
    )
    return d, l2_codes


def main():
    max_m = None
    if "--members" in sys.argv:
        max_m = int(sys.argv[sys.argv.index("--members") + 1])

    import catalog as cat
    import members_gen as membergen
    import consume

    print("세계 조립 중 …", flush=True)
    products, _s, _n = cat.generate()
    l2_by_sku = {r[consume.SKU]: r[consume.L2] for r in products}
    axes = {m[0]: (m[1], m[2], m[3], m[4]) for m in membergen.gen_members()}

    print("구매 이력 읽는 중 …", flush=True)
    pairs, win_end = load_pairs(max_members=max_m)

    print("간격 표 만드는 중 …", flush=True)
    d, l2_codes = build(pairs, win_end, l2_by_sku, axes)

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, "repurchase_intervals.npz")
    np.savez_compressed(out, l2_names=np.array(sorted(l2_codes, key=l2_codes.get)),
                        bin_edges=np.array(BIN_EDGES, dtype=np.float64),
                        win_end=np.array([win_end]), **d)

    n_iv = len(d["dur"]); n_ev = int(d["event"].sum())
    obs = d["dur"][d["event"] == 1]
    print("=" * 72)
    print("재구매 간격 표 완성")
    print("=" * 72)
    print(f"(회원,SKU) 쌍 {len(pairs):,} · 회원 {len(set(d['member'])):,}")
    print(f"간격 {n_iv:,}  (완료 {n_ev:,} · 절단 {n_iv-n_ev:,} = {(n_iv-n_ev)/n_iv:.1%})")
    print(f"완료 간격  평균 {obs.mean():.1f}일 · 중앙 {np.median(obs):.1f} · "
          f"변동계수 {obs.std()/obs.mean():.2f}")
    print(f"과거 이력 없는 간격 {(d['past_n'] == 0).sum():,} "
          f"({(d['past_n'] == 0).mean():.1%})  ← 결측 표시자와 함께 학습에 넣는다")
    print(f"person-period 예상 행 {int((d['last_bin'] + 1).sum()):,} "
          f"(간격당 평균 {(d['last_bin']+1).mean():.1f} 구간)")
    print()
    print("금지 칸 검산 — 설계행렬이 쓰는 칸과 금지 칸의 교집합을 본다.")
    print("  (저장 키 전체를 보면 진단용 칸까지 오탐한다. 재야 할 것은 X에 들어가는 칸이다)")
    leaked = sorted(FEATURE_KEYS & _FORBIDDEN)
    missing = sorted(FEATURE_KEYS - set(d))
    print(f"  누출 {len(leaked)}건" + ("" if not leaked else f"  !! {leaked}"))
    print(f"  FEATURE_KEYS 중 미저장 {len(missing)}건"
          + ("" if not missing else f"  !! {missing}"))
    print(f"  진단용 저장(특징 아님): dur · start · event · last_bin · pair · member")
    print(f"저장 → {out}")


if __name__ == "__main__":
    main()
