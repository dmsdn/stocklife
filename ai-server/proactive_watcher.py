"""StoreFlow ai-server 능동 개입 감시자.

현재 구현: HESITATION_HELP
- Backend의 /internal/events/stream SSE를 상시 구독
- VIEW 반복 + 일정 시간 무행동을 일반 규칙으로 감지
- Backend SoT에서 상품 상세/판매 통계를 조회
- 조건이 충족된 순간에만 Claude를 1회 호출
- /internal/chat/proactive 로 먼저 건 말을 저장/프론트 SSE로 중계

Claude가 매 이벤트마다 '망설임 여부'를 판단하지 않는 것이 핵심이다.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from collections import Counter, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import anthropic
import httpx
from dotenv import load_dotenv

import backend_client

load_dotenv()
log = logging.getLogger(__name__)

# ---- 환경변수로 쉽게 튜닝 ----
PROACTIVE_ENABLED = os.getenv("PROACTIVE_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
PROACTIVE_TICK_SEC = float(os.getenv("PROACTIVE_TICK_SEC", "2"))
HESITATION_WINDOW_SEC = float(os.getenv("HESITATION_WINDOW_SEC", "90"))
HESITATION_IDLE_SEC = float(os.getenv("HESITATION_IDLE_SEC", "12"))
HESITATION_MIN_VIEW_EVENTS = int(os.getenv("HESITATION_MIN_VIEW_EVENTS", "3"))
HESITATION_MIN_DISTINCT_SKUS = int(os.getenv("HESITATION_MIN_DISTINCT_SKUS", "2"))
INTERVENTION_COOLDOWN_SEC = float(os.getenv("INTERVENTION_COOLDOWN_SEC", "90"))
INTERVENTION_MAX_PER_SESSION = int(os.getenv("INTERVENTION_MAX_PER_SESSION", "4"))
SESSION_TTL_SEC = float(os.getenv("PROACTIVE_SESSION_TTL_SEC", "1800"))
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

_anthropic = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


@dataclass
class ViewEvent:
    occurred_at: float
    sku_id: int


@dataclass
class SessionState:
    session_id: str
    member_id: int | None = None
    views: deque[ViewEvent] = field(default_factory=deque)
    last_event_at: float = 0.0
    intervention_count: int = 0
    last_intervention_at: float = 0.0
    topics_done: set[str] = field(default_factory=set)
    evaluating: bool = False


@dataclass(frozen=True)
class InterventionCandidate:
    session_id: str
    member_id: int | None
    topic: str
    sku_ids: tuple[int, ...]


def _now_ts() -> float:
    return datetime.now(timezone.utc).timestamp()


def _parse_time(value: str | None) -> float:
    if not value:
        return _now_ts()
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return _now_ts()


class ProactiveWatcher:
    def __init__(self) -> None:
        self._states: dict[str, SessionState] = {}
        self._stop = asyncio.Event()
        self._client: httpx.AsyncClient | None = None

    async def run(self) -> None:
        if not PROACTIVE_ENABLED:
            log.info("Proactive watcher disabled")
            return
        if not backend_client.INTERNAL_SERVICE_KEY:
            log.warning("INTERNAL_SERVICE_KEY가 없어 proactive watcher를 시작하지 않습니다.")
            return

        timeout = httpx.Timeout(connect=5.0, read=None, write=5.0, pool=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            self._client = client
            log.info("Proactive watcher started")
            await asyncio.gather(self._listen_forever(), self._tick_forever())

    async def stop(self) -> None:
        self._stop.set()

    # 1. 행동 감지 ---------------------------------------------------------
    async def _listen_forever(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            try:
                await self._listen_once()
                backoff = 1.0
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.warning("Backend SSE 연결 실패: %s (%.1fs 뒤 재연결)", exc, backoff)
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=backoff)
                except asyncio.TimeoutError:
                    pass
                backoff = min(backoff * 2, 15.0)

    async def _listen_once(self) -> None:
        assert self._client is not None
        url = backend_client.BACKEND_BASE + "/internal/events/stream"
        headers = {"X-Internal-Service-Key": backend_client.INTERNAL_SERVICE_KEY}

        async with self._client.stream("GET", url, headers=headers) as response:
            response.raise_for_status()
            log.info("Backend SSE connected: %s", url)

            event_name: str | None = None
            data_lines: list[str] = []
            async for line in response.aiter_lines():
                if self._stop.is_set():
                    return
                if line == "":
                    if event_name and data_lines:
                        raw = "\n".join(data_lines)
                        try:
                            data = json.loads(raw)
                        except json.JSONDecodeError:
                            log.debug("SSE JSON parse skip: %r", raw)
                        else:
                            self.on_event(event_name, data)
                    event_name = None
                    data_lines = []
                    continue
                if line.startswith(":"):
                    continue
                if line.startswith("event:"):
                    event_name = line[6:].strip()
                elif line.startswith("data:"):
                    data_lines.append(line[5:].strip())

    def on_event(self, event_type: str, data: dict[str, Any]) -> None:
        if event_type == "connected":
            return
        session_id = data.get("sessionId")
        if not session_id:
            return

        state = self._states.setdefault(session_id, SessionState(session_id=session_id))
        occurred_at = _parse_time(data.get("occurredAt"))
        state.last_event_at = max(state.last_event_at, occurred_at)
        if data.get("memberId") is not None:
            state.member_id = int(data["memberId"])

        sku_id = data.get("skuId")
        if event_type == "VIEW" and sku_id is not None:
            state.views.append(ViewEvent(occurred_at, int(sku_id)))
            self._trim_views(state, occurred_at)
            return

        # 담았거나 구매했으면 더는 망설임으로 보지 않는다.
        if event_type in {"SCAN_ADD", "PURCHASE"}:
            state.views.clear()
            return

        self._trim_views(state, occurred_at)

    def _trim_views(self, state: SessionState, now: float) -> None:
        cutoff = now - HESITATION_WINDOW_SEC
        while state.views and state.views[0].occurred_at < cutoff:
            state.views.popleft()

    # 2. 개입 규칙 ---------------------------------------------------------
    async def _tick_forever(self) -> None:
        while not self._stop.is_set():
            try:
                await self._evaluate_all()
                self._cleanup_old_sessions()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("proactive rule tick 실패")
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=PROACTIVE_TICK_SEC)
            except asyncio.TimeoutError:
                pass

    async def _evaluate_all(self) -> None:
        now = _now_ts()
        tasks: list[asyncio.Task] = []
        for state in list(self._states.values()):
            candidate = self._hesitation_candidate(state, now)
            if candidate is None:
                continue
            state.evaluating = True
            tasks.append(asyncio.create_task(self._handle_candidate(state, candidate)))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    def _hesitation_candidate(self, state: SessionState, now: float) -> InterventionCandidate | None:
        if state.evaluating:
            return None
        self._trim_views(state, now)
        if len(state.views) < HESITATION_MIN_VIEW_EVENTS:
            return None
        if len({v.sku_id for v in state.views}) < HESITATION_MIN_DISTINCT_SKUS:
            return None
        if now - state.last_event_at < HESITATION_IDLE_SEC:
            return None
        if state.intervention_count >= INTERVENTION_MAX_PER_SESSION:
            return None
        if state.last_intervention_at and now - state.last_intervention_at < INTERVENTION_COOLDOWN_SEC:
            return None

        # 가장 많이 본 상품을 우선하고 동률이면 최근 본 상품을 우선한다.
        counts = Counter(v.sku_id for v in state.views)
        last_seen = {v.sku_id: v.occurred_at for v in state.views}
        ranked = sorted(counts, key=lambda sku: (counts[sku], last_seen[sku]), reverse=True)
        sku_ids = tuple(ranked[:2])
        topic = "hesitation:" + ":".join(map(str, sorted(sku_ids)))
        if topic in state.topics_done:
            return None

        return InterventionCandidate(state.session_id, state.member_id, topic, sku_ids)

    # 3~5. SoT 조회 -> Claude -> 말풍선 -----------------------------------
    async def _handle_candidate(self, state: SessionState, candidate: InterventionCandidate) -> None:
        try:
            context = await asyncio.to_thread(self._load_context, candidate)
            if not context.get("products"):
                return

            message = await asyncio.to_thread(self._generate_message, context)
            if not message:
                return

            result = await asyncio.to_thread(
                backend_client.push_proactive_message,
                candidate.session_id,
                message,
            )
            if not result.get("ok"):
                log.warning("proactive message 저장 실패: %s", result)
                return

            state.intervention_count += 1
            state.last_intervention_at = _now_ts()
            state.topics_done.add(candidate.topic)
            # 같은 VIEW 묶음으로 재개입하지 않도록 비운다.
            state.views.clear()
            log.info("HESITATION_HELP sent session=%s sku=%s", candidate.session_id, candidate.sku_ids)
        except Exception:
            log.exception("proactive candidate 처리 실패 session=%s", candidate.session_id)
        finally:
            state.evaluating = False

    def _load_context(self, candidate: InterventionCandidate) -> dict[str, Any]:
        products: list[dict[str, Any]] = []
        for sku_id in candidate.sku_ids:
            r = backend_client.get_product_detail(sku_id)
            if r.get("ok") and isinstance(r.get("data"), dict):
                products.append(r["data"])

        popularity = None
        r = backend_client.compare_purchase_popularity_internal(list(candidate.sku_ids), lookback_days=90)
        if r.get("ok"):
            popularity = r.get("data")

        return {
            "sessionId": candidate.session_id,
            "memberId": candidate.member_id,
            "products": products,
            "popularity": popularity,
        }

    def _generate_message(self, context: dict[str, Any]) -> str:
        if not os.getenv("ANTHROPIC_API_KEY"):
            # 데모/키 미설정 시에도 규칙 기능 자체는 확인할 수 있게 안전한 폴백.
            names = [p.get("name") or f"상품 {p.get('skuId', '')}" for p in context["products"]]
            if len(names) >= 2:
                return f"{names[0]}와 {names[1]} 중 고민 중이신가요? 두 상품을 비교해드릴까요?"
            return "상품 선택을 고민 중이신가요? 비교를 도와드릴까요?"

        compact_products = []
        for p in context["products"]:
            compact_products.append({
                "skuId": p.get("skuId"),
                "name": p.get("name"),
                "brand": p.get("brand"),
                "priceKrw": p.get("priceKrw"),
                "onPromo": p.get("onPromo"),
                "discountKrw": p.get("discountKrw"),
                "salePriceKrw": p.get("salePriceKrw"),
            })

        prompt = (
            "매장 소비자가 아래 상품들을 반복해서 본 뒤 잠시 행동이 없어 망설임으로 감지됐다. "
            "먼저 말을 걸어도 부담스럽지 않게 한국어 한두 문장으로 도움을 제안하라. "
            "주어진 상품/판매통계에 없는 사실은 만들지 말고, 통계가 없으면 언급하지 마라. "
            "구매를 강요하지 말고 마지막은 비교를 도와드릴까요? 같은 선택권 있는 표현으로 끝내라.\n\n"
            f"상품: {json.dumps(compact_products, ensure_ascii=False)}\n"
            f"최근 90일 판매통계: {json.dumps(context.get('popularity'), ensure_ascii=False)}"
        )
        response = _anthropic.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=160,
            temperature=0.2,
            messages=[{"role": "user", "content": prompt}],
        )
        text_parts = [block.text for block in response.content if getattr(block, "type", None) == "text"]
        return " ".join(text_parts).strip()

    def _cleanup_old_sessions(self) -> None:
        now = _now_ts()
        stale = [sid for sid, s in self._states.items() if s.last_event_at and now - s.last_event_at > SESSION_TTL_SEC]
        for sid in stale:
            self._states.pop(sid, None)
