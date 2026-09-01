# ============================================================================
# 이산시간 생존분석 — person-period 변환기 (가용예측 자산의 입력 공장)
# ============================================================================
# [무엇을 하나] 작업 한 건 = 한 행인 `lead_times.csv.gz`를,
#   **작업 × 시간구간 = 한 행**인 긴 표(long format)로 펼친다.
#
#   변환 전 (task 단위)                변환 후 (person-period 단위)
#   ─────────────────────              ──────────────────────────────
#   T001  dur=250s  event=1     →      T001  bin=0(0~60s)    y=0
#                                      T001  bin=1(60~120s)  y=0
#                                      T001  bin=2(120~300s) y=1   ← 이 구간에 완료
#
#   T002  dur=90s   event=0     →      T002  bin=0           y=0
#     (절단)                           T002  bin=1           y=0   ← 여기서 관측 끝. y=1 없음
#
# [왜 이렇게 하나 — 헌법 8을 지키는 방법]
#   헌법 8: "가용 예측은 이진 분류 금지 — 시점별 확률."
#   그런데 이 변환을 하면 **각 구간의 이진 분류**를 학습하게 된다. 모순처럼 보이지만
#   반대다. 구간별 이진 분류로 추정하는 것은 **이산 시간 해저드**
#     h(t | x) = P(구간 t에 완료 | 구간 t까지 안 완료)
#   이고, 이걸 누적하면 생존함수가 나온다:
#     S(t) = ∏_{k<=t} (1 - h(k))
#     "15분 안에 보충될 확률" = 1 - S(15분)
#   즉 이진 분류기를 **쌓아 시점별 확률 곡선**을 만든다. 헌법 8이 금지한 것은
#   "보충됨/안됨"을 한 번에 맞히는 단일 이진 분류이고, 이건 그것이 아니다.
#
# [중도절단이 여기서 처리된다 — 세계명세 §6.3의 핵심 이론 지점]
#   절단된 작업은 **관측된 구간까지만 y=0으로 넣고 y=1 행을 만들지 않는다.**
#   그래서 "그 이상 걸렸다"는 정보가 손실 없이 들어간다. 절단 행을 아예 버리면
#   오래 걸린 케이스가 표본에서 사라져 리드타임이 낙관 쪽으로 편향될 수 있다.
#   ⚠ 08-26 세계 검증(analysis/09_world_checks.R W-4)이 크기 주장을 교정했다:
#     한때 "SHIFT_END 잠재 리드 = 완료분의 2.1배"라 적었는데 현 세계의 실측은
#     **1.03배**(전체 절단 0.92배)다. 절단의 85%는 SHIFT_END가 아니라
#     LOG_LOST(일부러 심은 로그 유실 — 비정보적)이기도 하다. 그래서 이 세계에선
#     버려도 편향이 작다 — 그래도 버리지 않는 이유는 **원칙**이다: 절단 처리는
#     비용이 0이고, 실데이터에선 절단이 비정보적이라는 보장이 없다.
#
#   실패 시나리오: 절단을 버리고 학습한다 → "5분 안에 90% 보충" 같은 낙관적 곡선이
#   나온다 → 에이전트가 "곧 채워집니다"라고 말한다 → 손님이 15분 기다렸는데 안 온다.
#
# [X에 넣지 않는 것] wait/travel/handling_sec · true_lead_sec.
#   앞의 셋은 리드타임의 구성요소이고(lead = 셋의 합) 뒤는 정답 그 자체다.
#   넣으면 완벽 예측이 되어 아무것도 배우지 않는다. mode1이 CSV에 싣는 이유는
#   진단·검증 전용이며, 이 변환기는 그 칸을 **읽지 않는다**(아래 _FORBIDDEN).
#
# 실행:  python person_period.py            # 변환 + 요약
#        python person_period.py --bins 12  # 구간 수 바꿔보기
# ============================================================================

from __future__ import annotations

import csv
import gzip
import os
import sys

import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
LEAD_PATH = os.path.join(_HERE, "..", "sim", "out", "mode1", "lead_times.csv.gz")
OUT_DIR = os.path.join(_HERE, "out")

