# ============================================================================
# 가용예측 자산 — 이산시간 해저드 모델 (출하 1본)
# ============================================================================
# [무엇] person_period.npz의 (X, y)로 **구간별 해저드** h(t|x)를 학습하고,
#   그걸 누적해 **시점별 보충 확률** 곡선을 만든다.
#     h(t|x) = P(구간 t에 보충 완료 | 구간 t까지 안 됐음)
#     S(t|x) = ∏_{k<=t} (1 - h(k|x))        ← 아직 안 채워졌을 확률
#     답     = 1 - S(t|x)                    ← "t 안에 채워질 확률" (도구가 말할 값)
#
# [헌법 8 준수] "가용 예측은 이진 분류 금지 — 시점별 확률."
#   각 구간의 이진 분류를 쌓아 곡선을 만드는 것이 이산시간 생존분석이다.
#   금지된 것은 "보충됨/안됨"을 한 번에 맞히는 단일 분류이고, 이건 그게 아니다.
#   출력이 항상 **곡선**(구간 11개의 확률)이라 도구가 "10분 40% · 20분 85%"로 말한다.
#
# [링크 함수 — logit으로 확정 (08-25 실측)]
#   이산시간 해저드에 흔히 쓰는 링크가 둘이다:
#     · logit    : 로지스틱 회귀. 계수가 **오즈비**로 해석된다
#     · cloglog  : log(-log(1-h)). 계수가 **비례위험(Cox)의 로그 해저드비**와 일치한다
#   교과서상으로는 cloglog가 정석이다 — 연속시간 비례위험을 구간으로 자르면 정확히
#   그 꼴이 나온다(유도는 `hazard_link.py` 머리 주석).
#
#   ⚠ 이 자리에 원래 이렇게 적혀 있었다: *"표본이 138만 행이라 두 링크의 예측
#     차이는 작다 — 해석이 갈릴 뿐 곡선은 거의 같다."* **재 보니 틀렸다.**
#       보정 중간대역 편차   logit +5.5%p  ·  cloglog +14.3%p
#       Brier               logit 0.05597 ·  cloglog 0.06099
#     능선 세기를 1e-6~100으로 흔들어도 순서가 안 바뀌었다(정칙화 탓이 아니다).
#     **정석 링크가 더 나빴다.** 이유는 비례성 가정에 있다 — cloglog가 비례위험을
#     더 엄격히 강제하는데, 우리 리드타임은 경로유형이 분포를 **상수만큼 밀어서**
#     비례성이 깨진다(person_period.py의 「시간에 따라 변하는 효과」 참조).
#     그래서 출하본은 logit이고, 이건 편의가 아니라 **측정에 근거한 선택**이다.
#
# [평가 지표 — 정확도를 쓰지 않는다]
#   사건 발생 행이 19%뿐이라 "전부 0"으로 찍어도 정확도 81%가 나온다. 무의미하다.
#   대신 둘을 본다:
#     · Brier score  : 확률 예측의 제곱오차(낮을수록 좋음). 보정(calibration)에 민감
#     · 보정 곡선     : 예측 30%인 구간에서 실제로 30%가 일어났나 — **에이전트가
#                      "40%"라고 말하려면 그 40%가 맞아야 한다**. 순위(AUC)보다 중요
#   ⚠ 교차검증은 **작업 단위(groups)로 분리**한다. 같은 작업의 구간 행들이 train과
#     test에 나뉘면 누출이다(같은 작업의 앞 구간을 보고 뒷 구간을 맞히는 셈).
#
# 실행:  python hazard.py
# ============================================================================

from __future__ import annotations

import os
import sys
import time

import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
NPZ = os.path.join(_HERE, "out", "person_period.npz")

# 구간 경계 — person_period와 같아야 한다(곡선의 x축).
sys.path.insert(0, _HERE)
from person_period import BIN_EDGES, survival_from_hazard   # noqa: E402


