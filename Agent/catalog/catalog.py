# ============================================================================
# StoreFlow 카탈로그 생성기 — 상품 시드 (실행계획 5-a, 2026-08-14 / 08-18 맵 반영)
# ============================================================================
# 실행:  python catalog.py          (의존성 없음 — 표준 라이브러리만, CPU 수 초)
# 출력:  out/products_seed.sql  out/products_seed.csv  out/카탈로그_요약.md
#
# 설계 원칙 3개 (세계명세 §3):
#  1) sku_id는 **결정적 부여** — 품목 사전의 "순서"가 ID를 만든다.
#     (item_index × 10 + variant). 따라서 품목 사전은 **append-only**:
#     새 품목은 각 등급 리스트의 맨 끝에만 추가한다. 중간 삽입 = 전체 ID가 밀려
#     구매 이력·이벤트와의 연결이 끊긴다. 이름 "변경"은 안전하다(순서 불변).
#  2) 브랜드명·상품명은 자유 파라미터 — 어떤 모델도 문자열에 의존하지 않는다.
#     팀이 이름을 바꾸면 재실행 수 초로 끝난다.
#  3) 가격은 규격과 정합해야 한다(세계명세 §3.3) — 묶음이 클수록 단위가격
#     5~15% 하락 + 소수(품목의 ~6%)의 역전. 역전이 없으면 "어느 쪽이 이득?"이
#     항상 자명해져 비교 기능이 무의미해진다.
# ============================================================================
import csv, hashlib, io, json, os, sys
from datetime import date, timedelta

from taxonomy import TAXONOMY, BRAND_POOLS
from items_food import ITEMS_FOOD
from items_living import ITEMS_LIVING
from items_nonfood import ITEMS_NONFOOD

ITEMS = {**ITEMS_FOOD, **ITEMS_LIVING, **ITEMS_NONFOOD}

BASE_DATE = date(2026, 8, 13)   # 세계 기준일 — Date.now()류 비결정 요소를 쓰지 않는다
SKU_BASE  = 200000              # 샘플 행(101042~103902)과 절대 안 겹치는 대역

# ── 결정적 난수 대용 ─────────────────────────────────────────────────────────
# random 모듈을 쓰지 않는 이유: 시드를 걸어도 파이썬 버전에 따라 시퀀스가 바뀔
# 수 있다. md5(문자열)은 언어·버전 불변 → "같은 사전이면 같은 세계"가 보장된다.
def h(*parts) -> int:
    return int(hashlib.md5("|".join(str(p) for p in parts).encode()).hexdigest(), 16)

def hf(lo, hi, *parts) -> float:            # [lo, hi) 구간의 결정적 실수
    return lo + (h(*parts) % 10**6) / 10**6 * (hi - lo)

# ── EAN-13 ──────────────────────────────────────────────────────────────────
def ean13(sku_id: int) -> str:
    # '8809'(한국 국가코드 880 + 가상 업체 9) + sku_id 8자리 → 12자리 + 체크섬.
    # sku_id가 유일하므로 바코드 유일성(uq_barcode)이 자동으로 따라온다.
    body = "8809" + str(sku_id).zfill(8)
    s = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(body))
    return body + str((10 - s % 10) % 10)

# ── 등급별 SKU 수 배분 ───────────────────────────────────────────────────────
# A=6(5~8 허용), B=3.5(3~4), C=1 을 기본으로 깔고, l2 쿼터에 정확히 맞을 때까지
# B→A 순으로 ±1 조정한다. 사전 작성 시 개수를 정밀하게 맞출 필요가 없게 하기
# 위한 장치 — 쿼터는 코드가 맞추고, 사람은 품목 이름만 쓴다.
def allocate(l2, quota, items):
    nA, nB, nC = len(items["A"]), len(items["B"]), len(items["C"])
    counts = [6] * nA + [4 if i % 2 == 0 else 3 for i in range(nB)] + [1] * nC
    lo = [5] * nA + [3] * nB + [1] * nC     # 등급별 하한
    hi = [8] * nA + [4] * nB + [1] * nC     # 등급별 상한
    diff = quota - sum(counts)
    order = list(range(nA, nA + nB)) + list(range(nA))  # B 먼저, 그다음 A
    guard = 0
    while diff != 0:
        moved = False
        for i in order:
            if diff > 0 and counts[i] < hi[i]:
                counts[i] += 1; diff -= 1; moved = True
            elif diff < 0 and counts[i] > lo[i]:
                counts[i] -= 1; diff += 1; moved = True
            if diff == 0: break
        guard += 1
        if not moved or guard > 50:
            sys.exit(f"FAIL: {l2} 쿼터 {quota}를 품목 수(A{nA}/B{nB}/C{nC})로 못 맞춤 — 품목 추가/삭제 필요")
    return counts

