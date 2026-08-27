# ============================================================================
# tool_check — 도구 23종을 **실물 DB 위에서 전부 태워 본다** (LLM 없음)
# ============================================================================
# [왜 이게 따로 필요한가] 앞의 검사기 넷은 각자 다른 층을 본다.
#
#   schema_check   스키마 ↔ 함수 서명이 맞나        (코드만 — 데이터 불필요)
#   infer_check    출하물이 올라오고 답을 내나      (자산 층)
#   backend_probe  백엔드 창구·인증·시드가 사나     (HTTP 층)
#   route_check    매장 기하가 가정을 지키나        (세계 층)
#
# 비어 있던 것이 **도구 층**이다 — *"선언된 23종이 실물 세계에서 실제로 답을
# 내는가."* 계약이 맞아도(schema_check ✅) 창구가 살아도(backend_probe ✅)
# 도구가 빈손일 수 있다: 파라미터 이름이 어긋나거나, 그 SKU 에 데이터가 없거나,
# 조회는 되는데 우리 투영이 칸을 흘리거나.
#
# [세 갈래로 가른다 — backend_probe 의 "빈 배열의 뜻"을 도구 층에 적용]
#   ✅ 실물 응답    쓸 수 있는 값이 왔다
#   ⚠ 빈 결과      호출은 됐는데 내용이 없다 → **데이터 탓인지 코드 탓인지 갈라야 한다**
#   ❌ 오류        error 를 돌려줬거나 예외가 났다
#
# [재료를 실행 시각에 뽑는다] SKU·회원을 코드에 박지 않는다. DES 를 다시 돌리는
#   날(설계서 §10) 번호가 통째로 바뀌기 때문이다 — `golden_real.fixtures` 와
#   같은 규율이다. 재료를 못 뽑으면 그 자체가 **첫 번째 실패 보고**다.
#
# [상태를 바꾸는 도구 셋은 자기가 치운다] add → update → remove 순으로 불러
#   장바구니를 원래대로 되돌린다. 검사기가 쓰레기를 남기면 다음 검사가 그
#   쓰레기를 보고 판단한다.
#
# 실행:  python tool_check.py            (Agent/ 에서 · 백엔드 기동 + USE_MOCK_SOT=false)
# ============================================================================
from __future__ import annotations

import sys
import traceback

# ⚠ **이 세 줄의 순서가 이 파일의 정확성을 결정한다** (08-27 B 검수 A-1).
#   `config.USE_MOCK_SOT` 은 **모듈 최상단에서 한 번 굳는다**:
#       USE_MOCK_SOT = os.environ.get("USE_MOCK_SOT", "true") ... not in (...)
#   그래서 `config` 를 `load_env()` **전에** import 하면 `.env` 를 못 읽고
#   기본값 true 로 굳는다. `.env` 에 false 라고 적혀 있어도 소용없다.
#
#   처음에 `from app import config, env` 로 한 줄에 썼다가 **mock 을 재고
#   "실물 17종 통과"라고 보고했다.** 실물로 다시 재니 숫자가 달랐다.
#   **검사기가 통과 도장을 잘못 찍는 것은 검사기가 없는 것보다 나쁘다** —
#   없으면 사람이 의심이라도 한다.
#
#   `app/env.py` 자신의 주석이 이걸 경고하고 있었다: *"입구(main·runner)가
#   다른 app 모듈보다 먼저 불러야 한다."* main·runner 는 지켰고 여기만 어겼다.
from app import env

env.load_env()
env.use_utf8_stdout()

from app import config  # noqa: E402  ← load_env() 뒤여야 한다
from app import sot_client  # noqa: E402
from app.tools import action, compute, definitions, infer, query  # noqa: E402

OK, EMPTY, BAD, SKIP = "✅", "⚠", "❌", "·"

