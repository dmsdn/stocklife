# ============================================================================
# Agent 관제 생성기 — 모드 0: 정적 세계
# ============================================================================

# [역할] 확정된 배치표(map_layout.py)와 상품 시드(catalog)로부터 **매장이라는 물리적 사실**을 만들어 SQL로 내보낸다:
# zones · locations · map_cells · stocks · shelf_configs

# [헌법 3 — 이 파일은 ML을 모른다] 규칙 기반이며 모델 출력을 참조하지 않는다.
# `app/tools/infer.py`를 import하면 그 순간 "모델이 만든 세계로 모델을 학습"하는 자기충족이 되어 모든 성능 수치가 무의미해진다.
#
# [결정적 생성] 난수를 쓰되 seed를 상수로 고정한다. 같은 입력 → 같은 세계.
# catalog.py가 md5로 결정적 값을 뽑는 것과 같은 목적 — 재적재해도 어제와 같은 매장이어야 골든셋·데모가 재현된다.
#
# [층 구조] 1~3F 판매층(맵) + B1 중앙창고(zone_type=BACKROOM, 맵에 없음).
# B1이 필요한 이유: 보충 경로가 두 가지다 — 수직(바로 위 L4~L6에서 내리기, 분 단위) / 수평(B1에서 지게차로 올리기, 시간 단위).
# 리드타임 분포가 갈리는 근거이자 "약 15분 후 보충"이라는 예측이 성립하는 물리적 이유다.

# [베이 = SKU 3개] 계약 테스트가 요구하는 구조:
# L1·L2·L3 = PICK, 각 단에 **서로 다른 상품** 하나 → 베이당 3 SKU
# L4·L5·L6 = BULK, L(n)의 예비가 L(n+3) — 테스트 17이 이 페어링을 검사한다
# 같은 베이의 6개 로케이션은 x,y가 동일 — 테스트 16(좌표 일치)
# ============================================================================

import io
import os
import random
import sys
from collections import defaultdict

# 경로를 cwd(실행 위치)가 아니라 **이 파일의 위치** 기준으로 잡는다 (08-20 개정).
# 이전에는 sys.path.insert(0, "catalog") 같은 상대 문자열이라, 루트에서 돌리면 되고
# PyCharm ▶(기본 cwd=파일 폴더)나 다른 폴더에서 돌리면 "No module named taxonomy"로
# 죽었다 — 같은 코드가 실행 위치에 따라 되다 말다 하는, 원인 찾기 나쁜 고장이다.
# __file__ 기준이면 sim/의 형제 catalog/를 어디서 실행하든 찾는다.
# (main.py의 .env 로더가 Agent/.env를 찾는 것과 같은 수법. 저장소처럼 sim·catalog가
#  Agent/ 아래에 있어도, 작업장처럼 루트에 있어도 — "형제"라는 관계만 같으면 된다.)
_HERE = os.path.dirname(os.path.abspath(__file__))          # .../sim
sys.path.insert(0, os.path.join(_HERE, "..", "catalog"))    # 형제 catalog/
sys.path.insert(0, _HERE)                                   # sim/ 자신 (map_layout)

from map_layout import (BAYS, FACILITIES, FLOOR_W, FLOOR_H, BAY_CELLS,   # noqa: E402
                        ZONE_LABELS)
from taxonomy import TAXONOMY                                          # noqa: E402
import catalog as cat                                                  # noqa: E402

SEED = 20260818          # 세계 버전 식별자 겸 난수 시드. 바꾸면 다른 세계가 나온다
# 출력도 파일 위치 기준 — cwd가 어디든 항상 sim/out/에 쓴다
OUT = os.path.join(_HERE, "out", "world_seed.sql")

# 접근 방향 → 베이 원점으로부터의 오프셋 (격자 1m 기준, 베이는 2×2를 차지)
FACE_D = {"U": (0, -1), "D": (0, BAY_CELLS), "L": (-1, 0), "R": (BAY_CELLS, 0)}

# 층간 이동(에스컬레이터) — 맵 우측 하단의 수직동선. 모든 층에서 같은 좌표를 써야
# 같은 transit_id로 층간 간선이 이어진다. 값은 맵의 에스컬레이터 위치 근사.
TRANSIT = {"ESC": [(88, 66), (88, 67), (89, 66), (89, 67)]}