# ── 가격 ────────────────────────────────────────────────────────────────────
def price_of(l2, item, unit_price, value, rung_idx, n_rungs):
    # 품목 고유 계수(0.75~1.40): 같은 l2 안에서도 품목마다 단가가 다르다.
    factor = hf(0.75, 1.40, "factor", l2, item)
    # 묶음 계단이 오를수록 단위가격 5%씩 인하(최대 15%) — §3.3의 정합 규칙.
    disc = 1.0 - min(rung_idx, 3) * 0.05
    # 역전 케이스: 품목의 ~6%는 최대 묶음이 오히려 단위가격이 비싸다.
    # ("어느 쪽이 이득?"이 항상 자명하지 않게 만드는 최소 장치)
    if rung_idx == n_rungs - 1 and h("invert", l2, item) % 16 == 0:
        disc = 1.06
    raw = unit_price * factor * value * disc
    return max(100, int(round(raw / 100)) * 100 - 10)   # 12,890원 스타일 끝자리

# ── 규격 ────────────────────────────────────────────────────────────────────
UNIT_LABEL = {"volume_ml": "ml", "weight_g": "g", "count_ea": "입",
              "count_sheet": "매", "count_roll": "롤", "count_tab": "정"}

def spec_of(unit, rung):
    # rung = (낱개 값, 묶음 수, 표기). 묶음>1이면 총량 = 낱개×묶음, alt에 묶음 기록.
    per, pack, label = rung
    total = per * pack
    q = {"primary": unit, "value": total}
    if pack > 1:
        q["alt"] = {"count_pack": pack}
    return json.dumps({"raw": label, "quantity": q}, ensure_ascii=False), label, total

# ── 입고일 ──────────────────────────────────────────────────────────────────
def stocked_at(l2, item, vi):
    # 대부분은 90~700일 전(자리 잡은 상품), 4%만 최근 30일(기능 20 "취향인 신상"의
    # 존재 근거). 분포는 세계명세 §3.5 — 이벤트가 아니라 정적 속성.
    if h("new", l2, item, vi) % 100 < 4:
        back = h("newd", l2, item, vi) % 30
    else:
        back = 90 + h("oldd", l2, item, vi) % 610
    return (BASE_DATE - timedelta(days=int(back))).isoformat()

