# ============================================================================
# 시연 주입기 — 자발형 두 장면을 **정식 창구로** 일으킨다
# ============================================================================
# [왜 필요한가] 자발형(에이전트가 스스로 말을 거는 것)은 배선이 다 서 있어도
#   **사건이 없으면 아무것도 안 보인다.** 감시자·스테이징·전달까지 전부
#   구현됐지만, 그것을 깨우는 세계 사건이 데모 중에 저절로 일어나지 않는다.
#   이 파일이 그 사건을 만든다.
#
# [왜 SQL 로 심지 않는가 — 이 파일의 요점]
#   `POST /internal/events/shelf` 는 이벤트만 적는 창구가 아니다. 백엔드가
#   **상태를 실제로 바꾼다**:
#       RESTOCK_IN → applyChange 가 stocks.qty 를 올린다
#       MOVE       → move 가 stocks 행을 옮긴다(source 삭제 → target 저장)
#   그리고 둘 다 shelf_events 에 남기고 SSE 로 방송한다. 즉 **한 번의 호출이
#   조회 경로(get_change_events)와 자발형 경로(SSE)를 동시에 살린다.**
#
#   SQL 로 이벤트만 심으면 `stocks` 와 `shelf_events` 가 어긋난다 —
#   "자리가 바뀌었대서 갔더니 그대로"가 되고, 헌법 5(모든 상태 변경은 백엔드
#   단일 경로)도 깨진다. 시연용 데이터라고 예외를 두면 **시연에서 깨진다.**
#
# [재료는 세계에서 뽑는다] tool_check 와 같은 규율이다. sku 를 코드에 박으면
#   데모 슬라이스를 다시 만드는 날 조용히 엉뚱한 상품을 가리킨다.
#     · 보충 재료 → 백엔드의 보충 대기 큐(지금 실제로 par 밑인 것)
#     · 이동 재료 → 실 시드의 위치 표(같은 zone 의 빈 자리를 찾는다)
#
# 실행 (Agent 에서):
#     python demo_inject.py                 후보를 보여준다
#     python demo_inject.py restock         킬링 장면 1 — 보충 완료
#     python demo_inject.py move            킬링 장면 3 — 자리 이동
#     python demo_inject.py undo            마지막 주입을 되돌린다(리허설용)
#   공통 인자:  --sku 200032   재료를 직접 고른다
#               --dry          쏘지 않고 무엇을 쏠지만 보여준다
# ============================================================================
from __future__ import annotations

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import env                                            # noqa: E402

env.load_env()
env.use_utf8_stdout()

from app import config, sot_client                             # noqa: E402

_HERE = os.path.dirname(os.path.abspath(__file__))
# 마지막 주입 기록 — undo 가 읽는다. 왜 파일인가: 리허설은 여러 번 돌리는데
# 프로세스가 매번 새로 뜨므로 메모리로는 못 남긴다.
STATE = os.path.join(_HERE, ".demo_inject.json")


def _find(*parts) -> str:
    """작업장과 팀 저장소의 배치가 다르다 — route_check·pref_check 와 같은 처리."""
    for base in (os.path.join(_HERE, ".."), _HERE):
        p = os.path.join(base, *parts)
        if os.path.exists(p):
            return p
    return os.path.join(_HERE, *parts)


# ── 실 시드에서 위치 표를 읽는다 (모드 ② — 서버 없이 실데이터) ───────────────
def load_world():
    """locations · stocks · shelf_configs 를 시드 파일에서 읽는다.

    [왜 API 가 아니라 파일인가] 필요한 것이 "이 zone 에서 **비어 있는** 자리"인데,
      그건 어떤 창구도 안 준다(`get_inventory` 는 sku 하나의 위치만 준다).
      시드 파일은 백엔드 DB 에 적재된 **바로 그 파일**이라 같은 세계다.
    """
    path = _find("sim", "out", "world_seed.sql")
    if not os.path.exists(path):
        print(f"✗ 실 시드가 없다: {path}")
        sys.exit(2)
    src = open(path, encoding="utf-8").read()

    def rows_of(table):
        out = []
        for m in re.finditer(r"INSERT INTO %s \([^)]*\) VALUES\s*(.*?);" % table,
                             src, re.S):
            for t in re.finditer(r"\(([^()]*)\)", m.group(1)):
                out.append([v.strip().strip("'") for v in t.group(1).split(",")])
        return out

    loc = {}                       # location_id → (zone, tier, floor)
    by_zone = {}                   # (zone, tier) → [location_id …]
    for r in rows_of("locations"):
        lid, zone, _rk, _by, _lv, tier, floor = r[0], r[1], r[2], r[3], r[4], r[5], r[6]
        loc[lid] = (zone, tier, int(floor))
        by_zone.setdefault((zone, tier), []).append(lid)

    held = {}                      # location_id → {sku …}   (그 자리에 있는 것)
    where = {}                     # sku → [location_id …]
    for r in rows_of("stocks"):
        sku, lid, qty = int(r[0]), r[1], int(r[2])
        held.setdefault(lid, set()).add(sku)
        if qty > 0:
            where.setdefault(sku, []).append(lid)

    par = {}                       # (sku, location_id) → min_qty
    for r in rows_of("shelf_configs"):
        par[(int(r[0]), r[1])] = int(r[2])
    return loc, by_zone, held, where, par


