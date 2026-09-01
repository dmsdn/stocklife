# ============================================================================
# 모드 1 DES — 회원 소비상태 → 장바구니
# ============================================================================
# [무엇] 방문한 회원의 장바구니를 그 회원의 **소비 상태**에서 만든다. 무작위가 아니라
#   "각 습관 품목이 주기가 다 됐나"로 담는다 — 소비주기 자산이 배우려는 게 정확히
#   이 '간격의 분포'다. 무작위로 뿌리면 간격이 지수분포가 되어 배울 게 없다.
#
# [세 겹의 결정 요인]
#   ① 품목 기본주기(생수 10일·세제 60일 …) — params.cycle_days_for_l2
#   ② 축배율 — 반려/자녀/대가구가 특정 카테고리 주기를 당긴다(자주 소비)
#   ③ 은닉 frailty — **(회원, SKU) 쌍마다** 독립인 관측 불가 편차(아래 for 루프 안에서
#      쌍마다 따로 뽑는다). 모델이 이걸 못 봐야 정확도가 현실적이 되고
#      "합성이라 99% 나온다" 비판을 피한다(세계명세 §8-④).
#      ⚠ 「회원별」이 아니다. 같은 사람이 물티슈는 빨리 쓰고 라면은 느리게 쓰며 둘 사이에
#        상관이 없다. **이 한 줄이 학습 설계를 가른다** — 회원별이었다면 습관 SKU
#        18~40개의 이력을 합쳐 추정하므로 관측이 두꺼워지지만, 실제로는 쌍마다 평균
#        3.7개뿐이라 관측 1개의 신뢰 무게가 0.35에 그친다. 소비주기에서 경험적 베이즈
#        축소가 (a)와 같아진 원인의 절반이 여기 있다(모델대조표 §7.1).
#
# [취향의 흔적] members 테이블엔 취향 컬럼이 없다(§members_gen). 여기서 회원마다
#   습관 SKU 집합을 취향·축 가중으로 뽑아 **이력에 흔적으로만** 남긴다. 그 흔적에서
#   취향을 복원하는 게 취향매칭 자산의 일이다. 이 파일은 이벤트 스케줄을 모른다.
# ============================================================================

from __future__ import annotations

import numpy as np

import params as P

# catalog row 컬럼 인덱스(catalog.generate() 반환 형식)
SKU, NAME, BRAND, IS_PB, L1, L2, UNIT, PRICE = 0, 2, 3, 4, 5, 6, 11, 12


class MemberState:
    """한 회원의 소비 상태. 습관 SKU와 그 각각의 '마지막 구매일'을 들고 있다.

    왜 클래스인가 — 방문할 때마다 '경과일'을 갱신해야 해서, 회원별로 살아있는
    상태가 필요하다. 함수만으로는 마지막 구매일을 어딘가 저장해 실어 날라야 한다.
    """

    __slots__ = ("member_id", "hh", "pet", "child", "car",
                 "habits", "cycle", "last_day", "frailty")

    def __init__(self, member_id, hh, pet, child, car,
                 habits, cycle, frailty):
        self.member_id = member_id
        self.hh, self.pet, self.child, self.car = hh, pet, child, car
        self.habits = habits          # list[sku] — 늘 사는 품목
        self.cycle = cycle            # dict sku -> 개인화된 주기(일)
        self.frailty = frailty        # dict sku -> 곱 배율(은닉 편차)
        self.last_day = {}            # sku -> 마지막 구매일. build_member_state가 채운다


def _axis_mult(l2: str, pet: bool, child: bool, hh: int) -> float:
    """축이 이 소분류의 주기에 거는 배율. 여러 축이 겹치면 곱한다."""
    m = 1.0
    if pet:
        for key in ("반려", "펫"):
            if key in l2:
                m *= P.AXIS_CYCLE_MULT.get(f"has_pet_{key}", 1.0)
    if child:
        for key in ("기저귀", "분유", "물티슈"):
            if key in l2:
                m *= P.AXIS_CYCLE_MULT.get(f"has_child_{key}", 1.0)
    if (hh or 0) >= 4:
        for key in ("생수", "라면"):
            if key in l2:
                m *= P.AXIS_CYCLE_MULT.get(f"hh_big_{key}", 1.0)
    return m