def load():
    if not os.path.exists(NPZ):
        raise SystemExit(f"입력 없음: {NPZ}\n  먼저 python person_period.py")
    d = np.load(NPZ, allow_pickle=True)
    return d["X"], d["y"], d["groups"], list(d["cols"])


def split_by_group(groups: np.ndarray, frac=0.25, seed=0):
    """작업 단위로 train/test를 나눈다 — 구간 행이 갈리면 누출이다."""
    uniq = np.unique(groups)
    rng = np.random.default_rng(seed)
    test_ids = set(rng.choice(uniq, size=int(len(uniq) * frac), replace=False).tolist())
    te = np.fromiter((g in test_ids for g in groups), dtype=bool, count=len(groups))
    return ~te, te


def brier(p: np.ndarray, y: np.ndarray) -> float:
    return float(np.mean((p - y) ** 2))


def calibration(p: np.ndarray, y: np.ndarray, n_bins=10):
    """예측확률 구간별 (평균예측, 실제빈도, 개수). 대각선에 가까우면 잘 보정된 것."""
    edges = np.linspace(0, 1, n_bins + 1)
    out = []
    for i in range(n_bins):
        m = (p >= edges[i]) & (p < edges[i + 1] if i < n_bins - 1 else p <= 1.0)
        if m.sum() >= 50:
            out.append((float(p[m].mean()), float(y[m].mean()), int(m.sum())))
    return out


# ============================================================================
# 수치 핵심 — IRLS (이 파일이 소유하고, hazard_link.py가 빌려 쓴다)
# ============================================================================
# [왜 sklearn을 안 쓰나 — 08-25에 실제로 깨졌다]
#   상호작용을 넣어 설계행렬이 80열 → 123열이 되자 `LogisticRegression`(lbfgs)이
#   **1000회에도 수렴하지 못했다**(ConvergenceWarning). 열마다 스케일이 크게
#   다른 데다(qlen 0~161 · log_q_work ~10 · 더미 0/1) 상호작용이 조건수를 더 키운다.
#   같은 자료에서 아래 IRLS는 10회 안팎에 수렴한다 — 2계 정보(헤시안)를 쓰기 때문이다.
#   덤으로 **서빙에 sklearn이 필요 없어진다**: 계수 123개를 저장해 `infer.py`가
#   순전파만 하면 된다(헌법 6의 lifespan 상주와도 맞는다).
#
# [능선(ridge)이 필수인 이유] 구간더미 11개의 합과 소분류더미 60개의 합이 **둘 다
#   전부 1**이라 설계행렬이 완전공선이고 X'WX가 특이행렬이 된다. sklearn은 벌점으로
#   그걸 조용히 넘겼고, 여기서도 같은 방식으로 넘긴다(C=1.0 과 같은 세기).
RIDGE = 1.0
MAX_ITER = 30
TOL = 1e-7          # 계수 변화의 최대 절대값이 이보다 작으면 수렴으로 본다
CHUNK = 200_000     # X'WX 누적 청크. 200k x 열수 float64


# ── 링크 두 종 ──────────────────────────────────────────────────────────────
# 각 링크는 eta를 받아 (h, w, s)를 낸다.
#   h : 확률
#   w : IRLS 가중치 = (dh/deta)^2 / (h(1-h))       ← 피셔 정보의 대각
#   s : 점수 기여   = (y-h)*(dh/deta) / (h(1-h))   ← grad loglik = X's
# 이 세 값만 링크마다 다르고, 그 아래 뉴턴 갱신은 완전히 공통이다.

def _logit(eta: np.ndarray, y: np.ndarray):
    # 오버플로 방지: exp(-eta)를 그대로 쓰지 않고 부호별로 안전한 형태를 쓴다.
    h = np.empty_like(eta)
    pos = eta >= 0
    h[pos] = 1.0 / (1.0 + np.exp(-eta[pos]))
    e = np.exp(eta[~pos])
    h[~pos] = e / (1.0 + e)
    # logit에서는 dh/deta = h(1-h) 이므로 w = h(1-h), s = (y-h). 가장 단순한 꼴이다.
    w = h * (1.0 - h)
    return h, w, (y - h)


