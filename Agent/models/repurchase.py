# ============================================================================
# 소비주기 자산 — 후보 5행 대조표 (① 바닥 · ② 출하 · ②' frailty · ③ 구조 · ④ 천장)
# ============================================================================
# [무엇] `repurchase_intervals.npz`의 간격 표를 구간으로 펼쳐, 다섯 후보로
#   **"이 회원이 이 상품을 언제 다시 살까"** 의 시점별 확률 곡선을 만들고 겨룬다.
#
# [다섯이 각자 다른 질문에 답한다 — 성능 줄세우기가 아니다]
#   ① 평균주기        학습 없음. 이 쌍의 과거 간격 평균 → **바닥**.
#                     못 이기면 결론은 "모델 말고 쿼리를 쓴다"
#   ② 이산시간+(a)    구간별 해저드 + **원시 과거평균** 공변량 → 출하 후보
#   ②' 이산시간+(b)   구간별 해저드 + **축소된 과거평균**(경험적 베이즈) → 정합성
#   ③ Weibull AFT     간격에 모수 분포를 가정 → 구조. 외삽이 매끄럽다
#                     ⚠ 원래 계획은 감마 재발이었으나 lifelines의 감마 회귀가
#                       무거워 Weibull로 대체했다. 이름을 그대로 쓰면 안 된다.
#                       08-24 실측: 참조선보다 나쁘다 — 실제 해저드가 방문율에서
#                       **포화**하는데 Weibull 해저드는 멱함수라 포화를 못 그린다.
#   ④ 부스팅          ②와 **같은 뼈대**, h 추정기만 GBM → **천장**(②에 남은 여지)
#
# [(a)와 (b)의 차이 — 이 파일의 핵심 실험]
#   frailty는 회원×SKU 은닉 배율이고 세계는 그것을 **로그정규**로 생성한다.
#   그래서 로그공간에서 정규-정규 켤레가 성립하고, 사후평균이 닫힌 형태로 나온다:
#
#       w  = (n/σ²_w) / (n/σ²_w + 1/τ²)          ← 관측 n개의 신뢰 무게
#       eb = w · (그 쌍의 과거 로그평균) + (1−w) · (그 소분류의 로그평균)
#
#   n이 작으면 w→0이라 모집단으로 끌려가고, n이 크면 w→1이라 제 값을 지킨다.
#   (a)는 이 w를 **항상 1로 두는 것**과 같다 — 표본 크기를 무시하는 추정량.
#   실패 시나리오: 우연히 10일 만에 두 번 산 회원(진짜 주기 35일)을 (a)는 "주기 10일"로
#   믿고 10일마다 알린다 → 수다스럽다고 느껴 알림을 끈다.
#
#   ⚠ σ²_w·τ²·소분류 평균은 **학습 분할에서만** 추정한다. 검증 회원의 간격이
#     하이퍼파라미터에 새어 들어가면 그것도 누출이다.
#
# [평가 지표 셋 — 하나로는 못 고른다]
#   · Brier + 보정   확률이 맞는가. **헌법 8이 요구하는 것은 순위가 아니라 확률값**
#   · MAE(중앙예측)  며칠 틀리는가. 사람이 이해하는 단위. ①이 겨룰 수 있는 자리
#   · 개입 시점      실제 구매 **전에** 알렸는가 + 며칠 일찍. 유일하게 효용에 닿는 지표
#     (⚠ "언제 알리는 게 최선인가"의 정답은 우리 세계에 없다 — 손님 반응 모형이 없다.
#      약점목록 W-23. 그래서 "전에 알렸는가"까지만 주장한다)
#
# [분할] **회원 단위**. 쌍으로 자르는 것도 모자라다 — 취향(prefs)이 그 회원의 습관
#   SKU 집합 전체를 정하므로 같은 회원의 다른 SKU도 정보를 흘린다(설계 결정 ①).
#
# 실행:  python repurchase.py                # 시드 3개 전체
#        python repurchase.py --seeds 1      # 빠른 확인
#        python repurchase.py --only 1,2     # 후보 골라서
# ============================================================================

from __future__ import annotations

import os
import sys
import time

import numpy as np
from scipy import sparse

_HERE = os.path.dirname(os.path.abspath(__file__))
NPZ = os.path.join(_HERE, "out", "repurchase_intervals.npz")

