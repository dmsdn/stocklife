# ============================================================================
# 모드 1 DES — 시계와 이벤트 큐 (순수 엔진)
# ============================================================================
# [이산사건의 심장] 시간을 1초씩 흘리지 않고, "다음에 일어날 사건"으로 건너뛴다.
#   최소 힙(min-heap)으로 정렬된 이벤트 큐가 그 점프를 O(log n)에 해준다.
#
# [순수함] 이 파일은 **도메인을 모른다.** 판매·보충이 뭔지 모르고, "시각순으로
#   사건을 꺼내 등록된 핸들러에 넘긴다"만 한다. 도메인은 mode1.py가 핸들러로 주입.
#   왜 이렇게 나누나 — 모드 2(데모 실시간)가 같은 엔진을 재사용해야 하는데, 그때
#   달라지는 건 "사건을 어떻게 처리하고 어디로 내보내나"(핸들러·출력)뿐이고 시계·큐는
#   똑같기 때문이다. 엔진을 순수하게 두면 모드 2는 핸들러만 갈아 끼우면 된다.
#
# [헌법 3] 규칙 기반. 모델 출력을 참조하지 않는다. infer.py를 import하지 않는다.
# ============================================================================

from __future__ import annotations

import heapq
from dataclasses import dataclass, field


@dataclass(order=True)
class _Item:
    """힙에 들어가는 한 칸. 정렬 키는 (시각, 시퀀스)뿐이고 payload는 비교 대상이 아니다.

    왜 시퀀스(seq)가 필요한가 — 같은 시각(밀리초)에 두 사건이 겹치면 파이썬 힙이
    payload를 비교하려 들다 TypeError를 낸다(dict·객체는 < 정의가 없다). seq를
    2번째 키로 두면 tie가 **결정적으로** 갈리고(먼저 넣은 것이 먼저), 비교가 payload에
    닿지 않는다. field(compare=False)가 그 "비교 제외"를 건다.
    """
    t: float                                   # 발생 시각(에폭 초, 밀리초 소수부 포함)
    seq: int                                   # tie-break — 삽입 순서
    kind: str = field(compare=False)           # 이벤트 종류(핸들러 키)
    data: object = field(compare=False, default=None)   # 임의 payload


class Engine:
    """이벤트 큐를 돌리는 순수 시계.

    사용법:
        eng = Engine()
        eng.on("VISIT", handle_visit)          # 종류별 핸들러 등록
        eng.schedule(t0, "VISIT", payload)     # 초기 사건 투입
        eng.run(until=t_end)                   # 시각순으로 소진
    핸들러는 (engine, data)를 받고, 필요하면 engine.schedule(...)로 새 사건을 건다.
    """

    def __init__(self):
        self._heap: list[_Item] = []
        self._seq = 0
        self._handlers: dict[str, callable] = {}
        self.now: float = 0.0          # 현재 시각(마지막으로 꺼낸 사건의 시각)
        self.n_processed = 0

    def on(self, kind: str, handler) -> None:
        """이벤트 종류에 핸들러를 건다. 같은 종류를 두 번 걸면 나중 것이 이긴다."""
        self._handlers[kind] = handler

    def schedule(self, t: float, kind: str, data=None) -> None:
        """시각 t에 사건을 예약한다. 과거로 예약하면 버그이므로 막는다.

        과거 예약을 허용하면 이미 지나간 시점의 재고를 바꾸게 되어 인과가 깨진다
        (예: 지금이 15시인데 14시에 매대를 채워버림). 그 순간 학습 데이터가 조용히
        오염되므로, 값으로 넘기지 않고 즉시 터뜨린다.
        """
        if t < self.now - 1e-9:
            raise ValueError(f"과거로 예약 불가: t={t} < now={self.now} ({kind})")
        self._seq += 1
        heapq.heappush(self._heap, _Item(t, self._seq, kind, data))

    def run(self, until: float) -> None:
        """until까지의 사건을 시각순으로 전부 처리한다.

        until을 넘는 사건은 힙에 남겨둔 채 멈춘다 — 이것이 **관측 창의 끝**이고,
        아직 안 끝난 보충 작업이 여기서 중도절단(censoring)된다(replenish가 처리).
        """
        while self._heap and self._heap[0].t <= until:
            item = heapq.heappop(self._heap)
            self.now = item.t
            h = self._handlers.get(item.kind)
            if h is None:
                raise KeyError(f"핸들러 없는 이벤트: {item.kind}")
            h(self, item.data)
            self.n_processed += 1

    def pending(self) -> int:
        """아직 처리되지 않고 힙에 남은 사건 수(창 종료 후 = 중도절단 후보 규모)."""
        return len(self._heap)