# ── 창구 ────────────────────────────────────────────────────────────────────
def post_shelf(body: dict) -> tuple[bool, str]:
    """`POST /internal/events/shelf`. 성공/실패를 값으로 돌려준다.

    ⚠ 예외를 밖으로 던지지 않는다 — 시연 도중이라면 **왜 안 됐는지가 화면에
      보여야** 한다. 트레이스백이 뜨면 그 자리에서 읽을 수가 없다.
    """
    import httpx
    url = config.BACKEND_BASE_URL + "/internal/events/shelf"
    headers = {"X-Internal-Service-Key": os.environ.get("INTERNAL_SERVICE_KEY", "")}
    try:
        r = httpx.post(url, json=body, headers=headers, timeout=10.0)
    except Exception as e:                                     # noqa: BLE001
        return False, f"{type(e).__name__}: {e}"
    if r.status_code == 201:
        return True, "201"
    return False, f"{r.status_code} {r.text[:200]}"


def locs_of(sku: int) -> list[dict]:
    """그 sku 의 위치·수량 목록. **모양을 한 곳에서 정한다.**

    `get_inventory` 는 창구에 따라 리스트로도 dict(`locations` 키)로도 온다.
    부르는 데마다 각자 풀면 한쪽만 고치는 날 갈린다 — 08-28 에 실제로
    show_stock 은 dict 를 풀고 scene_restock 은 안 풀어서 문자열을 dict 로
    다뤘다(`'str' object has no attribute 'get'`).
    """
    rows = sot_client.get_inventory(sku) or []
    if isinstance(rows, dict):
        rows = rows.get("locations") or []
    return [r for r in rows if isinstance(r, dict)]


def show_stock(sku: int, label: str) -> None:
    """그 sku 가 지금 어디에 몇 개 있는지 — 주입 전후를 눈으로 대조한다.

    [왜 매번 찍나] 시연에서 제일 나쁜 것은 "쐈는데 아무 일도 안 일어난 것처럼
      보이는" 상태다. 201 만 찍고 끝내면 그게 창구의 성공인지 세계의 변화인지
      구분이 안 간다. **효과를 다시 읽어 보여 준다.**
    """
    rows = locs_of(sku)
    print(f"   [{label}] " + (" · ".join(
        f"{r.get('location_id')}({r.get('tier_role')}) {r.get('qty')}개"
        for r in rows) or "(재고 없음)"))