# 로지스틱 적합에 쓸 최대 구간 행 수. 모수가 ~85개뿐이라 200만 행이면 통계적으로
# 충분하고(표준오차는 √n에 반비례해 이미 무시할 수준), 1,046만 행 전체를 lbfgs에
# 넣으면 반복마다 1.5억 비영원소를 훑어 몇 시간이 된다. **검증은 전량으로 한다.**
FIT_ROWS = 2_000_000
# ③ AFT는 lifelines가 밀집 DataFrame을 요구해 간격 단위로도 무겁다. 간격을 표집한다.
AFT_INTERVALS = 300_000
# 개입 임계 — 이 확률을 넘는 첫날에 알린다고 가정한다.
ALERT_P = 0.60
# 표본 크기 공변량(past_n)을 넣을지. 넣으면 (a)를 줘도 모델이 "관측이 몇 개인지"를
# 보고 스스로 신뢰도를 조정할 수 있어 축소의 효과가 흡수된다 — 그 가설을 재는 스위치.
USE_PAST_N = "--no-pastn" not in sys.argv


def load():
    d = np.load(NPZ, allow_pickle=True)
    return {k: d[k] for k in d.files}


# ── 구간 펼치기 ──────────────────────────────────────────────────────────────
def expand(idx, last_bin, event, n_bins):
    """간격 인덱스 → (구간행 → 간격인덱스 map, 구간번호, y).

    간격 i가 last_bin=L이면 구간 0..L 을 낳고, y는 마지막 구간에서만 event다.
    np.repeat로 한 번에 만든다 — 파이썬 루프면 1,000만 행에서 분 단위가 된다.
    """
    L = last_bin[idx].astype(np.int64)
    reps = L + 1
    row_iv = np.repeat(np.arange(len(idx), dtype=np.int64), reps)
    # 각 간격 안에서 0..L 로 증가하는 수열: 누적합에서 시작점을 빼면 나온다
    starts = np.cumsum(reps) - reps
    b = np.arange(len(row_iv), dtype=np.int64) - np.repeat(starts, reps)
    y = np.zeros(len(row_iv), dtype=np.float32)
    is_last = (b == np.repeat(L, reps))
    y[is_last] = np.repeat(event[idx].astype(np.float32), reps)[is_last]
    return row_iv, b.astype(np.int8), y


def numeric_block(d, idx, eb):
    """간격 단위 수치 공변량. (a)/(b)는 past 칸만 갈아 끼운다."""
    return np.column_stack([
        d["hh"][idx], d["hh_na"][idx],
        d["pet"][idx], d["pet_na"][idx],
        d["child"][idx], d["child_na"][idx],
        d["car"][idx], d["car_na"][idx],
        (np.log1p(d["past_n"][idx].astype(np.float32)) if USE_PAST_N
         else np.zeros(len(idx), np.float32)),
        (d["past_n"][idx] > 0).astype(np.float32),      # has_history
        eb,                                              # 과거평균(원시 또는 축소)
        np.log1p(d["qty"][idx]),                         # ⚠ 쟁여두기 진단용(W-05)
    ]).astype(np.float32)


def design_sparse(d, idx, eb, n_bins, n_l2, row_iv, b):
    """구간 행 × (구간더미 + 소분류더미 + 수치) 희소 설계행렬.

    절편을 넣지 않는다 — 구간 더미가 다 있어 완전공선이 된다(구간 더미가 곧
    구간별 기저 해저드다). 가용예측 hazard.py와 같은 이유.
    """
    n = len(row_iv)
    rows = np.arange(n, dtype=np.int64)
    bin_m = sparse.csr_matrix((np.ones(n, np.float32), (rows, b.astype(np.int64))),
                              shape=(n, n_bins))
    l2v = d["l2"][idx][row_iv].astype(np.int64)
    l2_m = sparse.csr_matrix((np.ones(n, np.float32), (rows, l2v)), shape=(n, n_l2))
    num = numeric_block(d, idx, eb)[row_iv]
    return sparse.hstack([bin_m, l2_m, sparse.csr_matrix(num)], format="csr")


def design_dense(d, idx, eb, row_iv, b):
    """GBM용 조밀 행렬 — 소분류를 원핫 대신 **범주 코드**로 준다.

    원핫이면 60열이 늘어 1,046만 행에서 밀집 4GB가 되지만, HistGBM은 범주형을
    네이티브로 받으므로 한 칸이면 된다(메모리 1/5, 분할 품질은 오히려 낫다).
    """
    num = numeric_block(d, idx, eb)[row_iv]
    return np.column_stack([
        b.astype(np.float32),
        d["l2"][idx][row_iv].astype(np.float32),
        num,
    ])


