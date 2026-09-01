# ============================================================================
# T15 ② — 자료·분할·라벨 (취향 매칭)
# ============================================================================
# [무엇] 구매 이력·카탈로그·회원 축을 읽고, **누출 없는 평가 분할**을 만든다.
#   후보 7종(preference_rank.py)이 전부 이 분할 위에서 채점된다.
#
# ────────────────────────────────────────────────────────────────────────────
# ⚠ 작업지시서 §3.1 의 **시간 분할은 이 세계에서 성립하지 않는다** (08-27 실측)
# ────────────────────────────────────────────────────────────────────────────
#   지시서: "학습 = ~2026-07-09 / 평가 = 그 뒤 30일의 **처음 사는 SKU**".
#   돌려 보니 라벨이 **0쌍**이었다. 60일로 늘려도 2쌍, 90일로 늘려도 9쌍이다.
#
#   원인은 버그가 아니라 **세계의 구조**다. `consume.py` 는 회원 생성 시점에
#   습관 SKU 18~40개를 뽑아 **고정**하고, 그 뒤로는 주기대로 반복만 한다.
#   품목 주기는 길어야 63일이라 습관 SKU 는 전부 창 앞쪽에서 한 번씩 나온다 —
#   실측 첫 등장 경과일 중앙 24일 · 99% 96일 · 최대 220일(창 269일).
#   즉 **"신상품 발견"이라는 과정이 이 세계에 없다.**
#
#   → **보류 SKU 분할(leave-N-out)로 바꾼다.** 회원의 습관 SKU 중 일부를
#     이력에서 통째로 지우고(그 SKU 의 구매 행 **전부**), 남은 이력으로 그것을
#     맞히게 한다. 암묵적 피드백 추천에서 쓰는 표준 프로토콜이고, 지시서가
#     지키려던 것(**누출 금지** · **아직 안 산 것만 후보**)을 그대로 지킨다.
#     잃는 것은 "미래를 맞힌다"는 서사뿐인데, 그 서사는 애초에 이 세계에
#     대응물이 없다.
#
#   ⚠ 시간 분할과 달리 **인기순(②)도 학습 행에서만** 세야 한다. 보류 SKU 가
#     전역 인기 집계에 남아 있으면 "라벨이 인기 순위를 통해 새어 나온다".
# ============================================================================
from __future__ import annotations

import os
import re
import sys

import numpy as np
import pandas as pd

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
PUR = os.path.join(_ROOT, "sim", "out", "mode1", "purchases.csv.gz")
CAT = os.path.join(_ROOT, "catalog", "out", "products_seed_5000.csv")
MEM = os.path.join(_ROOT, "sim", "out", "members_seed.sql")

WORLD_SEED = 20260818          # sim/params.py SEED — 오라클 재현에 쓴다
HOLD_FRAC = 0.25               # 습관 SKU 중 보류 비율
MIN_TRAIN_SKU = 3              # 학습에 최소 이만큼은 남긴다(콜드스타트는 따로 본다)

_MEM_ROW = re.compile(r"\((\d+),(\d+|NULL),(\d+|NULL),(\d+|NULL),(\d+|NULL),")


def use_utf8():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:                                        # noqa: BLE001
        pass


def load_catalog() -> pd.DataFrame:
    """SKU 사전. `sku_id` 오름차순으로 고정한다 — 이 순서가 임베딩 행 순서이자
    점수 행렬의 열 순서라, 한 곳이라도 어긋나면 조용히 딴 상품을 추천한다."""
    c = pd.read_csv(CAT, encoding="utf-8-sig")
    return c.sort_values("sku_id").reset_index(drop=True)