# ── 1. zones ────────────────────────────────────────────────────────────────
def gen_zones():
    """판매 존 19개 + B1 창고 1개.

    zone_id를 'F2-C' 같은 사람이 읽는 문자열로 두는 이유는 스키마 주석대로 —
    에이전트 발화·이벤트 로그·디버깅에서 위치가 즉시 읽혀야 한다.
    """
    rows = []
    for z in sorted({f"F{f}-{zl}" for f, zl, *_ in BAYS}):
        floor, letter = int(z[1]), z[3]
        rows.append((z, floor, f"{ZONE_LABELS[(floor, letter)]} 구역", "SALES"))
    rows.append(("B1-W", 0, "지하 중앙창고", "BACKROOM"))
    return rows


# ── 2. locations ────────────────────────────────────────────────────────────
def gen_locations():
    """베이마다 6단을 펼친다. 반환: (location_id, zone, rack, bay, level, tier, floor, x, y)

    [랙·베이 번호] 존 안에서 같은 (행, 방향)을 공유하는 베이들을 하나의 랙으로 묶고,
    좌표순으로 R01·R02… B01·B02…를 매긴다. 번호가 좌표에서 결정되므로 재생성해도
    같은 자리에 같은 번호가 붙는다 — location_id가 이벤트 로그에 영구히 남기 때문에
    번호가 흔들리면 과거 이벤트가 다른 위치를 가리키게 된다.
    """
    by_zone = defaultdict(list)
    for f, zl, x, y, face in BAYS:
        by_zone[f"F{f}-{zl}"].append((x, y, face, f))

    rows = []
    for zone, bays in sorted(by_zone.items()):
        # 랙 = 같은 줄(가로 랙이면 같은 y, 세로 랙이면 같은 x) + 같은 방향
        groups = defaultdict(list)
        for x, y, face, f in bays:
            axis = y if face in ("U", "D") else x
            groups[(face, axis)].append((x, y, f))
        for rno, key in enumerate(sorted(groups, key=lambda k: (k[1], k[0])), start=1):
            members = sorted(groups[key], key=lambda t: (t[1], t[0]))
            for bno, (x, y, f) in enumerate(members, start=1):
                dx, dy = FACE_D[key[0]]
                ax, ay = x + dx, y + dy          # 접근 지점(통로 셀)
                for lv in range(1, 7):
                    tier = "PICK" if lv <= 3 else "BULK"
                    lid = f"{zone}-R{rno:02d}-B{bno:02d}-L{lv}"
                    rows.append((lid, zone, rno, bno, lv, tier, f, ax, ay))
    # B1 창고: 팔레트 랙 20 × 베이 12 × 6단 (수평 보충의 출발지)
    for rno in range(1, 21):
        for bno in range(1, 13):
            for lv in range(1, 7):
                rows.append((f"B1-W-R{rno:02d}-B{bno:02d}-L{lv}", "B1-W", rno, bno, lv,
                             "BULK", 0, rno * 3, bno * 3))
    return rows


# ── 3. map_cells ────────────────────────────────────────────────────────────
def gen_map_cells():
    """층별 격자. 랙·시설이 놓인 칸은 통행 불가, 나머지는 통로.

    왜 격자를 통째로 저장하는가: 동선 솔버(optimize_route)와 위치 스냅(get_position)이
    같은 격자를 봐야 한다. 프론트가 그린 그림에서 매번 다시 계산하면 두 소스가 갈린다.
    """
    blocked = defaultdict(set)
    for f, zl, x, y, _ in BAYS:
        for dx in range(BAY_CELLS):
            for dy in range(BAY_CELLS):
                blocked[f].add((x + dx, y + dy))
    for f, x, y, w, h in FACILITIES:
        for dx in range(w):
            for dy in range(h):
                blocked[f].add((x + dx, y + dy))
    transit = {}
    for tid, cells in TRANSIT.items():
        for (x, y) in cells:
            for f in (1, 2, 3):
                transit[(f, x, y)] = tid

    rows = []
    for f in (1, 2, 3):
        for y in range(FLOOR_H):
            for x in range(FLOOR_W):
                tid = transit.get((f, x, y))
                # 수직동선 칸은 시설과 겹쳐도 통행 가능해야 층 이동이 성립한다
                passable = 1 if (tid or (x, y) not in blocked[f]) else 0
                rows.append((f, x, y, passable, tid))
    return rows


