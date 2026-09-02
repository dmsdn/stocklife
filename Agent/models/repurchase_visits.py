# ============================================================================
# 소비주기 — 방문 공변량 추가와 천장 재측정
# ============================================================================
# [왜] 노트북 A가 가용예측에서 찾은 것과 **같은 종류의 결손**이 여기 있다.
#   A:  `qlen`(건수)은 봤는데 `q_work_sec`(소요)을 안 봤다  → 큐의 **구성**
#   여기: 경과일은 봤는데 **방문 여부**를 안 봤다            → 해저드의 **분해**
#
#   재구매 해저드는 사실 곱이다:
#       h(t) = P(그날 방문한다) × P(주기가 찼다 | 방문)
#   지금 모델은 오른쪽만 본다. 그런데 **손님이 와야 산다** — 실측으로 회원당
#   270일에 17.6회 방문(약 16일에 한 번)이고 재구매 중앙이 31.9일이라,
#   **간격 하나에 방문이 두 번밖에 없다.** 대부분의 날에 해저드는 문자 그대로 0인데
#   모델은 그 0을 "아직 주기가 안 찼다"로 잘못 배운다.
#
# [⚠ 이 공변량은 구간마다 값이 다르다 — 지금까지와 성질이 다르다]
#   기존 공변량(hh·eb·qty…)은 간격 안에서 상수였다. 방문 수는 간격이 진행되며 쌓인다.
#   이산시간 해저드는 원래 **구간별 공변량**을 허용한다 — 그것이 이 형식의 장점이다.
#
# [누출 경계가 미묘하다]
#   구간 b의 해저드를 예측하는 시점은 **구간 b의 시작**이다. 그때 아는 것은
#   [간격시작, b시작) 의 방문뿐이고, **구간 b 안의 방문은 미래**다.
#       legit  : v_before[b] = [start, start + edges[b]) 방문 수
#       oracle : v_in[b]     = [start + edges[b], start + edges[b+1]) 방문 수  ← 커닝
#   oracle은 **천장 측정 전용**이다. "방문을 완벽히 알면 얼마나 좋아지나"를 재고,
#   그 값이 잔여 잡음 52.4%의 얼마를 먹는지 본다.
#   (§3.3의 오라클은 **쌍 수준** 정보만 쟀다. 이건 **간격 안** 정보의 천장이다.)
#
# 실행:  python repurchase_visits.py
#        python repurchase_visits.py --seeds 1
# ============================================================================

from __future__ import annotations

import os
import sys
import time

import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

import repurchase as R   # noqa: E402

VISITS_NPZ = os.path.join(_HERE, "out", "member_visits.npz")
CE = os.path.join(_HERE, "..", "sim", "out", "mode1", "consumer_events.parquet")


def build_visits(log):
    """회원별 방문 시각(일 단위 절대값) 정렬본을 만든다.

    방문 = 세션이다. `consumer_events`의 (member_id, session_id)마다 첫 이벤트 시각.
    parquet에서 **3열만** 읽는다 — 8열을 다 파싱하면 8초, 3열이면 0.5초다.
    """
    if os.path.exists(VISITS_NPZ):
        d = np.load(VISITS_NPZ)
        log("  방문 인덱스 재사용 — %s명 · 방문 %s"
            % (f"{len(d['offset'])-1:,}", f"{len(d['times']):,}"))
        return d["members"], d["offset"], d["times"]

    import pandas as pd
    t0 = time.perf_counter()
    df = pd.read_parquet(CE, columns=["member_id", "session_id", "occurred_at"])
    df = df[df["member_id"].notna()]
    v = (df.groupby(["member_id", "session_id"], observed=True)["occurred_at"]
           .min().reset_index())
    # datetime → 일 단위 절대값. repurchase_period 의 _day() 와 같은 축이어야 한다.
    t = v["occurred_at"]
    day = (t.dt.normalize().map(lambda x: x.toordinal()).to_numpy(dtype=np.float64)
           + (t.dt.hour * 3600 + t.dt.minute * 60 + t.dt.second).to_numpy() / 86400.0)
    mem = v["member_id"].to_numpy(dtype=np.int64)

    order = np.lexsort((day, mem))
    mem, day = mem[order], day[order]
    members, start = np.unique(mem, return_index=True)
    offset = np.append(start, len(mem))
    np.savez_compressed(VISITS_NPZ, members=members, offset=offset, times=day)
    log("  방문 인덱스 생성 %.0f초 — 회원 %s · 방문 %s (회원당 %.1f)"
        % (time.perf_counter() - t0, f"{len(members):,}", f"{len(day):,}",
           len(day) / len(members)))
    return members, offset, day


