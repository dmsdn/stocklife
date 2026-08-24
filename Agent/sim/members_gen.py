# ===============================================
# Agent 관제 생성기 - 회원 2,000 + 행사 이력
# ===============================================

# [역할] 관제의 **사람과 행사이력**을 만들어 SQL DDL로 내보냄 - members + promotions(180일 행사이력 + 현재 진행분)

# [world_gen.py와 분리하는 이유]
# world_gen은 map_layout에 의존하는 물리세계(존·로케이션·재고)이고, 이 파일은 catalog에만 의존하는 사람 및 프로모션 이력
# 맵이 바뀌면 world만, 행사 파라미터를 튜닝하면 이 파일만 재생성하면 됨

# [헌법 3] 규칙 기반. 모델 출력을 참조하지 않음

# [결정적 생성] SEED 고정 - 같은 입력이면 같은 회원, 같은 행사가 나옴
# member_id가 구매이력과 학습데이터에 영구히 남으므로, 재생성할때마다 9번 회원이 다른 사람이 되면 이력 전체가 무효가 됨

# [기준일] catalog.BASE_DATE(2026-08-13)를 그대로 씀.
# 관제의 "현재"는 한 곳에만 있어야 함. 상품 입고일과 행사·가입 시점이 같은 달력 위에 서야, "신상인데 행사 중" 같은 교차 질의가 성립

# [축 4개]
# Null = "안 물어봄" / 가입 폼에서 건너뛴 사람이 실제로 있어야 에이전트의 "모르면 일반 추천" 분기가 관제 안에서 시험됨
# has_child만 household_size에 조건부. 완전 독립으로 뽑으면 1인 가구의 자녀 보유율이 4인 가구와 같아져 관제가 이상해짐. 조건부여도 확률이 0이 아니므로 희귀조합은 여전히 존재

# ===============================================

import io
import os
import random
import sys
from datetime import datetime, timedelta

# 경로는 이 파일 위치 기준 - 실행 위치(cwd)와 무관하게 형제 catalog/를 찾음
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "catalog"))

sys.modules.pop("catalog", None)

import catalog as cat  # noqa: E402

BASE_DATE = cat.BASE_DATE

SEED = 20260818
OUT = os.path.join(_HERE, "out", "members_seed.sql")

N_MEMBERS = 10000
MEMBER_BASE = 1000
HISTORY_DAYS = 270

# ===============================================

# 축 분포: 자유 파라미터(고를 수 있는 값)
# 정확한 인구 비율이 목적이 아님 - 학습에 필요한 것은 **분산과 조합의 존재** (실제 한국 인구 통계와 일치가 아닌 학습에 필요한 성질을 갖췄는가)
# 창고형 회원은 다인 가구·차량보유로 기울어 있다는 상식 수준의 근사
P_NULL = {"hh": 0.08, "pet": 0.10, "child": 0.12, "car": 0.10}  # "안 물어봄" 비율, 정밀한 근거가 있는 값은 아니며, "축마다 다르다"는 성질 자체가 목적
# 전부 10%로 똑같으면 NULL축이 무관한 균일 잡음이 됨
HH_WEIGHTS = {1: 15, 2: 24, 3: 22, 4: 26, 5: 13}  # 가중치
# HH_WEIGHTS와 독립으로 뽑는 두 축
P_PET = 0.27  # 한국 반려가구 비율 근사치
P_CAR = 0.75  # 일반 인구의 차량 보유율보다 높게 잡음(창고형 매장 업태 반영)
# HH_WEIGHTS에 조건부. 완전 독립으로 뽑으면 1인 가구의 자녀 보유율이 4인 가구와 같아짐
# None: 가구 규모를 밝히지 않은 사람의 자녀 확률
P_CHILD_BY_HH = {1: 0.02, 2: 0.18, 3: 0.60, 4: 0.78, 5: 0.82, None: 0.35}

# 행사 파라미터: 자유 파라미터
# 주 단위 웨이브 - 창고형 전단 행사의 리듬. 이력시작 (BASE-179)부터 7일 간격
# 26주를 깔면 마지막 웨이브(BASE-4 시작)가 기준일을 덮음 -> 지금 행사 중이 관제에 실존
N_WAVES = HISTORY_DAYS // 7 + 1
WAVE_SKUS = 150
P_TWO_WEEKS = 0.10
DISCOUNT_RANGE = (0.05, 0.25)


def _ts(d, hour, minute, sec) -> str:
    return f"{d.isoformat()} {hour:02d}:{minute:02d}:{sec:02d}.000"


# ===============================================

# ① members
def gen_members():
    rng = random.Random(SEED + 1)
    hh_vals = list(HH_WEIGHTS)
    hh_w = list(HH_WEIGHTS.values())

    rows = []
    for i in range(N_MEMBERS):
        member_id = MEMBER_BASE + 1 + i

        hh = None if rng.random() < P_NULL["hh"] else rng.choices(hh_vals, weights=hh_w)[0]
        pet = None if rng.random() < P_NULL["pet"] else (rng.random() < P_PET)
        child = None if rng.random() < P_NULL["child"] else (rng.random() < P_CHILD_BY_HH[hh])
        car = None if rng.random() < P_NULL["car"] else (rng.random() < P_CAR)

        if rng.random() < 0.75:
            back = rng.randint(HISTORY_DAYS + 1, 720)
        else:
            back = rng.randint(1, HISTORY_DAYS)
        created = _ts(BASE_DATE - timedelta(days=back),
                      rng.randint(9, 21), rng.randint(0, 59), rng.randint(0, 59))
        rows.append((member_id, hh, pet, child, car, created))
    return rows


