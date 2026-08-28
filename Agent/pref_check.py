# ============================================================================
# 취향 매칭 서빙 대조기 — 「서빙이 채점된 것과 같은 순위를 내는가」
# ============================================================================
# [왜 이 파일이 필요한가]
#   `models/preference_rank.py` 가 대조표에서 ⑤+cap3 을 골랐고, 그 승리는
#   **거기서 쓴 점수식**에 대한 것이다. 서빙(`infer.match_preferences`)이
#   조금이라도 다른 식을 쓰면 대조표의 숫자는 이 도구에 대해 **무효**다.
#   그런데 두 코드는 서로 import 할 수 없다 — 서빙은 `models/` 를 못 본다
#   (팀 저장소에 그 폴더가 없다. infer.py 머리의 [자립해야 한다] 참조).
#   같은 식을 두 곳에 적어 두면 한쪽만 고치는 날 조용히 갈린다. **그 갈림을
#   잡는 것이 이 파일의 전부다.**
#
# [어느 세계에서 재나 — 모드 ② 실 시드 파일] CLAUDE.md §2-5b.
#   백엔드를 안 띄운다. `sim/out/mode1/purchases.csv.gz` 를 직접 읽어
#   `sot_client.get_purchase_history` 를 **그 자리에 갈아 끼운다**(monkeypatch).
#   난수 이력으로 재면 안 된다 — 합성 데이터는 내가 가정한 세계를 그대로
#   돌려주므로, 종수·축·크기 보정이 실제로 맞물리는지를 못 본다.
#
# [무엇을 대조하나] 회원 N명에 대해
#   ① 상위 k 개 SKU 목록이 **완전히 같은가**(순서까지)
#   ② 다양화가 실제로 걸렸는가(소분류당 최대 3개)
#   ③ 이미 산 것이 후보에 안 섞였는가
#   ④ 이력 0건(콜드스타트)이 분기 없이 도는가
#
# 실행:  Agent 에서  python pref_check.py
# ============================================================================
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import env                                            # noqa: E402

env.load_env()
env.use_utf8_stdout()

from app import sot_client                                     # noqa: E402
from app.tools import infer, query                             # noqa: E402

_HERE = os.path.dirname(os.path.abspath(__file__))


def _find(*parts):
    """작업장과 팀 저장소의 **배치가 다르다** — route_check.py 와 같은 처리.
    warehouse 는 `sim/`·`catalog/` 가 저장소 뿌리에 있고, 2nd_Project 는
    `Agent/` 아래에 있다. 한쪽만 맞추면 다른 기계에서 못 돈다.
    """
    for base in (os.path.join(_HERE, ".."), _HERE):
        p = os.path.join(base, *parts)
        if os.path.exists(p):
            return p
    return os.path.join(_HERE, *parts)


PUR = _find("sim", "out", "mode1", "purchases.csv.gz")
# ⚠ 팀 저장소에는 parquet·csv.gz 가 없다(용량). 대신 **백엔드 DB 에 실제로
#   적재된 바로 그 파일**이 있다 — 데모 슬라이스 SQL. 그쪽을 읽으면 검사기가
#   두 저장소에서 다 돌고, 게다가 서버가 보는 세계와 같은 세계에서 잰다.
#   전량(206만)이 있으면 그걸 쓰고, 없으면 슬라이스(2,064)로 내려간다.
SQL = _find("sim", "out", "mode1", "history_seed.sql")
CAT = _find("catalog", "out", "products_seed_5000.csv")

TOP_K = 5
N_MEMBERS = 40


# ── 실 시드에서 이력을 읽어 SoT 자리에 끼운다 ────────────────────────────────
def load_world():
    """실 시드에서 구매 이력을 읽는다 — 전량이 있으면 전량, 없으면 슬라이스."""
    if os.path.exists(PUR):
        import pandas as pd
        pur = pd.read_csv(PUR, usecols=["member_id", "sku_id"])
        print(f"실 시드(전량) {len(pur):,}행 — {os.path.relpath(PUR, _HERE)}")
        return [(int(m), int(s)) for m, s in
                zip(pur["member_id"].to_numpy(), pur["sku_id"].to_numpy())]
    if os.path.exists(SQL):
        rows = _parse_purchases_sql(SQL)
        print(f"실 시드(데모 슬라이스) {len(rows):,}행 — "
              f"{os.path.relpath(SQL, _HERE)}")
        return rows
    print(f"✗ 실 시드가 없습니다: {PUR}")
    print("  `python sim/mode1.py` 로 모드 1을 먼저 돌리세요.")
    sys.exit(2)