def visit_counts(d, idx, riv, b, edges, members, offset, times):
    """구간 행마다 (직전까지 누적 방문, 그 구간 안의 방문) 두 벡터.

    회원별로 정렬된 방문 배열에 searchsorted를 건다. 회원 1만 명을 도는 루프가
    가장 단순하고, 벡터화한 것과 속도 차이가 거의 없다(회원당 방문이 17개뿐이라
    searchsorted 자체가 상수 시간에 가깝다).
    """
    mem_iv = d["member"][idx]
    st_iv = d["start"][idx]
    lo = np.asarray([edges[i] for i in range(len(edges) - 1)], dtype=np.float64)
    hi = np.asarray([edges[i + 1] if np.isfinite(edges[i + 1]) else 1e9
                     for i in range(len(edges) - 1)], dtype=np.float64)

    v_before = np.zeros(len(riv), dtype=np.float32)
    v_in = np.zeros(len(riv), dtype=np.float32)

    m_pos = {int(m): i for i, m in enumerate(members)}
    order = np.argsort(mem_iv[riv], kind="stable")
    mm = mem_iv[riv][order]
    bb = b[order]
    ss = st_iv[riv][order]
    uniq, gs = np.unique(mm, return_index=True)
    ge = np.append(gs[1:], len(mm))

    for m, s0, s1 in zip(uniq, gs, ge):
        p = m_pos.get(int(m))
        if p is None:
            continue
        tv = times[offset[p]:offset[p + 1]]
        sl = slice(s0, s1)
        base = ss[sl]
        bi = bb[sl].astype(np.int64)
        a0 = np.searchsorted(tv, base)                   # 간격 시작 시점
        a1 = np.searchsorted(tv, base + lo[bi])          # 구간 b 시작
        a2 = np.searchsorted(tv, base + hi[bi])          # 구간 b 끝
        v_before[order[sl]] = (a1 - a0).astype(np.float32)
        v_in[order[sl]] = (a2 - a1).astype(np.float32)
    return v_before, v_in


def member_rate(d, idx, members, offset, times):
    """그 회원의 방문 밀도(방문/일). 간격 단위 상수 — 창 전체에서 추정한다.

    ⚠ 엄밀히는 확장 윈도여야 하지만, 방문 밀도는 회원의 **성향**이라 창 안에서
    거의 변하지 않는다(hh·car에서 결정된다 — 3-02). 누출 위험이 낮은 대신
    효과도 hh·car와 겹치므로, 이 칸이 크게 기여하면 오히려 의심해야 한다.
    """
    span = float(times.max() - times.min())
    mem = d["member"][idx]
    cnt = np.zeros(int(members.max()) + 2, dtype=np.float32)
    for p, m in enumerate(members):
        cnt[int(m)] = offset[p + 1] - offset[p]
    out = (cnt[mem] / max(span, 1.0)).astype(np.float32)
    return out


