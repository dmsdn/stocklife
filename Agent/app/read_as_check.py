# -*- coding: utf-8 -*-
"""**결과가 시킨 것을 발화가 했나** — `read_as` 를 기계가 읽을 수 있게 만든다.

[왜 이 파일이 있나 — 08-29]
㉠ 로 규율을 도구 정의에서 **결과(`read_as`)로 옮기고 있다.** 짧아지면서
발화에 가까워지는 좋은 거래인데, **한 가지가 따라오지 않으면 거래가 뒤집힌다** —
궤적의 발화가 그 규율을 지켜야 한다.

안 지키면 그 궤적은 규율을 가르치는 게 아니라 **규율을 무시하는 법**을 가르치고,
그건 그 칸 하나가 아니라 `read_as` 라는 장치 전체를 깎는다. 실제로 있었다:
`compare_products` 의 행사 안내를 결과로 옮긴 날, 그 도구를 부르는 명세 칸
둘(`cell_product_compare` · `cell_recover_axis`)이 행사를 안 말했다.

⚠ **심판 셋이 하나도 못 잡는다.** 지어낸 수가 없어 J1 통과, 계약이 맞아 J2 통과,
시퀀스가 정상이라 J3 통과. 사각지대 네 축(값·계약·라우팅·표현)에도 없다.
**다섯째다.**

[왜 여기(Agent/)에 두나] `read_as` 를 **내는 코드가 여기** 있다. 검사를 저쪽에
두면 도구가 늘 때마다 한글 문자열을 손으로 파싱해야 하고, 안 손보면 조용히
낡는다 — 낡은 검사는 늘 초록이다. 규율과 그 검사가 **같은 파일 옆에** 있어야
같이 늙는다.

[정직하게] **전부 기계로 못 잡는다.** 어떤 규율은 "확률을 시점과 함께 말하라"
같은 판단이라 문자열로 안 떨어진다. 그런 것은 `unmechanized` 로 **이름을 붙여
남긴다** — 못 잡는다는 사실을 아는 것과 모르는 것은 다르다.

사용(심판 쪽):
    from app.read_as_check import expectations
    exp = expectations(tool_name, tool_result)
    for s in exp["must"]:
        if s not in reply: 위반
    for pat in exp["must_not"]:
        if re.search(pat, reply): 위반
"""
from __future__ import annotations

import re


def _name_core(name: str) -> str:
    """상품명에서 **발화에 반드시 남는 토막**만. 브랜드 접두와 규격 꼬리를 뗀다.

    ⚠ 08-29 거짓 양성: `"PB-바지락 300g"` 을 통째로 요구했더니, 모델이
      *"바지락은 원래 7,390원에서…"* 로 **자연스럽게 줄여 말한 것**을 위반으로
      찍었다. 사람도 두 번째 언급부터는 줄여 부른다 — 그걸 금지하면 이 검사가
      **말투를 재게 되고**, 그러면 아무도 안 본다.
    """
    t = re.sub(r"^[A-Za-z]+-", "", str(name or "")).strip()      # PB- · CJ- 따위
    t = re.sub(r"\s*\d+(\.\d+)?\s*(kg|ml|g|L|리터|입|매|개|롤|정|팩|구).*$",
               "", t).strip()                                    # 규격 꼬리
    return t or str(name or "")


def _name_forms(name: str) -> tuple:
    """상품명을 **부를 법한 꼴 셋**으로. 하나라도 발화에 있으면 언급한 것이다.

    ⚠ 08-30: 처음엔 `_name_core` 하나만 요구했다. `"PB-두꺼운 물티슈 100매"`
      → `"두꺼운 물티슈"` 인데, 모델은 세 번째 언급쯤에서 **수식어까지 떨궈**
      그냥 `"물티슈"` 라고 한다. 그것도 사람이 하는 말이다.

      > 어디까지 줄여도 되는지는 우리가 정할 일이 아니다. **언급했는지**만
      > 보면 되는데, 한 가지 꼴만 요구하면 그건 언급이 아니라 **표기**를
      > 검사하는 것이 된다.

    ⇒ 전체 · 핵심 · 마지막 낱말 셋 중 아무거나. 골든셋의 동의어 튜플과
      같은 규약이다(`_check_includes` 가 튜플을 "그중 하나면 됨"으로 읽는다).
    """
    full = str(name or "").strip()
    core = _name_core(full)
    last = core.split()[-1] if core.split() else core
    return tuple(dict.fromkeys(x for x in (full, core, last) if x))