def _cloglog(eta: np.ndarray, y: np.ndarray):
    # u = exp(eta). eta를 잘라 두지 않으면 u가 오버플로해 inf가 퍼진다.
    #   위쪽 5    : exp(5)=148 → h = 1-exp(-148) = 1.0 (배정도에서 이미 포화)
    #   아래쪽 -30: u=1e-13 → h≈1e-13. 그 아래는 배정도로 구분되지 않는다
    u = np.exp(np.clip(eta, -30.0, 5.0))
    h = -np.expm1(-u)                       # 1-exp(-u) 를 작은 u에서도 정확히
    # dh/deta = u*exp(-u) = u(1-h)
    #   w = (u(1-h))^2 / (h(1-h)) = u^2 (1-h)/h
    #   s = (y-h)*u(1-h)/(h(1-h)) = (y-h)*u/h
    # u/h 는 u→0 에서 1로 수렴한다(h≈u). 나눗셈을 그대로 두면 0/0이 되므로
    # 분모에만 바닥을 깔고, 비율이 1 근처로 가는 성질에 기댄다.
    ratio = u / np.maximum(h, 1e-300)
    w = u * ratio * (1.0 - h)
    return h, w, (y - h) * ratio


LINKS = {"logit": _logit, "cloglog": _cloglog}


def nll(X: np.ndarray, y: np.ndarray, beta: np.ndarray, link: str) -> float:
    """벌점 붙은 음의 로그가능도. 두 링크가 공유하는 **비교 가능한 척도**다.

    이 값이 있어야 (1) 자체 IRLS가 sklearn과 같은 문제를 푸는지 검산할 수 있고,
    (2) 뉴턴 걸음이 실제로 개선인지 판정할 수 있다. 없으면 발산을 눈치채지 못한다.
    """
    tot = 0.0
    for a in range(0, X.shape[0], CHUNK):
        e = X[a:a + CHUNK].astype(np.float64, copy=False) @ beta
        yy = y[a:a + CHUNK]
        if link == "logit":
            # log(1+exp(e)) 를 오버플로 없이: logaddexp(0, e)
            tot += float(np.sum(yy * e - np.logaddexp(0.0, e)))
        else:
            u = np.exp(np.clip(e, -30.0, 5.0))
            h = -np.expm1(-u)
            # y=1 이면 log h, y=0 이면 log(1-h) = -u. 두 항을 그대로 더한다.
            tot += float(np.sum(yy * np.log(np.maximum(h, 1e-300)) - (1.0 - yy) * u))
    return -tot + 0.5 * RIDGE * float(np.dot(beta, beta))