# 구간 경계(초). 로그 간격에 가깝게 둔다 — 리드타임이 분~시간 단위인데 꼬리가 길어서,
# 균등 간격(예: 60초마다)으로 자르면 앞쪽에 구간이 몰리고 꼬리에서 표본이 텅 빈다.
# 마지막 경계(inf)는 "그 이상"을 담는 열린 구간.
BIN_EDGES = [0, 60, 120, 240, 480, 900, 1800, 3600, 7200, 14400, 28800, float("inf")]

# X로 쓰면 안 되는 칸 — 결과의 구성요소이거나 정답이다. 코드로 못 박아 실수를 막는다
# (주석으로만 두면 다음 사람이 features 목록에 넣는다).
_FORBIDDEN = {"wait_sec", "travel_sec", "handling_sec", "true_lead_sec",
              "duration_sec", "event", "censor_reason", "task_id"}

# 예측 시점에 알 수 있는 것만. mode1의 주석과 같은 집합이다.
FEATURES_CAT = ["path_type", "l2"]          # 범주형 → one-hot
FEATURES_NUM = ["hour", "dow", "qlen"]      # 수치형 (hour/dow는 순환, qlen은 로그 변환)
# qlen을 log1p로 넣는 이유: 큐 효과가 강하게 비선형이다. 대기 0→10의 체감은 크고
# 150→160은 거의 같은데, 원시값을 선형 항으로 넣으면 모델이 그 둘을 같은 기울기로
# 본다. log1p(x)=log(1+x)는 0을 0으로 보내면서 큰 값을 눌러 그 체감 곡선을 맞춘다.
# (실측: 원시값만 넣었을 때 보정이 중간 구간에서 예측 65% vs 실제 78%로 어긋났다.)

# ── 큐의 구성 (08-25 추가) ──────────────────────────────────────────────────
# [왜] `qlen`은 건수만 센다. 대기시간을 정하는 것은 건수가 아니라 **일의 양**이다.
#   `hazard_link.py` 전량 실행이 이 자리를 지목했다 — 링크를 logit↔cloglog로 바꿔도
#   (+6.9%p ↔ +15.0%p), 능선을 1e-6~100으로 흔들어도 보정 편향이 안 사라졌다.
#   링크도 정칙화도 설명이 아니면 남는 것은 **공변량 부족**이다.
#
# [무엇] mode1이 새로 적는 넷:
#   q_vertical / q_horizontal / q_floor  큐에 든 작업들의 경로유형별 건수
#   q_work_sec                           그 작업들의 **예상 소요 합**(초, 기댓값)
#
#   앞의 셋과 qlen은 합이 같으므로(구성비) **완전공선**이다. 그래서 q_floor를 뺀다
#   — 기준 범주(reference category)를 하나 두는 더미 코딩의 정석이고, 남는 계수는
#   "FLOOR 대비" 로 읽힌다. 능선이 있어 안 빼도 수렴은 하지만, 계수 해석이 무너진다.
#
# [누출 아님] q_work_sec는 **기댓값**이다 — E[하역]=K·θ. 앞 작업들이 실제로 얼마나
#   걸렸는지(wait_sec 등)는 예측 시점에 존재하지 않으므로 쓰지 않는다(_FORBIDDEN).
FEATURES_QUEUE = ["q_vertical", "q_horizontal"]     # q_floor는 기준 범주로 제외
Q_WORK = "q_work_sec"
# q_work_sec도 log1p로 넣는다 — qlen과 같은 이유(체감의 비선형)이고, 단위가 초라
# 원시값이 수천~수만이라 선형 항으로는 다른 계수들과 스케일이 3~4자리 벌어진다.

