# ============================================================================
# 모드 1 DES — 도착 발생기 (비동차 포아송 + thinning)
# ============================================================================
# [무엇] 회원의 방문 시각을 뽑는다. 강도 λ(t)가 시각·요일로 변하므로 균일 간격
#   공식을 못 쓴다 → **thinning(솎아내기)** 으로 비동차 포아송 표본을 만든다.
#
# [thinning의 원리] 상한 λ_max로 **균일하게** 후보 시각을 잔뜩 뽑고, 각 후보를
#   λ(t)/λ_max 확률로 남긴다. 남은 것이 정확히 강도 λ(t)를 따르는 포아송 표본이다.
#   왜 맞나 — 균일 후보는 λ_max 강도의 포아송이고, 각 점을 p(t)=λ(t)/λ_max로 남기면
#   결과 강도가 λ_max·p(t)=λ(t)가 된다(포아송의 thinning 정리). 매대 상태는 모른다.
# ============================================================================

from __future__ import annotations

import numpy as np

import params as P


def hour_intensity(hour: int) -> float:
    """영업시간 내 시각별 상대 강도. 영업 밖은 0(방문 없음)."""
    if hour < P.HOUR_OPEN or hour >= P.HOUR_CLOSE:
        return 0.0
    return P.HOUR_PROFILE.get(hour, 0.5)


def day_multiplier(dow: int) -> float:
    """요일 배율(월=0 … 일=6). 주말이 크다."""
    return P.DOW_MULT[dow % 7]


def sample_visit_offsets(rng: np.random.Generator, expected_visits: float,
                         window_days: int, base_date_ordinal: int) -> list[float]:
    """한 회원의 방문 시각들을 이력 창 안에서 뽑아 **일(day) 오프셋 실수** 목록으로 준다.

    반환값은 [0, window_days) 범위의 실수(예: 3.53 = 창 시작 +3일 12:43).
    호출부(mode1)가 이걸 실제 timestamp로 바꾼다.

    [알고리즘]
      1. 하루 안의 시각 강도 λ_max(=HOUR_PROFILE 최댓값)와 요일 최대배율로 상한을 잡는다.
      2. 기대 방문수에 맞는 총 후보를 균일하게 뿌린다(상한 강도의 포아송).
      3. 각 후보를 (그 시각의 시간강도 × 그날 요일배율)/상한 확률로 남긴다(thinning).
    이렇게 하면 방문이 점심·저녁·주말에 몰린다 — 균일 난수 몇 줄로는 못 만드는 성질.
    """
    hmax = max(P.HOUR_PROFILE.values())
    dmax = max(P.DOW_MULT)
    lam_max = hmax * dmax                          # 후보를 뿌릴 상한 강도

    # 남는 비율(accept rate)의 평균을 미리 보정해 기대 방문수를 맞춘다.
    # 평균 accept = E[hour]·E[dow] / (hmax·dmax) 근사 → 후보 수를 그만큼 키운다.
    mean_hour = np.mean(list(P.HOUR_PROFILE.values()))
    mean_dow = np.mean(P.DOW_MULT)
    accept_rate = (mean_hour * mean_dow) / lam_max
    n_cand = int(np.ceil(expected_visits / max(accept_rate, 1e-6)))
    if n_cand <= 0:
        return []

    # 후보 시각(일 오프셋 실수)을 균일하게 뿌린다.
    cand = rng.uniform(0.0, window_days, size=n_cand)
    cand.sort()

    kept = []
    for off in cand:
        day = int(off)
        frac = off - day                            # 하루 안 위치(0~1)
        hour = int(P.HOUR_OPEN + frac * (P.HOUR_CLOSE - P.HOUR_OPEN))
        dow = (base_date_ordinal + day) % 7
        lam = hour_intensity(hour) * day_multiplier(dow)
        if rng.random() < lam / lam_max:            # thinning: 확률적으로 남긴다
            # 방문 시각 = 그 시각(hour) + 분 단위 흔들기. 하루 오프셋 실수로 되돌린다.
            kept.append(day + (hour + rng.random()) / 24.0)
    return kept
