# ============================================================================
# StoreFlow 세계 생성기 — 모드 0 ②: 회원 10,000 + 행사 이력 (실행계획 B단계 08/20)
# ============================================================================
# [역할] 세계의 **사람과 상거래 사실**을 만들어 SQL로 내보낸다:
#     members (축 4개, v2.5) · promotions (이력 기간 전체의 행사 + 현재 진행분)
#
# [왜 world_gen.py와 분리하는가] world_gen은 배치표(map_layout)에 의존하는
#   **물리 세계**(존·로케이션·재고)이고, 이 파일은 catalog에만 의존하는
#   **사람·상거래 사실**이다. 맵이 바뀌면 world만, 행사 파라미터를 튜닝하면
#   이쪽만 재생성한다 — 재생성 단위가 다르면 파일도 다르다.
#
# [헌법 3] 규칙 기반. 모델 출력을 참조하지 않는다 (world_gen과 같은 이유).
#
# [결정적 생성] SEED 고정 — 같은 입력이면 같은 회원, 같은 행사가 나온다.
#   member_id가 구매 이력(모드 1)과 학습 데이터에 영구히 남으므로, 재생성할 때마다
#   9번 회원이 다른 사람이 되면 이력 전체가 무효가 된다.
#
# [기준일] catalog.BASE_DATE(2026-08-13)를 그대로 쓴다 — 세계의 "현재"는 한 곳에만
#   있어야 한다. 상품 입고일(first_stocked_at)과 행사·가입 시점이 같은 달력 위에
#   서야 "신상인데 행사 중" 같은 교차 질의가 성립한다.
#
# [축 4개 — 세계명세 §4.1의 실행]
#   페르소나 라벨을 버리고 축을 **각각** 뽑는다. 라벨식 생성(조합 7종만 존재)으로
#   되돌아가지 않았는지는 아래 자체 검산의 "조합 존재" 검사가 지킨다.
#   · NULL은 "안 물어봄"이다 — 가입 폼에서 건너뛴 사람이 실제로 있어야
#     에이전트의 "모르면 일반 추천" 분기가 세계 안에서 시험된다.
#   · has_child만 household_size **조건부**다. 완전 독립으로 뽑으면 1인 가구의
#     자녀 보유율이 4인 가구와 같아져(약 절반이 자녀 있음) 세계가 이상해진다.
#     조건부여도 확률이 0은 아니므로 희귀 조합은 여전히 존재한다.
#   · 취향(카테고리 선호)은 여기 없다 — 모드 1(DES)이 이력을 만들 때 내부
#     가중치로만 쓰고 DB에는 안 쓴다. 이력에 흔적으로 남기고 그 흔적에서
#     복원하는 것이 자산 12의 일이다.
# ============================================================================

import io
import os
import random
import sys
from datetime import datetime, timedelta

# 경로는 이 파일 위치 기준 — 실행 위치(cwd)와 무관하게 형제 catalog/를 찾는다
# (world_gen.py와 같은 수법, 08-20 개정의 연장)
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "catalog"))

# 이름 충돌 방어 (평소엔 필요 없다 — 아래 조건에서만 쓰인다)
# 폴더 `catalog/`와 그 안의 `catalog.py`가 **같은 이름**이라, `import catalog`가
# 가리킬 후보가 둘이다: ① catalog.py(우리가 원하는 것) ② 폴더 자체를
# **네임스페이스 패키지**(__init__.py 없는 폴더도 빈 모듈처럼 import되는 것)로 본 것.
# 다행히 파이썬은 **정규 모듈을 네임스페이스 패키지보다 항상 우선**한다 —
# 경로 어딘가에 catalog.py가 있으면 부모 폴더가 경로 앞쪽에 있어도 ①이 이긴다.
# 그래서 평범한 실행(python members_gen.py)에서는 이 줄이 없어도 문제가 없다.
#
# 남는 구멍은 하나뿐이다: **위 sys.path.insert가 돌기 전에 누가 이미 catalog를
# import해 둔 경우.** 파이썬은 import한 모듈을 sys.modules에 캐시하고 그 뒤로는
# 경로를 아예 안 보므로, 그때 잘못 잡힌 빈 모듈이 계속 쓰인다(파이참 파이썬
# 콘솔처럼 상태가 남는 세션이 대표적). 캐시를 걷어내 다시 찾게 하는 한 줄이다.
# (pop의 두 번째 인자 None = 없어도 에러 내지 말 것)
sys.modules.pop("catalog", None)

