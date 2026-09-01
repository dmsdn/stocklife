# ============================================================================
# 소비주기 자산 — 확률 재보정 (isotonic). 서빙 전 유일한 블로커
# ============================================================================
# [왜 필요한가] 후보 대조에서 나온 보정 곡선이 고구간에서 무너졌다:
#     예측 93.1% → 실제 78.7%   (−14.4%p)
#     예측 84.2% → 실제 72.0%
#     예측 74.9% → 실제 66.2%
#   헌법 8은 "시점별 확률"을 요구하는데, 그 확률이 맞아야 의미가 있다.
#   에이전트가 "93% 확실합니다"라고 말했는데 실제로 79%면 **그건 확률이 아니라
#   과장**이다. 손님이 기다렸다가 허탕치면 다음부터 알림을 끈다.
#
# [무엇을 하나] 모델의 원시 확률 p를 **단조 증가 함수** g로 다시 매핑한다:
#     p_보정 = g(p_원시),   g는 비감소(monotone non-decreasing)
#   단조를 강제하는 이유: 순위를 보존해야 한다. "A가 B보다 곧 살 것"이라는 판단은
#   맞는데 절대 확률만 틀린 상황이므로, **순서를 건드리지 않고 눈금만 고친다.**
#   isotonic 회귀가 정확히 이 제약(단조) 아래 제곱오차를 최소화하는 도구다.
#
# [왜 Brier가 줄어드는가 — 분해가 답이다]
#   Brier = 신뢰도(reliability) − 해상도(resolution) + 불확실성(uncertainty)
#     · 신뢰도  : 예측확률과 실제빈도의 차이. **보정이 고치는 항** (작을수록 좋음)
#     · 해상도  : 예측이 케이스를 얼마나 갈라내는가 (클수록 좋음)
#     · 불확실성: 사건 자체의 무작위성. 어떤 모델도 못 건드림
#   단조 매핑은 순위를 보존하므로 **해상도를 거의 안 깎으면서 신뢰도만 줄인다.**
#   그래서 Brier가 내려간다.
#
# [⚠ 분할이 셋이어야 한다 — 여기서 실수가 난다]
#   보정 함수를 **모델을 학습한 데이터**로 맞추면 안 된다. 그 데이터에서 모델은 이미
#   과적합돼 있어 보정이 필요 없어 보이고, 정작 새 데이터에서는 안 고쳐진다.
#   실패 시나리오: train으로 보정 → 검증 Brier가 안 줄거나 오히려 는다.
#     학습(train) 60% → 모델 적합
#     보정(calib) 15% → g 적합            ← 모델이 처음 보는 데이터
#     검증(test)  25% → 최종 채점
#   **모두 회원 단위로 자른다**(쌍·간격 단위로 자르면 frailty가 새어 나간다).
#
# 실행:  python repurchase_calibrate.py
#        python repurchase_calibrate.py --seeds 1
# ============================================================================

from __future__ import annotations

import os
import sys

import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

import repurchase as R   # noqa: E402


def three_way(d, seed):
    """회원을 학습 60 / 보정 15 / 검증 25로. 간격 인덱스 셋을 돌려준다."""
    members = np.unique(d["member"])
    rng = np.random.default_rng(seed)
    perm = rng.permutation(members)
    n = len(perm)
    te_m = set(perm[: int(n * 0.25)].tolist())
    ca_m = set(perm[int(n * 0.25): int(n * 0.40)].tolist())
    mem = d["member"]
    is_te = np.isin(mem, list(te_m))
    is_ca = np.isin(mem, list(ca_m))
    return (np.where(~(is_te | is_ca))[0], np.where(is_ca)[0], np.where(is_te)[0])