# ── (b) 경험적 베이즈 축소 ───────────────────────────────────────────────────
def fit_shrinkage(d, tr_iv):
    """학습 분할에서 σ²_w(쌍 내 분산) · τ²(쌍 간 분산) · 소분류 로그평균을 추정."""
    ev = d["event"][tr_iv] == 1
    iv = tr_iv[ev]
    logd = np.log(d["dur"][iv].astype(np.float64))
    pair = d["pair"][iv]
    l2 = d["l2"][iv]

    n_l2 = int(d["l2"].max()) + 1
    mu_l2 = np.zeros(n_l2)
    gm = logd.mean()
    for c in range(n_l2):
        m = l2 == c
        mu_l2[c] = logd[m].mean() if m.sum() >= 30 else gm

    # 쌍별 평균과 쌍 내 편차
    order = np.argsort(pair, kind="stable")
    p_s, l_s = pair[order], logd[order]
    uniq, start = np.unique(p_s, return_index=True)
    cnt = np.diff(np.append(start, len(p_s)))
    ssum = np.add.reduceat(l_s, start)
    pmean = ssum / cnt
    within = l_s - np.repeat(pmean, cnt)
    multi = cnt >= 2
    # σ²_w : 자유도 보정(쌍마다 평균 하나를 썼으므로 n-1)
    sigma2_w = float((within ** 2).sum() / max(1, (cnt[multi] - 1).sum()))
    # τ²  : 쌍 평균의 분산에서 평균의 표집오차(σ²_w/n)를 뺀다
    var_pm = float(np.var(pmean[multi]))
    tau2 = max(1e-6, var_pm - sigma2_w / float(np.mean(cnt[multi])))
    return sigma2_w, tau2, mu_l2, gm


def apply_eb(d, idx, sigma2_w, tau2, mu_l2, gm, shrink=True):
    """과거평균 → (a) 원시 그대로 / (b) 축소. 이력이 없으면 소분류 평균."""
    n = d["past_n"][idx].astype(np.float64)
    m = d["past_log_mean"][idx].astype(np.float64)
    prior = mu_l2[d["l2"][idx]]
    if not shrink:                       # (a)
        return np.where(n > 0, m, prior).astype(np.float32)
    w = np.zeros_like(n)                 # (b)
    nz = n > 0
    w[nz] = (n[nz] / sigma2_w) / (n[nz] / sigma2_w + 1.0 / tau2)
    return (w * m + (1.0 - w) * prior).astype(np.float32)


# ── 지표 ─────────────────────────────────────────────────────────────────────
def brier(p, y):
    return float(np.mean((p - y) ** 2))


def calibration(p, y, n_bins=10):
    edges = np.linspace(0, 1, n_bins + 1)
    out = []
    for i in range(n_bins):
        m = (p >= edges[i]) & (p < edges[i + 1] if i < n_bins - 1 else p <= 1.0)
        if m.sum() >= 200:
            out.append((float(p[m].mean()), float(y[m].mean()), int(m.sum())))
    return out




def median_days_from_curve(F, edges):
    """곡선에서 중앙 예측일 — F가 0.5를 넘는 첫 구간의 **상한**을 쓴다.

    구간 안 위치를 선형보간하지 않는 이유: 구간이 로그 간격이라 안쪽 분포를 모르고,
    상한을 쓰면 늦게 예측하는 쪽으로 보수적이 된다. 비용이 비대칭이라서다 —
    알림이 늦으면 무용지물이지만 이르면 수다일 뿐이다.
    """
    n_bins = F.shape[1]
    hit = F >= 0.5
    first = np.where(hit.any(axis=1), hit.argmax(axis=1), n_bins - 1)
    ub = np.array([edges[i + 1] if np.isfinite(edges[i + 1]) else edges[-2] * 1.5
                   for i in range(n_bins)])
    return ub[first]


def alert_day_from_curve(F, edges, thr=ALERT_P):
    """개입 임계를 넘는 첫 구간의 **하한** — 그날 알린다고 본다.

    임계를 끝내 못 넘으면 reached=False. 그 경우는 '알림 없음'이라
    구매 전 알림 성공에서 제외한다(못 알린 것을 성공으로 세면 안 된다).
    """
    n_bins = F.shape[1]
    hit = F >= thr
    reached = hit.any(axis=1)
    first = np.where(reached, hit.argmax(axis=1), n_bins - 1)
    lb = np.array([edges[i] for i in range(n_bins)])
    return lb[first], reached


