# ============================================================================
# 소비주기 — 출하본 학습·저장·적재 (2026-08-25 11:04 고도화판)
# ============================================================================
# [왜 이 파일이 생겼나] 노트북 A의 전수검사 §5.1이 지적했다 —
#   *"학습된 모델이 저장되지 않는다. 네 파일 어디에도 joblib/pickle이 없어
#     매 실행이 재학습이고, infer.py가 적재할 산출물이 없다."*
#   맞는 지적이었다. 지금까지는 **비교**만 했고 **출하물**을 만든 적이 없다.
#
# [두 모델을 낸다 — 접점이 다르면 질문이 다르다]
#   재구매 해저드는 곱이다:  h(t) = P(그날 방문) × P(주기가 찼다 | 방문)
#
#     unconditional  전 구간에서 학습. **매장 밖**(푸시 알림)용.
#                    "곧 살 때 됩니다"를 언제 보낼지
#     conditional    **방문이 있었던 구간만** 학습. **매장 안**(진입 브리핑)용.
#                    손님이 이미 왔으므로 왼쪽 항은 1이다. 리스트에 없는데
#                    주기가 찬 품목을 고르는 것이 이 모델의 일
#
#   같은 알고리즘·같은 특징이고 **학습에 쓰는 행만 다르다.**
#   실측(08-25): 같은 순간·같은 손님에게 두 모델의 확률이 1.3~2.4배 다르다.
#   경과 16~24일에서 무조건부 0.211 / 조건부 0.506 — 임계 0.5면 한쪽은 침묵한다.
#
# [저장하는 것 — 모델만으로는 못 쓴다]
#   GBM 객체 · mu_l2(콜드스타트 사전평균) · l2_names · BIN_EDGES · 특징 이름
#   ⚠ **l2_names가 조용한 지뢰다**(A 지적). 소분류 코드는
#     `sorted(set(l2_by_sku.values()))`로 만들어지므로 카탈로그에 소분류가 하나 늘면
#     **코드가 통째로 밀린다.** 저장된 모델의 범주 특징이 다른 뜻이 되는데 예외는 안 난다.
#     → `load()`가 현재 카탈로그의 l2_names와 대조해 **안 맞으면 거부**한다.
#
# [적재 위치] `infer.py`가 아니라 **`main.py`의 lifespan**이다(헌법 6 — 1회 로드 상주).
#   이 파일은 그 적재가 쓸 `load()`를 제공한다.
#
# 실행:  python repurchase_ship.py            # 학습 + 저장 + 적재 검산
#        python repurchase_ship.py --check    # 저장된 것 적재 검산만
# ============================================================================

from __future__ import annotations

import os
import sys
import time

import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

import repurchase as R          # noqa: E402
import repurchase_visits as V   # noqa: E402

# [08-25 A] 자리를 옮겼다 — `models/out/`은 팀 저장소에 없는 폴더라
#   `infer.py`가 적재할 길이 없었다. 근거는 `models/artifacts.py` 머리 주석.
#   **추적하기로 한 판단(B)은 그대로 두고 위치만 바꾼다.**
from artifacts import path as _apath          # noqa: E402
BUNDLE = _apath("repurchase_model.joblib")
SEED = 0


# ── 특징 이름 — 저장물과 서빙이 같은 순서를 봐야 한다 ────────────────────────
FEATURE_NAMES = [
    "bin", "l2_code",
    "hh", "hh_na", "pet", "pet_na", "child", "child_na", "car", "car_na",
    "log_past_n", "has_hist", "eb", "log_qty",
    "log_visits_before", "visit_rate",
]


def build_design(d, idx, eb, riv, b, vis):
    """설계행렬 — 기존 14열 + 방문 2열.

    방문 열은 **구간마다 값이 다르다**(간격이 진행되며 방문이 쌓인다). 이산시간
    해저드는 원래 구간별 공변량을 허용하므로 형식상 자연스럽다.
    ⚠ 누출 경계: 구간 b의 해저드를 예측하는 시점은 **구간 b의 시작**이라,
      쓸 수 있는 것은 [간격시작, b시작) 의 방문뿐이다.
    """
    members, offset, times = vis
    edges = d["bin_edges"]
    X = R.design_dense(d, idx, eb, riv, b)
    vb, _ = V.visit_counts(d, idx, riv, b, edges, members, offset, times)
    rate = V.member_rate(d, idx, members, offset, times)[riv]
    return np.column_stack([X, np.log1p(vb).astype(np.float32),
                            rate.astype(np.float32)])