import catalog as cat                                          # noqa: E402

BASE_DATE = cat.BASE_DATE       # 세계 기준일. cat에서 꺼내 쓴다 —
                                # `from catalog import BASE_DATE`로 따로 import하면
                                # 같은 모듈을 두 경로로 찾게 되어 위 충돌에 두 번 노출된다

SEED = 20260818                  # world_gen과 같은 세계 버전
OUT = os.path.join(_HERE, "out", "members_seed.sql")

N_MEMBERS = 10000                # 세계명세 §4 (08-20 v2: 2,000→10,000).
                                 # 2,000이면 하루 방문 ~95명 — 3층·SKU 5,000짜리
                                 # 창고형 매장의 트래픽이 아니고, 보충 이벤트가
                                 # SKU당 1~2회뿐이라 가용 예측 학습 재료가 모자란다.
                                 # 희소 조합도 풀린다(1인+자녀 3명 → 21명)
MEMBER_BASE = 1000               # member_id = 1001~11000. 시드 대역(< 10,000,000).
                                 # 실사용자는 10,000,000 + consumer_id — 겹칠 수 없다
HISTORY_DAYS = 270               # 이력 기간(세계명세 §4, 08-20 v2: 180→270).
                                 # 소비주기의 병목은 회원 수가 아니라 기간이다 —
                                 # 6~8주 주기 품목의 관측이 3~4회 → 4~6회가 되어야
                                 # 개인 편차(frailty) 추정이 선다. 모드 1(DES)이 같은 값을 쓴다.
                                 # ⚠ 이 값을 바꾸면 난수 소비량이 달라져 **회원 전원이
                                 # 딴사람이 된다**(세계 버전 업) — N_MEMBERS 증가(진부분집합,
                                 # 기존 회원 불변)와 성격이 다르다. 트러블슈팅·이론노트 참조

# ── 축 분포 (자유 파라미터) ─────────────────────────────────────────────────
# 정확한 인구 비율이 목적이 아니다 — 학습에 필요한 것은 **분산과 조합의 존재**다
# (세계명세 §7 체크리스트). 값을 바꾸면 재생성 수 초.
# 창고형 회원은 다인 가구·차량 보유로 기울어 있다는 상식 수준의 근사.
P_NULL = {"hh": 0.08, "pet": 0.10, "child": 0.12, "car": 0.10}   # "안 물어봄" 비율
HH_WEIGHTS = {1: 15, 2: 24, 3: 22, 4: 26, 5: 13}                 # 5 = 5명 이상
P_PET = 0.27                     # 축끼리 독립 — "1인 가구 + 반려동물"이 저절로 생긴다
P_CAR = 0.75                     # 창고형 고유 축 — 차량 편중
P_CHILD_BY_HH = {1: 0.02, 2: 0.18, 3: 0.60, 4: 0.78, 5: 0.82,
                 None: 0.35}     # 가구 규모를 안 밝힌 사람의 자녀 확률은 전체 평균 근사