def curve_matrix(model, d, idx, eb, n_bins, n_l2, sparse_mode):
    """각 간격에 대해 구간 11개의 누적확률 F(t)를 만든다.

    구간 더미만 갈아 끼우며 h(t)를 뽑고 1−∏(1−h)로 누적한다 — 도구가 낼 곡선이다.
    (간격수 × 11)행을 한 번에 만들면 검증분이 커서 청크로 나눈다.
    """
    n = len(idx)
    F = np.empty((n, n_bins), dtype=np.float32)
    CH = 200_000
    for s0 in range(0, n, CH):
        sl = slice(s0, min(s0 + CH, n))
        sub = idx[sl]
        m = len(sub)
        row_iv = np.repeat(np.arange(m, dtype=np.int64), n_bins)
        b = np.tile(np.arange(n_bins, dtype=np.int8), m)
        if sparse_mode:
            X = design_sparse(d, sub, eb[sl], n_bins, n_l2, row_iv, b)
        else:
            X = design_dense(d, sub, eb[sl], row_iv, b)
        h = model.predict_proba(X)[:, 1].reshape(m, n_bins)
        F[sl] = 1.0 - np.cumprod(1.0 - h, axis=1)
    return F


def eval_candidate(tag, F, h_te, y_te, d, te_iv, edges, out):
    """공통 채점 — Brier(구간행) · MAE(완료 간격) · 개입 시점."""
    res = {"tag": tag, "brier": brier(h_te, y_te) if h_te is not None else float("nan")}
    done = d["event"][te_iv] == 1
    actual = d["dur"][te_iv][done]
    pred_med = median_days_from_curve(F[done], edges)
    res["mae"] = float(np.mean(np.abs(pred_med - actual)))
    res["bias"] = float(np.mean(pred_med - actual))
    aday, reached = alert_day_from_curve(F[done], edges)
    before = (aday <= actual) & reached
    res["alert_before"] = float(before.mean())
    res["alert_lead"] = float(np.mean(actual[before] - aday[before])) if before.any() else float("nan")
    out.append(res)
    return res


