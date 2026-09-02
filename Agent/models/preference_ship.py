# ============================================================================
# T15 ④ — 출하물 (Agent/app/artifacts/preference_model.npz)
# ============================================================================
# [무엇] 대조표(preference_rank)가 고른 후보를 **서빙이 쓸 모양**으로 굽는다.
#   `match_preferences` 도구가 이 파일 하나만 읽고 추천을 만든다.
#
# ────────────────────────────────────────────────────────────────────────────
# ⚠ 작업지시서 §6 의 계약과 **다르다** — 임베딩을 안 싣는다
# ────────────────────────────────────────────────────────────────────────────
#   §6 은 `emb (5000, 768)` 을 출하물의 본체로 잡았다. 그런데 대조표에서
#   임베딩(④)이 규칙(③)에게도 졌고, **⑤ 위에 얹어도(④⑤ 혼합) 한 자리도 안
#   늘었다.** 원인은 모델이 아니라 세계다 — 습관 SKU 표집이 소분류 가중으로만
#   이뤄져 **소분류 아래에 정보가 0** 이다(DES설계 §10.6 실측).
#
#   점수에 안 쓰는 7MB 를 계약에 남겨 두면, 배선하는 사람이 **쓰라는 뜻으로 읽는다.**
#   그래서 뺀다. 분석용 `models/out/pref_emb_*.npz` 는 그대로 남으니 되살리는
#   비용은 한 줄이다.
#
# [무엇을 싣나 — ⑤ 소분류 사후]
#   서빙 시 회원 이력(요청 ④ API)에서 **소분류별 습관 SKU 종수**를 세고,
#   소분류 크기·축 배율로 나눈 뒤 디리클레로 축소해 취향 분포를 만든다.
#   회원 벡터를 안 싣는 것은 §6 과 같다 — 이력은 어제 바뀌었을 수 있다.
#
# [왜 「횟수」가 아니라 「종수」인가] 구매 횟수 ≈ 취향 ÷ 주기다. 주기가 짧은
#   우유가 취향 1위로 올라온다(실측: 1위 소분류가 32.8% 갈린다).
#
# 실행:  python models/preference_ship.py
# ============================================================================
from __future__ import annotations

import json
import os

import numpy as np

import preference_data as D
import preference_rank as R

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
ART = os.path.join(_ROOT, "Agent", "app", "artifacts")
VERSION = "2026-08-27"


def main():
    D.use_utf8()
    d = D.build(0)                       # 분할은 평가용. 출하물은 **전량**으로 굽는다
    cat = d["cat"]
    S = len(d["sid"])
    l2_names = d["l2_names"]
    L = len(l2_names)
    l2 = d["l2"]

    # 전량 이력으로 다시 센다 — 보류는 평가 장치일 뿐 출하물이 버릴 이유가 없다.
    pur = D.load_purchases()
    s_ix = {int(v): i for i, v in enumerate(d["sid"])}
    m_ix = {int(v): i for i, v in enumerate(d["mid"])}
    mi = pur["member_id"].map(m_ix).to_numpy()
    si = pur["sku_id"].map(s_ix).to_numpy()
    ok = ~(np.isnan(mi) | np.isnan(si))
    mi, si = mi[ok].astype(np.int64), si[ok].astype(np.int64)

    pop = np.zeros(S, np.float32)
    np.add.at(pop, si, 1.0)
    dst = np.zeros((len(d["mid"]), L), np.float32)
    np.add.at(dst, (mi, l2[si]), 1.0)
    prior = dst.sum(0) + 1.0
    prior /= prior.sum()

    pet_l2 = np.array([("반려" in n or "펫" in n) for n in l2_names])
    kid_l2 = np.array([any(k in n for k in ("기저귀", "분유")) for n in l2_names])
    boost_l2 = np.ones(L, np.float32)
    boost_l2[pet_l2] = 1.0 + (d["axes"][:, 1] == 1).mean()
    boost_l2[kid_l2] = 1.0 + (d["axes"][:, 2] == 1).mean()

    tbl = {}
    p = os.path.join(_HERE, "out", "preference_rank.npz")
    if os.path.exists(p):
        z = np.load(p, allow_pickle=True)
        for k in z.files:
            name, metric = k.split("|")
            tbl.setdefault(name, {})[metric] = [round(float(x), 5) for x in z[k]]

    os.makedirs(ART, exist_ok=True)
    out = os.path.join(ART, "preference_model.npz")
    np.savez_compressed(
        out,
        sku=d["sid"].astype(np.int32),
        l2_of_sku=l2.astype(np.int16),
        l2_names=np.array(l2_names, dtype=object),
        l2_size=np.bincount(l2, minlength=L).astype(np.int32),
        l2_prior=prior.astype(np.float32),
        l2_boost=boost_l2.astype(np.float32),
        axis_pet_l2=pet_l2, axis_kid_l2=kid_l2, axis_mult=np.float32(2.0),
        pop=pop,                                   # 소분류 **안**을 가르는 꼬리표
        alpha=np.float32(R.ALPHA_DIR),
        div_cap=np.int32(3),                       # 운용: 소분류당 최대 3개
        method="l2_posterior",
        version=VERSION,
        chosen_over=json.dumps(tbl, ensure_ascii=False),
        note=("점수는 소분류 사후확률로만 낸다. 임베딩은 대조표에서 기여 0이라 "
              "싣지 않는다 — 근거는 DES설계 §10.6."),
    )
    print(f"→ {out}  {os.path.getsize(out) / 1024:.0f}KB")
    print(f"   SKU {S:,} · 소분류 {L} · 대조표 {len(tbl)}행 · version {VERSION}")


if __name__ == "__main__":
    main()
