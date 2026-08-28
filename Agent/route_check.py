# ============================================================================
# route_check — 층 분해 솔버·위치 스냅을 **실배치**로 검증한다
# ============================================================================
# [무엇] `sim/out/world_seed.sql`(백엔드 DB 에 적재된 것과 같은 파일)에서 실
#   좌표·통행 격자·재고를 읽어, 층 분해해가 단일 전역 Held-Karp 와 같은지
#   그리고 스냅이 통로에 착지하는지 잰다. **백엔드가 꺼져 있어도 같은 세계다.**
#
# [왜 남기나] 층 분해는 알고리즘의 정리가 아니라 **이 매장 기하의 성질**에
#   기대고 있다("층간 이동이 층내 걸음을 지배한다"). 배치가 바뀌면 — 층이 늘거나,
#   에스컬레이터가 하나 더 생기거나, DES 를 다시 돌려 좌표가 바뀌면 — 그 전제를
#   **다시 재야 한다.** 일회용 스크립트로 두면 그날 아무도 못 잰다.
#
# [08-27 이 검사가 잡은 것] 난수 좌표로만 재던 동안 못 본 것 하나:
#   `locations` 의 좌표는 매대 칸이 아니라 **이미 접근 지점**이다(world_gen 의
#   FACE_D 오프셋). 그래서 스냅은 실 시드에서 **한 번도 안 옮긴다** —
#   "없으면 A* 가 죽는다"가 아니라 "지금은 무동작인 안전망"이 맞는 서술이다.
#   난수로 검증하면 "무작위 매장에서 성립한다"를 재게 된다. 우리가 알아야 하는
#   것은 **우리 매장에서 성립하는가**다.
#
# 실행:  python route_check.py          (Agent/ 에서)
# ============================================================================
import os
import random
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
from app.tools import compute  # noqa: E402

_HERE = os.path.dirname(os.path.abspath(__file__))
# ⚠ 두 저장소의 배치가 다르다 — warehouse 는 `sim/` 이 루트에, 2nd_Project 는
#   `Agent/sim/` 안에 있다. 한쪽만 보면 이관한 날 "시드가 없다"로 죽는다.
#   경로를 코드에 박는 대신 **둘 다 찾는다** — 어느 저장소에서 돌려도 같은 세계다.
_CANDS = [os.path.join(_HERE, "..", "sim", "out", "world_seed.sql"),
          os.path.join(_HERE, "sim", "out", "world_seed.sql")]
SEED_SQL = next((c for c in _CANDS if os.path.exists(c)), _CANDS[0])

if not os.path.exists(SEED_SQL):
    print("world_seed.sql 이 없다 — sim/world_gen.py 를 먼저 돌린다")
    raise SystemExit(2)
src = open(SEED_SQL, encoding="utf-8").read()


def rows_of(table: str):
    """INSERT INTO <table> ... VALUES (…),(…); 를 튜플 목록으로."""
    out = []
    for m in re.finditer(r"INSERT INTO %s \([^)]*\) VALUES\s*(.*?);" % table,
                         src, re.S):
        for t in re.finditer(r"\(([^()]*)\)", m.group(1)):
            out.append([v.strip().strip("'") for v in t.group(1).split(",")])
    return out


# ── 실 좌표 ─────────────────────────────────────────────────────────────────
loc = {}                                   # location_id → (floor, x, y, tier)
for r in rows_of("locations"):
    lid, _z, _rk, _by, _lv, tier, f, x, y = r[:9]
    loc[lid] = (int(f), int(x), int(y), tier)

cells = {}                                 # floor → set of passable (x,y)
for r in rows_of("map_cells"):
    f, x, y, passable = int(r[0]), int(r[1]), int(r[2]), r[3]
    if passable in ("1", "true", "TRUE"):
        cells.setdefault(f, set()).add((x, y))

stock = {}                                 # sku → [location_id …] (PICK, 재고>0)
for r in rows_of("stocks"):
    sku, lid, qty = int(r[0]), r[1], int(r[2])
    if qty > 0 and loc.get(lid, ("", "", "", ""))[3] == "PICK":
        stock.setdefault(sku, []).append(lid)

print(f"실 시드 — 위치 {len(loc):,} · 통행칸 "
      + " ".join(f"{f}층 {len(c):,}" for f, c in sorted(cells.items()))
      + f" · 매대재고 SKU {len(stock):,}")