def run_seed(d, seed, only, log):
    from sklearn.linear_model import LogisticRegression
    from sklearn.ensemble import HistGradientBoostingClassifier

    edges = d["bin_edges"]
    n_bins = len(edges) - 1
    n_l2 = int(d["l2"].max()) + 1
    members = np.unique(d["member"])
    rng = np.random.default_rng(seed)
    te_m = set(rng.choice(members, size=int(len(members) * 0.25), replace=False).tolist())
    is_te = np.isin(d["member"], list(te_m))
    tr_iv, te_iv = np.where(~is_te)[0], np.where(is_te)[0]
    log("  회원 분할 학습 %s / 검증 %s  · 간격 %s / %s"
        % (f"{len(members)-len(te_m):,}", f"{len(te_m):,}",
           f"{len(tr_iv):,}", f"{len(te_iv):,}"))

    s2w, tau2, mu_l2, gm = fit_shrinkage(d, tr_iv)
    w1 = (1 / s2w) / ((1 / s2w) + (1 / tau2))
    w7 = (7 / s2w) / ((7 / s2w) + (1 / tau2))
    log("  축소 추정: sigma2_w=%.4f tau2=%.4f -> 관측1회 무게 %.2f · 7회 %.2f"
        % (s2w, tau2, w1, w7))

    eb_a_tr = apply_eb(d, tr_iv, s2w, tau2, mu_l2, gm, shrink=False)
    eb_b_tr = apply_eb(d, tr_iv, s2w, tau2, mu_l2, gm, shrink=True)
    eb_a_te = apply_eb(d, te_iv, s2w, tau2, mu_l2, gm, shrink=False)
    eb_b_te = apply_eb(d, te_iv, s2w, tau2, mu_l2, gm, shrink=True)

    riv_tr, b_tr, y_tr = expand(tr_iv, d["last_bin"], d["event"], n_bins)
    riv_te, b_te, y_te = expand(te_iv, d["last_bin"], d["event"], n_bins)
    log("  구간 행 학습 %s / 검증 %s" % (f"{len(y_tr):,}", f"{len(y_te):,}"))

    sub = rng.choice(len(y_tr), size=min(FIT_ROWS, len(y_tr)), replace=False)
    out = []

    base_h = np.zeros(n_bins)
    for bb in range(n_bins):
        m = b_tr == bb
        base_h[bb] = y_tr[m].mean() if m.sum() else 0.0
    log("  기저 해저드로만 찍은 Brier %.4f  <- 참조선" % brier(base_h[b_te], y_te))

    if "1" in only:
        t0 = time.perf_counter()
        pred = np.exp(np.clip(eb_a_te, 0, 6))
        F1 = np.zeros((len(te_iv), n_bins), dtype=np.float32)
        for i in range(n_bins):
            F1[:, i] = (pred <= edges[i + 1]).astype(np.float32)
        h1 = np.clip(F1[riv_te, b_te], 1e-6, 1 - 1e-6)
        r = eval_candidate("① 평균주기", F1, h1, y_te, d, te_iv, edges, out)
        log("  ① 평균주기       %5.0f초  Brier %.4f · MAE %.1f일 · 구매전알림 %.1f%%"
            % (time.perf_counter() - t0, r["brier"], r["mae"], r["alert_before"] * 100))

    lr_models = {}
    for tag, eb_tr, eb_te, key in (("② 이산시간+(a)", eb_a_tr, eb_a_te, "2"),
                                   ("②' 이산시간+(b)", eb_b_tr, eb_b_te, "2")):
        if key not in only:
            continue
        t0 = time.perf_counter()
        Xtr = design_sparse(d, tr_iv, eb_tr, n_bins, n_l2, riv_tr[sub], b_tr[sub])
        mdl = LogisticRegression(max_iter=300, fit_intercept=False, C=1.0, solver="lbfgs")
        mdl.fit(Xtr, y_tr[sub])
        del Xtr
        Xte = design_sparse(d, te_iv, eb_te, n_bins, n_l2, riv_te, b_te)
        h = mdl.predict_proba(Xte)[:, 1]
        del Xte
        F = curve_matrix(mdl, d, te_iv, eb_te, n_bins, n_l2, True)
        r = eval_candidate(tag, F, h, y_te, d, te_iv, edges, out)
        lr_models[tag] = (mdl, h)
        log("  %-16s %5.0f초  Brier %.4f · MAE %.1f일 · 구매전알림 %.1f%%"
            % (tag, time.perf_counter() - t0, r["brier"], r["mae"], r["alert_before"] * 100))

    if "4" in only:
        t0 = time.perf_counter()
        # [A-1 · 08-25] ④는 **원시 (a)** 로 학습한다. 전에는 축소 (b)를 쓰고 있었는데
        #   채택 사양(§6)은 (a)라 "채택된 구성으로 낸 대조표 행이 없는" 상태였다.
        #   성능 영향은 0.0001(시드 표준편차 이하)이지만, (b)를 안 쓰는 논거가
        #   "서빙에서 σ²_w·τ²를 들고 다녀야 한다"인데 정작 대조표가 그 비용을
        #   내고 있었다 — 논거와 산출물이 어긋났다.
        Xtr = design_dense(d, tr_iv, eb_a_tr, riv_tr[sub], b_tr[sub])
        gbm = HistGradientBoostingClassifier(
            max_iter=200, learning_rate=0.1, max_leaf_nodes=31,
            categorical_features=[1], random_state=seed)
        gbm.fit(Xtr, y_tr[sub])
        del Xtr
        Xte = design_dense(d, te_iv, eb_a_te, riv_te, b_te)
        h = gbm.predict_proba(Xte)[:, 1]
        del Xte
        F = curve_matrix(gbm, d, te_iv, eb_a_te, n_bins, n_l2, False)
        r = eval_candidate("④ 부스팅", F, h, y_te, d, te_iv, edges, out)
        lr_models["④ 부스팅"] = (gbm, h)
        log("  ④ 부스팅         %5.0f초  Brier %.4f · MAE %.1f일 · 구매전알림 %.1f%%"
            % (time.perf_counter() - t0, r["brier"], r["mae"], r["alert_before"] * 100))

    if "3" in only:
        t0 = time.perf_counter()
        try:
            import pandas as pd
            from lifelines import WeibullAFTFitter
            cols = ["hh", "hh_na", "pet", "pet_na", "child", "child_na",
                    "car", "car_na", "log_past_n", "has_hist", "eb", "log_qty"]
            k = rng.choice(len(tr_iv), size=min(AFT_INTERVALS, len(tr_iv)), replace=False)
            ktr = tr_iv[k]
            df = pd.DataFrame(numeric_block(d, ktr, eb_b_tr[k]), columns=cols)
            df["T"] = d["dur"][ktr].astype(float)
            df["E"] = d["event"][ktr].astype(int)
            aft = WeibullAFTFitter(penalizer=0.01)
            aft.fit(df, duration_col="T", event_col="E")
            dte = pd.DataFrame(numeric_block(d, te_iv, eb_b_te), columns=cols)
            times = [float(e) for e in edges[1:] if np.isfinite(e)]
            S = aft.predict_survival_function(dte, times=times).to_numpy().T
            F = np.empty((len(te_iv), n_bins), dtype=np.float32)
            F[:, :len(times)] = (1.0 - S).astype(np.float32)
            F[:, len(times):] = F[:, [len(times) - 1]]
            h3 = np.clip(F[riv_te, b_te], 1e-6, 1 - 1e-6)
            r = eval_candidate("③ Weibull AFT", F, h3, y_te, d, te_iv, edges, out)
            rho = getattr(aft, "rho_", None)
            log("  ③ Weibull AFT       %5.0f초  Brier %.4f · MAE %.1f일 · 구매전알림 %.1f%%%s"
                % (time.perf_counter() - t0, r["brier"], r["mae"],
                   r["alert_before"] * 100,
                   "" if rho is None else "  (rho=%.2f)" % float(rho)))
        except Exception as e:
            log("  ③ Weibull AFT 실패: %s: %s" % (type(e).__name__, str(e)[:140]))

    # [A-3 · 08-25] **채택 후보(④)를 먼저** 본다. 전에는 ②'가 앞이라 실행 출력에
    #   탈락 후보의 보정 곡선이 찍혔고, 그 표는 고구간에서 나쁘다 —
    #   문서를 안 읽고 출력만 본 사람은 정확히 반대로 이해한다.
    cal = None
    for tag in ("④ 부스팅", "②' 이산시간+(b)", "② 이산시간+(a)"):
        if tag in lr_models:
            cal = (tag, calibration(lr_models[tag][1], y_te))
            break
    return out, cal