def hazard_from_curve(F):
    """누적곡선 F(t) → 구간 해저드 h(t). curve_matrix가 누적한 것을 되돌린다.

        F(0) = h(0)
        F(j) = 1 − ∏_{k<=j}(1−h(k))  →  h(j) = (F(j) − F(j−1)) / (1 − F(j−1))

    보정은 **해저드에 걸고 다시 누적한다.** 누적된 F에 g를 직접 걸면 곱 구조가
    깨져서 "구간 j까지의 확률"이 구간별 확률의 곱과 어긋난다 — 곡선이 단조를
    잃거나 1을 넘을 수 있다.
    """
    prev = np.concatenate([np.zeros((F.shape[0], 1), np.float32), F[:, :-1]], axis=1)
    return np.clip((F - prev) / np.maximum(1.0 - prev, 1e-9), 0.0, 1.0).astype(np.float32)


def reliability(p, y, n_bins=20):
    """신뢰도 항 — Σ n_k (p̄_k − ȳ_k)² / N. 작을수록 잘 보정된 것."""
    edges = np.linspace(0, 1, n_bins + 1)
    tot, N = 0.0, len(p)
    for i in range(n_bins):
        m = (p >= edges[i]) & (p < edges[i + 1] if i < n_bins - 1 else p <= 1.0)
        if m.sum() > 0:
            tot += m.sum() * (p[m].mean() - y[m].mean()) ** 2
    return float(tot / N)


def max_gap(p, y, n_bins=10):
    """보정 곡선의 최대 어긋남(%p) — '93%라고 말했는데 실제 79%'를 한 숫자로."""
    g = 0.0
    for pm, ym, n in R.calibration(p, y, n_bins):
        g = max(g, abs(pm - ym))
    return g * 100


def run(d, seed, log):
    from sklearn.linear_model import LogisticRegression
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.isotonic import IsotonicRegression

    edges = d["bin_edges"]
    n_bins = len(edges) - 1
    n_l2 = int(d["l2"].max()) + 1
    tr, ca, te = three_way(d, seed)
    log("  회원 분할 — 학습 %s · 보정 %s · 검증 %s (간격)"
        % (f"{len(tr):,}", f"{len(ca):,}", f"{len(te):,}"))

    s2w, tau2, mu_l2, gm = R.fit_shrinkage(d, tr)
    eb = {k: R.apply_eb(d, v, s2w, tau2, mu_l2, gm, shrink=False)
          for k, v in (("tr", tr), ("ca", ca), ("te", te))}

    exp = {k: R.expand(v, d["last_bin"], d["event"], n_bins)
           for k, v in (("tr", tr), ("ca", ca), ("te", te))}
    rng = np.random.default_rng(seed)
    sub = rng.choice(len(exp["tr"][2]), size=min(R.FIT_ROWS, len(exp["tr"][2])),
                     replace=False)

    out = []
    for tag, kind in (("② 이산시간", "lr"), ("④ 부스팅", "gbm")):
        # ── 적합 ──
        if kind == "lr":
            Xtr = R.design_sparse(d, tr, eb["tr"], n_bins, n_l2,
                                  exp["tr"][0][sub], exp["tr"][1][sub])
            mdl = LogisticRegression(max_iter=300, fit_intercept=False, C=1.0)
        else:
            Xtr = R.design_dense(d, tr, eb["tr"], exp["tr"][0][sub], exp["tr"][1][sub])
            mdl = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.1,
                                                 max_leaf_nodes=31,
                                                 categorical_features=[1],
                                                 random_state=seed)
        mdl.fit(Xtr, exp["tr"][2][sub])
        del Xtr

        def raw(split):
            riv, b, _ = exp[split]
            idx = {"tr": tr, "ca": ca, "te": te}[split]
            X = (R.design_sparse(d, idx, eb[split], n_bins, n_l2, riv, b)
                 if kind == "lr" else R.design_dense(d, idx, eb[split], riv, b))
            return mdl.predict_proba(X)[:, 1]

        # ── 보정 함수 g를 **보정 분할**에서 적합 ──
        p_ca, y_ca = raw("ca"), exp["ca"][2]
        iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
        iso.fit(p_ca, y_ca)

        # ── 검증 ──
        p_te, y_te = raw("te"), exp["te"][2]
        q_te = iso.predict(p_te)

        rows = []
        for lab, p in (("원시", p_te), ("보정", q_te)):
            rows.append((lab, R.brier(p, y_te), reliability(p, y_te), max_gap(p, y_te)))
        log("  %s" % tag)
        for lab, br, rel, mg in rows:
            log("    %-4s Brier %.4f · 신뢰도항 %.5f · 최대어긋남 %.1f%%p"
                % (lab, br, rel, mg))
        log("    → Brier %+.4f · 신뢰도 %+.5f · 어긋남 %+.1f%%p"
            % (rows[1][1] - rows[0][1], rows[1][2] - rows[0][2], rows[1][3] - rows[0][3]))

        # ── 곡선 지표(MAE·개입)도 보정 전후로 ──
        F_raw = R.curve_matrix(mdl, d, te, eb["te"], n_bins, n_l2, kind == "lr")
        # 곡선은 구간 해저드에서 나오므로, 보정은 해저드에 걸고 다시 누적한다.
        # (누적한 F에 g를 걸면 단조·정합이 깨진다 — 확률의 곱 구조가 무너진다)
        h_raw = hazard_from_curve(F_raw)
        h_cal = iso.predict(h_raw.ravel()).reshape(h_raw.shape).astype(np.float32)
        F_cal = 1.0 - np.cumprod(1.0 - h_cal, axis=1)

        done = d["event"][te] == 1
        act = d["dur"][te][done]
        for lab, F in (("원시", F_raw), ("보정", F_cal)):
            med = R.median_days_from_curve(F[done], edges)
            ad, rc = R.alert_day_from_curve(F[done], edges)
            bf = (ad <= act) & rc
            out.append({"tag": f"{tag}/{lab}", "brier": R.brier(
                q_te if lab == "보정" else p_te, y_te),
                "mae": float(np.mean(np.abs(med - act))),
                "before": float(bf.mean())})
            log("    %-4s MAE %.1f일 · 구매전알림 %.1f%%"
                % (lab, out[-1]["mae"], out[-1]["before"] * 100))

        if kind == "gbm":
            log("    보정 후 곡선 (검증)")
            for pm, ym, n in R.calibration(q_te, y_te):
                log("      예측 %5.1f%%  실제 %5.1f%%  n=%9s" % (pm * 100, ym * 100, f"{n:,}"))
    return out


