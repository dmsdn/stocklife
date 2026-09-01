# ============================================================================
# T15 ③ — 대조표: 취향 매칭 후보 7종 (P@5 · MRR · 커버리지)
# ============================================================================
# [무엇] 같은 분할(preference_data) 위에서 후보 7개를 같은 자로 재고 표로 낸다.
#   출하 여부는 이 표가 정한다 — "바닥을 못 이기면 안 싣는다"(지시서 §3.2).
#
# [후보 7]
#   ① 무작위      바닥의 바닥
#   ② 인기순      비개인화 바닥. **이걸 못 이기면 개인화가 아니라 장식이다**
#   ③ 소분류 횟수  지시서의 규칙판 — "많이 산 소분류에서 인기순"
#   ④ 임베딩      지시서의 본안 — 구매 상품 임베딩의 가중평균과 코사인
#   ⑤ 소분류 사후 (신설) 종수 기반 · 소분류 크기·축 보정 · 디리클레 축소
#   ⑥ 협업필터    (신설) 암묵적 ALS — 텍스트를 안 쓰고 공동구매만으로
#   ⑦ 오라클      (신설) 세계의 **진짜** 취향 가중. 도달 불가능한 상한
#
# [⑦이 왜 필수인가] 상한이 없으면 ①~⑥ 의 숫자를 해석할 수 없다. P@5 0.02 가
#   잘한 것인지 못한 것인지는 **오라클이 0.03 인가 0.30 인가**에 달렸다.
#   가용예측의 「규칙 바닥 0.1248」이 같은 자리를 지켰던 것과 대칭이다.
#
# [⑤가 왜 필요한가 — ③은 편향 추정량이다]
#   세계는 습관 SKU 를 **소분류 가중**으로 뽑고, 그 뒤 **주기**대로 반복시킨다.
#   따라서 구매 **횟수** ≈ 취향 ÷ 주기 이고 취향이 아니다. 실측(08-27):
#     · 회원별 1위 소분류가 「횟수」와 「종수」에서 갈리는 비율   32.8%
#     · 주기 vs (횟수순위 − 종수순위) 상관                     0.637
#   ③은 우유(주기 16.7일)를 취향 1위로 올린다. ⑤는 **종수**로 세고, 소분류
#   크기(SKU 가 많은 소분류일수록 습관에 뽑힐 확률이 높다)와 축 배율을 나눠
#   낸 뒤 디리클레로 축소한다.
#
# 실행:  python models/preference_rank.py [--seeds 3] [--emb ko] [--full]
# ============================================================================
from __future__ import annotations

import argparse
import os
import time

import numpy as np

import preference_data as D

_HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(_HERE, "out")

TAUS = (30.0, 90.0, 270.0)      # 최근성 반감 후보(일) — 지시서 §2.2 스윕
ALPHA_DIR = 8.0                 # ⑤ 디리클레 축소 세기의 기본값
ALPHAS = (2.0, 8.0, 32.0)       # 그 스윕 — 감으로 고정하지 않는다(지시서 §5-5)
MIX_W = (0.3, 1.0)              # ④⑤ 혼합에서 임베딩이 소분류 안을 흔드는 세기
DIV_CAPS = (1, 3)               # 다양화: 소분류당 최대 몇 개까지 연달아 미나
ALS_RANK, ALS_ITER, ALS_REG, ALS_ALPHA = 32, 15, 0.05, 20.0
BLOCK = 500                     # 회원 블록 — (500, 4970) float32 = 10MB


# ── 축 배율: consume.py 와 **같은 식**이어야 한다 ────────────────────────────
def axis_boost(axes: np.ndarray, l2_names: list[str], l2: np.ndarray) -> np.ndarray:
    """(M, S) 축 배율. `consume.py` 의 습관 표집 가중을 그대로 옮긴 것.

    ⚠ NULL(-1)은 "안 물어봄"이라 **배율이 안 걸린다**. consume.py 에서는 None 이
      falsy 라 자연히 그렇게 되는데, 여기선 -1 이 truthy 라 명시적으로 걸러야
      한다 — 안 그러면 오라클이 세계보다 더 아는 게 되어 상한이 거짓으로 오른다.
    """
    pet_l2 = np.array([("반려" in n or "펫" in n) for n in l2_names])
    kid_l2 = np.array([any(k in n for k in ("기저귀", "분유")) for n in l2_names])
    pet_s, kid_s = pet_l2[l2], kid_l2[l2]                     # (S,)
    pet_m = (axes[:, 1] == 1)[:, None]                        # (M, 1) — -1 은 False
    kid_m = (axes[:, 2] == 1)[:, None]
    return (np.where(pet_m & pet_s, 2.0, 1.0) *
            np.where(kid_m & kid_s, 2.0, 1.0)).astype(np.float32)


