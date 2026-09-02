# -*- coding: utf-8 -*-
# ============================================================================
# 검색어 후보정 색인 굽기 — 카탈로그 → Agent/app/artifacts/searchterm.npz
# ============================================================================
# [무엇을 만드나] 손님이 칠 법한 **낱말**들의 자모 색인. 하네스가 검색 0건일 때
#   이 색인에서 가장 가까운 낱말을 찾아 다시 검색한다(`app/searchterm.py`).
#
# [왜 상품명 전체가 아니라 낱말인가 — 이 파일의 핵심 결정]
#   상품명은 "농부의아침 한우 등심 500g" 처럼 길다. 손님이 치는 것은 "한우"·
#   "등심" 같은 **조각**이다. 전체 이름을 색인하면 "등심"과의 편집거리가
#   20을 넘어 아무것도 안 붙는다. 그래서 공백으로 쪼개 **토큰**을 모은다.
#   토큰은 이름 안에 그대로 들어 있으므로 백엔드의 `LIKE '%토큰%'` 에도 걸린다
#   — 고친 낱말이 **실제로 검색되는 낱말**이어야 한다는 조건을 이렇게 지킨다.
#
# [무엇을 버리나] "500g"·"2입"·"1L" 같은 규격 토큰. 이것들은 검색어로 쳐도
#   의미가 없고, 서로 편집거리가 1~2라 **오답의 온상**이다("500g"→"300g").
#
# [언제 다시 굽나] ⚠ `catalog.py` 를 다시 돌렸으면 이것도 다시 돌린다.
#   안 그러면 색인이 없는 상품으로 손님을 안내한다.
#
#   python catalog/searchterm_gen.py
# ============================================================================
import csv
import io
import os
import re
import sys

import numpy as np

# ── 저장소 루트 찾기 (배치 무관) ────────────────────────────────────────────
# 이 파일은 두 곳에서 돈다: warehouse 는 `<루트>/catalog`, 팀 저장소는
# `<루트>/Agent/catalog` 다. 그래서 "두 칸 위가 루트"라고 박으면 한쪽에서 깨진다
# (팀 저장소에서는 `Agent/Agent/app/artifacts` 를 찾게 된다).
#
# **위로 올라가며 `Agent/app` 을 품은 조상을 찾는다.** 그러면 같은 파일이 양쪽에서
# 그대로 돈다 — 옮길 때 사람이 고칠 것이 없다.
# ⚠ 형제 참조(`../catalog` 등)는 이 처리가 필요 없다. 묶음이 함께 움직이므로
#   두 배치에서 이미 같다. 고쳐야 하는 것은 **묶음 밖을 가리키는 것뿐**이다.
def _find_root(start: str) -> str:
    d = start
    while not os.path.isdir(os.path.join(d, "Agent", "app")):
        parent = os.path.dirname(d)
        if parent == d:
            raise SystemExit(
                "저장소 루트를 못 찾았다 — `Agent/app` 을 품은 조상이 없다.\n"
                f"  시작점: {start}")
        d = parent
    return d


HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "out", "products_seed_5000.csv")      # 형제 — 배치 무관
DST = os.path.join(_find_root(HERE), "Agent", "app", "artifacts", "searchterm.npz")
VERSION = "searchterm-v1"

# ⚠ **이 세 줄은 `_find_root`·`HERE` 정의 뒤에 와야 한다.** 위로 올리면
#   NameError 다 — 08-28 에 실제로 그랬다. import 문을 파일 머리에 모으는
#   습관이 여기서는 함정이 된다: 경로를 세우는 코드가 그보다 먼저 돌아야 한다.
sys.path.insert(0, os.path.join(_find_root(HERE), "Agent"))
from app.env import use_utf8_stdout  # noqa: E402
from app.searchterm import to_jamo  # noqa: E402  (경로를 세운 뒤라야 import 된다)

# 규격 토큰 — 숫자로 시작하면서 단위로 끝나는 것. 이런 것은 색인하지 않는다.
_SPEC = re.compile(r"^[\d.,]+\s*(g|kg|ml|l|매|개|입|팩|p|ea|구|캔|병|포|봉|롤|정)?$",
                   re.IGNORECASE)
# 괄호·기호는 토큰 경계로 본다. 상품명에 "(2입)" 같은 꼬리가 붙는다.
_SPLIT = re.compile(r"[\s()\[\],./+·]+")

MIN_LEN = 2      # 한 글자 토큰은 안 넣는다 — 거리 1이면 온 세상과 붙는다


def main():
    # ⚠ 윈도우 콘솔은 기본이 cp949 라 「—」·「→」 한 글자에 스크립트가 죽는다.
    #   08-26 에 이 한 줄이 없어 개입 발화가 통째로 삼켜진 적이 있다.
    use_utf8_stdout()
    if not os.path.exists(SRC):
        raise SystemExit(f"카탈로그가 없다: {SRC}\n먼저 `python catalog.py` 를 돌려라")

    # utf-8-sig — 이 CSV 는 BOM 으로 시작한다. 그냥 utf-8 로 읽으면 첫 칸 이름이
    # "﻿sku_id" 가 되어 DictReader 의 키가 어긋난다(조용히 KeyError).
    with io.open(SRC, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    # 종류마다 사전을 따로 모은 뒤 **우선순위대로** 합친다.
    # 같은 낱말이 소분류이기도 하고 이름 토큰이기도 하면 소분류로 적는다 —
    # 발화에서 "'물티슈' 로 찾아봤어요" 라고 할 때 더 자연스러운 쪽이다.
    l2, brand, name = set(), set(), set()
    for r in rows:
        if r.get("category_l2"):
            l2.add(r["category_l2"].strip())
        if r.get("brand"):
            brand.add(r["brand"].strip())
        for tok in _SPLIT.split(r.get("name") or ""):
            tok = tok.strip()
            if len(tok) >= MIN_LEN and not _SPEC.match(tok):
                name.add(tok)

    terms, kinds, seen = [], [], set()
    for bucket, kind in ((l2, "l2"), (brand, "brand"), (name, "name")):
        for t in sorted(bucket):
            if t in seen:
                continue
            seen.add(t)
            terms.append(t)
            kinds.append(kind)

    jamo = [to_jamo(t) for t in terms]

    os.makedirs(os.path.dirname(DST), exist_ok=True)
    np.savez_compressed(
        DST,
        version=VERSION,
        terms=np.array(terms, dtype=object),
        jamo=np.array(jamo, dtype=object),
        kind=np.array(kinds, dtype=object),
    )

    n = {k: kinds.count(k) for k in ("l2", "brand", "name")}
    size = os.path.getsize(DST) / 1024
    print(f"{VERSION} — 낱말 {len(terms):,}개 "
          f"(소분류 {n['l2']} · 브랜드 {n['brand']} · 이름토큰 {n['name']:,})")
    print(f"  → {os.path.normpath(DST)}  ({size:.0f} KB)")

    # 굽자마자 실물로 확인한다 — "만들었다"와 "듣는다"는 다른 말이다.
    from app import searchterm
    print("  적재:", searchterm.load())
    for bad, want in (("물치슈", "물티슈"), ("무리슈", "물티슈")):
        got = searchterm.suggest(bad)
        print(f"  '{bad}' → {got}", "" if got and got[0] == want else f"  ⚠ {want} 기대")


if __name__ == "__main__":
    main()
