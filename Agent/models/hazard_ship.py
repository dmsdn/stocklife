# ============================================================================
# 가용예측 — 출하본 학습·저장·적재 (2026-08-25 판)
# ============================================================================
# [왜 이 파일이 생겼나] 08-25 후보 대조표(`hazard_compare.py`)가 판정을 뒤집었다.
#   그 전까지 출하본은 `hazard.py`의 **logit**이었고, 근거는 "우리가 보정 편향을
#   고쳤으니까"였다. 그런데 후보를 나란히 세워 보니:
#
#     후보                     Brier        중간대역 편차   신뢰도항
#     ① 규칙 바닥              0.12480      +0.1%p         0.00000
#     ⑤ logit(상호작용 없음)    0.05609      +5.8%p         0.00062
#     ③ cloglog               0.05070      +6.1%p         0.00069
#     ② logit  (그때의 출하본)  0.04908      +3.0%p         0.00029
#     ④ 부스팅                 0.04065      -0.4%p         0.00002   ← 세 지표 전부 1위
#
#   시드 3개 표준편차가 0.00008인데 ②와 ④의 차이가 0.008이다 — **100배**다.
#   그래서 출하본을 **부스팅으로 바꾼다.** 이 파일이 그 결정의 실물이다.
#
# [무엇을 배웠나 — 사다리를 보라] 중간대역 편차가
#     +5.8%p(상호작용 없음) → +3.0%p(손으로 넣음) → -0.4%p(트리)
#   로 내려간다. 08-25 오전에 구간×공변량 상호작용을 손으로 넣어 편향을 절반으로
#   줄였는데, **트리는 그 일을 공짜로 하고 나머지 절반까지 가져갔다.**
#   소비주기에서 독립적으로 같은 결론이 나왔다(GBM 채택 + 애초에 잘 보정됨).
#   → 이론노트 §35: 「정석」은 가정이 참일 때만 정석이다.
#
# [그래도 hazard.py는 남는다] 거기에 IRLS(수치 핵심)가 있고 `hazard_link`·
#   `hazard_compare`가 그것을 빌려 쓴다. 출하본이 트리로 바뀐다고 지우지 않는다 —
#   **비교의 근거를 만든 코드는 근거가 유효한 동안 살아 있어야 한다.**
#
# [저장하는 것 — 모델만으로는 못 쓴다]
#   GBM 객체 · cols(열 이름 123) · BIN_EDGES · 대표 케이스 좌표 · 학습 메타
#   ⚠ **cols가 조용한 지뢰다.** 설계행렬의 열 순서는 `person_period.py`가 정하는데,
#     소분류가 하나 늘거나 상호작용 목록이 바뀌면 **순서가 통째로 밀린다.**
#     저장된 모델의 3번 열이 다른 뜻이 되는데 예외는 안 난다.
#     → `load()`가 현재 `person_period`의 열 이름과 대조해 **안 맞으면 거부**한다.
#     (소비주기 `repurchase_ship.py`가 l2_names로 한 것과 같은 계열의 방어다.)
#
# [적재 위치] `infer.py`가 아니라 **`main.py`의 lifespan**이다(헌법 6 — 1회 로드 상주).
#   이 파일은 그 적재가 쓸 `load()`를 제공한다. 산출물은 `Agent/app/artifacts/`에
#   놓인다 — 팀 저장소에 `models/`가 없어서 그쪽으로는 적재 경로가 안 선다.
#
# 실행:  python hazard_ship.py            # 학습 + 저장 + 적재 검산
#        python hazard_ship.py --check    # 저장된 것 검산만
# ============================================================================

from __future__ import annotations

import os
import sys
import time

import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from artifacts import path as _apath                              # noqa: E402
from hazard import load as load_npz, split_by_group, brier, calibration   # noqa: E402
from hazard import NPZ as NPZ_PATH                                        # noqa: E402
from person_period import BIN_EDGES, survival_from_hazard         # noqa: E402

BUNDLE = _apath("availability_model.joblib")
REPORT = _apath("availability_ship.txt")
SEED = 0                    # 출하본은 시드 하나로 고정한다 — 대조표의 시드 3개는
                            # "차이가 우연인가"를 재는 용도이고, 내보내는 물건은 하나다.
MID_LO, MID_HI = 0.45, 0.80


def _mid_bias(p, y):
    cal = calibration(p, y)
    mid = [(pm, ym, n) for pm, ym, n in cal if MID_LO <= pm <= MID_HI]
    if not mid:
        return float("nan")
    return 100 * sum((ym - pm) * n for pm, ym, n in mid) / sum(n for _, _, n in mid)


def _reliability(p, y, nb=20):
    e = np.linspace(0, 1, nb + 1)
    tot = 0.0
    for i in range(nb):
        m = (p >= e[i]) & (p < e[i + 1] if i < nb - 1 else p <= 1.0)
        if m.sum() >= 200:
            tot += m.sum() * (p[m].mean() - y[m].mean()) ** 2
    return tot / len(y)