# ── 4. stocks + shelf_configs ───────────────────────────────────────────────
def gen_stock(locations, products):
    """SKU를 존의 PICK 슬롯에 배정하고, 바로 위 BULK에 예비 재고를 둔다.

    [배정 규칙] 상품은 자기 소분류의 존에만 들어간다(카테고리↔존 정합).
    같은 소분류 상품이 흩어지지 않도록 sku_id 순으로 이어 붙인다 — 실제 매장에서
    같은 종류가 모여 있는 것과 같고, 동선 최적화가 의미를 갖는 전제이기도 하다.

    [초기 재고] 용량의 30~100%를 결정적 난수로. 일부러 낮은 칸을 만드는 이유:
    데모 첫날부터 "매대엔 없는데 위에 있어요"(장면 1) 상태가 존재해야 하기 때문이다.
    """
    rng = random.Random(SEED)
    zone_of_l2 = {t[1]: t[2] for t in TAXONOMY}

    pick_by_zone = defaultdict(list)
    for r in locations:
        if r[5] == "PICK":
            pick_by_zone[r[1]].append(r)
    for z in pick_by_zone:                      # 좌표·단 순으로 정렬 = 결정적
        pick_by_zone[z].sort(key=lambda r: (r[2], r[3], r[4]))

    # catalog.generate()의 행은 튜플이다 — 열 위치를 상수로 이름 붙여 쓴다
    # (숫자 인덱스를 코드에 흩뿌리면 카탈로그 열이 하나 늘 때 조용히 어긋난다)
    SKU, L2, PRICE = 0, 6, 12
    by_zone_products = defaultdict(list)
    for p in products:
        by_zone_products[zone_of_l2[p[L2]]].append(p)
    for z in by_zone_products:
        by_zone_products[z].sort(key=lambda p: p[SKU])

    stocks, configs = [], []
    for zone, plist in by_zone_products.items():
        slots = pick_by_zone[zone]
        assert len(plist) <= len(slots), f"{zone}: 상품 {len(plist)} > PICK 슬롯 {len(slots)}"
        for p, loc in zip(plist, slots):
            lid, _z, rno, bno, lv, _t, _f, _x, _y = loc
            # 용량은 규격이 클수록 작게 — 큰 상품이 한 칸에 덜 들어간다
            cap = 60 if p[PRICE] < 5000 else (36 if p[PRICE] < 30000 else 18)
            replenish = max(4, int(cap * 0.8))
            min_qty = max(2, int(cap * 0.25))
            # 초기 재고 3분기. 대부분은 넉넉하지만 **일부러 부족한 칸을 만든다** —
            # 매대가 전부 가득 차 있으면 데모 첫 장면(장면 1: "매대엔 지금 없는데
            # 약 N분 뒤 채워집니다")을 만들 재료가 세계에 존재하지 않는다.
            # 보충이 필요한 상태는 매장의 예외가 아니라 상시 현실이기도 하다.
            roll = rng.random()
            if roll < 0.02:
                qty = 0                                   # 매대 완전 비었음 (장면 1의 핵심)
            elif roll < 0.06:
                qty = rng.randint(1, min_qty)             # 임계 이하 — 보충 대기
            else:
                qty = rng.randint(int(cap * 0.35), cap)   # 정상
            stocks.append((p[SKU], lid, qty))
            configs.append((p[SKU], lid, min_qty, replenish, cap))
            # 수직 페어: 같은 베이 L(n+3)에 예비 (테스트 17)
            bulk = lid.rsplit("-L", 1)[0] + f"-L{lv + 3}"
            stocks.append((p[SKU], bulk, rng.randint(cap, cap * 4)))
    return stocks, configs


