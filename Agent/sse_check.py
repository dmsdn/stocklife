# -*- coding: utf-8 -*-
# ============================================================================
# sse_check — 세계 신호가 **실제로 우리에게 닿는가**
# ============================================================================
#   python sse_check.py              구독 → 이벤트 주입 → 도착 확인
#   python sse_check.py --wait 20    기다리는 시간(초)
#
# ⚠ 백엔드가 떠 있어야 한다. 에이전트 서버는 **필요 없다** — 여기서 직접 구독한다.
#
# ─── 왜 이 검사기가 생겼나 (08-28) ──────────────────────────────────────────
# 자발형 자동 검증(`eval/scenario_runner`)은 `runner.fanout()` 에 신호를 **직접**
# 넣는다. 그 이음매를 고른 이유는 좋았다 — LLM·네트워크 없이 판정만 재려고.
# 그런데 그 결과 **fanout 위쪽이 통째로 검증 밖**이었다:
#
#   백엔드 이벤트 → SSE 스트림 → runner._listen_forever → fanout → 감시자 → 예절
#   └────────── 아무도 안 재던 구간 ──────────┘   └── 16/16 로 재던 구간 ──┘
#
# 실제로 08-28에 `GET /internal/events/stream` 이 **500** 을 내고 있었다.
# 시나리오 16/16 · 도구 23/23 · 골든셋 45/45 가 전부 초록인데 **킬링 장면 1은
# 원리적으로 안 나는 상태**였다. 신호가 애초에 안 들어오니까.
#
# > **검사기가 고른 이음매의 위쪽은 검사되지 않는다.** 그 이음매를 고른 이유가
# > 타당해도 마찬가지다 — 타당한 이유로 생긴 사각지대도 사각지대다.
#
# ─── 무엇을 재나 ────────────────────────────────────────────────────────────
# ① 스트림에 붙는가 (200 + `connected`)
# ② 주입한 이벤트가 **그 스트림으로 돌아오는가**
# ③ 우리 감시자가 아는 유형으로 오는가 (`runner.SHELF_EVENTS` 철자 대조)
#
# 발화까지는 안 본다 — 그건 과금이고 `demo_inject` 의 몫이다. 여기는 **배관**만.
# ============================================================================
import argparse
import json
import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import env                                    # noqa: E402
env.use_utf8_stdout()
env.load_env()

from app import config                                 # noqa: E402  ← load_env() 뒤
from app.watchers import runner                        # noqa: E402

STREAM = "/internal/events/stream"


