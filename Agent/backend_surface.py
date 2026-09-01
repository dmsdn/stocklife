# -*- coding: utf-8 -*-
# ============================================================================
# backend_surface — 우리가 부르는 백엔드 창구를 **전부** 찔러 본다
# ============================================================================
#   python backend_surface.py
#
# ⚠ 백엔드가 떠 있어야 한다. 에이전트 서버는 필요 없다.
#
# ─── 왜 생겼나 (08-28) ──────────────────────────────────────────────────────
# `tool_check` 이 23/23 초록이었는데도 자발형이 화면에 한 글자도 안 나왔다.
# 이유는 **도구가 안 타는 창구가 따로 있었기 때문**이다:
#
#   도구 23종이 타는 창구        tool_check 이 잰다        ✅
#   SSE 스트림                   아무도 안 쟀다            → 500 이었다
#   개입 전달(chat/proactive)     아무도 안 쟀다            → 500 이었다
#
# 도구는 **조회·계산**의 입구고, 자발형은 **신호와 전달**이 따로 있다.
# 도구만 재면 자발형의 양 끝(입구·출구)이 통째로 사각지대다.
#
# > 초록불의 개수가 아니라 **어디까지 재는지**가 신뢰의 크기다.
#
# ─── 무엇을 재나 ────────────────────────────────────────────────────────────
# `sot_client._API` 의 전 항목 + 도구 밖 세 곳(SSE 구독 · 매대 이벤트 주입 ·
# 개입 전달). **응답 내용은 안 본다** — 그건 `tool_check` 의 몫이다.
# 여기가 답하는 질문은 하나뿐: **"이 창구가 살아 있나."**
#
# 상태 읽는 법:
#   2xx      살아 있다
#   400/404  **인자 문제일 수도, 창구 부재일 수도** 있다 — 아래 note 를 읽는다
#   401      키 불일치 (INTERNAL_SERVICE_KEY)
#   5xx      ❌ 창구가 깨졌다. 우리 인자와 무관하다
# ============================================================================
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import env                                    # noqa: E402
env.use_utf8_stdout()
env.load_env()
from app import config                                 # noqa: E402  ← load_env() 뒤

MEMBER = 1001
SKU = 200001


def H():
    return {"X-Internal-Service-Key": os.environ.get("INTERNAL_SERVICE_KEY", "")}