def irls(X: np.ndarray, y: np.ndarray, link: str, verbose=True):
    """뉴턴-랩슨(= IRLS) + **되추적 직선탐색**으로 계수를 적합한다.

    갱신식:  b <- b + t * (X'WX + lam*I)^-1 (X's - lam*b)
    좌변 괄호가 벌점 붙은 헤시안, 우변 괄호가 벌점 붙은 점수(gradient)다.
    벌점 (lam/2)||b||^2 의 미분이 lam*b 이므로 점수에서 빼고 헤시안에 lam*I 를 더한다.
    X'WX 는 80x80 이므로 청크로 누적하면 메모리가 상수다.

    [왜 t(걸음 크기)가 필요한가 — 실제로 겪은 발산]
      처음엔 t=1로 고정했다(순수 뉴턴). logit은 11회에 수렴했는데 **cloglog가
      발산했다** — max|db| 가 1e0 → 1e2 → 1e6 → 2.65e9 로 튀어올랐다.
      그 상태로 낸 Brier가 0.807이었고, 스크립트는 그걸 "cloglog가 나쁘다"는
      판정으로 태연히 출력했다. **발산을 결론으로 읽을 뻔했다.**

      이유는 cloglog의 가중치에 있다. w = u^2 (1-h)/h 인데 eta가 크면 h→1 이라
      w→0 이다. 즉 잘 맞는 관측일수록 헤시안 기여가 0으로 꺼진다. 그 방향으로
      헤시안이 거의 특이해지고, 그 역행렬이 곱해진 걸음이 폭발한다.
      logit은 w=h(1-h)로 대칭이라 이 병이 약하다 — **링크마다 수치적 성격이 다르다.**

      해법은 표준이다: 걸음을 그대로 받지 않고 **목적함수가 실제로 줄었는지 확인**한다.
      안 줄었으면 t를 절반으로 줄여 다시 본다(되추적). 뉴턴 방향은 하강 방향이므로
      t를 충분히 줄이면 반드시 줄어든다 — 그게 이 방법이 항상 끝나는 이유다.
    """
    f = LINKS[link]
    n, p = X.shape
    beta = np.zeros(p, dtype=np.float64)
    cur = nll(X, y, beta, link)
    t0 = time.time()
    it = 0

    for it in range(MAX_ITER):
        H = np.zeros((p, p), dtype=np.float64)      # X'WX
        g = np.zeros(p, dtype=np.float64)           # X's
        for a in range(0, n, CHUNK):
            xb = X[a:a + CHUNK].astype(np.float64, copy=False)
            eta = xb @ beta
            _h, w, s = f(eta, y[a:a + CHUNK])
            # (xb * w[:,None]) 은 각 행에 가중치를 곱한 것. 그걸 xb'와 곱하면
            # sum_i w_i x_i x_i' 가 되고 이것이 X'WX 의 청크 몫이다.
            H += xb.T @ (xb * w[:, None])
            g += xb.T @ s

        H[np.diag_indices(p)] += RIDGE
        g -= RIDGE * beta

        # solve가 lstsq보다 빠르고, 능선을 넣었으므로 양정치라 안전하다.
        step = np.linalg.solve(H, g)

        # ── 되추적: 목적함수가 줄어드는 t를 찾을 때까지 절반씩 ──
        t = 1.0
        for _ in range(40):
            cand = beta + t * step
            val = nll(X, y, cand, link)
            if val <= cur:            # 등호 허용 — 수렴 근처의 수치 잡음에서 멈추지 않게
                break
            t *= 0.5
        else:
            if verbose:
                print(f"    iter {it + 1:>2d}  개선하는 걸음을 못 찾음 — 중단")
            break

        move = float(np.max(np.abs(t * step)))
        beta, cur = cand, val
        if verbose:
            print(f"    iter {it + 1:>2d}  max|db| = {move:.2e}  t={t:<6g} NLL={cur:.4f}",
                  flush=True)
        if move < TOL:
            break

    if verbose:
        print(f"    수렴 {it + 1}회 · {time.time() - t0:.1f}초 · NLL {cur:.4f}")
    return beta


def predict(X: np.ndarray, beta: np.ndarray, link: str) -> np.ndarray:
    f = LINKS[link]
    out = np.empty(X.shape[0], dtype=np.float64)
    for a in range(0, X.shape[0], CHUNK):
        xb = X[a:a + CHUNK].astype(np.float64, copy=False)
        h, _w, _s = f(xb @ beta, np.zeros(xb.shape[0]))
        out[a:a + CHUNK] = h
    return out