# 고장이 아니라 **상태**인 것들 — 이 서버가 그 기능을 안 켰을 뿐이다.
#   not_implemented   아직 안 만들었다(match_preferences — 08/29 배선)
#   encoder_not_loaded 사진 인코더 3.5GB 는 기본 꺼짐(LOAD_PHOTO_ENCODER)
#   not_pending       큐에 없는 sku 는 곡선을 그릴 이유가 없다(매대에 있다)
#   no_scan_anchor    스캔 기록이 없으면 추측하지 않는 것이 설계다
STATE_ERRORS = {"not_implemented", "encoder_not_loaded",
                "not_pending", "no_scan_anchor"}
_rows: list = []


def line(mark: str, name: str, detail: str) -> None:
    _rows.append((mark, name, detail))
    print(f" {mark} {name:<28} {detail}")


def _empty(v) -> bool:
    """'빈 결과'의 정의 — 호출은 됐는데 쓸 내용이 없다.

    dict 안의 첫 리스트/목록 칸이 비었으면 빈 결과로 본다. 스칼라만 있는
    응답(예: get_product)은 값 자체의 유무로 판정한다.
    """
    if v is None:
        return True
    if isinstance(v, (list, tuple, str)):
        return len(v) == 0
    if isinstance(v, dict):
        for k in ("items", "products", "locations", "curve", "events", "groups"):
            if k in v:
                return not v[k]
        return not v
    return False


def run(name: str, **kw):
    """도구 하나를 **루프와 같은 경로로** 부르고 세 갈래로 보고한다.

    ⚠ 08-27 에 이 검사기가 처음 REGISTRY 를 직접 불렀다가 TypeError 를 다섯 개
      냈다 — `member_id`·`session_id` 처럼 **루프가 주입하는 인자**를 검사기가
      안 넣었기 때문이다(B안 신원 주입). 도구 잘못이 아니라 **검사기가 실물과
      다른 문을 두드린 것**이었다.
      → `loop._dispatch` 는 LLM 이 고른 이름·인자를 받아 각 REGISTRY 의 `run()`
        으로 보내고, 그 `run()` 이 신원 주입·인자 정화·예외 흡수를 한다.
        **검사는 실물이 지나는 길에서 해야 뜻이 있다.**
    """
    from app import loop
    try:
        v, _src = loop._dispatch(name, dict(kw))
    except Exception as e:                                     # noqa: BLE001
        line(BAD, name, f"예외 {type(e).__name__}: {str(e)[:70]}")
        return None
    if isinstance(v, dict) and v.get("error"):
        # **고장과 상태를 가른다.** 아래 셋은 "지금 이 서버가 그 기능을 안 켰다"
        # 이지 망가진 것이 아니다 — 섞으면 빨간 줄이 상수가 되고, 상수가 된
        # 경고는 아무도 안 본다(검사기의 설계 원칙 ②, 4-03장).
        mark = SKIP if v["error"] in STATE_ERRORS else BAD
        line(mark, name, f'{v["error"]}: {str(v.get("message", ""))[:60]}')
        return None
    if _empty(v):
        line(EMPTY, name, "빈 결과 — 데이터인지 질의인지 아래 재료와 대조")
        return v
    line(OK, name, _brief(v))
    return v


def _brief(v) -> str:
    if isinstance(v, list):
        return f"{len(v)}건"
    if isinstance(v, dict):
        for k in ("items", "products", "locations", "curve", "groups"):
            if isinstance(v.get(k), list):
                return f"{k} {len(v[k])}건"
        keys = [k for k in v if not k.startswith("_")][:4]
        return "· ".join(f"{k}={str(v[k])[:18]}" for k in keys)
    return str(v)[:60]


def _pick_member() -> int:
    """구매 이력이 **실제로 있는** 회원을 하나 고른다. 못 고르면 1001 로 물러선다.

    [왜 뽑나] SKU 를 안 박는 것과 같은 이유다 — 데모 슬라이스를 다시 만들면
      회원 번호가 통째로 바뀐다. 다만 회원은 검색 창구가 없어서, 후보를
      순서대로 두드려 **이력이 나오는 첫 번째**를 쓴다.
    """
    for mid in range(1001, 1031):
        try:
            query.set_identity(mid, "toolcheck-session")
            r = query.REGISTRY["get_purchase_history"]() or {}
            if r.get("purchases"):
                return mid
        except Exception:                                      # noqa: BLE001
            continue
    return 1001