def train(d, vis, conditional, log):
    from sklearn.ensemble import HistGradientBoostingClassifier
    edges = d["bin_edges"]
    n_bins = len(edges) - 1
    members, offset, times = vis

    # 출하본은 **전량으로 학습**한다. 대조표는 검증이 필요해 25%를 뗐지만
    # 출하물은 가진 자료를 다 쓰는 것이 맞다(그 성능을 다시 보고하지는 않는다).
    idx = np.arange(len(d["dur"]))
    s2w, tau2, mu_l2, gm = R.fit_shrinkage(d, idx)
    eb = R.apply_eb(d, idx, s2w, tau2, mu_l2, gm, shrink=False)   # [A-1] 원시 (a)
    riv, b, y = R.expand(idx, d["last_bin"], d["event"], n_bins)

    X = build_design(d, idx, eb, riv, b, vis)
    if conditional:
        _, vi = V.visit_counts(d, idx, riv, b, edges, members, offset, times)
        keep = vi >= 1
        X, y = X[keep], y[keep]
    rng = np.random.default_rng(SEED)
    sub = rng.choice(len(y), size=min(R.FIT_ROWS, len(y)), replace=False)

    t0 = time.perf_counter()
    m = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.1,
                                       max_leaf_nodes=31, categorical_features=[1],
                                       random_state=SEED)
    m.fit(X[sub], y[sub])
    log("  %-14s 학습 %s행(표집 %s) · 사건률 %.1f%% · %.0f초"
        % ("조건부" if conditional else "무조건부", f"{len(y):,}", f"{len(sub):,}",
           y.mean() * 100, time.perf_counter() - t0))
    return m, mu_l2, gm


def save(d, models, mu_l2, gm, log):
    import joblib
    import sklearn as _sk
    bundle = {
        "version": "2026-08-25 11:04",
        "models": models,                      # {"unconditional":…, "conditional":…}
        "mu_l2": mu_l2,                        # 콜드스타트 사전평균(로그 일)
        "gm": float(gm),                       # 소분류가 없을 때의 전체 평균
        "l2_names": np.asarray(d["l2_names"]),  # ⚠ 적재 시 대조용 — 지뢰 방어
        "bin_edges": np.asarray(d["bin_edges"]),
        "feature_names": FEATURE_NAMES,
        # [T12 · 08-25] **저장 환경을 같이 싣는다.** A가 이 번들을 열지 못했다 —
        #   저장 sklearn 1.7.2(B) / 열기 1.9.0(A) → ModuleNotFoundError: '_loss'.
        #   sklearn 추정기의 pickle은 **버전 간 호환이 보장되지 않는다**(공식 입장).
        #   내부 모듈 경로가 바뀌면 역직렬화가 실패하고, 에러 메시지는 원인을 안 말한다.
        #   → 저장 버전을 실어 두고 `load()`가 실패를 **원인이 보이는 문장**으로 옮긴다.
        "env": {
            "sklearn": _sk.__version__,
            "joblib": joblib.__version__,
            "numpy": np.__version__,
            "python": "%d.%d" % sys.version_info[:2],
        },
        # 운용점 — `소비주기_모델대조표.md` §13.8에서 확정. **md에만 두면 하네스가
        # 숫자를 하드코딩하게 되므로 출하물에 같이 싣는다.** 근거 수치를 함께 실어
        # 서빙에서 실측과 대조(회귀 감지)할 수 있게 한다.
        "operating_point": {
            "gate": 0.80,              # 이 확률 미만은 말하지 않는다
            "max_per_visit": None,     # 상한은 **조정기**가 우선순위와 함께 건다(§13.8)
                                       #   모델이 미리 자르면 조정기가 "3등까지 있었다"를 못 본다
                                       #   상한 3 → 적중 −24% · 상한 2 → −38% (W-34)
            "cooldown_days": 14,
            "list_frac_assumed": 0.70,  # 손님이 살 것의 70%를 리스트에 적어 온다는 가정
            "expected": {              # f=0.7 · 시드 3개. 서빙 실측이 크게 벗어나면 재학습 신호
                "alerts_per_visit": 1.28,
                "precision": 0.717,
                "silent_rate": 0.52,
                "p_at_1": 0.655,
            },
        },
        "note": ("unconditional=매장 밖(푸시) · conditional=매장 안(진입 브리핑). "
                 "eb는 원시 과거 로그평균(a). "
                 "⚠ operating_point.gate는 P(구매)에 대한 관문이지 "
                 "P(구매 ∧ 리스트에 없음)이 아니다 — '관문=기대 적중률'로 읽지 말 것(W-33)."),
    }
    joblib.dump(bundle, BUNDLE, compress=3)
    log("  저장 → %s (%.1f MB)" % (BUNDLE, os.path.getsize(BUNDLE) / 2**20))