def load_members() -> pd.DataFrame:
    """회원 축 4개. `members_seed.sql` 의 INSERT 를 정규식으로 뜯는다.

    [왜 SQL 을 파싱하나] 회원은 DB 시드로만 나가 있고 parquet 이 없다. 축을
    다시 생성(`members_gen`)하면 될 것 같지만, 그러면 **시드 파일과 어긋날 위험**을
    새로 만든다 — 팀에 이미 나간 것이 이 SQL 이므로 이것이 정본이다.
    NULL 은 "안 물어봄"이고 0 이 아니다(세계명세 §4.1) → -1 로 실어 구분한다.
    """
    rows = []
    with open(MEM, encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if not s.startswith("("):
                continue
            m = _MEM_ROW.match(s)
            if m:
                g = m.groups()
                rows.append([int(g[0])] + [-1 if v == "NULL" else int(v) for v in g[1:]])
    df = pd.DataFrame(rows, columns=["member_id", "hh", "pet", "child", "car"])
    return df.sort_values("member_id").reset_index(drop=True)


def load_purchases() -> pd.DataFrame:
    return pd.read_csv(PUR, usecols=["member_id", "sku_id", "qty", "purchased_at"])


def build(seed: int):
    """분할 하나를 만든다. 시드를 바꾸면 **보류 SKU 가 바뀐다**(자료는 그대로).

    [반환] dict — 배열은 전부 **조밀 색인**(회원 0..M-1 · SKU 0..S-1)이다.
      mid, sid          색인 → 실제 id (이름표)
      tr_m, tr_s, tr_n  학습 구매: 회원·SKU 색인과 그 쌍의 구매 **횟수**
      tr_last           그 쌍의 마지막 구매 경과일(오늘 기준) — 최근성 가중용
      ho_m, ho_s        보류(=라벨) 쌍
      l2                SKU → 소분류 색인 · l2_names
      axes              회원 축 (M, 4)
    """
    rng = np.random.default_rng(seed)
    cat, mem, pur = load_catalog(), load_members(), load_purchases()

    sid = cat["sku_id"].to_numpy(np.int64)
    s_ix = pd.Series(np.arange(len(sid)), index=sid)
    mid = mem["member_id"].to_numpy(np.int64)
    m_ix = pd.Series(np.arange(len(mid)), index=mid)

    pur = pur[pur["member_id"].isin(m_ix.index) & pur["sku_id"].isin(s_ix.index)]
    day = pd.to_datetime(pur["purchased_at"]).dt.floor("D")
    today = day.max()
    pur = pur.assign(mi=m_ix.reindex(pur["member_id"]).to_numpy(),
                     si=s_ix.reindex(pur["sku_id"]).to_numpy(),
                     ago=(today - day).dt.days.to_numpy())

    # 회원×SKU 로 접는다 — 이 쌍이 「습관」의 단위다.
    g = pur.groupby(["mi", "si"], sort=True)
    pair = g.agg(n=("qty", "size"), qty=("qty", "sum"), ago=("ago", "min")).reset_index()

    # ── 보류 뽑기 ────────────────────────────────────────────────────────
    # 회원마다 습관 SKU 의 HOLD_FRAC 을 통째로 지운다. 그 SKU 의 구매 행이
    # **전부** 사라져야 누출이 없다(한 줄이라도 남으면 "산 적 있다"가 샌다).
    hold = np.zeros(len(pair), bool)
    starts = np.flatnonzero(np.r_[True, pair["mi"].to_numpy()[1:] != pair["mi"].to_numpy()[:-1]])
    ends = np.r_[starts[1:], len(pair)]
    for a, b in zip(starts, ends):
        k = b - a
        n_hold = int(round(k * HOLD_FRAC))
        n_hold = min(n_hold, max(0, k - MIN_TRAIN_SKU))
        if n_hold > 0:
            hold[a + rng.choice(k, size=n_hold, replace=False)] = True

    tr, ho = pair[~hold], pair[hold]
    l2_names = sorted(cat["category_l2"].unique())
    l2_ix = {v: i for i, v in enumerate(l2_names)}
    return {
        "mid": mid, "sid": sid, "cat": cat,
        "tr_m": tr["mi"].to_numpy(np.int32), "tr_s": tr["si"].to_numpy(np.int32),
        "tr_n": tr["n"].to_numpy(np.float32), "tr_qty": tr["qty"].to_numpy(np.float32),
        "tr_ago": tr["ago"].to_numpy(np.float32),
        "ho_m": ho["mi"].to_numpy(np.int32), "ho_s": ho["si"].to_numpy(np.int32),
        "l2": cat["category_l2"].map(l2_ix).to_numpy(np.int32), "l2_names": l2_names,
        "axes": mem[["hh", "pet", "child", "car"]].to_numpy(np.int32),
        "seed": seed,
    }


if __name__ == "__main__":
    use_utf8()
    d = build(0)
    M, S = len(d["mid"]), len(d["sid"])
    print(f"회원 {M:,} · SKU {S:,} · 소분류 {len(d['l2_names'])}")
    print(f"학습 쌍 {len(d['tr_m']):,} · 보류(라벨) 쌍 {len(d['ho_m']):,}")
    nh = np.bincount(d["ho_m"], minlength=M)
    nt = np.bincount(d["tr_m"], minlength=M)
    print(f"회원당 학습 SKU 중앙 {np.median(nt):.0f} · 라벨 중앙 {np.median(nh):.0f} "
          f"· 라벨 0인 회원 {int((nh == 0).sum()):,}")
    print(f"후보 크기 중앙 {S - np.median(nt):.0f}")