def true_prefs(mid: np.ndarray, l2_names: list[str]) -> np.ndarray:
    """⑦ 오라클 — 세계가 회원마다 실제로 뽑은 소분류 취향 가중 (M, L).

    `mode1._member_prefs` 를 그대로 재현한다. 결정적 시드(`SeedSequence`)라
    같은 member_id 면 같은 수가 나온다 — 그래서 이력을 안 보고도 정답을 안다.
    """
    L = len(l2_names)
    out = np.full((len(mid), L), 0.2, np.float32)
    for i, m in enumerate(mid):
        rng = np.random.default_rng(np.random.SeedSequence([D.WORLD_SEED, int(m), 7]))
        n_fav = int(rng.integers(4, 9))
        for l2 in rng.choice(l2_names, size=min(n_fav, L), replace=False):
            out[i, l2_names.index(l2)] = float(rng.uniform(1.5, 4.0))
    return out


# ── 후보별 점수판 ───────────────────────────────────────────────────────────
def member_l2_stats(d, M, L):
    """회원×소분류의 두 집계 — 구매 **횟수**(③용)와 습관 **종수**(⑤용)."""
    cnt = np.zeros((M, L), np.float32)      # 횟수
    dst = np.zeros((M, L), np.float32)      # 종수
    np.add.at(cnt, (d["tr_m"], d["l2"][d["tr_s"]]), d["tr_n"])
    np.add.at(dst, (d["tr_m"], d["l2"][d["tr_s"]]), 1.0)
    return cnt, dst


def l2_posterior(dst, l2, L, boost_l2, alpha=ALPHA_DIR):
    """⑤ 소분류 취향의 사후 추정 (M, L).

    세계:  P(습관이 소분류 l 에) ∝ prefs[l] × 축배율[l] × (l 의 SKU 수)
    따라서 관측한 종수 n_l 을 **크기와 축으로 나눠야** prefs 가 나온다.
    표본이 회원당 ~22개뿐이라 그대로 쓰면 안 산 소분류가 0 으로 죽는다 →
    전역 사전으로 디리클레 축소(경험적 베이즈와 같은 계열, 소비주기 §7.1).
    """
    size = np.bincount(l2, minlength=L).astype(np.float32)    # 소분류별 SKU 수
    prior = dst.sum(0) + 1.0
    prior /= prior.sum()
    post = (dst + alpha * prior[None, :]) / (size[None, :] * boost_l2)
    return post / post.sum(1, keepdims=True)


def als_factors(d, M, S, seed):
    """⑥ 암묵적 피드백 ALS (Hu-Koren-Volinsky).

    [왜 이 방식인가] 평점이 없다 — "안 샀다"가 싫다는 뜻이 아니라 **모른다**는
    뜻이다. HKV 는 모든 칸을 학습에 넣되 관측된 칸에 **신뢰도** c=1+αn 을 주어
    이 비대칭을 다룬다. 명시적 MF 를 그대로 쓰면 미관측을 전부 0점으로 읽어
    인기 상품만 밀게 된다.

    [왜 직접 짜나] `implicit` 패키지를 새로 깔지 않으려는 것도 있지만, 규모가
    작아서다(회원 1만 · SKU 5천 · 관측 21.7만). 밀집 그람 행렬 방식이면
    파이썬 반복으로도 몇 초다.
    """
    rng = np.random.default_rng(seed + 991)
    X = rng.normal(0, 0.01, (M, ALS_RANK)).astype(np.float32)
    Y = rng.normal(0, 0.01, (S, ALS_RANK)).astype(np.float32)
    c = 1.0 + ALS_ALPHA * d["tr_n"]                            # 신뢰도
    I = np.eye(ALS_RANK, dtype=np.float32) * ALS_REG

    # CSR 형태로 한 번만 정렬해 둔다(회원순 / SKU순)
    om = np.argsort(d["tr_m"], kind="stable"); os_ = np.argsort(d["tr_s"], kind="stable")
    mstart = np.searchsorted(d["tr_m"][om], np.arange(M + 1))
    sstart = np.searchsorted(d["tr_s"][os_], np.arange(S + 1))

    for _ in range(ALS_ITER):
        YtY = Y.T @ Y
        for u in range(M):
            sl = om[mstart[u]:mstart[u + 1]]
            if not len(sl):
                continue
            Yi, ci = Y[d["tr_s"][sl]], c[sl]
            A = YtY + (Yi * (ci - 1)[:, None]).T @ Yi + I
            X[u] = np.linalg.solve(A, (Yi * ci[:, None]).sum(0))
        XtX = X.T @ X
        for i in range(S):
            sl = os_[sstart[i]:sstart[i + 1]]
            if not len(sl):
                Y[i] = 0.0
                continue
            Xi, ci = X[d["tr_m"][sl]], c[sl]
            A = XtX + (Xi * (ci - 1)[:, None]).T @ Xi + I
            Y[i] = np.linalg.solve(A, (Xi * ci[:, None]).sum(0))
    return X, Y