# ── 5. SQL 출력 ─────────────────────────────────────────────────────────────
def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def write_sql(zones, locations, cells, stocks, configs):
    def batch(f, table, cols, rows, fmt, size=500):
        for i in range(0, len(rows), size):
            f.write(f"INSERT INTO {table} ({cols}) VALUES\n")
            f.write(",\n".join(" " + fmt(r) for r in rows[i:i + size]) + ";\n")

    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("-- StoreFlow 세계 시드 (모드 0) — sim/world_gen.py 생성물. 직접 수정 금지.\n"
                f"-- 배치표: sim/map_layout.py (프론트 확정 맵) · 시드 seed={SEED}\n"
                "-- 적재: schema_v2.sql → products_seed.sql → 이 파일 → verify_world.sql\n"
                "-- 좌표계: 격자 1칸 = 1m, 원점 = 매장 내부 좌상단, y는 아래로 증가(화면 좌표계)\n\n"
                "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n"
                "DELETE FROM shelf_configs; DELETE FROM stocks;\n"
                "DELETE FROM map_cells; DELETE FROM locations; DELETE FROM zones;\n"
                "SET FOREIGN_KEY_CHECKS=1;\n\n")
        batch(f, "zones", "zone_id, floor_no, name, zone_type", zones,
              lambda r: f"({q(r[0])},{r[1]},{q(r[2])},{q(r[3])})")
        f.write("\n")
        batch(f, "locations",
              "location_id, zone_id, rack_no, bay_no, level_no, tier_role, floor_no, x, y",
              locations,
              lambda r: f"({q(r[0])},{q(r[1])},{r[2]},{r[3]},{r[4]},{q(r[5])},{r[6]},{r[7]},{r[8]})")
        f.write("\n")
        batch(f, "map_cells", "floor_no, x, y, passable, transit_id", cells,
              lambda r: f"({r[0]},{r[1]},{r[2]},{r[3]},{q(r[4]) if r[4] else 'NULL'})", 1000)
        f.write("\n")
        batch(f, "stocks", "sku_id, location_id, qty", stocks,
              lambda r: f"({r[0]},{q(r[1])},{r[2]})", 1000)
        f.write("\n")
        batch(f, "shelf_configs", "sku_id, location_id, min_qty, replenish_to_qty, capacity_qty",
              configs, lambda r: f"({r[0]},{q(r[1])},{r[2]},{r[3]},{r[4]})", 1000)


if __name__ == "__main__":
    products, _stats, _n = cat.generate()
    zones = gen_zones()
    locations = gen_locations()
    cells = gen_map_cells()
    stocks, configs = gen_stock(locations, products)

    # ── 자체 검산 (적재 전에 터뜨린다 — SQL 에러보다 원인이 명확하다)
    assert len({l[0] for l in locations}) == len(locations), "location_id 중복"
    assert len({s[1] for s in stocks}) == len(stocks), "한 칸에 두 상품 (uq_stk_location 위반)"
    for _s, _l, mn, rp, cp in configs:
        assert mn < rp <= cp, ("shelf_configs 순서 위반", mn, rp, cp)
    picks = {l[0] for l in locations if l[5] == "PICK"}
    assert sum(1 for s in stocks if s[1] in picks) == len(products), "PICK 재고 수 ≠ 상품 수"

    # ── 통로 연결성: 모든 접근 지점이 하나의 통로망으로 이어져 있는가
    # 왜 이 검사가 필요한가: 랙을 조금만 옮겨도 통로가 두 덩이로 갈릴 수 있는데,
    # 그러면 동선 솔버는 에러 없이 **"경로 없음"**을 돌려주고 데모 당일에야 드러난다.
    # 격자 위 너비 우선 탐색(BFS)으로 최대 연결 덩어리를 구해 전부 포함되는지 본다.
    from collections import deque
    passable = {f: set() for f in (1, 2, 3)}
    for f, x, y, ok, _t in cells:
        if ok:
            passable[f].add((x, y))
    for f in (1, 2, 3):
        start = min(passable[f])
        seen, dq = {start}, deque([start])
        while dq:                                   # 상하좌우 4방 이동
            cx, cy = dq.popleft()
            for nx, ny in ((cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)):
                if (nx, ny) in passable[f] and (nx, ny) not in seen:
                    seen.add((nx, ny)); dq.append((nx, ny))
        pts = {(l[7], l[8]) for l in locations if l[6] == f}
        orphan = pts - seen
        assert not orphan, f"{f}F: 통로망에서 끊긴 접근 지점 {len(orphan)}개 {sorted(orphan)[:5]}"
    low = sum(1 for s in stocks if s[1] in picks and s[2] == 0)
    print(f"통로 연결성 3개 층 OK · 매대 빈 칸 {low}개(장면 1 재료)")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)   # OUT과 같은 기준(__file__)으로
    write_sql(zones, locations, cells, stocks, configs)
    print(f"zones {len(zones)} · locations {len(locations):,} · map_cells {len(cells):,} · "
          f"stocks {len(stocks):,} · shelf_configs {len(configs):,}")
    print(f"→ {OUT}")