def curve_for(beta: np.ndarray, x_row: np.ndarray, n_bins: int,
              cols=None, link="logit") -> np.ndarray:
    """공변량 한 벌(x_row)에 대해 구간 11개의 '그 시점까지 채워질 확률' 곡선.

    구간 더미를 갈아 끼우며 h(t)를 뽑고 누적한다 — 이게 도구가 손님에게 줄 곡선이다.

    ⚠ 상호작용 열(`bin_b*이름`)도 **함께** 갈아 끼워야 한다. 구간 더미만 바꾸고
      상호작용을 그대로 두면, "구간 7인데 상호작용은 구간 3의 자리에 켜져 있는"
      존재하지 않는 좌표에서 예측하게 된다. 학습 자료에 그런 행이 없으므로 모델은
      외삽하고, 곡선이 조용히 틀린다 — 스모크도 안 터진다. 그래서 여기서 막는다.
      (`cols`를 안 주면 상호작용이 없는 옛 설계행렬로 보고 예전처럼 동작한다.)
    """
    rows = np.tile(x_row, (n_bins, 1))
    rows[:, :n_bins] = np.eye(n_bins)      # 앞 n_bins열이 구간 더미

    if cols is not None:
        # 상호작용 열은 `bin_{b}*{이름}` 꼴이다. 이름별로 (n_bins-1)칸이 붙어 있고,
        # 그 값은 원래 공변량 열의 값과 같다 — x_row에서 그대로 가져온다.
        ip = {c: i for i, c in enumerate(cols)}
        by_name = {}
        for c in cols:
            if "*" in c and c.startswith("bin_"):
                b_s, nm = c.split("*", 1)
                by_name.setdefault(nm, {})[int(b_s[4:])] = ip[c]
        for nm, slots in by_name.items():
            src = ip[nm]
            for j in slots.values():
                rows[:, j] = 0.0                    # 일단 전부 끄고
            for b, j in slots.items():
                rows[b, j] = x_row[src]             # 그 구간의 자리만 켠다

    h = predict(rows.astype(np.float32), beta, link)
    return 1.0 - survival_from_hazard(h)