def member_emb(d, emb, tau, M):
    """④ 회원 선호 벡터 = 학습 구매 상품 임베딩의 가중 평균 (M, dim).

        w = qty × exp(-경과일 / τ)
    수량 가중은 "10개 산 것이 1개보다 강한 신호", 최근성 가중은 "취향은 변한다".
    합친 뒤 L2 정규화 — 안 하면 이력이 많은 회원의 점수가 통째로 커져
    회원 사이 비교가 아니라 **회원 안의 순위**만 의미를 갖게 된다.
    """
    w = d["tr_qty"] * np.exp(-d["tr_ago"] / tau)
    V = np.zeros((M, emb.shape[1]), np.float32)
    np.add.at(V, d["tr_m"], emb[d["tr_s"]] * w[:, None])
    n = np.linalg.norm(V, axis=1, keepdims=True)
    return V / np.maximum(n, 1e-9)


# ── 채점 ────────────────────────────────────────────────────────────────────
def evaluate(score_of_block, d, M, S, seed, ks=(5, 20, 100)):
    """후보 하나를 채점한다. score_of_block(a, b) → (b-a, S) 점수판.

    [학습에서 본 SKU 는 후보에서 뺀다] 추천은 **아직 안 산 것** 중에서 고른다
    (지시서 §5-4: 이미 산 것을 밀면 소비주기 영역을 침범한다). 안 빼면 이력이
    그대로 정답표가 되어 P@5 가 거짓으로 치솟는다.

    [동점은 무작위로 가른다] ⑤·⑦은 같은 소분류의 SKU 에 **같은 점수**를 준다 —
    소분류 아래에 정보가 없기 때문이다(08-27 실측). 이때 색인 순서로 자르면
    카탈로그 정렬이 점수가 되어 버린다. 아주 작은 잡음으로 공평하게 흔든다.
    """
    rng = np.random.default_rng(seed + 7717)
    l2 = d["l2"]
    hit = {k: 0.0 for k in ks}
    rec = {k: 0.0 for k in ks}
    mrr = 0.0
    cov = 0.0
    n_eval = 0

    # 회원별 학습 SKU / 라벨을 블록에서 빨리 찾도록 CSR 로
    om = np.argsort(d["tr_m"], kind="stable")
    ms = np.searchsorted(d["tr_m"][om], np.arange(M + 1))
    oh = np.argsort(d["ho_m"], kind="stable")
    hs = np.searchsorted(d["ho_m"][oh], np.arange(M + 1))

    for a in range(0, M, BLOCK):
        b = min(a + BLOCK, M)
        # ⚠ **float64 여야 한다.** ③·⑤·⑦은 「소분류 점수 × 1e6 + 인기(0~1)」라는
        #   사전식 점수를 쓰는데, float32 는 5e4 근처에서 최소 간격이 0.004 라
        #   뒷자리(인기)가 **통째로 반올림돼 사라진다** — 꼬리표가 죽어 전부 동점이
        #   되고, 그러면 무작위 잡음이 순위를 정한다. 조용히 틀리는 종류의 버그다.
        Sc = np.asarray(score_of_block(a, b), np.float64).copy()
        Sc += rng.random(Sc.shape) * (1e-9 * (np.abs(Sc).max() + 1.0))   # 완전 동점만 가르기
        for u in range(a, b):
            seen = d["tr_s"][om[ms[u]:ms[u + 1]]]
            Sc[u - a, seen] = -np.inf                            # 후보에서 제외
        order = np.argsort(-Sc, axis=1)
        pos = np.empty_like(order)
        np.put_along_axis(pos, order, np.arange(S)[None, :].repeat(b - a, 0), axis=1)

        for u in range(a, b):
            held = d["ho_s"][oh[hs[u]:hs[u + 1]]]
            if not len(held):
                continue
            r = pos[u - a, held] + 1                             # 1부터 세는 순위
            for k in ks:
                h = int((r <= k).sum())
                hit[k] += h / k
                rec[k] += h / len(held)
            mrr += 1.0 / r.min()
            cov += len(np.unique(l2[order[u - a, :20]]))
            n_eval += 1
    return {"P@5": hit[5] / n_eval, "P@20": hit[20] / n_eval,
            "R@100": rec[100] / n_eval, "MRR": mrr / n_eval,
            "cov@20": cov / n_eval, "n": n_eval}


