# ============================================================================
# 백엔드 실물 대조 탐침 — USE_MOCK_SOT=False 로 넘기기 전에 돌린다
# ============================================================================
# [왜 필요한가] 백엔드가 "요청서 스펙대로 맞췄다"고 해도, 실제로 맞는지는
#   **우리 클라이언트가 파싱해 보기 전까지 모른다.** 필드 이름 하나가 다르면
#   `r.get("hasBulk")`가 조용히 None을 돌려주고(예외가 아니다!), 그러면
#   `bool(None) = False`가 되어 **경로유형이 전부 수평/층간으로 잘못 판정**된다.
#   404도 500도 아니고 **틀린 확률이 나온다** — 가장 나쁜 실패 방식이다.
#
# [무엇을 보나 — 셋]
#   ① 인증·연결   : 200이 오나, 401/404가 아닌가
#   ② 필드 이름   : 우리가 읽는 키가 응답에 실제로 있나(빈 배열이면 판정 불가 → 경고)
#   ③ **의미**    : 빈 배열이 "정말 0건"인가 "데이터가 없어서 0건"인가
#                   ← 이게 이 스크립트의 존재 이유다(아래 [함정])
#
# [함정 — 빈 배열이 거짓말을 한다]
#   `get_pending_replenishments()`는 창구가 없으면 None, 있으면 목록을 준다.
#   infer는 None이면 "모른다"고 정직하게 답하고, **[]이면 "큐가 비었다 = 한산"**
#   으로 읽어 **매우 빠른 보충 확률**을 낸다(ex-av3의 파란 곡선: 4분에 82%).
#   그런데 백엔드 DB에 시드가 안 들어가 있으면 []가 온다 — 즉 **"데이터 없음"이
#   "매장이 한가하다"로 둔갑**한다. 이건 가드도 못 잡는다(원장에 그 숫자가
#   실제로 있으니까). 그래서 시드 적재 여부를 **여기서** 확인한다.
#
# 실행:  cd Agent && python backend_probe.py
# ============================================================================
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.env import load_env, use_utf8_stdout                       # noqa: E402

use_utf8_stdout()
load_env()

from app import config, sot_client                                  # noqa: E402

OK, WARN, BAD = "✅", "⚠️", "❌"


def line(mark: str, name: str, detail: str = "") -> None:
    print(f"  {mark} {name:<34s} {detail}")


def main() -> int:
    print("=" * 74)
    print("백엔드 실물 대조 — USE_MOCK_SOT 전환 전 점검")
    print("=" * 74)
    print(f"  base_url        {config.BACKEND_BASE_URL}")
    print(f"  USE_MOCK_SOT    {config.USE_MOCK_SOT}"
          f"{'   ← 지금은 mock이다. 실물을 보려면 .env 에서 끄고 다시 실행' if config.USE_MOCK_SOT else ''}")
    key = os.environ.get("INTERNAL_SERVICE_KEY", "")
    print(f"  INTERNAL_KEY    {'설정됨(' + str(len(key)) + '자)' if key else '**비어 있음 → 401 확정**'}")
    print()

    if config.USE_MOCK_SOT:
        print("  mock 모드라 실물 대조를 못 한다. .env 에 USE_MOCK_SOT=false 를 넣고 다시.")
        return 2

    bad = 0

    # ── ① 보충 대기 (가용예측의 입력 절반) ────────────────────────────────
    print("── ① /internal/replenishment/pending ──")
    pending = sot_client.get_pending_replenishments()
    if pending is None:
        line(BAD, "창구 응답", "None — 예외가 났다(404/401/연결 실패). 서버·키 확인")
        bad += 1
    elif not pending:
        line(WARN, "빈 배열 []", "0건이다. **시드가 적재됐는지** 아래 ③으로 판별")
    else:
        line(OK, f"{len(pending)}건 수신")
        r = pending[0]
        # 우리가 읽는 키가 실제로 채워졌나. None이면 이름이 다른 것이다.
        # queued_at 만 **null 이 정상일 수 있다** — 백엔드 DTO 주석대로
        # "BELOW_PAR 이벤트가 없으면 null"(0건이 아니라 모름). 나머지 넷은
        # null 이면 필드명 불일치다.
        for k in ("sku_id", "location_id", "floor_no", "has_bulk"):
            v = r.get(k)
            if v is None:
                line(BAD, f"필드 {k}", "None — 백엔드 필드명이 다르다(camelCase 확인)")
                bad += 1
            else:
                line(OK, f"필드 {k}", repr(v)[:44])
        n_q = sum(1 for x in pending if x.get("queued_at"))
        if n_q:
            line(OK, "필드 queued_at", f"{n_q}/{len(pending)}건에 값 있음")
        else:
            line(WARN, "필드 queued_at", "전건 null — BELOW_PAR 이력이 없다는 뜻. "
                                        "대기시간 원점이 없어 예측이 낙관 쪽으로 기운다")

    # ── ② 인기 상품 ───────────────────────────────────────────────────────
    print("\n── ② /internal/purchases/popular ──")
    try:
        pop = sot_client.get_popular_products(limit=3)
        items = pop.get("items", [])
        if not items:
            line(WARN, "빈 목록", "이력 시드가 없으면 정상. ③으로 판별")
        else:
            line(OK, f"{len(items)}건 수신", str(items[0])[:56])
            for k in ("sku_id", "name", "total_qty", "purchaser_count"):
                if items[0].get(k) is None:
                    line(BAD, f"필드 {k}", "None — 필드명 확인")
                    bad += 1
    except Exception as e:                                          # noqa: BLE001
        line(BAD, "호출 실패", f"{type(e).__name__}: {e}")
        bad += 1

    # ── ③ 시드 적재 여부 — 빈 배열의 의미를 가른다 ────────────────────────
    print("\n── ③ 시드가 적재됐나 (빈 배열의 의미를 가르는 검사) ──")
    probe_sku = 200000        # products_seed_5000 의 첫 sku_id
    prod = sot_client.get_product(probe_sku)
    if prod:
        line(OK, "상품 시드", f"sku {probe_sku} = {prod.get('name')}")
    else:
        line(BAD, "상품 시드", f"sku {probe_sku} 없음 — **products_seed_5000.sql 미적재**")
        bad += 1
    inv = sot_client.get_inventory(probe_sku) or {}
    if (inv.get("locations") or []):
        line(OK, "재고·매대 시드", f"{len(inv['locations'])}개 위치")
    else:
        line(BAD, "재고·매대 시드", "위치 없음 — world_seed.sql 미적재")
        bad += 1

    # ── 판정 ──────────────────────────────────────────────────────────────
    print("\n" + "=" * 74)
    if bad:
        print(f"{BAD} 막는 문제 {bad}건 — 전환하면 안 된다.")
    elif not pending:
        print(f"{WARN} 연결·필드는 정상. 그러나 보충 대기가 0건이다.")
        print("   시드가 적재됐는데도 0건이면 진짜 0건이고, 그러면 가용예측은")
        print("   **'매장이 한가하다'는 매우 빠른 확률**을 낸다 — 데모에서 킬링 장면 1")
        print("   ('약 15분 후')이 '지금 바로'로 바뀐다. history_seed 적재 후 재확인.")
    else:
        print(f"{OK} 전환 가능.")
    print("=" * 74)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