# (이름, 메소드, 경로, 파라미터, 본문, 기대, 비고)
# ⚠ 기대를 적는 이유: 400/404 가 정상인 창구가 있다. 그것을 ❌ 로 세면
#   진짜 고장이 그 속에 묻힌다(러너의 "터진 것 vs 틀린 것" 과 같은 규율).
CALLS = [
    ("search_products", "GET", "/api/products/search", {"keyword": "물티슈"}, None, (200,), ""),
    ("get_product", "GET", f"/api/products/{SKU}", None, None, (200,), ""),
    ("get_products_by_skus", "GET", "/api/products/by-skus", {"skuIds": str(SKU)}, None, (200,), ""),
    ("get_inventory", "GET", f"/api/products/{SKU}/inventory", None, None, (200,), ""),
    ("get_alt_candidates", "GET", f"/api/products/{SKU}/alternatives/candidates", None, None, (200,), ""),
    # ⚠ skuIds 는 **필수**다. 빼면 400 이 나는데 그건 창구 고장이 아니라
    #   탐침이 틀린 것이다(08-28 에 그렇게 잘못 읽었다).
    ("get_change_events", "GET", "/api/inventory/change-events",
     {"skuIds": str(SKU), "hours": 24}, None, (200,), ""),
    ("floor_map", "GET", "/api/map/floors/1", None, None, (200,), ""),
    ("navigation_route", "POST", "/api/navigation/route", None,
     {"floorNo": 1, "startX": 2, "startY": 2, "destinations": [{"locationId": "F1-A-R01-B01-L1"}]},
     (200, 400), "공개 창구 — 400 이면 본문 계약이 바뀐 것"),
    # ── 내부 창구 ──
    ("get_purchase_history", "GET", "/internal/purchases/history", {"memberId": MEMBER}, None,
     (200,), "⚠ 팀 저장소엔 아직 경로가 없다(요청 A)"),
    ("get_wishlist", "GET", "/internal/wishlist", {"memberId": MEMBER}, None, (200,), ""),
    ("get_session_cart", "GET", "/internal/cart/session", {"consumerId": MEMBER}, None, (200,), ""),
    ("get_frequent", "GET", "/internal/orders/frequent", {"consumerId": MEMBER}, None, (200,), ""),
    ("get_product_metrics", "GET", "/internal/products/metrics", {"skuIds": str(SKU)}, None, (200,), ""),
    ("compare_popularity", "GET", "/internal/purchases/compare", {"skuIds": str(SKU)}, None, (200,), ""),
    ("get_popular", "GET", "/internal/purchases/popular", None, None, (200,), ""),
    ("pending_replenish", "GET", "/internal/replenishment/pending", None, None, (200,), ""),
    # ── 도구가 안 타는 셋 — 08-28 에 둘이 여기서 깨져 있었다 ──
    ("★ SSE 구독", "STREAM", "/internal/events/stream", None, None, (200,),
     "자발형의 **유일한 입구**"),
    ("★ 개입 전달", "POST", "/internal/chat/proactive", None,
     {"sessionId": "surface-probe-" + uuid.uuid4().hex[:6], "content": "배관 점검"},
     (200, 404), "자발형의 **출구**. 404=세션 없음(정상) / 500=창구 고장"),
    ("★ 매대 이벤트", "POST", "/internal/events/shelf", None,
     {"eventType": "TASK_QUEUED", "skuId": SKU, "locationId": "F1-A-R01-B01-L1"},
     (201, 409), "시연 주입기·모드 2 가 쓴다"),
]


def main() -> int:
    import httpx
    base = config.BACKEND_BASE_URL
    print(f"■ 백엔드 창구 전수 점검 — {base}")
    print(f"  {len(CALLS)}개 (도구가 타는 것 + 자발형의 입구·출구)\n")

    bad, warn = [], []
    for name, method, path, params, body, ok, note in CALLS:
        try:
            if method == "STREAM":
                # ⚠ 본문을 읽지 않는다. SSE 는 **끝나지 않는 응답**이라
                #   `r.read()` 를 부르면 영원히 기다리다 ReadTimeout 이 나고,
                #   그것이 "창구 고장" 으로 보인다(08-28 에 그렇게 잘못 읽었다).
                #   상태 코드는 헤더만으로 정해지므로 그것만 보고 끊는다.
                with httpx.stream("GET", base + path, headers=H(),
                                  timeout=httpx.Timeout(5.0, read=5.0)) as r:
                    code = r.status_code
            else:
                r = httpx.request(method, base + path, params=params, json=body,
                                  headers=H(), timeout=15)
                code = r.status_code
        except Exception as e:                                 # noqa: BLE001
            print(f"  ❌ {name:22s} {type(e).__name__}")
            bad.append(name)
            continue

        if code in ok:
            mark = "✅"
        elif code >= 500:
            mark = "❌"
            bad.append(f"{name} ({code})")
        else:
            mark = "⚠ "
            warn.append(f"{name} ({code})")
        print(f"  {mark} {name:22s} {code}  {note}")

    print()
    if bad:
        print(f"■ ❌ 깨진 창구 {len(bad)}개 — {', '.join(bad)}")
        print("   5xx 는 **우리 인자와 무관**하다. 백엔드 코드나 DB 스키마다.")
        print("   `/internal/chat/proactive` 가 500 이면 `migration_chat_v2` 를")
        print("   안 돌린 것이다(db/README_시드적재.md §2-⑦).")
        return 1
    if warn:
        print(f"■ ⚠ 확인 필요 {len(warn)}개 — {', '.join(warn)}")
        print("   4xx 는 인자 문제일 수도, 창구 부재일 수도 있다. 위 note 참조.")
        return 2
    print("■ 전 창구 정상 — 도구가 타는 것도, 자발형의 입구·출구도.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