def run_seed(seed, emb_files, verbose=True):
    d = D.build(seed)
    M, S = len(d["mid"]), len(d["sid"])
    L = len(d["l2_names"])
    l2 = d["l2"]
    boost = axis_boost(d["axes"], d["l2_names"], l2)             # (M, S)
    boost_l2 = np.ones(L, np.float32)                            # ⑤의 소분류 단위 배율
    for i, n in enumerate(d["l2_names"]):
        if "반려" in n or "펫" in n:
            boost_l2[i] = 1.0 + (d["axes"][:, 1] == 1).mean()     # 기대 배율(전역)
        elif any(k in n for k in ("기저귀", "분유")):
            boost_l2[i] = 1.0 + (d["axes"][:, 2] == 1).mean()

    pop = np.zeros(S, np.float32)
    np.add.at(pop, d["tr_s"], d["tr_n"])                          # ② 학습분만
    # 소분류 **안**을 가르는 공통 꼬리표. ③·⑤·⑦은 전부 "소분류를 고르고 그 안에서
    # 인기순"이라는 같은 모양이라, 꼬리표를 통일해야 **소분류 순위의 차이만** 남는다.
    # (이 세계에선 소분류 안이 균등이라 어떤 꼬리표를 써도 기댓값은 같다 — 08-27 실측)
    pop_n = pop / (pop.max() + 1.0)                                # [0, 1)
    LEX = 1e6                                                      # 앞자리를 확실히 가른다
    cnt, dst = member_l2_stats(d, M, L)
    tp = true_prefs(d["mid"], d["l2_names"])

    rng = np.random.default_rng(seed + 4242)
    res = {}
    res["① 무작위"] = evaluate(lambda a, b: rng.random((b - a, S)), d, M, S, seed)
    res["② 인기순"] = evaluate(lambda a, b: np.tile(pop, (b - a, 1)), d, M, S, seed)
    # ③ 지시서의 규칙판 — "많이 산 소분류에서 인기순". **사전식**으로 쓴다:
    #   곱셈으로 섞으면 시원찮은 소분류의 인기 상품이 1등 소분류의 비인기 상품을
    #   제쳐, 지시서가 말한 규칙이 아니라 다른 규칙을 재게 된다.
    res["③ 소분류 횟수"] = evaluate(
        lambda a, b: cnt[a:b][:, l2] * LEX + pop_n[None, :], d, M, S, seed)
    # ⑤ 축소 세기 스윕 — 회원당 습관이 ~22개뿐이라 α 가 결과를 가른다.
    #   작으면 안 산 소분류가 0 으로 죽고, 크면 전원이 전역 평균으로 뭉갠다.
    post_by_a = {}
    for al in ALPHAS:
        post_by_a[al] = l2_posterior(dst, l2, L, boost_l2, al)
        res[f"⑤ 소분류 사후 a{int(al)}"] = evaluate(
            lambda a, b, P=post_by_a[al]:
                P[a:b][:, l2] * boost[a:b] * LEX + pop_n[None, :], d, M, S, seed)
    post = post_by_a[ALPHA_DIR]
    # ⑤ + 다양화 — **운용 판정용**. ⑤의 상위 20은 커버리지 1.0, 즉 **전부 한
    #   소분류**다(소분류 아래에 정보가 없으니 당연하다). 추천 20개가 전부 우유면
    #   맞고 틀리고 이전에 발화가 이상하다. 소분류당 최대 cap 개로 끊어 돌린다.
    #   정확도를 얼마나 내주는지가 이 줄의 값어치다 — 감으로 정할 일이 아니다.
    ordv = np.lexsort((-pop_n, l2))                # 소분류별로 인기순 정렬
    g = np.empty(S, np.int64)                      # 자기 소분류 안에서 몇 번째인가
    _, cuts = np.unique(l2[ordv], return_index=True)
    g[ordv] = np.arange(S) - np.repeat(cuts, np.diff(np.r_[cuts, S]))
    for cap in DIV_CAPS:
        blk = (g // cap).astype(np.float64)
        res[f"⑤ 다양화 cap{cap}"] = evaluate(
            lambda a, b, blk=blk: -blk[None, :] * 1e12
            + post_by_a[ALPHA_DIR][a:b][:, l2] * boost[a:b] * LEX - g[None, :],
            d, M, S, seed)

    X, Y = als_factors(d, M, S, seed)
    res["⑥ 협업필터"] = evaluate(lambda a, b: X[a:b] @ Y.T, d, M, S, seed)
    res["⑦ 오라클"] = evaluate(
        lambda a, b: tp[a:b][:, l2] * boost[a:b] * LEX + pop_n[None, :], d, M, S, seed)

    for tag, path in emb_files.items():
        z = np.load(path, allow_pickle=True)
        emb = z["emb"].astype(np.float32)
        assert (z["sku"] == d["sid"]).all(), f"{tag}: SKU 순서가 어긋난다"
        for tau in TAUS:
            V = member_emb(d, emb, tau, M)
            res[f"④ 임베딩 {tag} t{int(tau)}"] = evaluate(
                lambda a, b, V=V, emb=emb: V[a:b] @ emb.T, d, M, S, seed)
        # ⑤가 소분류를 정하고 임베딩이 **그 안**을 다시 세운다.
        # 소분류 아래에 정보가 있다면 여기서 늘어야 한다 — 이 줄이 그 시험이다.
        V = member_emb(d, emb, 90.0, M)
        for w in MIX_W:
            res[f"④⑤ 혼합 {tag} w{w}"] = evaluate(
                lambda a, b, V=V, emb=emb, w=w:
                    post[a:b][:, l2] * boost[a:b] * LEX * (1.0 + w * (V[a:b] @ emb.T)),
                d, M, S, seed)
    return res


def main():
    D.use_utf8()
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--emb", default="ko,bge")
    a = ap.parse_args()

    emb_files = {}
    for tag in a.emb.split(","):
        for v in ("keep", "strip"):
            p = os.path.join(OUT, f"pref_emb_{tag}_{v}.npz")
            if os.path.exists(p):
                emb_files[f"{tag}/{v}"] = p
            else:
                print(f"  (없음: {os.path.basename(p)} — 건너뜀)")
    print(f"임베딩 {len(emb_files)}벌 · 시드 {a.seeds}\n")

    t0 = time.perf_counter()
    runs = []
    for s in range(a.seeds):
        print(f"── 시드 {s} ──", flush=True)
        runs.append(run_seed(s, emb_files))
        print(f"   {time.perf_counter() - t0:.0f}초", flush=True)

    keys = list(runs[0])
    print(f"\n{'후보':<22}{'P@5':>9}{'P@20':>9}{'R@100':>9}{'MRR':>9}{'커버@20':>9}")
    print("─" * 68)
    for k in keys:
        v = {m: np.array([r[k][m] for r in runs]) for m in ("P@5", "P@20", "R@100", "MRR", "cov@20")}
        print(f"{k:<22}" + "".join(f"{v[m].mean():>9.4f}" for m in
                                   ("P@5", "P@20", "R@100", "MRR", "cov@20")))
        print(f"{'':<22}" + "".join(f"{'±' + format(v[m].std(), '.4f'):>9}" for m in
                                    ("P@5", "P@20", "R@100", "MRR", "cov@20")))
    np.savez_compressed(os.path.join(OUT, "preference_rank.npz"),
                        **{f"{k}|{m}": np.array([r[k][m] for r in runs])
                           for k in keys for m in ("P@5", "P@20", "R@100", "MRR", "cov@20")})
    print(f"\n총 {time.perf_counter() - t0:.0f}초 → models/out/preference_rank.npz")


if __name__ == "__main__":
    main()