def _drop_interactions(X, cols):
    """상호작용 열을 뺀 설계행렬. 트리에는 이것을 준다.

    왜 빼나: 트리는 구간과 공변량의 상호작용을 **스스로 만든다**. 손으로 만든
    열을 함께 주면 같은 정보가 두 번 들어가 분할이 갈라지고, 무엇보다
    **"트리가 스스로 찾는가"를 확인할 수 없게 된다.** 대조표(④)도 같은 조건이라
    여기서 조건을 바꾸면 그때 잰 수치와 다른 물건이 나온다.
    """
    keep = [i for i, c in enumerate(cols) if "*" not in c]
    return X[:, keep], [cols[i] for i in keep]


def train():
    from sklearn.ensemble import HistGradientBoostingClassifier

    X, y, g, cols = load_npz()
    y = y.astype(np.float64)
    Xn, cols_n = _drop_interactions(X, cols)
    tr, te = split_by_group(g, seed=SEED)

    t0 = time.perf_counter()
    gbm = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.1,
                                         max_leaf_nodes=31, random_state=SEED)
    gbm.fit(Xn[tr], y[tr])
    secs = time.perf_counter() - t0

    p = gbm.predict_proba(Xn[te])[:, 1]
    metrics = {"brier": brier(p, y[te]),
               "mid_bias": _mid_bias(p, y[te]),
               "reliability": _reliability(p, y[te]),
               "n_train": int(tr.sum()), "n_test": int(te.sum()),
               "fit_sec": round(secs, 1)}

    # 대표 케이스 좌표 — 곡선을 그릴 때 "전형적인 손님"의 자리.
    # ⚠ 작업 단위 중앙값을 쓴다. 행 단위로 잡으면 오래 걸린 작업이 구간 행 수만큼
    #   과대표집돼 "전형"이 아니라 "혼잡한 순간"이 된다(hazard.py의 같은 주석).
    ip = {c: i for i, c in enumerate(cols_n)}
    first = np.unique(g, return_index=True)[1]
    base = {c: float(np.median(Xn[first, ip[c]]))
            for c in ("qlen", "log_qlen", "q_vertical", "q_horizontal",
                      "log_q_work", "log_travel")
            if c in ip}

    # ── 매대 거리 표 — 서빙이 (sku, path)로 조회한다 ─────────────────────
    # person_period가 기하량(조합 내 sd=0 가드)으로 증명해 npz에 실은 것을
    # 그대로 번들에 옮긴다. 배포에서는 백엔드 locations 좌표에서 같은 값이
    # 나온다 — 표는 그때까지의 다리다. 모르는 SKU는 경로유형 평균으로 받는다.
    npz = np.load(NPZ_PATH, allow_pickle=True)
    t_sku = npz["travel_sku"]; t_path = npz["travel_path"]; t_sec = npz["travel_sec"]
    travel = {(int(a), str(b)): float(c) for a, b, c in zip(t_sku, t_path, t_sec)}
    travel_mean = {p_: float(np.mean(t_sec[t_path == p_])) for p_ in set(map(str, t_path))}

    bundle = {
        "kind": "availability_hazard",
        "version": "2026-08-26",
        "model": gbm,
        "cols": cols_n,                  # 트리에 준 열 이름(상호작용 제외)
        "bin_edges": list(BIN_EDGES),
        "base_case": base,
        "travel": travel,                # (sku_id, path_type) → 이동시간 상수(초)
        "travel_mean": travel_mean,      # 모르는 SKU의 낙하 지점
        "metrics": metrics,
        "seed": SEED,
        # 왜 이 모델인지의 근거를 물건에 붙여 보낸다 — 파일만 받은 사람도
        # "logit이 아니라 왜 트리인가"를 알 수 있어야 한다.
        # 08-26 거리 특징(log_travel) 포함 재비교값 — hazard_compare.txt
        "chosen_over": {"logit": 0.04892, "cloglog": 0.05057,
                        "logit_no_interaction": 0.05598, "rule_baseline": 0.12480},
    }
    return bundle


def save(bundle):
    import joblib
    joblib.dump(bundle, BUNDLE, compress=3)
    m = bundle["metrics"]
    lines = [
        "가용예측 출하본 — %s" % bundle["version"],
        "  모델      HistGradientBoosting(max_iter=200, lr=0.1, leaves=31, seed=%d)" % bundle["seed"],
        "  설계행렬  %d열 (상호작용 제외 — 트리가 스스로 만든다)" % len(bundle["cols"]),
        "  구간      %d개" % (len(bundle["bin_edges"]) - 1),
        "  학습/검증 %s / %s 행 (작업 단위 분리) · 적합 %.1f초"
        % (f"{m['n_train']:,}", f"{m['n_test']:,}", m["fit_sec"]),
        "",
        "  Brier          %.5f" % m["brier"],
        "  중간대역 편차   %+.1f%%p   (45~80%%)" % m["mid_bias"],
        "  신뢰도항        %.5f" % m["reliability"],
        "",
        "  무엇을 이겼나 (hazard_compare.py · 시드 3개 평균 Brier)",
    ]
    for k, v in bundle["chosen_over"].items():
        lines.append("    %-22s %.5f" % (k, v))
    lines += ["", "  파일  %s (%.1f MB)" % (os.path.basename(BUNDLE),
                                            os.path.getsize(BUNDLE) / 2**20)]
    txt = "\n".join(lines)
    with open(REPORT, "w", encoding="utf-8") as f:
        f.write(txt + "\n")
    return txt