# ── 시간에 따라 변하는 효과 (08-25 추가) ────────────────────────────────────
# [무엇을 가정하고 있었나] 지금까지의 모형은 공변량이 기저 해저드를 **일정 배율**로
#   민다고 가정했다. logit이면 오즈에 일정 배, cloglog면 해저드에 일정 배 —
#   이름은 달라도 "그 배율이 **구간마다 같다**"는 점은 똑같다.
#   생존분석에서 이 가정을 **비례성**(proportionality)이라 부른다.
#
# [왜 우리 자료에서 깨지나] 리드타임 = 대기 + 이동 + 하역이고, 이동은 경로유형이
#   정하는 **상수**다(VERTICAL 40초 · HORIZONTAL/FLOOR 수백초). 상수만큼 통째로
#   밀린 분포는 배율로 표현되지 않는다 — 해저드의 **모양** 자체가 유형마다 다르다.
#   큐도 같다: 대기가 길면 **앞쪽 구간에서만** 완료가 막힌다. 뒤쪽 구간에 가서는
#   큐가 길든 짧든 이미 일이 시작됐으므로 효과가 옅어진다.
#
# [해법] 구간더미와 곱한 항(상호작용)을 넣어 **구간마다 다른 기울기**를 허용한다.
#   bin_0을 기준으로 두고 나머지 10구간에만 넣는다(안 그러면 완전공선).
#
# [실측 — 무엇이 얼마나 줄였나] 보정 중간대역 편차:
#     기준(상호작용 없음)                +5.5%p   Brier 0.05597
#     + log_qlen x bin                  +4.2%p   Brier 0.05048
#     + log_q_work x bin                +5.0%p   Brier 0.05160
#     + path_type x bin                 +6.5%p   Brier 0.05436  ← 혼자서는 **악화**
#     + 넷 전부                          +2.6%p   Brier 0.04901
#   path_type만 넣으면 Brier는 좋아지는데 중간대역 편향은 나빠진다.
#   **두 지표가 다른 것을 재고 있다는 증거**다(전체 제곱오차 vs 특정 대역의 계통 편차).
#   우리가 지키기로 한 것은 뒤쪽이다 — 헌법 8은 "그 확률값이 맞아야 한다"이지
#   "평균적으로 덜 틀려야 한다"가 아니다. 그래서 **넷을 함께** 넣는다.
FEATURES_INTERACT = ["log_qlen", "log_q_work", "log_travel",
                     "path_type=HORIZONTAL", "path_type=VERTICAL"]


# ── 매대 거리 (08-26 추가 — R 검증 B-5가 찾은 누락 특징) ─────────────────────
# [발견 경위] "규칙 세계에서 공변량을 다 넣으면 SKU 수준 frailty는 0이어야
#   한다"는 검사(coxme)에서 theta=0.121이 남았다. 추적하니 **이동시간이
#   (SKU, 경로)별 완전 상수인데(조합 내 표준편차 0.00초) SKU 간에는 sd 27초로
#   퍼져** 있었다 — 모델은 path_type 3단계만 알고, 매대가 입고구에서 얼마나
#   먼지는 몰랐다. 그 SKU별 상수가 고스란히 frailty로 잡힌 것이다.
#
# [이것은 누출이 아니다 — travel_sec이 _FORBIDDEN인 것과 모순되지 않는다]
#   _FORBIDDEN의 travel_sec은 **이 작업의 실현값**이다(리드타임의 구성요소).
#   여기서 쓰는 것은 (SKU, 경로)별 **상수** — 매장 도면이 정하는 기하량이라
#   작업이 시작되기 전에 알 수 있다. 두 값이 수치로 같은 이유는 시뮬 세계의
#   이동이 결정적이기 때문이고, 그래서 아래 가드가 **조합 내 sd = 0**을
#   강제한다: sd가 0이 아니면 이것은 기하가 아니라 실현값이므로 거부한다.
#   (배포에서는 이 표가 백엔드 locations 좌표에서 계산된다 — 같은 기하량.)
def travel_lookup(tasks):
    """(sku_id, path_type) → 이동시간 상수. 기하량임을 sd=0 가드로 증명한다."""
    acc = {}
    for t in tasks:
        k = (t["sku_id"], t["path_type"])
        acc.setdefault(k, []).append(float(t["travel_sec"]))
    out = {}
    for k, v in acc.items():
        arr = np.asarray(v)
        if arr.std() > 1e-9:
            raise SystemExit(
                f"travel이 {k}에서 상수가 아닙니다(sd={arr.std():.3f}) — "
                "기하량 가정이 깨졌으므로 이 특징을 쓸 수 없습니다.")
        out[k] = float(arr[0])
    return out