def remember(kind: str, undo: dict) -> None:
    log = []
    if os.path.exists(STATE):
        log = json.load(open(STATE, encoding="utf-8"))
    log.append({"kind": kind, "undo": undo})
    json.dump(log, open(STATE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


# ── 장면 1 — 보충 완료 ──────────────────────────────────────────────────────
def scene_restock(sku_arg, dry: bool) -> int:
    """킬링 장면 1: "약 15분 후 보충 예정" → [이벤트] → "지금 있습니다".

    [재료를 큐에서 뽑는 이유] 임의 상품에 RESTOCK_IN 을 쏘면 재고가 늘긴 하는데
      **손님이 물어봤던 그 물건이 아니다.** 장면이 성립하려면 「지금 par 밑이라
      보충 대기 중인 것」이어야 한다 — 그게 보충 대기 큐다.
    """
    pend = sot_client.get_pending_replenishments()
    if not isinstance(pend, list) or not pend:
        print("✗ 보충 대기 큐가 비었다 — 장면 1의 전제(par 밑)가 없다.")
        print("  stock_sync.sql 이 적재됐는지 확인한다(README §⑦-b).")
        return 2
    row = next((p for p in pend if int(p["sku_id"]) == sku_arg), None) if sku_arg \
        else pend[0]
    if row is None:
        print(f"✗ sku {sku_arg} 는 지금 보충 대기 큐에 없다. 큐에 있는 것:")
        print("  " + " ".join(str(p["sku_id"]) for p in pend[:12]))
        return 2

    sku, lid = int(row["sku_id"]), row["location_id"]
    _, _, _, _, par = load_world()
    target = par.get((sku, lid))
    prod = sot_client.get_product(sku) or {}
    now_qty = next((r.get("qty") for r in locs_of(sku)
                    if r.get("location_id") == lid), 0)
    qty = max(1, (target or (now_qty + 12)) - int(now_qty or 0))

    print(f"장면 1 — 보충 완료\n"
          f"   상품 {sku} {prod.get('name')}\n"
          f"   자리 {lid} · 현재 {now_qty}개 · par {target} → +{qty}개")
    show_stock(sku, "전")
    if dry:
        print("   (--dry: 쏘지 않았다)")
        return 0

    ok, why = post_shelf({"eventType": "RESTOCK_IN", "skuId": sku,
                          "locationId": lid, "qty": qty, "taskId": "demo-restock"})
    print(f"   주입 {'✓' if ok else '✗'} {why}")
    if not ok:
        return 1
    show_stock(sku, "후")
    remember("restock", {"skuId": sku, "locationId": lid, "qty": qty})
    print("\n   → 감시자가 깨려면 **그 세션이 이 sku 를 물어본 적이 있어야** 한다.\n"
          "     (world.note_from_ledgers 가 predict_availability·get_inventory 로\n"
          "      관심을 적는다. 관심 없는 손님에게 말을 걸지 않는 것이 예절이다.)")
    return 0


# ── 장면 3 — 자리 이동 ──────────────────────────────────────────────────────
def scene_move(sku_arg, dry: bool) -> int:
    """킬링 장면 3: "늘 사시던 물티슈 **자리가 바뀌었어요**".

    [빈 자리를 어떻게 찾나 — 08-28 에 여기서 틀렸다]
      처음엔 "그 sku 가 없는 자리"로 골랐다가 500 이 났다. `stocks` 에
      **`UNIQUE KEY uq_stk_location`** 이 걸려 있다 — **한 자리에 한 SKU** 가
      이 세계의 불변식이다(매대 한 칸 = 상품 하나). 그러니 목적지는
      "그 sku 가 없는" 자리가 아니라 **아무것도 없는** 자리여야 한다.
      같은 zone·같은 tier 로 좁히는 이유는 따로다 — 3층에 있던 물티슈가 B1 로
      갔다고 하면 그건 이동이 아니라 재배치라 발화가 이상해진다.
    """
    loc, by_zone, held, where, _ = load_world()

    sku = sku_arg
    if sku is None:
        # 데모 슬라이스 회원이 실제로 사는 것 중 PICK 재고가 있는 것.
        hist = sot_client.get_purchase_history(1001) or []
        for h in hist:
            s = h.get("sku_id")
            if s and int(s) in where:
                sku = int(s)
                break
    if sku is None or sku not in where:
        print(f"✗ 옮길 재고가 있는 sku 를 못 골랐다 (sku={sku})")
        return 2

    src_lid = next((l for l in where[sku] if loc.get(l, ("", "", 0))[1] == "PICK"),
                   where[sku][0])
    zone, tier, floor = loc[src_lid]
    cands = [l for l in by_zone.get((zone, tier), [])
             if l != src_lid and not held.get(l)]      # **아무것도 없는** 자리
    if not cands:
        print(f"✗ zone {zone} · {tier} 에 완전히 빈 자리가 없다.")
        print("  `--sku N` 으로 다른 상품을 고르거나, 그 zone 에 빈 칸을 만든다.")
        return 2
    dst_lid = cands[0]

    prod = sot_client.get_product(sku) or {}
    print(f"장면 3 — 자리 이동\n"
          f"   상품 {sku} {prod.get('name')}\n"
          f"   {src_lid} → {dst_lid}  (zone {zone} · {floor}층 · {tier})")
    show_stock(sku, "전")
    if dry:
        print("   (--dry: 쏘지 않았다)")
        return 0

    ok, why = post_shelf({"eventType": "MOVE", "skuId": sku,
                          "locationId": src_lid, "toLocationId": dst_lid,
                          "taskId": "demo-move"})
    print(f"   주입 {'✓' if ok else '✗'} {why}")
    if not ok:
        return 1
    show_stock(sku, "후")
    remember("move", {"skuId": sku, "locationId": dst_lid, "toLocationId": src_lid})
    print("\n   → 이 이벤트는 두 갈래로 쓰인다.\n"
          "     ① 진입 브리핑(장면 3): 그 손님이 **늘 사던** 물건이면 매장에\n"
          "        들어서는 순간 묶음에 실린다(schedule._moved_items).\n"
          "        장바구니가 비어 있어도 나온다 — 습관으로 보기 때문이다.\n"
          "     ② 담는 중: 이미 **장바구니에 든** 물건이면 즉시 알린다\n"
          "        (world.on_event 의 MOVE 갈래 · 우선순위 50).\n"
          "     같은 사안(loc:sku)이라 둘 다 걸려도 한 번만 말한다.")
    return 0


# ── 되돌리기 ────────────────────────────────────────────────────────────────
def undo_last(dry: bool) -> int:
    """마지막 주입을 되돌린다 — 리허설을 여러 번 하려면 필수다.

    되돌리기도 **같은 창구로** 한다. MOVE 는 반대로 옮기고, RESTOCK_IN 은 같은
    수량만큼 SALE 로 뺀다. DB 를 직접 고치면 되돌린 흔적이 이벤트에 안 남아
    다음 사람이 "왜 재고가 이러지"를 못 푼다.
    """
    if not os.path.exists(STATE):
        print("되돌릴 주입 기록이 없다.")
        return 0
    log = json.load(open(STATE, encoding="utf-8"))
    if not log:
        print("되돌릴 주입 기록이 없다.")
        return 0
    last = log[-1]
    u = last["undo"]
    if last["kind"] == "move":
        body = {"eventType": "MOVE", "skuId": u["skuId"],
                "locationId": u["locationId"], "toLocationId": u["toLocationId"],
                "taskId": "demo-undo"}
        what = f"MOVE {u['locationId']} → {u['toLocationId']}"
    else:
        body = {"eventType": "SALE", "skuId": u["skuId"],
                "locationId": u["locationId"], "qty": u["qty"],
                "taskId": "demo-undo"}
        what = f"SALE {u['locationId']} −{u['qty']}개"
    print(f"되돌리기 — {last['kind']}: {what}")
    if dry:
        print("   (--dry: 쏘지 않았다)")
        return 0
    ok, why = post_shelf(body)
    print(f"   주입 {'✓' if ok else '✗'} {why}")
    if not ok:
        return 1
    show_stock(u["skuId"], "후")
    json.dump(log[:-1], open(STATE, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    return 0


def show_list() -> int:
    """무엇을 쏠 수 있는지 — 시연 직전에 재료를 눈으로 고르는 화면."""
    pend = sot_client.get_pending_replenishments()
    n = len(pend) if isinstance(pend, list) else 0
    print(f"보충 대기 큐 {n}건" + (" — 장면 1 재료" if n else " ⚠ 장면 1 불가"))
    if isinstance(pend, list):
        for p in pend[:8]:
            prod = sot_client.get_product(p["sku_id"]) or {}
            print(f"   {p['sku_id']}  {str(prod.get('name'))[:28]:30s} "
                  f"{p['location_id']}  대기 {p.get('queued_at')}")
    loc, by_zone, held, where, _ = load_world()
    print(f"\n실 시드 — 위치 {len(loc):,} · 재고 있는 SKU {len(where):,}")
    print("   장면 3 재료는 `move --sku N` 으로 직접 고르거나 비우면 "
          "회원 1001 의 구매이력에서 뽑는다")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="시연 주입기")
    ap.add_argument("what", nargs="?", default="list",
                    choices=["list", "restock", "move", "undo"])
    ap.add_argument("--sku", type=int, default=None)
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()

    if config.USE_MOCK_SOT:
        print("✗ mock 모드다 — 주입은 실물 백엔드에만 의미가 있다.")
        print("  .env 의 USE_MOCK_SOT 를 false 로 두고 다시 실행한다.")
        return 2
    print(f"백엔드 {config.BACKEND_BASE_URL}\n")

    if a.what == "list":
        return show_list()
    if a.what == "restock":
        return scene_restock(a.sku, a.dry)
    if a.what == "move":
        return scene_move(a.sku, a.dry)
    return undo_last(a.dry)


if __name__ == "__main__":
    raise SystemExit(main())