def _parse_purchases_sql(path):
    """history_seed.sql 의 purchases INSERT 에서 (member_id, sku_id)만 긁는다.

    [왜 정규식 한 줄이 아니라 상태 기계인가] 이 파일 안에는 purchases 말고도
    shelf_events·consumer_events INSERT 가 있고, 값 튜플의 모양이 서로 닮았다.
    "숫자 넷 든 괄호"를 그냥 긁으면 **다른 테이블의 행이 섞인다.** 그래서
    `INSERT INTO purchases` 를 만나면 켜고, 다음 `INSERT INTO` 에서 끈다.

    [칸 순서에 기대는 것을 감수한다] purchase_id, basket_id, member_id,
    sku_id, … 이므로 3·4번째다. 순서가 바뀌면 여기가 조용히 틀리므로
    **머리글 줄을 실제로 읽어 자리번호를 찾는다** — 기대지 않는다.
    """
    import csv
    import re
    out = []
    on = False
    mi = si = None
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("INSERT INTO "):
                on = line.startswith("INSERT INTO purchases ")
                if on:
                    cols = re.search(r"\(([^)]*)\)", line).group(1)
                    names = [c.strip() for c in cols.split(",")]
                    mi, si = names.index("member_id"), names.index("sku_id")
                continue
            if not on or not line.startswith("("):
                continue
            # 값 튜플은 문자열에 쉼표가 들어갈 수 있어 csv 로 가른다.
            v = next(csv.reader([line.strip().rstrip(",;").strip("()")],
                                quotechar="'"))
            out.append((int(v[mi]), int(v[si])))
    return out


