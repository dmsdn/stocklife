# ============================================================================
# 모드 0 ③ — 위시리스트 시드 (`sim/out/wishlist_seed.sql`)
# ============================================================================
# [왜 시드인가 — 주입이 아니라]
#   08-28 에 자발형 두 장면(보충 완료·자리 이동)은 **주입**으로 풀었다. 그것들은
#   사건이라 시연 중에 일어나야 의미가 있고, 백엔드 창구가 상태까지 바꿔 준다.
#   위시리스트는 반대다 — 「이 손님이 무엇을 찜해 뒀는가」는 **상태**다.
#   주입으로 심으면 DB 를 다시 적재할 때마다 사라진다.
#
#     사건은 주입, 상태는 시드.
#
# [왜 취향에서 뽑나 — 아무거나 심으면 안 되는 이유]
#   위시리스트는 `get_wishlist` 의 재료이면서 **진입 브리핑의 재료**다
#   ("찜하신 것 중에 오늘 행사하는 게 있어요"). 무작위로 심으면 그 발화가
#   "생전 안 살 물건을 찜해 뒀다"가 되어 데모에서 티가 난다.
#   그래서 `mode1._member_prefs` 와 **같은 난수열**로 같은 취향을 재현한다 —
#   구매 이력을 만든 그 취향이다. 그래야 "산 것"과 "찜한 것"이 한 사람으로 보인다.
#
# [왜 산 것을 빼나] 찜은 「살까 말까 눈여겨 둔 것」이다. 이미 습관적으로 사는
#   물건은 찜 목록에 없다 — 그건 재구매 알림(소비주기)의 영역이고, 둘이 겹치면
#   진입 브리핑이 같은 상품을 두 번 말한다.
#
# [결정적] 같은 SEED 면 같은 목록이 나온다. 재생성해도 데모가 안 바뀐다.
#
# 실행:  python sim/wishlist_gen.py
# ============================================================================
from __future__ import annotations

import csv
import os
import random
import sys
from datetime import datetime, timedelta

import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
sys.path.insert(0, _HERE)
# ⚠ params.py 가 catalog 를 import 한다 — 그 폴더도 길에 올려야 한다
#   (mode1·members_gen 과 같은 두 줄이다).
sys.path.insert(0, os.path.join(_HERE, "..", "catalog"))

import params as P                                             # noqa: E402

CATALOG = os.path.join(_ROOT, "catalog", "out", "products_seed_5000.csv")
MEMBERS = os.path.join(_HERE, "out", "members_seed.sql")
PURCHASES = os.path.join(_HERE, "out", "mode1", "purchases.csv.gz")
OUT = os.path.join(_HERE, "out", "wishlist_seed.sql")

# 회원당 찜 개수 — 3~8. 실제 서비스의 위시리스트는 길지 않다(길면 그건 장바구니다).
N_MIN, N_MAX = 3, 8
# 찜한 시각의 창. DEMO_NOW(2026-08-08) 이전 최근 60일 안에 흩는다 —
# 전부 같은 날이면 "일괄 생성"이 눈에 보인다.
DEMO_NOW = datetime(2026, 8, 8, 14, 20, 0)
SPREAD_DAYS = 60


def _rng(*key) -> np.random.Generator:
    """`mode1._rng` 와 같은 함수. 같은 key 면 같은 수다.

    ⚠ 복사해 온 이유: `sim/mode1.py` 를 import 하면 DES 엔진 전체가 딸려 온다
      (무겁고, 이 파일은 세계를 굴리지 않는다). 세 줄이라 옮기는 편이 싸다 —
      다만 **P.SEED 를 같이 쓰므로 같은 세계**다.
    """
    return np.random.default_rng(np.random.SeedSequence([P.SEED, *key]))