def _won(v) -> str | None:
    """원 단위 정수 → 발화에 나올 꼴("5,590"). 발화는 늘 세자리 콤마를 쓴다."""
    return f"{int(v):,}" if isinstance(v, (int, float)) else None


def expectations(tool_name: str, result: dict, reply: str | None = None) -> dict:
    """이 결과의 `read_as` 가 발화에 요구하는 것.

    [반환] {"must": [문자열], "must_not": [정규식], "unmechanized": [사유]}
      must         — 발화에 **그대로** 있어야 하는 조각
      must_not     — 있으면 위반인 정규식
      unmechanized — 이 갈래의 규율 중 문자열로 안 떨어지는 것의 이름

    ⚠ `read_as` 가 없으면 셋 다 비었다 — **규율이 없는 것과 검사가 없는 것을
      가르지 않는다.** 가르려면 read_as 자리 목록이 필요한데 그건
      `eval/read_as_coverage.py` 가 소스에서 센다. 여기서는 결과만 본다.
    """
    exp: dict = {"must": [], "must_not": [], "unmechanized": []}
    if not isinstance(result, dict) or not result.get("read_as"):
        return exp

    # ── compare_products — 행사 안내 (㉠ 08-29 에 정의에서 옮겨 온 것) ────────
    # 규율: "'원래 O원인데 O원 할인된 O원'처럼 행사 사실을 함께 말하세요."
    # ⇒ **정가가 발화에 있어야만** 그 문장이 성립한다. "행사 중이에요"만으로는
    #   지킨 것이 아니다 — 손님이 얼마를 아꼈는지 모른다.
    if tool_name == "compare_products":
        for r in result.get("items") or []:
            if r.get("on_promo"):
                if r.get("name"):
                    exp["must"].append(_name_forms(r["name"]))
                w = _won(r.get("regular_price_krw"))
                if w:
                    exp["must"].append(w)

    # ── search_products — 오타 후보정 ────────────────────────────────────────
    # 규율: "다른 낱말로 찾았다는 사실을 답에서 먼저 말하세요."
    # ⇒ 바꾼 낱말이 발화에 없으면 손님은 자기가 친 낱말의 답을 들었다고 믿는다.
    elif tool_name == "search_products":
        c = result.get("corrected_from") or {}
        if c.get("from"):
            # ⚠ **`from`(손님이 친 낱말)을 요구한다** — 08-30 정정.
            #   처음엔 `to`(바꾼 낱말)를 요구했는데, 그건 **바꿨다는 사실을
            #   안 밝혀도 통과**한다. 실제로 그렇게 새는 발화를 봤다:
            #
            #     질문: "쿡프리즉 제품 있어요?"
            #     발화: "'쿡프리즈' 브랜드는 저희 매장에 여러 종류 있어요."
            #            ↑ `to` 는 있다. 그런데 바꿨다는 신호가 하나도 없다.
            #
            #   손님은 **자기가 친 낱말의 답을 들었다고 믿는다.** 그게 이
            #   규율이 막으려던 바로 그것이다.
            #
            # ⚠ 그리고 이 자리는 **골든 케이스와 어긋나 있었다** — 케이스는
            #   `typo_word`(=from)를 요구하는데 여기는 `to` 였다. 같은 규율을
            #   재는 두 자가 **다른 것을 재고 있었다.**
            exp["must"].append(str(c["from"]))
        # 결과가 잘렸을 때: 규율이 **금지**다. total_found 는 창구가 돌려준
        # 행의 수지 매장 전체의 수가 아니다 — "총 N개"는 원장의 수를 인용하고도
        # 거짓이 되는 부류라 J1 이 못 잡는다.
        if "결과가 많아" in str(result.get("read_as")):
            exp["must_not"].append(r"총\s*\d+\s*(개|가지|종)")

    # ── get_purchase_history — 시간 방향 ─────────────────────────────────────
    # 규율: "구매 목록은 과거→최근 순입니다. '지난번에 산 것'은 **마지막 항목**."
    # ⇒ 궤적 검사에서 강하다: 첫 항목의 상품을 "최근"이라 말하면 위반이다.
    #   ⚠ 다만 여기서는 sku 만 알고 **이름이 없다**(창구가 이름을 안 준다).
    #   그래서 이름 대조는 심판이 get_product 결과와 합쳐서 해야 한다 —
    #   그 사실을 이름 붙여 남긴다.
    elif tool_name == "get_purchase_history":
        rows = result.get("purchases") or []
        if len(rows) >= 2:
            exp["unmechanized"].append(
                "구매이력 방향: 발화가 rows[-1](최근)을 말했는지 rows[0](최古)을 "
                "말했는지는 **상품 이름**으로만 갈리는데 이 결과엔 이름이 없다. "
                "심판이 뒤따르는 get_product 결과와 짝지어 봐야 한다 "
                f"(최근 sku={rows[-1].get('sku_id')} · 최古 sku={rows[0].get('sku_id')})")

    # ── compare_unit_price — **일부만 견줬다** (08-30) ───────────────────────
    # 규율: "빠진 상품을 반드시 함께 말하세요."
    # ⇒ 이 갈래가 셋 중 제일 위험하다. 비교가 **성립했으므로** LLM 은
    #   "견줘 봤다"고 말하고, 빠진 상품은 발화에서 조용히 사라진다.
    #   값이 전부 원장에 있어 **가드(J1)가 못 잡는다.**
    # ⚠ 이름은 `_name_core` 로 느슨하게 본다 — 모델은 두 번째 언급부터
    #   줄여 부른다(08-29 에 compare_products 에서 배운 것).
    elif tool_name == "compare_unit_price":
        for r in (result.get("ungrouped") or []) + (result.get("unmeasurable") or []):
            nm = r.get("name") if isinstance(r, dict) else None
            if nm:
                exp["must"].append(_name_forms(nm))

    # ── match_preferences — 추론한 축을 **단정하지 않는가** (08-30) ──────────
    # 규율: "손님이 알려준 정보가 아닙니다 — '반려동물 키우시죠?'처럼 단정하지
    #        말고, 그 소분류를 사셨다는 사실까지만 말하세요."
    # ⚠ 금지형만 기계로 잡는다. 긍정형("자주 사셨더라고요")은 문구가 안
    #   정해져 있어 목록으로 만들면 **말투를 강제**하게 된다.
    elif tool_name == "match_preferences":
        exp["must_not"].append(r"(키우시|기르시)")
        exp["unmechanized"].append(
            "추천 근거 고지: '그 소분류를 사셨다'까지 말했는지는 긍정형이라 "
            "문구가 안 정해진다. 심판이 본다")

    # ── find_substitutes — 규격 일치 ─────────────────────────────────────────
    # 규율: "size_match 가 same 이 아니면 용량이 다르다는 사실을 말하세요."
    # ⇒ 다르다는 사실을 **어떤 말로든** 해야 한다. 문구는 안 정해져 있으니
    #   대안 묶음으로 본다(골든셋의 동의어 튜플과 같은 성질).
    elif tool_name == "find_substitutes":
        subs = result.get("substitutes") or []
        # ⚠ **발화가 이름을 댄 것만 본다** (08-30, B 가 D2 전량에서 잡은
        #   거짓 양성 10건). 도구는 후보 셋을 주는데 발화가 둘만 추천하면,
        #   **주장하지도 않은 셋째의 `size_match` 때문에** 걸렸다.
        #
        #     도구: PB-가글(same) · 퓨어셀(same) · 글로우랩 스틱(close)
        #     발화: "PB-가글(같은 규격), 퓨어셀(같은 규격) 정도가 가까워요"
        #           ↑ 언급한 둘은 실제로 same 이다. 셋째는 말하지도 않았다.
        #
        #   08-29 의 부정형 거짓 양성과 **같은 계열**이다. 그때는 문형이
        #   문제였고 이번엔 **범위**다 — 규율이 다스리는 것은 *언급한 것을
        #   어떻게 말하나*지 *몇 개를 말하나*가 아니다.
        #   ⇒ `named` 가 비면(아무 이름도 안 댔으면) 지금 동작으로 떨어진다.
        named = [x for x in subs
                 if reply and x.get("name")
                 and any(f in reply for f in _name_forms(x["name"]))]
        scope = named or subs
        # ⚠ 그리고 **조용한 누락**은 위반이 아니라 기록으로 남긴다.
        #   `same` 인 것만 말하고 규격이 다른 후보를 통째로 뺐다면, 좋은
        #   판단(순위가 낮았다)일 수도 있고 **"다르다"고 말하기 싫어서**일
        #   수도 있다. 결과만으로는 못 가른다 — 그래서 심판에게 넘긴다.
        if named and len(named) < len(subs) and all(
                x.get("size_match") == "same" for x in named):
            dropped = [x.get("name") for x in subs if x not in named]
            exp["unmechanized"].append(
                "조용한 누락 가능성: 발화가 `same` 인 것만 이름을 댔고 "
                f"규격이 다른 후보 {len(dropped)}개를 안 말했다({dropped[:2]}). "
                "순위 때문일 수도, '다르다'고 말하기 싫어서일 수도 있다 — "
                "결과만으로는 못 가른다")
        if any(s.get("size_match") not in ("same", None) for s in scope):
            # ⚠ **긍정과 부정을 가른다** (08-29 거짓 양성). 전에는
            #   `같은\s*(규격|용량)` 이라 **"같은 용량은 없고, 대신 400g짜리로"**
            #   까지 잡았다. 그건 같다는 주장이 아니라 **없다는 고지**이고,
            #   오히려 이 규율이 바라는 발화다.
            #   가드의 `매대에 있` 이 "매대에 있는지 확인해드릴까요?"를 잡던
            #   것과 **같은 병**이다 — 문형을 안 보고 낱말만 본다.
            exp["must_not"].append(r"같은\s*(규격|용량)(?![^.]{0,8}(없|아니|안 ))")
            exp["unmechanized"].append(
                "규격 다름 고지: '용량이 다릅니다'·'규격이 달라요'·'확인이 "
                "어렵습니다' 등 문구가 안 정해져 있다. 부정형(같다고 말하지 "
                "않았나)만 기계로 잡고, 긍정형은 심판이 본다")

    # ── predict_repurchase — 산 적 없는 손님(콜드스타트) ────────────────────
    # 규율: "'손님은 ~쯤 다시 사실 거예요'처럼 **주어를 손님으로 두지 마세요.**"
    # ⇒ 이건 금지형이라 기계로 강하게 잡힌다. 그리고 이 갈래가 제일 위험하다 —
    #   숫자는 전부 원장에 있어서 J1 이 통과시킨다. 틀린 것은 **주어**다.
    elif tool_name == "predict_repurchase":
        if result.get("basis") and result.get("basis") != "history":
            exp["must_not"].append(r"손님(은|이|께서는)?\s*[^.]{0,20}다시\s*사")
            exp["must_not"].append(r"(고객|손님)님?의?\s*(재구매|구매)\s*주기")
            exp["unmechanized"].append(
                "'먼저 사시는 상품'이라는 사실을 숨기지 않았나 — 긍정형이라 "
                "문구가 안 정해진다")

    # ── identify_product_photo — 신뢰 등급 ───────────────────────────────────
    # 규율은 tier 마다 다르다(단정 / 기준 밝힘 / 되묻기). 공통은 하나다:
    #   "어느 tier 든 후보 목록을 함께 보이세요."
    elif tool_name == "identify_product_photo":
        cands = result.get("candidates") or []
        if len(cands) >= 2 and cands[1].get("name"):
            exp["must"].append(cands[1]["name"])      # 2위가 있으면 보여야 한다
        if result.get("tier") == "unsure":
            exp["unmechanized"].append(
                "unsure tier: 되묻는 문장인가 — 물음표 유무로는 못 가른다"
                "('~일까요?'가 단정의 수사일 수 있다)")

    # ── get_position — 위치 신뢰 등급 ────────────────────────────────────────
    # 규율: 등급에 따라 단정/기준밝힘/되묻기. **구역은 어느 등급에서도 안 말한다.**
    elif tool_name == "get_position":
        exp["must_not"].append(r"[A-Z]\s*구역")

    # ── 아직 문자열로 안 떨어지는 것들 ───────────────────────────────────────
    elif tool_name in ("predict_availability",):
        exp["unmechanized"].append(
            "%s: 규율이 '곡선을 시점과 함께 읽어라'·'왜 그 상품인지 근거를 "
            "대라' 같은 **판단**이라 문자열로 안 떨어진다. 심판이 본다"
            % tool_name)

    return exp