def build_member_state(rng: np.random.Generator, member_row, products,
                       l2_by_sku, prefs) -> MemberState:
    """회원 하나의 소비 상태를 결정적으로 만든다.

    prefs: dict l2 -> 선호 가중(0~). 이 회원의 취향. 습관 SKU를 이 가중으로 뽑는다.
    products: 후보 SKU 목록(전체 카탈로그 행). l2_by_sku: sku -> 소분류.
    """
    member_id, hh, pet, child, car, _created = member_row

    # 습관 SKU 뽑기 — 취향 가중 × 축 가중으로 확률을 만들고, 겹치지 않게 표집.
    skus = np.array([p[SKU] for p in products])
    w = np.array([prefs.get(l2_by_sku[p[SKU]], 0.2)
                  * (2.0 if (pet and ("반려" in l2_by_sku[p[SKU]] or "펫" in l2_by_sku[p[SKU]])) else 1.0)
                  * (2.0 if (child and any(k in l2_by_sku[p[SKU]] for k in ("기저귀", "분유"))) else 1.0)
                  for p in products], dtype=float)
    w = w / w.sum()
    n_habit = int(rng.integers(P.HABIT_SKUS_MIN, P.HABIT_SKUS_MAX + 1))
    n_habit = min(n_habit, len(skus))
    habits = rng.choice(skus, size=n_habit, replace=False, p=w).tolist()

    cycle, frailty, last_day = {}, {}, {}
    for s in habits:
        base = P.cycle_days_for_l2(l2_by_sku[s])
        cyc = base * _axis_mult(l2_by_sku[s], pet, child, hh)
        # frailty: 로그정규(평균 1). 이 회원이 이 품목을 유독 자주/드물게 사는 은닉 성향.
        fr = float(np.exp(rng.normal(0.0, P.FRAILTY_SD)))
        cycle[s] = cyc
        frailty[s] = fr
        # 마지막 구매일을 [-cyc, 0) 사이 무작위로 — 첫 방문에 전부 몰리지 않게 위상 분산.
        last_day[s] = -float(rng.uniform(0.0, cyc))

    st = MemberState(member_id, hh, pet, child, car, habits, cycle, frailty)
    st.last_day = last_day
    return st


def basket_at(rng: np.random.Generator, st: MemberState, day: float,
              on_promo=None) -> list[tuple[int, int]]:
    """이 회원이 `day`(창 시작 이후 일수)에 방문했을 때 담는 (sku, qty) 목록.

    담길 확률 = Φ((경과일 − 주기·frailty) / (주기·산포)) — 주기가 다 될수록 1에 가까움.
    담기로 정해지면 수량은 복합 포아송(케이스 덩어리). 담은 품목은 last_day를 갱신.

    on_promo: `(sku, day) -> bool` 또는 None. **세계 버전 축 v2**(DES설계 §10.1).
      None 이면 행사가 수요와 무관하다 — 지금(v1)의 세계다.
      주면 행사 중인 품목의 **유효 주기를 `P.PROMO_CYCLE_MULT` 배**로 줄인다:
      주기가 짧아지면 같은 경과일에서 z 가 커져 담길 확률이 오른다.

      [왜 확률에 직접 더하지 않고 주기를 줄이나] 확률에 상수를 더하면 주기가
      한참 남은 품목까지 같은 폭으로 올라 **"행사면 아무거나 산다"** 가 된다.
      주기를 줄이면 **살 때가 가까워진 사람만** 앞당겨 산다 — 행사가 수요를
      새로 만드는 게 아니라 **시점을 옮긴다**는 것이 우리가 재려는 가설이다.
    """
    from math import erf, sqrt
    basket = []
    for s in st.habits:
        cyc = st.cycle[s] * st.frailty[s]
        # v2 축 — 기본(None)에서는 이 줄이 통째로 건너뛰어진다. 난수 소비 없음.
        if on_promo is not None and on_promo(s, day):
            cyc *= P.PROMO_CYCLE_MULT
        elapsed = day - st.last_day[s]
        if elapsed <= 0:
            continue
        z = (elapsed - cyc) / (cyc * P.CYCLE_SD_FRAC)
        prob = 0.5 * (1.0 + erf(z / sqrt(2.0)))     # 표준정규 CDF Φ(z)
        if rng.random() < prob:
            lam = P.QTY_LAMBDA + (P.QTY_BULK_BOOST if (st.hh or 0) >= 4 else 0.0)
            qty = 1 + int(rng.poisson(lam))         # 최소 1 + 케이스 덩어리
            basket.append((int(s), qty))
            st.last_day[s] = day
    return basket