def main():
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv \
        else {"1", "2", "3", "4"}
    n_seed = int(sys.argv[sys.argv.index("--seeds") + 1]) if "--seeds" in sys.argv else 3

    lines = []

    def log(m):
        print(m, flush=True)
        lines.append(m)

    d = load()
    log("=" * 78)
    log("소비주기 대조표 — 간격 %s · 회원 %s"
        % (f"{len(d['dur']):,}", f"{len(np.unique(d['member'])):,}"))
    log("=" * 78)

    allres, cals = [], []
    for s in range(n_seed):
        log("\n[시드 %d]" % s)
        r, cal = run_seed(d, s, only, log)
        allres.append({x["tag"]: x for x in r})
        if cal:
            cals.append(cal)

    order = ["① 평균주기", "② 이산시간+(a)", "②' 이산시간+(b)",
             "③ Weibull AFT", "④ 부스팅"]
    tags = [t for t in order if any(t in a for a in allres)]
    log("\n" + "=" * 78)
    log("대조표 — 시드 %d개 평균 ± 표준편차" % n_seed)
    log("=" * 78)
    log("%-18s%16s%16s%16s%12s" % ("후보", "Brier", "MAE(일)", "구매전알림", "리드(일)"))
    log("-" * 78)
    for t in tags:
        v = {k: np.array([a[t][k] for a in allres if t in a])
             for k in ("brier", "mae", "alert_before", "alert_lead")}
        log("%-18s%9.4f±%-6.4f%9.1f±%-6.1f%9.1f%%±%-5.1f%%%9.1f"
            % (t, v["brier"].mean(), v["brier"].std(),
               v["mae"].mean(), v["mae"].std(),
               v["alert_before"].mean() * 100, v["alert_before"].std() * 100,
               np.nanmean(v["alert_lead"])))
    log("=" * 78)

    if cals:
        tag, c = cals[0]
        log("\n보정 곡선 — %s (시드 0)" % tag)
        for pm, ym, n in c:
            log("  예측 %5.1f%%  실제 %5.1f%%  n=%9s  %s"
                % (pm * 100, ym * 100, f"{n:,}", "#" * int(ym * 40)))

    os.makedirs(os.path.join(_HERE, "out"), exist_ok=True)
    with open(os.path.join(_HERE, "out", "repurchase_report.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    log("\n저장 -> models/out/repurchase_report.txt")


if __name__ == "__main__":
    main()