# ── 본체 ────────────────────────────────────────────────────────────────────
def generate():
    rows, item_index = [], 0
    stats = []
    for l1, l2, zone, quota, flags, unit, rungs, unit_price in TAXONOMY:
        items = ITEMS.get(l2) or sys.exit(f"FAIL: 품목 사전에 '{l2}' 없음")
        ordered = ([("A", n) for n in items["A"]] + [("B", n) for n in items["B"]]
                   + [("C", n) for n in items["C"]])
        counts = allocate(l2, quota, items)
        pool = BRAND_POOLS[l1]
        n_sku = 0
        for (grade, item), cnt in zip(ordered, counts):
            # 품목별 브랜드 라인업: 풀에서 결정적으로 3개 회전 선택
            b0 = h("brand", l2, item) % len(pool)
            brands = [pool[(b0 + k) % len(pool)] for k in range(3)]
            # 품목별 규격 사다리: 전체 사다리에서 시작점만 품목마다 다르게
            r0 = h("rung", l2, item) % max(1, len(rungs) - 2)
            for vi in range(cnt):
                sku_id = SKU_BASE + item_index * 10 + vi
                # PB 규칙(세계명세 §3.6): B급 전 품목의 0번 변형 + A급 절반의 0번
                # 변형이 PB → 전체의 ~20%. 상품명 = "PB-{품목} {규격}", 브랜드 = 'PB'
                is_pb = (grade == "B" and vi == 0) or \
                        (grade == "A" and vi == 0 and h("pbA", l2, item) % 2 == 0)
                if grade == "C":
                    ri = min(r0 + 1, len(rungs) - 1)          # 단독품은 중간 규격 1개
                else:
                    # 브랜드 3 × 규격의 격자 "순서대로" 순회(vi%3, vi//3) — 전단사라
                    # (브랜드, 규격) 조합이 절대 겹치지 않고(상품명 중복 방지),
                    # 같은 규격에 브랜드 3개가 서므로 "같은 규격, 다른 브랜드" 비교가 성립
                    ri = min(r0 + vi // 3, len(rungs) - 1)
                rung = rungs[ri]
                spec_json, label, total = spec_of(unit, rung)
                brand = "PB" if is_pb else brands[vi % 3]
                name = (f"PB-{item} {label}" if is_pb else f"{brand} {item} {label}")
                krw = price_of(l2, item, unit_price, total, ri, len(rungs))
                if is_pb:
                    krw = max(100, int(krw * 0.88 / 100) * 100 - 10)  # PB는 동급 대비 ~12% 저렴
                r, f_, a, fr = flags
                rows.append((sku_id, ean13(sku_id), name, brand, int(is_pb), l1, l2,
                             r, f_, a, fr, unit, krw, spec_json, label,
                             f"/img/{sku_id}.webp", stocked_at(l2, item, vi), "ACTIVE"))
                n_sku += 1
            item_index += 1
        assert n_sku == quota, (l2, n_sku, quota)
        stats.append((l1, l2, zone, quota, len(ordered)))
    return rows, stats, item_index

# 출력 폴더는 cwd가 아니라 이 파일 위치 기준 (08-20 개정 — world_gen과 같은 이유).
# cwd 기준이면 다른 폴더에서 돌렸을 때 엉뚱한 곳에 out/이 생긴다.
_OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

def _out(name):
    """out/ 안의 파일 경로를 만든다 — 항상 catalog/out/을 가리킨다."""
    return os.path.join(_OUT_DIR, name)

def write_outputs(rows, stats, n_items):
    os.makedirs(_OUT_DIR, exist_ok=True)
    cols = ("sku_id, barcode, name, brand, is_pb, category_l1, category_l2,\n"
            "  is_refrigerated, is_frozen, is_alcohol, is_fresh, unit, price_krw,\n"
            "  spec, spec_raw, image_url, first_stocked_at, lifecycle_status")
    def sqlv(r):
        e = lambda s: str(s).replace("\\", "\\\\").replace("'", "''")
        return (f"({r[0]},'{r[1]}','{e(r[2])}','{e(r[3])}',{r[4]},'{e(r[5])}','{e(r[6])}',"
                f"{r[7]},{r[8]},{r[9]},{r[10]},'{r[11]}',{r[12]},'{e(r[13])}','{e(r[14])}',"
                f"'{r[15]}','{r[16]}','{r[17]}')")
    with io.open(_out("products_seed.sql"), "w", encoding="utf-8", newline="\n") as f:
        f.write("-- StoreFlow 상품 시드 — catalog.py 생성물 (직접 수정 금지: 사전을 고치고 재생성)\n"
                "-- 적재: docker exec -i storeflow_mysql mysql -uroot -p1234 "
                "--default-character-set=utf8mb4 storeflow_db < products_seed_5000.sql\n"
                "SET NAMES utf8mb4;\n\n")
        for i in range(0, len(rows), 250):   # 250행 배치 — 한 문장 초과 방지 + 재적재 속도
            f.write(f"INSERT INTO products\n ({cols}) VALUES\n")
            f.write(",\n".join(sqlv(r) for r in rows[i:i+250]) + ";\n\n")
    with io.open(_out("products_seed.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)   # utf-8-sig: 엑셀에서 바로 열려도 한글이 안 깨지게
        w.writerow(["sku_id","barcode","name","brand","is_pb","category_l1","category_l2",
                    "is_refrigerated","is_frozen","is_alcohol","is_fresh","unit","price_krw",
                    "spec","spec_raw","image_url","first_stocked_at","lifecycle_status"])
        w.writerows(rows)
    pb = sum(r[4] for r in rows)
    with io.open(_out("카탈로그_요약.md"), "w", encoding="utf-8") as f:
        f.write("# StoreFlow 카탈로그 시드 — 소분류 60 · 5,000 SKU 요약\n\n")
        f.write(f"생성 기준일 {BASE_DATE} · 품목 {n_items} · SKU {len(rows)} · PB {pb} ({pb/len(rows):.0%})\n\n")
        f.write("| 대분류 | 소분류 | 존 | SKU | 품목 |\n|---|---|---|---|---|\n")
        for l1, l2, zone, quota, ni in stats:
            f.write(f"| {l1} | {l2} | {zone} | {quota} | {ni} |\n")
    print(f"OK: SKU {len(rows)} / 품목 {n_items} / PB {pb} ({pb/len(rows):.1%})")
    ids = [r[0] for r in rows]
    assert len(set(ids)) == len(ids) and len(set(r[1] for r in rows)) == len(rows)
    # 상품명 중복 = 사전에 같은 품목이 두 번 들어갔다는 뜻 — 조용히 넘어가지 않는다
    names = [r[2] for r in rows]
    dup = {n for n in names if names.count(n) > 1} if len(set(names)) != len(names) else set()
    assert not dup, f"상품명 중복: {sorted(dup)[:5]}"
    # 총 SKU 수는 taxonomy의 쿼터 합에서 유도한다 — 여기에 숫자를 박아두면
    # 존 용량이 바뀔 때마다 두 곳을 고쳐야 하고, 한 곳만 고치면 검산이 거짓이 된다.
    expected = sum(t[3] for t in TAXONOMY)
    assert len(rows) == expected, (len(rows), expected)

if __name__ == "__main__":
    rows, stats, n_items = generate()
    write_outputs(rows, stats, n_items)