def main():
    n_seed = int(sys.argv[sys.argv.index("--seeds") + 1]) if "--seeds" in sys.argv else 3
    lines = []

    def log(m):
        print(m, flush=True)
        lines.append(m)

    d = R.load()
    log("=" * 78)
    log("소비주기 — isotonic 재보정 (학습 60 / 보정 15 / 검증 25, 전부 회원 단위)")
    log("=" * 78)
    allr = []
    for s in range(n_seed):
        log("\n[시드 %d]" % s)
        allr.append({x["tag"]: x for x in run(d, s, log)})

    log("\n" + "=" * 78)
    log("요약 — 시드 %d개 평균" % n_seed)
    log("=" * 78)
    log("%-16s%12s%12s%14s" % ("후보/보정", "Brier", "MAE(일)", "구매전알림"))
    for t in ("② 이산시간/원시", "② 이산시간/보정", "④ 부스팅/원시", "④ 부스팅/보정"):
        v = [a[t] for a in allr if t in a]
        if not v:
            continue
        log("%-16s%12.4f%12.1f%13.1f%%"
            % (t, np.mean([x["brier"] for x in v]), np.mean([x["mae"] for x in v]),
               np.mean([x["before"] for x in v]) * 100))
    log("=" * 78)

    with open(os.path.join(_HERE, "out", "repurchase_calibration.txt"), "w",
              encoding="utf-8") as f:
        f.write("\n".join(lines))
    log("\n저장 -> models/out/repurchase_calibration.txt")


if __name__ == "__main__":
    main()