def load_tasks(path=LEAD_PATH) -> list[dict]:
    if not os.path.exists(path):
        raise SystemExit(f"입력이 없습니다: {path}\n  먼저 sim/mode1.py를 돌리세요.")
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def bin_of(sec: float, edges=BIN_EDGES) -> int:
    """초를 구간 번호로. edges[i] <= sec < edges[i+1] 이면 i."""
    for i in range(len(edges) - 1):
        if edges[i] <= sec < edges[i + 1]:
            return i
    return len(edges) - 2


def _cyc(v: float, period: float) -> tuple[float, float]:
    """순환 변수를 (sin, cos) 두 축으로. 23시와 0시가 붙어 있음을 모델에 알린다.

    hour를 0~23 정수로 그냥 넣으면 모델은 23과 0이 **가장 먼 값**이라고 배운다
    (거리 23). 실제로는 한 시간 차이다. sin/cos로 원 위에 올리면 그 인접성이
    좌표에 들어간다. 요일도 같다(일요일과 월요일).
    """
    a = 2.0 * np.pi * v / period
    return float(np.sin(a)), float(np.cos(a))


def build(tasks: list[dict], edges=BIN_EDGES, lookup=None):
    """person-period 긴 표를 만든다.

    반환: (X, y, groups, colnames)
      X       : (N, D) 설계행렬 — 구간 더미 + 공변량
      y       : (N,)  이 구간에 완료했으면 1
      groups  : (N,)  task 인덱스 — 같은 작업의 행끼리 묶는다(교차검증에서 분리 단위)
    """
    n_bins = len(edges) - 1

    # 범주형 값 목록을 먼저 모아 one-hot 열 순서를 고정한다(재현성).
    cats = {c: sorted({t[c] for t in tasks}) for c in FEATURES_CAT}

    # 새 칸이 있는 파일인지 먼저 본다. 없는 옛 CSV로 돌리면 KeyError가 루프 한복판에서
    # 터져 원인이 안 보이므로, 여기서 한 번에 잡아 무엇을 다시 돌려야 하는지 말해 준다.
    missing = [c for c in FEATURES_QUEUE + [Q_WORK] if c not in tasks[0]]
    if missing:
        raise SystemExit(f"lead_times.csv.gz에 칸이 없습니다: {missing}\n"
                         f"  sim/mode1.py를 다시 돌리세요 (python mode1.py --full).")

    cols = ([f"bin_{i}" for i in range(n_bins)]
            + ["hour_sin", "hour_cos", "dow_sin", "dow_cos", "qlen", "log_qlen"]
            + FEATURES_QUEUE + ["log_q_work", "log_travel"]
            + [f"{c}={v}" for c in FEATURES_CAT for v in cats[c]]
            # 상호작용은 **맨 뒤**에 붙인다. 앞쪽 열 순서를 건드리면 hazard.py의
            # `rows[:, :n_bins] = np.eye(n_bins)` 같은 위치 기반 코드가 조용히 깨진다.
            + [f"bin_{b}*{nm}" for nm in FEATURES_INTERACT for b in range(1, n_bins)])
    # 상호작용 값을 만들 때 쓸 위치. 본 열이 다 만들어진 뒤에 잡는다.
    _ip = {c: i for i, c in enumerate(cols)}
    inter_src = [_ip[nm] for nm in FEATURES_INTERACT]

    rows, ys, grp = [], [], []
    for gi, t in enumerate(tasks):
        dur = float(t["duration_sec"])
        event = t["event"] == "1"
        last = bin_of(dur, edges)

        hs, hc = _cyc(float(t["hour"]), 24.0)
        ds, dc = _cyc(float(t["dow"]), 7.0)
        qlen = float(t["qlen"])
        log_qlen = float(np.log1p(qlen))
        q_vec = [float(t[c]) for c in FEATURES_QUEUE]
        log_q_work = float(np.log1p(float(t[Q_WORK])))
        # 매대 거리 — travel_lookup()이 기하량(상수)임을 가드로 증명한 값
        log_travel = float(np.log1p(lookup[(t["sku_id"], t["path_type"])]))
        cat_vec = [1.0 if t[c] == v else 0.0 for c in FEATURES_CAT for v in cats[c]]

        # 구간 0..last 까지 한 행씩. 마지막 구간의 y는 완료(event)면 1, 절단이면 0.
        for b in range(last + 1):
            bin_dummy = [0.0] * n_bins
            bin_dummy[b] = 1.0
            main = (bin_dummy + [hs, hc, ds, dc, qlen, log_qlen]
                    + q_vec + [log_q_work, log_travel] + cat_vec)
            # 이 행은 구간 b에 있으므로, b가 1 이상일 때만 그 자리의 상호작용이 켜진다.
            # (bin_0은 기준 구간이라 상호작용 열을 아예 안 만든다 — 위 cols 참조.)
            inter = [0.0] * (len(FEATURES_INTERACT) * (n_bins - 1))
            if b >= 1:
                for k, si in enumerate(inter_src):
                    inter[k * (n_bins - 1) + (b - 1)] = main[si]
            rows.append(main + inter)
            ys.append(1.0 if (b == last and event) else 0.0)
            grp.append(gi)

    return np.asarray(rows, dtype=np.float32), np.asarray(ys, dtype=np.float32), \
        np.asarray(grp, dtype=np.int32), cols