def install_fakes(pur):
    """SoT 두 창구를 실 시드로 갈아 끼운다.

    ⚠ `infer` 가 `from app import sot_client` 로 **모듈을** 잡았기 때문에
      모듈 속성을 바꾸면 서빙이 그대로 본다. `from ... import 함수` 였다면
      이 방식이 안 통했을 것이다 — 이름이 함수 객체에 직접 묶여서다.
    """
    by_member = {}
    for m, sku in pur:
        by_member.setdefault(m, []).append(sku)
    cat = {}
    if os.path.exists(CAT):
        import csv
        # ⚠ utf-8-**sig** — catalog.py 가 BOM 을 붙여 쓴다(엑셀에서 열리라고).
        #   그냥 utf-8 로 읽으면 첫 칸 이름이 ﻿sku_id 가 되어 KeyError 다.
        with open(CAT, encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                cat[int(r["sku_id"])] = r

    def fake_history(member_id):
        return [{"sku_id": int(s), "qty": 1, "purchased_at": None}
                for s in by_member.get(int(member_id), [])]

    def fake_by_skus(sku_ids):
        out = []
        for s in sku_ids:
            r = cat.get(int(s))
            out.append({"sku_id": int(s),
                        "name": (r or {}).get("name", f"SKU{s}"),
                        "category_l2": (r or {}).get("category_l2"),
                        "price_krw": int((r or {}).get("price_krw") or 0),
                        "final_price_krw": None, "on_promo": False})
        return out

    sot_client.get_purchase_history = fake_history
    sot_client.get_products_by_skus = fake_by_skus
    return by_member


# ── 대조군: 대조표의 식을 여기서 **독립적으로** 다시 쓴다 ────────────────────
def reference_top(b, bought, k):
    """`models/preference_rank.py` §⑤+cap3 의 점수식을 그대로 옮긴 것.

    일부러 서빙 코드를 안 부른다 — 같은 함수를 두 번 부르면 아무것도 대조가
    안 된다. **두 곳에 적힌 식이 같은 답을 내는가**가 물음이다.
    """
    l2 = b["l2_of_sku"]
    L, S = len(b["l2_names"]), len(l2)
    ix = b["sku_ix"]
    seen = [ix[v] for v in bought if v in ix]

    dst = np.zeros(L, np.float64)
    if seen:
        np.add.at(dst, l2[np.array(seen, np.int64)], 1.0)
    post = ((dst + b["alpha"] * b["l2_prior"].astype(np.float64))
            / (b["l2_size"].astype(np.float64) * b["l2_boost"].astype(np.float64)))
    post /= post.sum()

    boost = np.ones(S, np.float64)
    if dst[b["axis_pet_l2"]].sum() > 0:
        boost[b["axis_pet_l2"][l2]] *= b["axis_mult"]
    if dst[b["axis_kid_l2"]].sum() > 0:
        boost[b["axis_kid_l2"][l2]] *= b["axis_mult"]

    sc = (-b["blk"] * 1e12 + post[l2] * boost * 1e6 - b["g"].astype(np.float64))
    if seen:
        sc[np.array(seen, np.int64)] = -np.inf
    return [int(b["sku"][i]) for i in np.argsort(-sc)[:k]], post, dst


def main():
    got = infer.load_all()
    if infer._STATE["preference"] is None:
        print("✗ 취향 출하물이 안 올라왔습니다:", got.get("preference"))
        sys.exit(2)
    b = infer._STATE["preference"]
    print(f"출하물 {b['version']} · {len(b['sku']):,} SKU · 소분류 {len(b['l2_names'])}"
          f" · α={b['alpha']:g} · cap={b['div_cap']}")

    pur = load_world()
    by_member = install_fakes(pur)
    members = sorted(by_member)[:N_MEMBERS]
    print(f"회원 {len(by_member):,}명 중 {len(members)}명 대조\n")

    l2 = b["l2_of_sku"]
    ix = b["sku_ix"]
    fails = []
    cap_max, n_cold = 0, 0

    for m in members:
        query.set_identity(m, f"chk-{m}")
        out = infer.match_preferences(top_k=TOP_K)
        if "items" not in out:
            fails.append((m, f"items 없음: {out.get('error') or out.get('state')}"))
            continue
        served = [it["sku_id"] for it in out["items"]]

        bought = {int(s) for s in by_member[m]}
        ref, post, dst = reference_top(b, bought, TOP_K)

        # ① 순서까지 같은가
        if served != ref:
            fails.append((m, f"순위 불일치\n      서빙 {served}\n      대조 {ref}"))
        # ② 다양화 — 소분류당 개수
        cnt = {}
        for s in served:
            c = int(l2[ix[s]])
            cnt[c] = cnt.get(c, 0) + 1
        cap_max = max([cap_max] + list(cnt.values()))
        if cnt and max(cnt.values()) > b["div_cap"]:
            fails.append((m, f"다양화 위반 — 한 소분류에 {max(cnt.values())}개"))
        # ③ 이미 산 것이 섞였나
        dup = set(served) & bought
        if dup:
            fails.append((m, f"이미 산 것이 후보에: {sorted(dup)}"))
        # ④ 취향이 실제로 반영됐나 — 1위 소분류가 사후 1위인가
        if out["taste"] and out["items"]:
            if out["items"][0]["why"]["l2_rank"] != 1:
                fails.append((m, "1위 후보의 소분류가 사후 1위가 아니다"))

    # ④ 콜드스타트 — 이력 0건 회원을 만들어 본다(분기 없이 도는가)
    query.set_identity(999999, "chk-cold")
    cold = infer.match_preferences(top_k=TOP_K)
    if "items" not in cold or len(cold["items"]) != TOP_K:
        fails.append((999999, f"콜드스타트가 후보를 못 냈다: "
                              f"{cold.get('error') or cold.get('state')}"))
    else:
        n_cold = len(cold["items"])
        if cold["history_skus"] != 0:
            fails.append((999999, "이력 0건이어야 하는데 아니다"))

    print(f"소분류당 최대 후보 수 {cap_max} (상한 {b['div_cap']})")
    print(f"콜드스타트(이력 0건) 후보 {n_cold}개 — 분기 없이 전역사전으로 나온다")
    print(f"1위 소분류: {cold['taste'][0]['l2'] if cold.get('taste') else '?'}\n")

    n = len(members) + 1
    if fails:
        print(f"✗ {len(fails)}건 불일치 / {n}명")
        for m, why in fails[:10]:
            print(f"   회원 {m}: {why}")
        sys.exit(1)
    print(f"✓ {n}명 전원 일치 — 서빙 순위 = 대조표 점수식")


if __name__ == "__main__":
    main()