def load(expected_l2_names=None):
    """서빙 적재. **소분류 목록이 안 맞으면 거부한다.**

    l2_code는 카탈로그의 소분류를 정렬해 매긴 번호다. 소분류가 하나 늘면 그 뒤가
    통째로 밀리는데, 밀린 채로 예측하면 **예외 없이 틀린 답**이 나온다
    (범주 특징이라 값 범위가 유효해 보인다). 그래서 이름 목록을 대조한다.
    """
    import joblib
    import sklearn as _sk
    if not os.path.exists(BUNDLE):
        raise SystemExit(f"출하물이 없습니다: {BUNDLE}\n  먼저 python repurchase_ship.py")
    # [T12] 역직렬화 실패를 **원인이 보이는 문장**으로 옮긴다.
    #   그냥 두면 `ModuleNotFoundError: No module named '_loss'`만 뜬다 —
    #   sklearn 내부 모듈 이름이라 읽는 사람이 버전 문제라고 알아챌 방법이 없다.
    try:
        b = joblib.load(BUNDLE)
    except Exception as e:
        raise SystemExit(
            "출하물을 열지 못했습니다 — **sklearn 버전 불일치**일 가능성이 큽니다.\n"
            f"  현재 sklearn {_sk.__version__} · joblib {joblib.__version__}\n"
            f"  원인: {type(e).__name__}: {str(e)[:120]}\n"
            "  sklearn 추정기의 pickle은 버전 간 호환이 보장되지 않습니다.\n"
            "  저장 환경과 버전을 맞추거나, 그 환경에서 재저장하세요\n"
            "  (models/repurchase_ship.py — 저장 버전은 번들의 'env' 열쇠에 있습니다).")
    # 열리긴 했는데 버전이 다르면 **경고만** 한다. 트리 구조 자체는 자료라
    # 대개 같은 답이 나오지만, 재현 문제를 추적할 때 이 줄이 단서가 된다.
    env = b.get("env")
    if env and env.get("sklearn") != _sk.__version__:
        print("⚠ sklearn 저장 %s / 현재 %s — 열리긴 했으나 재현 시 확인하세요"
              % (env.get("sklearn"), _sk.__version__), flush=True)
    if expected_l2_names is not None:
        got = list(map(str, b["l2_names"]))
        exp = list(map(str, expected_l2_names))
        if got != exp:
            raise SystemExit(
                "소분류 목록 불일치 — 모델을 적재할 수 없습니다.\n"
                f"  저장 {len(got)}종 · 현재 {len(exp)}종\n"
                "  카탈로그가 바뀌었으면 재학습이 필요합니다(코드가 밀려 조용히 틀립니다).")
    return b