# ② promotions
def gen_promotions(products):
    rng = random.Random(SEED + 2)
    SKU, PRICE = 0, 12
    sku_ids = [p[SKU] for p in products]
    price_of = {p[SKU]: p[PRICE] for p in products}

    rows = []
    carry_over = set()
    first_start = BASE_DATE - timedelta(days=HISTORY_DAYS - 1)
    for w in range(N_WAVES):
        start = first_start + timedelta(days=7 * w)
        pool = [s for s in sku_ids if s not in carry_over]
        picked = rng.sample(pool, WAVE_SKUS)
        carry_over = set()
        for sku in picked:
            days = 14 if rng.random() < P_TWO_WEEKS else 7
            if days == 14:
                carry_over.add(sku)
            price = price_of[sku]
            rate = rng.uniform(*DISCOUNT_RANGE)
            disc = max(100, int(price * rate / 100) * 100)
            if disc >= price:
                disc = 100
            rows.append((sku, "DISCOUNT", disc,
                         _ts(start, 7, 0, 0),  # 개점 준비와 함께 시작
                         _ts(start + timedelta(days=days - 1), 23, 59, 59)))
    return rows


# ③ SQL 출력
def _sql(v):
    """파이썬 값 → SQL 리터럴. None→NULL, bool→1/0 (BOOLEAN은 TINYINT(1)이다)."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def write_sql(members, promos):
    def batch(f, table, cols, rows, size=500):
        for i in range(0, len(rows), size):
            f.write(f"INSERT INTO {table} ({cols}) VALUES\n")
            f.write(",\n".join(" (" + ",".join(_sql(v) for v in r) + ")"
                               for r in rows[i:i + size]) + ";\n")

    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("-- StoreFlow 회원·행사 시드 (모드 0 ②) — sim/members_gen.py 생성물. 직접 수정 금지.\n"
                f"-- 기준일 {BASE_DATE} · 이력 {HISTORY_DAYS}일 · seed={SEED}\n"
                "-- 적재: schema_v2.sql → products_seed.sql → world_seed.sql → 이 파일 → verify_members.sql\n\n"
                "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n"
                "DELETE FROM promotions; DELETE FROM members;\n"
                "SET FOREIGN_KEY_CHECKS=1;\n\n")
        batch(f, "members",
              "member_id, household_size, has_pet, has_child, by_car, created_at",
              members)
        f.write("\n")
        # promo_id는 AUTO_INCREMENT — 시드가 번호를 정하지 않는다(재적재마다 새 번호,
        # 어디에도 promo_id를 참조하는 시드가 없으므로 무해)
        batch(f, "promotions",
              "sku_id, promo_type, discount_krw, starts_at, ends_at", promos)


if __name__ == "__main__":
    products, _stats, _n = cat.generate()
    members = gen_members()
    promos = gen_promotions(products)

    # ── 자체 검산 (적재 전에 터뜨린다) ──────────────────────────────────────
    assert len(members) == N_MEMBERS
    ids = {m[0] for m in members}
    assert len(ids) == N_MEMBERS, "member_id 중복"
    assert max(ids) < 10_000_000, "시드 대역 이탈 — 실사용자 대역 침범"

    # 조합 존재 — 라벨식 생성으로 되돌아가지 않았는가 (세계명세 §7)
    combo_pet_solo = sum(1 for m in members if m[1] == 1 and m[2] is True)
    combo_no_car = sum(1 for m in members if (m[1] or 0) >= 4 and m[4] is False)
    assert combo_pet_solo > 0, "1인 가구 + 반려동물 조합이 0 — 축이 독립이 아니다"
    assert combo_no_car > 0, "4인 이상 + 차 없음 조합이 0"

    # NULL이 실존하되 과하지 않은가 ("안 물어봄"은 세계의 일부지 주류가 아니다)
    for idx, name in ((1, "household_size"), (2, "has_pet"),
                      (3, "has_child"), (4, "by_car")):
        n_null = sum(1 for m in members if m[idx] is None)
        assert 0.03 < n_null / N_MEMBERS < 0.25, (name, n_null)

    # 행사 — 기간·할인·겹침
    price_of = {p[0]: p[12] for p in products}
    spans = {}
    for sku, _t, disc, s, e in promos:
        assert s < e, ("기간 역전", sku)
        assert 0 < disc < price_of[sku], ("할인이 가격 이상", sku, disc)
        for ps, pe in spans.get(sku, ()):
            assert not (s <= pe and ps <= e), ("같은 SKU 행사 기간 겹침", sku)
        spans.setdefault(sku, []).append((s, e))
    now = _ts(BASE_DATE, 12, 0, 0)
    live = sum(1 for _s, _t, _d, s, e in promos if s <= now <= e)
    assert live > 50, f"기준일에 행사 중인 SKU가 {live}개 — 검색 on_promo_only가 빈다"

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    write_sql(members, promos)
    n_null_total = sum(1 for m in members for v in m[1:5] if v is None)
    print(f"members {len(members):,} (1인+반려 {combo_pet_solo} · 4인+차없음 {combo_no_car} · "
          f"NULL 칸 {n_null_total}) · promotions {len(promos):,} (지금 행사 중 {live})")
    print(f"→ {OUT}")