def load_catalog():
    """sku → 소분류. ⚠ catalog.py 가 BOM 을 붙여 쓴다 — utf-8-**sig**."""
    by_l2: dict[str, list[int]] = {}
    l2_of: dict[int, str] = {}
    with open(CATALOG, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            sku, l2 = int(r["sku_id"]), r["category_l2"]
            by_l2.setdefault(l2, []).append(sku)
            l2_of[sku] = l2
    return by_l2, l2_of


def load_members() -> list[int]:
    """members_seed.sql 에서 member_id 만. 회원 표의 정본이 그 파일이라 거기서 읽는다."""
    ids = []
    on = False
    with open(MEMBERS, encoding="utf-8") as f:
        for line in f:
            if line.startswith("INSERT INTO "):
                on = line.startswith("INSERT INTO members ")
                continue
            # ⚠ 값 줄이 **공백으로 시작한다**(members_gen 이 그렇게 쓴다).
            #   `line.startswith("(")` 로 보면 한 명도 못 찾고 **조용히 빈 시드**가
            #   나온다 — 08-28 에 실제로 0명이 나왔다. 먼저 strip 한다.
            t = line.strip()
            if on and t.startswith("("):
                ids.append(int(t.lstrip("(").split(",")[0]))
    return ids


def load_bought() -> dict[int, set[int]]:
    """회원 → 산 sku 집합. 전량 DES 산출(parquet/csv.gz)이 세계의 진실이다.

    없으면 빈 dict 로 물러선다 — 그러면 '안 산 것' 조건이 느슨해질 뿐
    시드는 나온다. 모드 1 을 안 돌린 기계에서도 이 파일이 돌아야 한다.
    """
    if not os.path.exists(PURCHASES):
        print(f"⚠ 구매 이력이 없다({os.path.relpath(PURCHASES, _ROOT)}) — "
              "'안 산 것' 조건 없이 뽑는다.")
        return {}
    import pandas as pd
    d = pd.read_csv(PURCHASES, usecols=["member_id", "sku_id"])
    out: dict[int, set[int]] = {}
    for m, s in zip(d["member_id"].to_numpy(), d["sku_id"].to_numpy()):
        out.setdefault(int(m), set()).add(int(s))
    return out


def prefs_of(member_id: int, all_l2) -> dict[str, float]:
    """`mode1._member_prefs` 를 그대로 재현한다 — key 가 (mid, 7) 인 것까지 같다.

    ⚠ 여기서 key 를 바꾸면 **구매 이력을 만든 취향과 다른 취향**이 나온다.
      그러면 "이 사람이 산 것"과 "찜한 것"이 딴사람 것처럼 보인다.
    """
    rng = _rng(member_id, 7)
    prefs = {l2: 0.2 for l2 in all_l2}
    n_fav = int(rng.integers(4, 9))
    for l2 in rng.choice(list(all_l2), size=min(n_fav, len(all_l2)), replace=False):
        prefs[l2] = float(rng.uniform(1.5, 4.0))
    return prefs


def main() -> int:
    if not os.path.exists(CATALOG):
        print(f"✗ 카탈로그가 없다: {CATALOG}  (python catalog/catalog.py)")
        return 2
    if not os.path.exists(MEMBERS):
        print(f"✗ 회원 시드가 없다: {MEMBERS}  (python sim/members_gen.py)")
        return 2

    by_l2, _l2_of = load_catalog()
    all_l2 = sorted(by_l2)
    members = load_members()
    bought = load_bought()
    print(f"카탈로그 소분류 {len(all_l2)} · 회원 {len(members):,}명 · "
          f"이력 있는 회원 {len(bought):,}명")
    if not members:
        # ⚠ 여기서 안 멈추면 0건짜리 SQL 이 나오고, 그걸 적재하면
        #   `DELETE FROM wishlists` 만 돌아 **있던 것까지 지운다.**
        print("✗ 회원을 한 명도 못 읽었다 — members_seed.sql 의 모양을 확인한다.")
        return 2

    rows = []
    for mid in members:
        prefs = prefs_of(mid, all_l2)
        # 취향 가중으로 소분류를 뽑는다. 가중이 0.2 인 것도 뽑히긴 한다 —
        # 사람은 늘 사던 것만 찜하지 않는다(그러면 그건 재구매 목록이다).
        w = np.array([prefs[l] for l in all_l2], dtype=float)
        w = w / w.sum()
        r = _rng(mid, 91)                    # 7 은 취향이 쓴다 — 다른 열을 쓴다
        n = int(r.integers(N_MIN, N_MAX + 1))
        seen = bought.get(mid, set())
        picked: set[int] = set()
        for _ in range(n * 4):               # 여유를 두고 뽑다가 n 개 채우면 그만
            if len(picked) >= n:
                break
            l2 = all_l2[int(r.choice(len(all_l2), p=w))]
            cands = by_l2[l2]
            sku = int(cands[int(r.integers(len(cands)))])
            if sku in seen or sku in picked:
                continue                     # 산 것·중복은 건너뛴다
            picked.add(sku)
            # 찜한 시각 — 최근 SPREAD_DAYS 일 안에 흩는다.
            at = DEMO_NOW - timedelta(seconds=float(r.integers(0, SPREAD_DAYS * 86400)))
            rows.append((mid, sku, at.strftime("%Y-%m-%d %H:%M:%S.000")))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("-- StoreFlow 위시리스트 시드 (모드 0 ③) — sim/wishlist_gen.py 생성물. "
                "직접 수정 금지.\n")
        f.write(f"-- 회원 {len(members):,}명 · 찜 {len(rows):,}건 · seed={P.SEED}\n")
        f.write("-- 적재: … → members_seed.sql → 이 파일\n")
        f.write("--   취향은 mode1._member_prefs 와 같은 난수열이라 구매 이력과 "
                "같은 사람으로 보인다.\n\n")
        f.write("DELETE FROM wishlists;\n\n")
        # 한 문장에 다 넣으면 max_allowed_packet 에 걸린다 — 1,000행씩 끊는다.
        for i in range(0, len(rows), 1000):
            chunk = rows[i:i + 1000]
            f.write("INSERT INTO wishlists (member_id, sku_id, added_at) VALUES\n")
            f.write(",\n".join(f"({m},{s},'{a}')" for m, s, a in chunk))
            f.write(";\n\n")

    size = os.path.getsize(OUT) / 1024
    print(f"→ {os.path.relpath(OUT, _ROOT)}  {size:.0f}KB · {len(rows):,}건 "
          f"(회원당 평균 {len(rows)/max(1,len(members)):.1f})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