# 층별 지름(맨해튼 최대) — "층간이 층내를 지배하는가"의 분모
for f, c in sorted(cells.items()):
    xs = [p[0] for p in c]
    ys = [p[1] for p in c]
    print(f"  {f}층 지름 ≈ {max(xs)-min(xs) + max(ys)-min(ys)}")


# ── 실 좌표 위에서 분해해 vs 단일 전역 Held-Karp ────────────────────────────
def real_cost(a, b):
    """mock 과 같은 비용 모델(맨해튼 + 에스컬레이터 경유)을 실 좌표에 적용."""
    return compute._mock_cost(a, b)


rng = random.Random(20260827)
skus = sorted(stock)
n_trial = n_eq = 0
worst = (0.0, None)

for _ in range(400):
    k = rng.randint(3, 8)
    picked = rng.sample(skus, k)
    coords, dests = [], []
    for i, sku in enumerate(picked):
        f, x, y, _ = loc[stock[sku][0]]
        coords.append((f, x, y))
        dests.append({"sku_id": sku, "floor_no": f, "x": x, "y": y})
    sf = rng.choice([1, 2, 3])
    start = (sf,) + tuple(rng.choice(sorted(cells[sf])))

    dec = compute._route_floor_decomposed(
        start, dests,
        lambda pt, d: (real_cost(pt, (d["floor_no"], d["x"], d["y"])),
                       (d["floor_no"], d["x"], d["y"])))
    sc = [real_cost(start, c) for c in coords]
    pc = [[real_cost(a, b) if a is not b else 0 for b in coords] for a in coords]
    for i in range(k):
        pc[i][i] = 0
    exact = compute._held_karp_order(sc, pc)

    n_trial += 1
    gap = dec[1] - exact[1]
    assert gap >= 0, "분해가 전역해보다 싸다 — 버그"
    if gap == 0:
        n_eq += 1
    else:
        rel = gap / exact[1]
        if rel > worst[0]:
            worst = (rel, (k, gap, exact[1]))

print(f"\n[실배치] 시행 {n_trial} · 전역해와 일치 {n_eq} ({n_eq/n_trial:.1%})"
      + (f" · 최대 어긋남 {worst[0]:.2%}" if worst[1] else " · 어긋남 0"))

# ── 실 격자로 스냅 검증 — 매대 좌표는 반드시 통로로 옮겨져야 한다 ────────────
from app.tools import infer  # noqa: E402

infer._STATE["floormap"] = {f: frozenset(c) for f, c in cells.items()}
n_bay = n_moved = n_ok = 0
worst_d = 0
for lid, (f, x, y, tier) in loc.items():
    if tier != "PICK" or f not in cells:
        continue
    n_bay += 1
    sx, sy, snapped = infer.snap_to_walkable(f, x, y)
    if snapped:
        n_moved += 1
    if (sx, sy) in cells[f]:
        n_ok += 1
        worst_d = max(worst_d, abs(sx - x) + abs(sy - y))

print(f"[실격자 스냅] PICK 위치 {n_bay:,} · 통로로 착지 {n_ok:,} "
      f"({n_ok/n_bay:.1%}) · 실제로 옮긴 것 {n_moved:,} · 최대 이동 {worst_d}칸")

# ── 전 tier 로 확대: 정말 스냅이 필요 없는가? ───────────────────────────────
from collections import Counter
need = Counter(); tot = Counter()
for lid, (f, x, y, tier) in loc.items():
    if f not in cells:
        continue
    tot[tier] += 1
    if (x, y) not in cells[f]:
        need[tier] += 1
print("\n[스냅이 필요한 위치] tier별  통행불가 / 전체")
for t in sorted(tot):
    print(f"   {t:<6} {need[t]:>6,} / {tot[t]:>6,}")
# 베이 원점(장애물)과 위치 좌표가 다른지 — world_gen 의 FACE 오프셋 확인
print("\n[표본] 같은 zone 의 PICK 3개와 그 칸의 통행 여부")
for lid, v in list(loc.items())[:3]:
    f, x, y, t = v
    print(f"   {lid}  ({f},{x},{y}) {t}  통행={(x,y) in cells.get(f,set())}")