def main() -> int:
    # ⚠ **출하물을 먼저 올린다.** 서버는 lifespan 이 올리는데 이 검사기는
    #   loop 를 직접 부르므로 아무도 안 올린다 — 08-27 에 평가 러너가 정확히
    #   이 병으로 추론 5종을 "적재 안 됨"으로 채점했다(같은 병 네 번째).
    got = infer.load_all()
    print(f"tool_check — USE_MOCK_SOT={config.USE_MOCK_SOT} · "
          f"백엔드={config.BACKEND_BASE_URL}")
    print(f"출하물: {got}")
    if config.USE_MOCK_SOT:
        print("⚠ **mock 을 재고 있다.** 이 표는 실물 DB 의 상태가 아니다.\n"
              "   .env 의 USE_MOCK_SOT 가 false 인데도 이 줄이 보이면 import 순서를 의심한다"
              "(이 파일 머리 주석).")
    print()

    # ── 재료 뽑기 — 못 뽑으면 그 자체가 첫 실패다 ────────────────────────────
    print("── 재료 (실행 시각에 세계에서 뽑는다) ──")
    # 여러 갈래로 시도한다 — 한 질의가 비었다고 "세계가 비었다"고 단정하면
    # 검사기가 첫 줄에서 거짓 보고를 한다(빈 결과의 뜻을 가르는 이 파일의 원칙을
    # 자기 자신에게도 적용). 빈 키워드가 안 먹는 구현도 있어 낱말도 섞는다.
    found, probe = [], []
    for kw in ("", "물티슈", "우유", "라면", "커피"):
        r = query.REGISTRY["search_products"](keyword=kw) or {}
        # ⚠ 목록 칸의 이름이 도구마다 다르다(`products`·`items`). 하나만 보다가
        #   08-27 에 이 검사기가 스스로 걸렸다 — 세계가 멀쩡한데 "상품을 하나도
        #   못 찾았다"고 보고했다. **검사기의 거짓 음성이 제일 나쁘다**(고장을
        #   못 잡는 것보다, 없는 고장을 있다고 하는 쪽이 사람을 엉뚱한 데로 보낸다).
        hits = r.get("products") or r.get("items") or []
        probe.append(f"{kw or '(빈)'}={len(hits)}")
        if hits:
            found = hits
            break
    print(" 재료 질의:", " · ".join(probe))
    if not found:
        print(" ❌ 상품을 하나도 못 찾았다 — 백엔드·시드부터 확인한다"
              " (backend_probe.py)")
        return 2
    sku = int(found[0]["sku_id"])
    # ⚠ 두 번째 재료는 **같은 축**이어야 한다. 아무거나 집으면 단위가격 도구가
    #   축이 달라 거부하는데(설계대로), 검사기는 그걸 고장으로 센다 —
    #   도구가 옳게 거부한 것을 ❌ 로 적는 것도 거짓 경보다.
    sku2 = int(found[1]["sku_id"]) if len(found) > 1 else sku
    #   검색 투영에는 `unit` 이 없으므로 상품 조회로 축을 확인한다.
    def _axis(_s):
        q = sot_client.spec_quantity((sot_client.get_product(_s) or {}).get("spec"))
        return (q or {}).get("axis")
    _u0 = _axis(sku)
    for _c in found[1:]:
        if _axis(int(_c["sku_id"])) == _u0:
            sku2 = int(_c["sku_id"])
            break
    l2 = found[0].get("category_l2")
    # ⚠ **`members` 에 있다고 유효한 재료가 아니다**(08-27 B 검수 A-2).
    #   `members` 는 세계 시드(구매이력의 주체)이고 `consumer` 는 백엔드 로그인
    #   사용자다 — **다른 테이블**이고, 장바구니·위시리스트·주문은 `consumer` 를
    #   참조한다. 9001 은 members 에만 있어 add_to_cart 가 FK 위반으로 500 이었다.
    #   두 테이블에 다 있고 구매이력까지 있는 것은 데모 슬라이스 1001~1030 이다.
    #   ⚠ 그래도 **박지 않는다** — 이 파일의 규율이 "재료를 실행 시각에 세계에서
    #   뽑는다"이므로, 이력이 실제로 있는 회원을 골라 쓰고 실패하면 그대로 보고한다.
    member = _pick_member()
    print(f" 상품 {sku}·{sku2} · 소분류 {l2} · 회원 {member}(이력 있는 회원을 실행 시각에 선정)")
    print()

    # 신원 주입 — 개인화 도구는 LLM 이 아니라 이 경로로 신원을 받는다(B안).
    query.set_identity(member, "toolcheck-session")
    from app.tools import compute as _c
    _c.set_position(2, 7, 15)          # 경로 도구의 기본 출발점

    print("── 조회 10 ──")
    run("get_product", sku_id=sku)
    run("search_products", keyword="")
    run("get_inventory", sku_id=sku)
    run("get_purchase_history")
    run("get_session_cart")
    run("get_wishlist")
    run("get_change_events", sku_ids=[sku])
    run("get_popular_products")
    run("get_product_metrics", sku_ids=[sku])
    run("compare_purchase_popularity", sku_ids=[sku, sku2])

    print("\n── 계산 5 ──")
    run("compare_products", sku_ids=[sku, sku2])
    run("compare_unit_price", sku_ids=[sku, sku2])
    run("find_substitutes", sku_id=sku)
    run("optimize_bundle", candidate_sku_ids=[sku, sku2], budget_krw=100000)
    run("optimize_route", sku_ids=[sku, sku2])

    print("\n── 추론 5 ──")
    # 큐에 실제로 든 sku 를 지목해야 **곡선까지** 확인된다. 임의 상품은 거의
    # 항상 not_pending 으로 떨어지는데, 그건 옳은 동작이라 통과로 세도 곡선은
    # 못 본다 — 자산이 사는지를 보려면 재료를 골라야 한다(B 검수 A-3).
    pend = sot_client.get_pending_replenishments()
    pend_sku = (pend[0]["sku_id"]
                if isinstance(pend, list) and pend else sku)
    run("predict_availability", sku_id=pend_sku)
    run("predict_repurchase")
    run("get_position")
    run("match_preferences")
    run("identify_product_photo", image_ref="")

    print("\n── 액션 3 (스스로 치운다: 담기 → 수량 → 빼기) ──")
    action.set_consumer_id(member)
    added = run("add_to_cart", sku_id=sku, quantity=1)
    if added:
        run("update_cart_quantity", sku_id=sku, quantity=2)
        run("remove_from_cart", sku_id=sku)
    else:
        line(SKIP, "update_cart_quantity", "담기가 안 돼 건너뜀")
        line(SKIP, "remove_from_cart", "담기가 안 돼 건너뜀")

    # ── 집계 ─────────────────────────────────────────────────────────────────
    n = {m: sum(1 for r in _rows if r[0] == m) for m in (OK, EMPTY, BAD, SKIP)}
    print(f"\n{'='*66}")
    print(f"도구 {len(_rows)}종 — 실물 {n[OK]} · 빈결과 {n[EMPTY]} · "
          f"오류 {n[BAD]} · 미구현/건너뜀 {n[SKIP]}")
    if n[BAD]:
        print("\n❌ 오류난 것:")
        for m, name, d in _rows:
            if m == BAD:
                print(f"   {name}: {d}")
    if n[EMPTY]:
        print("\n⚠ 빈 결과 — **데이터가 없는 것과 질의가 틀린 것을 가른다.**")
        print("   같은 조건으로 backend_probe.py 를 돌려 창구 쪽을 먼저 본다.")
        for m, name, d in _rows:
            if m == EMPTY:
                print(f"   {name}")
    declared = {t["name"] for t in definitions.TOOLS}
    tested = {r[1] for r in _rows}
    missing = declared - tested
    if missing:
        # 검사기가 도구를 빠뜨리면 "전부 확인했다"가 거짓이 된다 — 스스로 잡는다.
        print(f"\n❌ 이 검사기가 안 태운 도구: {sorted(missing)}")
        return 1
    return 1 if n[BAD] else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:                                          # noqa: BLE001
        traceback.print_exc()
        sys.exit(2)