def curve(bundle, kind, feats):
    """공변량 한 벌 → 구간별 누적확률 F(t). 도구가 부를 함수의 원형.

    구간 더미만 갈아 끼우며 h를 뽑고 누적한다 — 4-02·4-03이 유도한 그 세 줄이다.
    """
    n_bins = len(bundle["bin_edges"]) - 1
    rows = np.tile(np.asarray(feats, dtype=np.float32), (n_bins, 1))
    rows[:, 0] = np.arange(n_bins)          # 0번 열이 구간번호
    h = bundle["models"][kind].predict_proba(rows)[:, 1]
    return 1.0 - np.cumprod(1.0 - h)


def main():
    lines = []

    def log(m):
        print(m, flush=True)
        lines.append(m)

    log("=" * 78)
    log("소비주기 출하본 — 2026-08-25 11:04")
    log("=" * 78)

    if "--check" not in sys.argv:
        d = R.load()
        vis = V.build_visits(log)
        models = {}
        for kind, cond in (("unconditional", False), ("conditional", True)):
            m, mu_l2, gm = train(d, vis, cond, log)
            models[kind] = m
        save(d, models, mu_l2, gm, log)
    else:
        d = R.load()

    # ── 적재 검산 ──
    log("")
    log("적재 검산")
    b = load(expected_l2_names=d["l2_names"])
    log("  버전 %s · 모델 %s · 특징 %d개 · 구간 %d개"
        % (b["version"], list(b["models"]), len(b["feature_names"]),
           len(b["bin_edges"]) - 1))
    log("  소분류 대조 OK (%d종)" % len(b["l2_names"]))
    ev = b.get("env", {})
    log("  저장 환경 sklearn %s · joblib %s · numpy %s · python %s"
        % (ev.get("sklearn", "?"), ev.get("joblib", "?"),
           ev.get("numpy", "?"), ev.get("python", "?")))
    op = b["operating_point"]
    log("  운용점 관문 %.2f · 상한 %s(조정기 위임) · 쿨다운 %d일 · 리스트 가정 f=%.2f"
        % (op["gate"], op["max_per_visit"] or "없음", op["cooldown_days"],
           op["list_frac_assumed"]))
    log("    기대치 알림/방문 %.2f · 적중률 %.1f%% · 침묵 %.0f%%"
        % (op["expected"]["alerts_per_visit"], op["expected"]["precision"] * 100,
           op["expected"]["silent_rate"] * 100))

    # 지뢰가 실제로 걸리는지 — 소분류를 하나 늘려 본다
    fake = list(map(str, d["l2_names"])) + ["신규소분류"]
    try:
        load(expected_l2_names=fake)
        log("  !! 지뢰 방어 실패 — 목록이 달라도 통과했다")
    except SystemExit:
        log("  지뢰 방어 OK — 소분류가 늘면 적재를 거부한다")

    # 곡선 한 벌 뽑아 보기 (중앙적 손님: 축 결측 없음·이력 3회·주기 로그평균 3.4)
    feats = [0, 30, 2, 0, 0, 0, 0, 0, 1, 0, np.log1p(3), 1, 3.4, np.log1p(1),
             np.log1p(1), 0.065]
    lab = [f"{int(b['bin_edges'][i+1])}일" if np.isfinite(b["bin_edges"][i + 1])
           else "그이상" for i in range(len(b["bin_edges"]) - 1)]
    log("")
    log("도구가 낼 곡선 (예시 손님 — 가구 2인·차량 있음·이력 3회)")
    log("  %-12s" % "구간" + "".join(f"{x:>8s}" for x in lab[:8]))
    for kind in ("unconditional", "conditional"):
        c = curve(b, kind, feats)
        log("  %-12s" % kind + "".join(f"{v:>7.0%} " for v in c[:8]))
    log("  → 같은 손님인데 답이 다르다. 매장 안이면 아래 줄이 맞다.")

    # [T12] 검산 기록도 출하물과 **같은 자리**에 쓴다. A가 joblib을 옮길 때
    #   이 경로가 안 따라와서, 추적되는 ship.txt 는 옛 실행분이고 코드는 계속
    #   `models/out/`(gitignore)에 쓰고 있었다 — 증빙이 조용히 낡는 구조였다.
    out_txt = _apath("repurchase_ship.txt")
    with open(out_txt, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    log("\n저장 -> %s" % out_txt)


if __name__ == "__main__":
    main()