def _headers():
    return {"X-Internal-Service-Key": os.environ.get("INTERNAL_SERVICE_KEY", "")}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wait", type=float, default=15.0)
    ap.add_argument("--sku", type=int, default=None)
    a = ap.parse_args()

    import httpx
    base = config.BACKEND_BASE_URL
    print(f"■ SSE 배관 검사 — {base}{STREAM}")

    got = []
    err = []
    ready = threading.Event()

    def listen():
        """스트림을 붙잡고 오는 것을 모은다. 별도 스레드 — 주입과 동시에 듣는다."""
        try:
            with httpx.stream("GET", base + STREAM, headers=_headers(),
                              timeout=httpx.Timeout(5.0, read=a.wait + 5)) as r:
                if r.status_code != 200:
                    err.append(f"{r.status_code} {r.read().decode('utf-8','replace')[:200]}")
                    ready.set()
                    return
                ready.set()
                name = None
                for line in r.iter_lines():
                    if line.startswith("event:"):
                        name = line.split(":", 1)[1].strip()
                    elif line.startswith("data:"):
                        got.append((name, line.split(":", 1)[1].strip()))
                        if len(got) >= 3:
                            return
        except Exception as e:                                 # noqa: BLE001
            err.append(f"{type(e).__name__}: {e}")
            ready.set()

    th = threading.Thread(target=listen, daemon=True)
    th.start()
    ready.wait(timeout=10)

    if err:
        print(f"  ❌ 붙지 못했다 — {err[0]}")
        print()
        print("  500 이면 백엔드의 `AgentEventStreamController.stream` 을 본다:")
        print("    반환 타입이 `ResponseEntity<?>` 면 그것이 원인이다. Spring 은")
        print("    SseEmitter 를 비동기 반환 타입으로 특별 취급하는데, 와일드카드")
        print("    제네릭으로 감싸면 그 핸들러가 안 잡아 일반 컨버터로 떨어진다.")
        print("    `SseEmitter` 를 그대로 반환하면 된다(같은 저장소의")
        print("    RealtimeController.stream 이 그렇게 돼 있고 정상이다).")
        print("  401 이면 INTERNAL_SERVICE_KEY 가 백엔드와 다르다.")
        return 1

    print("  ✅ ① 스트림에 붙었다")

    # ── 이벤트를 하나 넣는다 ────────────────────────────────────────────────
    # RESTOCK_IN 을 쓴다: 재고를 **올리는** 방향이라 실패해도 세계가 상하지 않는다
    # (SALE 은 내리는 방향이라 빈 매대에서 409 가 나고, 성공하면 재고가 준다).
    sku = a.sku
    if sku is None:
        rows = httpx.get(base + "/internal/replenishment/pending",
                         headers=_headers(), timeout=10).json()
        if not rows:
            print("  ⚠ 보충 대기 큐가 비어 주입할 재료가 없다 — --sku 로 직접 주거나")
            print("     `python demo_inject.py` 로 큐를 본다.")
            return 2
        sku, loc = int(rows[0]["skuId"]), rows[0]["locationId"]
    else:
        loc = None
        inv = httpx.get(base + f"/internal/products/{sku}/inventory",
                        headers=_headers(), timeout=10).json()
        for r in (inv if isinstance(inv, list) else inv.get("locations") or []):
            if (r.get("tierRole") or r.get("tier_role")) == "PICK":
                loc = r.get("locationId") or r.get("location_id")
                break
        if loc is None:
            print(f"  ❌ sku {sku} 의 PICK 자리를 못 찾았다")
            return 2

    body = {"eventType": "RESTOCK_IN", "skuId": sku, "locationId": loc, "qty": 1}
    t0 = time.time()
    r = httpx.post(base + "/internal/events/shelf", json=body,
                   headers=_headers(), timeout=10)
    if r.status_code != 201:
        print(f"  ❌ 주입 실패 {r.status_code} {r.text[:160]}")
        return 1
    print(f"  ✅ ② 주입 — RESTOCK_IN sku={sku} loc={loc}")

    # ── 돌아오나 ────────────────────────────────────────────────────────────
    deadline = t0 + a.wait
    while time.time() < deadline and not any(n != "connected" for n, _ in got):
        time.sleep(0.2)

    real = [(n, d) for n, d in got if n != "connected"]
    if not real:
        print(f"  ❌ {a.wait:.0f}초 안에 아무것도 안 왔다.")
        print("     주입은 201 인데 스트림엔 안 온다 = **발행 쪽이 끊겼다**.")
        print("     `EventBroadcastService.publishToAgent` 가 불리는지,")
        print("     `agentEmitters` 가 비어 있지 않은지 본다.")
        return 1

    print(f"  ✅ ③ 도착 ({time.time() - t0:.1f}초) — {len(real)}건")
    unknown = []
    for n, d in real:
        try:
            payload = json.loads(d)
        except Exception:                                      # noqa: BLE001
            payload = d
        mark = "✅" if n in runner.SHELF_EVENTS or n == runner.ENTRY_EVIDENCE else "⚠"
        if mark == "⚠":
            unknown.append(n)
        print(f"       {mark} {n:16s} {str(payload)[:90]}")

    if unknown:
        print(f"\n  ⚠ 우리 감시자가 모르는 유형: {', '.join(set(unknown))}")
        print("     `watchers/runner.SHELF_EVENTS` 의 철자와 대조하라 —")
        print("     철자가 하나 다르면 그 신호는 **조용히 버려진다.**")
        return 1

    print("\n■ 배관 정상 — 백엔드가 낸 신호가 우리 감시자가 아는 이름으로 닿는다.")
    print("  (발화까지는 여기서 안 본다 — `demo_inject.py` 의 몫이다)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