# ── 행사 파라미터 (자유 파라미터) ───────────────────────────────────────────
# 주 단위 웨이브 — 창고형 전단 행사의 리듬. 이력 시작부터 7일 간격으로 깔아
# 마지막 웨이브가 기준일을 덮는다 → "지금 행사 중"이 세계에 실존한다
# (검색 on_promo_only·망설임 개입의 재료).
# 상수가 아니라 HISTORY_DAYS에서 **파생**시킨다(08-20) — 처음엔 26으로 박아뒀는데,
# 기간을 180→270으로 바꾸는 순간 행사가 앞 180일에만 깔린 반쪽 세계가 될 뻔했다.
# 한 값에서 계산되는 것을 두 곳에 적으면 한쪽만 고치는 날이 온다.
# 180//7+1=26 · 270//7+1=39 — 둘 다 마지막 웨이브 시작이 기준일 6일 이내라 현재를 덮는다.
N_WAVES = HISTORY_DAYS // 7 + 1
WAVE_SKUS = 150                  # 웨이브당 행사 SKU (~전체의 3%)
P_TWO_WEEKS = 0.10               # 10%는 2주 행사 — 기간 다양성(수요 모델 β_promo의 재료)
DISCOUNT_RANGE = (0.05, 0.25)    # 할인율 5~25% → 100원 단위 내림


def _ts(d, hour, minute, sec) -> str:
    """TIMESTAMP(3) 문자열. 밀리초는 .000 — 시드는 밀리초 정밀도가 필요 없다."""
    return f"{d.isoformat()} {hour:02d}:{minute:02d}:{sec:02d}.000"


# ── 1. members ──────────────────────────────────────────────────────────────
def gen_members():
    """회원 N_MEMBERS명(v2: 10,000). 반환: (member_id, hh, pet, child, car, created_at)

    [가입일] 75%는 이력 시작 이전(BASE-720 ~ BASE-181), 25%는 이력 기간 중.
    기간 중 가입자는 이력이 짧다 — 모드 1이 가입일 이후만 구매를 생성하므로
    "이력 2회 미만이라 주기를 못 정하는 회원"이 세계에 자연히 존재하게 된다
    (predict_repurchase의 한계 표시가 실제로 쓰일 재료).
    """
    rng = random.Random(SEED + 1)    # world_gen(SEED)과 다른 난수열 — 같은 시드를
                                     # 두 파일이 쓰면 첫 N개 난수가 겹쳐 상관이 생긴다
    hh_vals = list(HH_WEIGHTS)
    hh_w = list(HH_WEIGHTS.values())

    rows = []
    for i in range(N_MEMBERS):
        member_id = MEMBER_BASE + 1 + i

        # 축마다 먼저 "답했는가"를 뽑고, 답했으면 값을 뽑는다 — NULL이 축마다
        # 독립이라 "가구 규모만 답하고 반려동물은 건너뛴" 회원도 생긴다.
        hh = None if rng.random() < P_NULL["hh"] else \
            rng.choices(hh_vals, weights=hh_w)[0]
        pet = None if rng.random() < P_NULL["pet"] else (rng.random() < P_PET)
        child = None if rng.random() < P_NULL["child"] else \
            (rng.random() < P_CHILD_BY_HH[hh])
        car = None if rng.random() < P_NULL["car"] else (rng.random() < P_CAR)

        if rng.random() < 0.75:
            back = rng.randint(HISTORY_DAYS + 1, 720)      # 이력 시작 이전 가입
        else:
            back = rng.randint(1, HISTORY_DAYS)            # 기간 중 가입
        created = _ts(BASE_DATE - timedelta(days=back),
                      rng.randint(9, 21), rng.randint(0, 59), rng.randint(0, 59))
        rows.append((member_id, hh, pet, child, car, created))
    return rows