def run(seed, mode, d, vis, log):
    """mode 넷.

      base       현행 — 방문 정보 없음
      visit      + 정당한 방문 이력 (구간 시작까지의 누적)
      oracle     + 구간 안 방문 수 (커닝) — **천장 측정 전용**
      given      **방문한 구간만** 채점 — 서빙에서 손님이 매장에 있을 때의 질문

    ⚠ given은 채점 대상 행이 달라 다른 셋과 Brier를 직접 비교할 수 없다.
      그래서 그 부분집합의 기저율을 참조선으로 함께 낸다.
    """
    from sklearn.ensemble import HistGradientBoostingClassifier
    from scipy import sparse  # noqa: F401

    members, offset, times = vis
    edges = d["bin_edges"]
    n_bins = len(edges) - 1
    n_l2 = int(d["l2"].max()) + 1
    mem_all = np.unique(d["member"])
    rng = np.random.default_rng(seed)
    te_m = set(rng.choice(mem_all, size=int(len(mem_all) * .25), replace=False).tolist())
    is_te = np.isin(d["member"], list(te_m))
    tr, te = np.where(~is_te)[0], np.where(is_te)[0]

    s2w, tau2, mu_l2, gm = R.fit_shrinkage(d, tr)
    eb = {"tr": R.apply_eb(d, tr, s2w, tau2, mu_l2, gm, False),
          "te": R.apply_eb(d, te, s2w, tau2, mu_l2, gm, False)}
    ex = {"tr": R.expand(tr, d["last_bin"], d["event"], n_bins),
          "te": R.expand(te, d["last_bin"], d["event"], n_bins)}

    def design(split, idx):
        riv, b, _ = ex[split]
        X = R.design_dense(d, idx, eb[split], riv, b)
        if mode == "base":
            return X
        vb, vi = visit_counts(d, idx, riv, b, edges, members, offset, times)
        rate = member_rate(d, idx, members, offset, times)[riv]
        cols = [np.log1p(vb), rate]
        if mode == "oracle":
            cols.append(vi)                 # ⚠ 커닝 — 천장 측정 전용
        return np.column_stack([X] + [c.astype(np.float32) for c in cols])

    Xtr = design("tr", tr)
    ytr = ex["tr"][2]
    keep_tr = keep_te = None
    if mode == "given":
        # 그 구간에 방문이 **있었던** 행만 남긴다. 조건부 확률 P(산다 | 방문)을 배운다.
        riv, b, _ = ex["tr"]
        _, vi_tr = visit_counts(d, tr, riv, b, edges, members, offset, times)
        keep_tr = vi_tr >= 1
        riv, b, _ = ex["te"]
        _, vi_te = visit_counts(d, te, riv, b, edges, members, offset, times)
        keep_te = vi_te >= 1
        Xtr, ytr = Xtr[keep_tr], ytr[keep_tr]
    sub = rng.choice(len(ytr), size=min(R.FIT_ROWS, len(ytr)), replace=False)
    m = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.1,
                                       max_leaf_nodes=31, categorical_features=[1],
                                       random_state=seed)
    m.fit(Xtr[sub], ytr[sub])
    del Xtr
    Xte = design("te", te)
    yte = ex["te"][2]
    if mode == "given":
        Xte, yte = Xte[keep_te], yte[keep_te]
    p = m.predict_proba(Xte)[:, 1]
    del Xte
    br = R.brier(p, yte)
    if mode == "given":
        base_rate = float(yte.mean())
        log("  %-8s Brier %.4f  (행 %s · 기저율 %.1f%% → 기저율로 찍으면 %.4f)"
            % (mode, br, f"{len(yte):,}", base_rate * 100, base_rate * (1 - base_rate)))
        return br
    rel = None
    try:
        import repurchase_calibrate as C
        rel = C.reliability(p, ex["te"][2])
    except Exception:
        pass
    log("  %-8s Brier %.4f%s" % (mode, br, "" if rel is None else "  · 신뢰도항 %.5f" % rel))
    return br


def main():
    n_seed = int(sys.argv[sys.argv.index("--seeds") + 1]) if "--seeds" in sys.argv else 3
    lines = []

    def log(msg):
        print(msg, flush=True)
        lines.append(msg)

    log("=" * 78)
    log("소비주기 — 방문 공변량과 천장 재측정 (출하 후보 ④ GBM)")
    log("=" * 78)
    d = R.load()
    vis = build_visits(log)

    res = {k: [] for k in ("base", "visit", "oracle", "given")}
    for s in range(n_seed):
        log("\n[시드 %d]" % s)
        for mode in ("base", "visit", "oracle", "given"):
            res[mode].append(run(s, mode, d, vis, log))

    log("\n" + "=" * 78)
    log("요약 — 시드 %d개 평균" % n_seed)
    log("=" * 78)
    b0 = float(np.mean(res["base"]))
    for k, label in (("base", "현행 (방문 없음)"),
                     ("visit", "+ 방문 이력 (legit)"),
                     ("oracle", "+ 구간 안 방문 (커닝, 천장)"),
                     ("given", "방문한 구간만 (서빙 조건) *")):
        v = np.array(res[k])
        log("  %-26s Brier %.4f ±%.4f   %s"
            % (label, v.mean(), v.std(),
               "" if k == "base" else "(%+.4f)" % (v.mean() - b0)))
    log("=" * 78)
    log("  * given은 채점 행이 달라 다른 셋과 직접 비교 불가 — 위 로그의 기저율과 비교할 것")

    with open(os.path.join(_HERE, "out", "repurchase_visits.txt"), "w",
              encoding="utf-8") as f:
        f.write("\n".join(lines))
    log("\n저장 -> models/out/repurchase_visits.txt")


if __name__ == "__main__":
    main()