def violations(tool_name: str, result: dict, reply: str) -> list[dict]:
    """한 도구 결과와 최종 발화를 대조한다. 심판이 부르는 입구.

    ⚠ **`unmechanized` 는 위반으로 세지 않는다.** 못 잡는 것을 위반으로 세면
      멀쩡한 궤적이 빨간불이 되고, 그러면 이 검사를 아무도 안 본다.
      대신 반환에 실어 보내 **세어는 둔다** — 못 잡는 것이 몇 개인지 아는 것이
      이 파일의 절반이다.
    """
    exp = expectations(tool_name, result, reply)
    v = []
    for want in exp["must"]:
        # 튜플이면 **그중 하나면 됨**(골든셋 `_check_includes` 와 같은 규약).
        alts = want if isinstance(want, tuple) else (want,)
        alts = [a for a in alts if a]
        if alts and not any(a in (reply or "") for a in alts):
            v.append({"rule": "read_as_must", "tool": tool_name,
                      "want": " | ".join(alts)})
    for pat in exp["must_not"]:
        m = re.search(pat, reply or "")
        if m:
            v.append({"rule": "read_as_must_not", "tool": tool_name,
                      "hit": m.group(0), "pattern": pat})
    return v


if __name__ == "__main__":                                   # 자체 검산
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:                                        # noqa: BLE001
        pass

    # ① 행사 — 정가를 안 말하면 걸린다
    res = {"read_as": "행사…",
           "items": [{"name": "PB-연어 필렛 300g", "on_promo": True,
                      "regular_price_krw": 5590, "final_price_krw": 5190},
                     {"name": "PB-바지락 300g", "on_promo": False,
                      "regular_price_krw": 7390, "final_price_krw": 7390}]}
    bad = "PB-연어 필렛 300g이 5,190원으로 더 싸요."
    good = "PB-연어 필렛 300g은 원래 5,590원인데 400원 할인된 5,190원이에요."
    assert violations("compare_products", res, bad), "정가 없는 발화를 놓쳤다"
    assert not violations("compare_products", res, good), "정상 발화를 잡았다"

    # ② 후보정 — 바꾼 낱말이 없으면 걸린다
    res2 = {"read_as": "손님이 친…", "corrected_from": {"from": "물티슈", "to": "물티슈"}}
    res2["corrected_from"] = {"from": "물티suy", "to": "물티슈"}
    # ⚠ 요구하는 것은 **손님이 친 낱말**(from)이다 — `to` 만 있는 발화는
    #   바꿨다는 사실을 안 밝히고도 통과한다(08-30 실측으로 걸렸다).
    assert violations("search_products", res2, "'물티슈'로 찾았어요. 세 가지 있어요.")
    assert not violations("search_products", res2,
                          "'물티suy'로는 없어서 '물티슈'로 찾았어요.")

    # ③ 콜드스타트 — 주어를 손님으로 두면 걸린다
    res3 = {"read_as": "⚠ 이 손님은…", "basis": "l2_prior"}
    assert violations("predict_repurchase", res3, "손님은 14일쯤 다시 사실 거예요.")
    assert not violations("predict_repurchase", res3,
                          "이건 보통 14일쯤 쓰십니다. 먼저 사시는 상품이에요.")

    # ④ read_as 가 없으면 아무것도 요구하지 않는다
    assert expectations("compare_products", {"items": []}) == {
        "must": [], "must_not": [], "unmechanized": []}

    print("read_as_check 자체 검산 통과 — 4묶음")