# ── 2. promotions ───────────────────────────────────────────────────────────
def gen_promotions(products):
    """행사 이력. 반환: (sku_id, promo_type, discount_krw, starts_at, ends_at)

    [겹침 금지] 같은 SKU의 행사 기간이 겹치면 "지금 할인가가 얼마인가"가 두 답을
    갖는다. 2주 행사로 뽑힌 SKU를 다음 웨이브 후보에서 빼는 것으로 막고,
    자체 검산이 전 조합을 재확인한다.

    [promo_type] DISCOUNT 하나만 쓴다. 스키마는 BUNDLE도 허용하지만 지금
    묶음 행사를 구분해 소비하는 기능이 없다 — 소비자 없는 다양성은 잡음이다
    (BUNDLE이 필요해지는 날 이 함수에 분기 하나 늘리고 재생성하면 된다).
    """
    rng = random.Random(SEED + 2)
    SKU, PRICE = 0, 12               # catalog 행 튜플의 열 위치(world_gen과 동일 상수)
    sku_ids = [p[SKU] for p in products]
    price_of = {p[SKU]: p[PRICE] for p in products}

    rows = []
    carry_over = set()               # 직전 웨이브의 2주 행사 — 이번 주 후보 제외
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
            disc = max(100, int(price * rate / 100) * 100)   # 100원 단위 내림
            if disc >= price:                                # 초저가 상품 방어
                disc = 100
            rows.append((sku, "DISCOUNT", disc,
                         _ts(start, 7, 0, 0),                       # 개점 준비와 함께 시작
                         _ts(start + timedelta(days=days - 1), 23, 59, 59)))

    # ── 현재 진행분 — **데모 시점에 살아 있는 행사** (08-27 신설) ────────────
    # [무엇이 문제였나] 위 웨이브는 BASE_DATE(2026-08-13)에서 끝난다. 그런데
    #   **백엔드는 실제 시계로 행사 유효성을 판정한다**(`pr.startsAt <= :now`).
    #   실기동일이 08-27이면 유효 행사가 **0건**이라, 행사 기능이 통째로 죽는다:
    #     · search_products(on_promo_only=True) → 항상 빈 목록
    #     · final_price_krw 가 늘 정가와 같아 "행사가로 말하라"는 규율이 무의미
    #     · 킬링 장면 2(단위가격 비교)의 "지금 이게 더 싸요"가 성립 안 함
    #   이 함수 독스트링이 "이력 기간 전체의 행사 + **현재 진행분**"이라 적어 두고
    #   현재 진행분을 안 만들고 있었다(08-27 실측: 08-08 기준 161건 / NOW 0건).
    #
    # [왜 종료일을 멀리 두나] 데모 날짜가 계속 밀린다(09/06 마감 → 발표는 그 뒤).
    #   행사를 실기동일에 맞춰 고정하면 **하루만 지나도 또 죽는다.** 세계의 시계와
    #   벽시계가 다른 것이 근본 원인이므로, 이 마지막 웨이브만 **열린 구간**으로
    #   둔다 — 데모 기간 내내 유효하다.
    #
    # [자기충족 아님] 이 행사들도 위와 같은 rng·같은 분포에서 나온다. 다른 것은
    #   기간뿐이고, 소비 이력에 영향을 주지 않는다(DES 는 BASE_DATE 이전만 돈다).
    live_start = BASE_DATE - timedelta(days=3)          # 데모 며칠 전 시작한 것으로
    live_end = BASE_DATE + timedelta(days=180)          # 데모 기간을 넉넉히 덮는다
    # ⚠ 겹침 금지는 이 웨이브에도 걸린다(자체 검산이 잡는다 — 08-27에 실제로 걸렸다).
    #   live_start 가 과거로 3일 물러나므로 **마지막 두 웨이브**의 SKU를 다 빼야
    #   한다: carry_over(2주짜리)뿐 아니라 직전 주에 시작한 1주짜리도 겹칠 수 있다.
    _live_from = _ts(live_start, 7, 0, 0)
    _busy = {r[0] for r in rows if r[4] >= _live_from}   # 종료가 live 시작 이후인 것
    pool = [s for s in sku_ids if s not in carry_over and s not in _busy]
    for sku in rng.sample(pool, WAVE_SKUS):
        price = price_of[sku]
        rate = rng.uniform(*DISCOUNT_RANGE)
        disc = max(100, int(price * rate / 100) * 100)
        if disc >= price:
            disc = 100
        rows.append((sku, "DISCOUNT", disc,
                     _ts(live_start, 7, 0, 0), _ts(live_end, 23, 59, 59)))
    return rows


# ── 3. SQL 출력 ─────────────────────────────────────────────────────────────
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