def load(expected_cols=None):
    """출하본을 적재한다. 열 이름이 어긋나면 **거부한다.**

    [왜 거부까지 하나] 설계행렬의 열 순서는 `person_period.py`가 정한다. 소분류가
    하나 늘거나 상호작용 목록이 바뀌면 순서가 통째로 밀리는데, 그래도 **모양은
    맞아서 예외가 안 난다.** 3번 열이 `dow_sin`이었는데 `hour_cos`가 되어도
    predict는 조용히 숫자를 낸다. 그 숫자가 손님에게 나간다.
    → 모양이 아니라 **이름**을 대조한다. 안 맞으면 재학습하라고 말한다.
    """
    import joblib
    if not os.path.exists(BUNDLE):
        raise SystemExit(f"출하물이 없습니다: {BUNDLE}\n  먼저 python hazard_ship.py")
    b = joblib.load(BUNDLE)
    if expected_cols is not None and list(b["cols"]) != list(expected_cols):
        raise SystemExit(
            "출하본의 열 구성이 지금 설계행렬과 다릅니다 — 적재를 거부합니다.\n"
            f"  저장본 {len(b['cols'])}열 / 현재 {len(expected_cols)}열\n"
            "  카탈로그나 특징 목록이 바뀐 것입니다. python hazard_ship.py 로 재학습하세요.")
    return b


def curve(bundle, x_row: np.ndarray) -> np.ndarray:
    """공변량 한 벌 → 구간별 누적 확률 F(t). 도구가 손님에게 줄 곡선.

    구간 더미만 갈아 끼우며 h(t)를 뽑고 1-∏(1-h)로 누적한다.
    ⚠ 상호작용 열이 없으므로 hazard.py의 `curve_for`가 하던 "상호작용도 함께
      전환" 처리가 필요 없다 — 트리에 준 설계행렬에 그 열이 애초에 없다.
      **출하본을 트리로 바꾸면서 조용한 실수 하나가 구조적으로 사라졌다.**
    """
    n_bins = len(bundle["bin_edges"]) - 1
    rows = np.tile(x_row, (n_bins, 1))
    rows[:, :n_bins] = np.eye(n_bins)
    h = bundle["model"].predict_proba(rows)[:, 1]
    return 1.0 - survival_from_hazard(h)


def main():
    if "--check" in sys.argv:
        from person_period import FEATURES_INTERACT   # noqa: F401
        _X, _y, _g, cols = load_npz()
        cols_n = [c for c in cols if "*" not in c]
        b = load(expected_cols=cols_n)
        print("적재 OK · %s · %d열 · Brier %.5f"
              % (b["version"], len(b["cols"]), b["metrics"]["brier"]))
        return

    print("학습 중 …", flush=True)
    bundle = train()
    txt = save(bundle)
    print("=" * 72)
    print(txt)
    print("=" * 72)

    # 적재 검산 — 저장한 것을 곧바로 다시 읽어 곡선을 뽑아 본다.
    b = load(expected_cols=bundle["cols"])
    ip = {c: i for i, c in enumerate(b["cols"])}
    n_bins = len(b["bin_edges"]) - 1
    x = np.zeros(len(b["cols"]), dtype=np.float32)
    for k, v in b["base_case"].items():
        x[ip[k]] = v
    labels = [f"{int(b['bin_edges'][i+1])//60}분" if np.isfinite(b["bin_edges"][i + 1])
              else "그이상" for i in range(n_bins)]
    print("\n적재 검산 — 시점별 보충 확률 (대표 케이스)")
    print("  %-12s" % "경로" + "".join(f"{l:>8s}" for l in labels[:8]))
    for p_ in ("VERTICAL", "HORIZONTAL", "FLOOR"):
        key = f"path_type={p_}"
        if key not in ip:
            continue
        xx = x.copy()
        for q in ("VERTICAL", "HORIZONTAL", "FLOOR"):
            if f"path_type={q}" in ip:
                xx[ip[f"path_type={q}"]] = 0.0
        xx[ip[key]] = 1.0
        c = curve(b, xx)
        print("  %-12s" % p_ + "".join(f"{v:>7.0%} " for v in c[:8]))
    print(f"\n저장 → {BUNDLE}")
    print(f"       {REPORT}")


if __name__ == "__main__":
    main()