def main():
    X, y, g, cols = load()
    y = y.astype(np.float64)
    n_bins = len(BIN_EDGES) - 1
    tr, te = split_by_group(g)
    print(f"학습 {tr.sum():,} 행 / 검증 {te.sum():,} 행 · 공변량 {X.shape[1]}개 "
          f"(작업 단위 분리)")

    # 출하 1본: 구간 더미 + 공변량 + 상호작용의 로지스틱 회귀 = 이산시간 해저드 모델.
    # 절편이 없는 이유: 구간 더미가 11개 다 있어서 절편과 완전공선(다중공선성)이
    # 된다. 더미가 곧 구간별 기저 해저드다.
    # (적합기는 위 IRLS. sklearn을 쓰다가 123열에서 수렴 실패를 겪고 바꿨다 —
    #  §「왜 sklearn을 안 쓰나」)
    beta = irls(X[tr], y[tr], "logit")

    p_te = predict(X[te], beta, "logit")
    print(f"\nBrier {brier(p_te, y[te]):.4f}  (전부 기저율로 찍으면 "
          f"{brier(np.full(te.sum(), y[tr].mean()), y[te]):.4f})")

    print("\n보정 곡선 (예측 vs 실제 — 두 값이 가까워야 '40%'라고 말할 수 있다)")
    for pm, ym, n in calibration(p_te, y[te]):
        bar = "#" * int(ym * 40)
        print(f"  예측 {pm:5.1%}  실제 {ym:5.1%}  n={n:>7,}  {bar}")

    # ── 경로별 곡선: 도구가 실제로 낼 답의 모양 ──
    print("\n시점별 보충 확률 — 경로 3유형 (qlen=중앙값, 점심시간 기준)")
    ip = {c: i for i, c in enumerate(cols)}
    base = np.zeros(X.shape[1], dtype=np.float32)
    # ⚠ 대표 케이스의 qlen은 **작업 단위**로 잡는다. 행 단위 중앙값을 쓰면 오래 걸린
    #   작업이 구간 행 수만큼 과대표집돼 값이 부풀고(실측 행 68 vs 작업 13),
    #   "전형적인 손님"이 아니라 "혼잡한 순간"의 곡선을 그리게 된다.
    _first = np.unique(g, return_index=True)[1]
    med_q = float(np.median(X[_first, ip["qlen"]]))

    # ── 큐의 구성은 qlen과 **함께 움직여야 한다** (08-25) ──────────────────
    # [실제로 깨졌다] 새 칸을 0으로 두고 qlen만 바꿔 곡선을 그렸더니 이렇게 나왔다:
    #     qlen=0   → 1분에 이미 100%
    #     qlen=101 → 전 구간 0%
    #   둘 다 헛것이다. "큐 길이는 0인데 큐에 쌓인 일은 중앙값만큼 있다" 같은
    #   **자기모순 좌표**를 모델에 먹였기 때문이다. 학습 자료에 그런 행이 없으므로
    #   모델은 외삽하고, 외삽은 선형항을 그대로 밀어 확률을 0이나 1로 포화시킨다.
    #
    # [고침] 큐 구성을 qlen의 **비율로** 잡는다. 중앙 상태에서의 유형별 비율과
    #   건당 평균 작업량을 구해 두고, qlen이 바뀌면 그 비율대로 함께 늘린다.
    #   그래야 "큐가 두 배면 그 안의 일도 대략 두 배"라는, 자료에 실제로 있는
    #   좌표 위를 움직인다.
    q_share, work_per = {}, 0.0
    if "q_vertical" in ip:
        for _c in ("q_vertical", "q_horizontal"):
            q_share[_c] = float(np.median(X[_first, ip[_c]])) / max(med_q, 1.0)
        # log_q_work의 중앙값을 되돌려(expm1) 건당 평균 작업량을 얻는다.
        work_per = float(np.expm1(np.median(X[_first, ip["log_q_work"]]))) / max(med_q, 1.0)

    def set_queue(vec, q):
        """qlen을 q로 두고, 구성·작업량을 그 비율대로 함께 옮긴다."""
        vec[ip["qlen"]] = q
        vec[ip["log_qlen"]] = float(np.log1p(q))
        for _c, sh in q_share.items():
            vec[ip[_c]] = sh * q
        if work_per:
            vec[ip["log_q_work"]] = float(np.log1p(work_per * q))

    set_queue(base, med_q)
    base[ip["hour_sin"]], base[ip["hour_cos"]] = np.sin(2 * np.pi * 12 / 24), np.cos(2 * np.pi * 12 / 24)
    base[ip["dow_sin"]], base[ip["dow_cos"]] = np.sin(2 * np.pi * 2 / 7), np.cos(2 * np.pi * 2 / 7)

    labels = [f"{int(BIN_EDGES[i+1])//60}분" if BIN_EDGES[i + 1] != float("inf") else "그이상"
              for i in range(n_bins)]
    print(f"  {'경로':<12s}" + "".join(f"{l:>8s}" for l in labels[:8]))
    for path in ("VERTICAL", "HORIZONTAL", "FLOOR"):
        key = f"path_type={path}"
        if key not in ip:
            continue
        x = base.copy()
        for _p in ("VERTICAL", "HORIZONTAL", "FLOOR"):    # 셋 중 하나만 켠다
            if f"path_type={_p}" in ip:
                x[ip[f"path_type={_p}"]] = 0.0
        x[ip[key]] = 1.0
        c = curve_for(beta, x, n_bins, cols)
        print(f"  {path:<12s}" + "".join(f"{v:>7.0%} " for v in c[:8]))

    # ── 큐 압력의 효과: 대기의 지배 변수가 곡선을 얼마나 미는가 ──
    print(f"\n큐 압력의 효과 (VERTICAL 고정, qlen 변화 — 중앙값 {med_q:.0f})")
    q75 = float(np.percentile(X[_first, ip["qlen"]], 75))
    q90 = float(np.percentile(X[_first, ip["qlen"]], 90))
    for q in (0, med_q, q75, q90):
        x = base.copy()
        x[ip["path_type=VERTICAL"]] = 1.0
        set_queue(x, q)          # ⚠ qlen만 바꾸지 않는다 — 위 「함께 움직여야」 참조
        c = curve_for(beta, x, n_bins, cols)
        print(f"  qlen={q:>5.0f}" + "".join(f"{v:>7.0%} " for v in c[:8]))

    print("\n[읽는 법] 각 행이 도구가 낼 답이다 — '15분 내 몇 %'.")
    print("  보정이 맞아야 그 숫자를 손님에게 말할 수 있다(헌법 8: 시점별 확률).")


if __name__ == "__main__":
    main()