def survival_from_hazard(h: np.ndarray) -> np.ndarray:
    """구간별 해저드 h(0..K-1) → 생존함수 S(0..K-1). S(t) = ∏_{k<=t}(1-h(k)).

    `np.cumprod`가 그 누적곱이다. 반환 S[t]는 "구간 t까지 아직 안 채워졌을 확률"이라,
    "구간 t 안에 채워질 확률"은 1 - S[t]다 — 도구가 손님에게 말할 값.
    """
    return np.cumprod(1.0 - h)


def main():
    edges = BIN_EDGES
    if "--bins" in sys.argv:
        k = int(sys.argv[sys.argv.index("--bins") + 1])
        hi = np.geomspace(60, 28800, k - 1)
        edges = [0] + [float(x) for x in hi] + [float("inf")]

    tasks = load_tasks()
    lookup = travel_lookup(tasks)
    X, y, g, cols = build(tasks, edges, lookup)

    n_task = len(tasks)
    n_cens = sum(1 for t in tasks if t["event"] == "0")
    os.makedirs(OUT_DIR, exist_ok=True)
    # 거리 표도 함께 저장 — 출하(hazard_ship)가 번들에 싣고 서빙(infer)이
    # (sku, path)로 조회한다. 배포에서는 locations 좌표에서 같은 값이 나온다.
    tk = np.array([k[0] for k in lookup], dtype=np.int64)
    tp = np.array([k[1] for k in lookup])
    tv = np.array([lookup[k] for k in lookup], dtype=np.float32)
    np.savez_compressed(os.path.join(OUT_DIR, "person_period.npz"),
                        X=X, y=y, groups=g, cols=np.array(cols),
                        travel_sku=tk, travel_path=tp, travel_sec=tv)

    print("=" * 70)
    print("person-period 변환 완료")
    print("=" * 70)
    print(f"작업 {n_task:,}건 (절단 {n_cens:,} = {n_cens/n_task:.1%})")
    print(f"→ person-period 행 {len(y):,} (작업당 평균 {len(y)/n_task:.1f} 구간)")
    print(f"→ 설계행렬 {X.shape} · 사건 발생 행 {int(y.sum()):,} ({y.mean():.2%})")
    print(f"→ 구간 {len(edges)-1}개: {[int(e) if e != float('inf') else 'inf' for e in edges]}")
    print(f"\n금지 칸이 X에 없는지 검산: ", end="")
    leaked = [c for c in cols if any(f in c for f in _FORBIDDEN)]
    print("누출 없음 OK" if not leaked else f"!! 누출 {leaked}")
    print(f"저장 → {os.path.join(OUT_DIR, 'person_period.npz')}")
    print("\n[다음] 이 X·y로 구간별 해저드를 학습하고(로지스틱 등),")
    print("       survival_from_hazard()로 시점별 확률 곡선을 만든다(헌법 8).")


if __name__ == "__main__":
    main()
