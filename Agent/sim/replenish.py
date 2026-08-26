# ============================================================================
# 모드 1 DES — 보충 대기행렬 (직원 = 서버)
# ============================================================================
# [무엇] 매대가 par(min_qty) 밑으로 떨어지면 보충 작업이 큐에 들어가고, 직원이 비면
#   처리한다. 리드타임 = 대기(큐) + 이동(경로 유형) + 하역(감마). 이 리드타임의
#   '분포'가 가용예측 자산이 배우는 것이다.
#
# [왜 대기행렬인가] 리드타임이 상수면 배울 게 없다. 직원이 바빠 **대기가 쌓이는
#   동학**이 있어야 "지금 결품인데 언제 오나"의 분포가 생긴다. 직원 수는 결품 도달률
#   70~90%에 맞춰 조정한다(세계명세 §7 — 이 값이 검증 루프의 핵심 손잡이).
#
# [M/M/c 근사] 층마다 서버 c명. 작업이 도착하면 가장 먼저 비는 서버에 붙인다.
#   서버의 '다음 빈 시각'만 들고 있으면 대기시간이 계산된다 — 힙에 직원을 넣지 않아도
#   시각순 처리에서 자연히 큐가 형성된다.
#
# [중도절단] 관측 창(270일) 끝까지 RESTOCK_IN이 안 온 작업은 리드타임을 모른다.
#   버리면 리드타임이 낙관 쪽으로 크게 편향된다 — 이 처리가 가용예측 학습의 핵심
#   이론 지점(세계명세 §6.3). 창 종료 시 미완 작업을 censored=True로 남긴다.
# ============================================================================

from __future__ import annotations

from datetime import datetime, timedelta

import numpy as np

import params as P


def shift_to_open(epoch: float) -> float:
    """영업시간(HOUR_OPEN~HOUR_CLOSE) 밖이면 다음 개점 시각으로 민다.

    왜 필요한가 — 야간 보충 인력이 없다. 저녁 늦게 결품이 나면 그 보충은 **다음 날
    아침**에야 시작된다. 이 규칙이 두 가지를 만든다: ① 리드타임 분포의 **긴 꼬리**
    (저녁 결품 = 밤새 대기, 세계명세 §7의 필수 성질) ② 관측 창 끝의 **중도절단**
    (마지막 날 저녁 작업은 다음 날 = 창 밖에서 끝나므로 리드타임 미상, §6.3).
    데모로도 "저녁에 품절이면 내일 아침 들어와요"가 성립한다.
    """
    dt = datetime.fromtimestamp(epoch)
    if dt.hour >= P.HOUR_CLOSE:
        nxt = (dt + timedelta(days=1)).replace(hour=P.HOUR_OPEN, minute=0, second=0, microsecond=0)
        return nxt.timestamp()
    if dt.hour < P.HOUR_OPEN:
        return dt.replace(hour=P.HOUR_OPEN, minute=0, second=0, microsecond=0).timestamp()
    return epoch


class StaffPool:
    """층별 직원 풀. 각 층에 c명, 각자 '다음 빈 시각'을 든다.

    배정 규칙: 작업이 시각 t에 도착하면 그 층에서 가장 먼저 비는 직원에게 준다.
      start = max(t, 그 직원의 다음 빈 시각)   ← 대기 = start - t
      finish = start + 이동 + 하역
      그 직원의 다음 빈 시각 = finish
    """

    def __init__(self, floors, rng: np.random.Generator):
        # 매장 전체 한 풀 — floors 인자는 하위호환용으로 받되 무시한다(직원은 전역).
        # 각 직원의 '다음 빈 시각'. 처음엔 전부 0(자유). 층 구분 없이 한 큐로 밀린다 —
        # 극저밀도 인력이 매장 전체를 돌므로, 층별 독립 큐로 나누면 실제보다 여유롭다.
        self.free = np.zeros(P.N_STAFF_TOTAL)
        self.rng = rng

    def assign(self, t: float, floor: int, travel_sec: float, handling_mult: float = 1.0):
        """작업 하나를 배정하고 (start, finish, wait_sec, handling_sec)을 돌려준다.

        floor: 이동시간(travel_sec) 계산에만 쓰였고 풀 선택엔 안 쓴다(전역 풀).
        handling_mult: 깊은 보충(다량 운반)이면 하역을 늘려 꼬리를 키운다.
        """
        pool = self.free
        i = int(np.argmin(pool))            # 가장 먼저 비는 직원
        start = shift_to_open(max(t, float(pool[i])))   # 영업시간 밖이면 다음 개점으로
        wait = start - t
        handling = float(self.rng.gamma(P.HANDLING_GAMMA_K, P.HANDLING_GAMMA_THETA)) * handling_mult
        finish = start + travel_sec + handling
        pool[i] = finish
        return start, finish, wait, handling

    def free_at(self, close_epoch: float) -> None:
        """교대 종료로 작업을 포기했을 때, 그 직원을 폐점 시각에 풀어준다.

        포기한 작업의 finish까지 직원을 붙잡아두면(원래 pool 값) 다음 날 그 직원이
        허공에서 일하는 셈이 되어 가동률이 과대 계산된다. 교대는 폐점에 끝난다.
        """
        i = int(np.argmax(self.free))       # 가장 늦게까지 잡혀 있는 = 방금 배정된 직원
        if self.free[i] > close_epoch:
            self.free[i] = close_epoch


def close_epoch_of(epoch: float) -> float:
    """그 날의 폐점 시각(에폭). 교대 경계 판정에 쓴다."""
    dt = datetime.fromtimestamp(epoch)
    return dt.replace(hour=P.HOUR_CLOSE, minute=0, second=0, microsecond=0).timestamp()


def travel_seconds(tier_from: str, floor_from: int, floor_to: int,
                   dist_cells: float) -> tuple[float, str]:
    """보충 이동시간과 경로 유형을 돌려준다. 유형이 셋으로 갈려야 가용예측이 산다(§8-①).

    - 수직(VERTICAL): 같은 랙 BULK→PICK 위아래. 이동 거의 없음(고정 소요).
    - 수평(HORIZONTAL): 같은 층 다른 지점. 거리/보행속도.
    - 층간(FLOOR): 무빙워크 페널티 + 수평 이동.
    """
    if floor_from == floor_to and tier_from == "BULK":
        return float(P.BACKROOM_VERTICAL_SEC), "VERTICAL"
    horiz = dist_cells * P.CELL_METERS / P.WALK_SPEED_MPS
    if floor_from != floor_to:
        return horiz + P.FLOOR_CHANGE_SEC, "FLOOR"
    return horiz, "HORIZONTAL"
