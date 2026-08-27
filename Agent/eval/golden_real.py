# ============================================================================
# 실물 골든셋 — 백엔드·DB에 붙은 상태로 채점한다 (2026-08-27 신설)
# ============================================================================
# [왜 golden_set.py 와 따로 있나]
#   기존 골든셋은 **mock 세계 전용**이다 — sku 101042(물티슈) 대역, 12,900원,
#   "인기 1위=물티슈" 같은 mock 숫자가 기대값에 박혀 있다. 실물 DB는 200000
#   대역이라 그대로 돌리면 전멸한다.
#   그렇다고 갈아엎으면 **백엔드 없이 도는 유일한 검증 경로**가 사라진다
#   (개발 중·오프라인·CI). 그래서 둘을 나란히 둔다:
#       golden_set.py    mock 회귀 — 로직·발화 규율 (백엔드 불필요)
#       golden_real.py   실물 회귀 — 계약·연동·세계 정합 (백엔드 필요)
#
# [⚠ 이 파일의 설계 원칙 — mock 골든셋이 깨진 이유를 반복하지 않는다]
#   mock 판이 깨진 원인은 **세계의 값을 케이스에 하드코딩**한 것이다.
#   그런데 이 세계도 곧 바뀐다 — DES 설계 §10의 세계 버전 대조(v2~v5)가
#   09/06 이후에 예정돼 있고, 그때 재고·이력·인기 순위가 **전부 달라진다.**
#   같은 실수를 하면 이 파일도 그날 죽는다.
#
#   그래서 두 층으로 나눈다:
#     ① 불변(카탈로그)  sku_id · 상품명 · 정가 — 결정적 생성물이라 세계 버전과
#                       무관하다. 케이스에 적어도 안전하다.
#     ② 가변(세계 상태) 재고·큐·이력·인기 — **적지 않는다.** 실행 시각에
#                       `fixtures()` 가 SoT 에서 뽑아 기대값을 만든다.
#
#   즉 이 파일은 "값"이 아니라 **"성질"**을 적는다:
#     ✗ "매대 0, 예비 135개인 sku 200032 를 물으면 '135'가 나와야 한다"
#     ✓ "매대 0 + 예비 있음인 아무 상품이나 물으면 품절이라 하지 않고
#        보충을 말해야 한다"
#
# [실행]  Agent/ 에서
#     python -m eval.runner --real            전체
#     python -m eval.runner --real --only real_scene1
#   ⚠ 선행: 백엔드 8080 기동 + `.env` 의 USE_MOCK_SOT=false + 시드 적재.
#     `python backend_probe.py` 가 "전환 가능"이어야 한다.
# ============================================================================
from __future__ import annotations


# ── 고정 재료 — 카탈로그는 결정적이라 세계 버전이 바뀌어도 그대로다 ──────────
# (`catalog.py` 는 append-only 이고 sku_id 는 품목×10+변형으로 결정된다)
SKU_IN_STOCK = 202233          # 쿡프리즈 라자냐 700g — 매대에 재고가 있는 쪽
MEMBER_WITH_HISTORY = 1005     # 데모 슬라이스 30명 중 하나(이력 33건)
MEMBER_NONE = None             # 비회원


def fixtures(sot) -> dict:
    """실행 시각에 SoT 를 읽어 **케이스가 쓸 재료**를 만든다.

    [왜 함수인가] 세계 상태(재고·큐·이력·인기)는 DES 를 다시 돌리면 바뀐다.
      케이스에 값을 박으면 §10 세계 버전 대조에서 이 파일이 통째로 죽는다.
      실행할 때마다 **지금 세계에서** 조건에 맞는 상품을 찾아 쓴다.

    [반환] {"restock_name": str|None, "in_stock_name": str, "top_name": str|None,
            "repeat_name": str|None}
      None 이면 그 조건을 만족하는 재료가 세계에 없다는 뜻 — 러너가 케이스를
      **건너뛰고 SKIP 으로 표시**한다(FAIL 이 아니다. 세계 탓이지 코드 탓이 아니다).

    [부작용] 없다. 읽기만 한다.
    """
    f = {}

    # ① 장면 1 재료 — 매대 0 + 예비 있음 + 대기 원점 있음
    #    셋을 다 만족해야 "곧 채워진다"가 사실이 된다. 하나라도 없으면
    #    그 발화가 거짓이 되므로 케이스 자체가 성립하지 않는다.
    f["restock_name"] = None
    pending = sot.get_pending_replenishments()
    if not pending:
        # 셋 다 "재료가 없다"는 같지만 이유가 다르다 — 찍지 않으면 SKIP 이
        # 세계 탓인지(진짜 0건) 서버 탓인지(미기동·키) 구분이 안 된다.
        #   []                    진짜 대기 0건
        #   None                  창구 없음(404)
        #   Unavailable("...")    인증·통신 실패
        if pending is not None and pending != []:
            print(f"[fixtures] 보충 대기 조회 실패({pending}) — 장면 1 은 SKIP")
        pending = []
    for row in pending[:300]:
        if not (row.get("queued_at") and row.get("has_bulk")):
            continue
        inv = sot.get_inventory(row["sku_id"]) or {}
        locs = inv.get("locations") or []
        pick = next((L for L in locs if L.get("tier_role") == "PICK"), None)
        bulk = next((L for L in locs if L.get("tier_role") == "BULK"), None)
        if pick and bulk and pick.get("qty") == 0 and (bulk.get("qty") or 0) > 0:
            p = sot.get_product(row["sku_id"]) or {}
            if p.get("name"):
                f["restock_name"] = p["name"]
                break

    # ② 재고 있는 상품 — 위치 안내용
    p = sot.get_product(SKU_IN_STOCK) or {}
    f["in_stock_name"] = p.get("name")
    f["in_stock_price"] = p.get("final_price_krw") or p.get("price_krw")

    # ③ 인기 1위 — 집계는 백엔드가 한다
    items = (sot.get_popular_products(limit=1) or {}).get("items") or []
    f["top_name"] = items[0]["name"] if items else None

    # ④ 그 회원이 **두 번 이상** 산 상품 — 재구매 질문의 재료
    f["repeat_name"] = None
    hist = sot.get_purchase_history(MEMBER_WITH_HISTORY) or []
    seen = {}
    for h in hist:
        seen[h["sku_id"]] = seen.get(h["sku_id"], 0) + 1
    rep = [s for s, n in seen.items() if n >= 2]
    if rep:
        p = sot.get_product(rep[0]) or {}
        f["repeat_name"] = p.get("name")

    # ⑤ 행사 중인 상품 — 정가 vs 실판매가가 갈리는 자리
    #    `on_promo_only=True` 로 백엔드가 골라 준다(우리가 날짜를 계산하지 않는다).
    promo = sot.search_products(on_promo_only=True) or []
    f["promo_name"] = promo[0]["name"] if promo else None
    f["promo_final"] = promo[0].get("final_price_krw") if promo else None

    # ⑥ 같은 소분류 두 상품 — 비교·조합의 재료. 이름이 겹치지 않아야 발화가 안 헷갈린다
    f["pair_names"] = f["pair_budget"] = None
    if f.get("in_stock_name"):
        p0 = sot.get_product(SKU_IN_STOCK) or {}
        same = [x for x in (sot.search_products(category_l2=p0.get("category_l2")) or [])
                if x.get("final_price_krw")][:2]
        if len(same) == 2:
            f["pair_names"] = [x["name"] for x in same]
            # 둘 다 담기엔 모자라고 하나는 되는 예산 — 솔버가 실제로 고르게 한다
            lo, hi = sorted(x["final_price_krw"] for x in same)
            f["pair_budget"] = hi + lo // 2

    # ⑦ 장바구니·위시리스트 — 실물 백엔드에 **행이 없어** 지금은 못 쓴다
    #    (consumer 0행 · cart_group 0행 · wishlists 0행 — 08-27 실측).
    #    거짓 PASS 를 만들지 않도록 재료를 None 으로 두고 SKIP 시킨다.
    f["cart_ready"] = None
    f["wishlist_ready"] = None
    return f


def build(f: dict) -> list[dict]:
    """재료로 케이스를 조립한다. 계약은 golden_set.py 와 같다(러너 공용).

    `needs` 칸이 추가됐다 — 그 재료가 None 이면 러너가 SKIP 한다.

    ⚠ **재료가 None 이어도 조립은 되어야 한다.** SKIP 판정은 build() **뒤**에
      일어나므로, 여기서 `f"{None:,}"` 같은 것이 터지면 세계에 재료가 없는 날
      골든셋 전체가 못 돈다(08-27에 promo_name=None 으로 실제로 터졌다).
      그래서 아래 `_n`·`_p` 로 감싼다 — 값이 없으면 안전한 자리표시로 떨어진다.
    """
    def _p(v):                      # 가격 → "1,234" (없으면 매칭 안 될 문자열)
        return f"{v:,}" if isinstance(v, int) else "__NO_FIXTURE__"

    def _n(v, i=0):                 # 이름/쌍 → 문자열 (없으면 빈 질문 → SKIP 됨)
        if isinstance(v, (list, tuple)):
            return v[i] if len(v) > i else ""
        return v or ""

    return [
        # ── 킬링 장면 1 — 실물 큐 상태에서 재고 3분기가 서는가 ──────────────
        {"id": "real_scene1", "needs": "restock_name",
         "q": f"{_n(f.get('restock_name'))} 있어요?",
         "consumer_id": MEMBER_WITH_HISTORY, "session_id": "real-1",
         # ⚠ 08-27 상향: `predict_availability` 를 필수로 올렸다.
         #   [왜 빠져 있었나] 이 케이스를 쓸 때 가용 예측이 스텁이었다. 그래서
         #   **되는 것에 맞춰** get_inventory 까지만 기대했고, 케이스는 PASS 인데
         #   발화는 "정확한 보충 시점은 확인이 어렵네요"였다. 킬링 장면 1의 심장
         #   ("약 15분 후 보충 예정")이 골든셋에서 통째로 안 검증되고 있었다.
         #   출하물이 08-26에 올라온 뒤에도 기준이 안 따라 올라온 것이다.
         #   [헌법 8 이 여기서 지켜진다] 확률을 요구하는 이유는 표현 취향이 아니라
         #   "있다/없다" 이진으로 답하지 말라는 규율이다. 큐 95(토요일 14:20)에서
         #   모델은 1시간 내 97.6% 를 낸다 — 이진으로는 "곧 됩니다"밖에 못 말하고,
         #   그건 15분 뒤 빈손으로 돌아온 손님에게 거짓이 된다.
         "expect_tools": ["search_products", "get_inventory", "predict_availability"],
         "must_include": [("보충", "채워", "들어오", "입고", "예비", "다시"),
                          ("%", "퍼센트", "확률")],
         # `품절` 을 통짜로 금지하면 "품절은 아니에요"(옳은 발화)까지 잡는다 —
         # 가드 쪽과 같은 정정(08-27). 부정이 붙지 않은 품절 주장만 금지한다.
         "must_not_include": [r"품절(?!\s*\S{0,3}\s*아니)", r"없습니다[.!]?\s*$",
                              # 모델이 답을 냈는데 "모르겠다"고 말하면 도구를 놀린 것
                              r"시점[^.!?]{0,10}(확인이 어|알 수 없|모르)"],
         "why": "실물 DB에서 매대 0 + 예비 있음인 상품. mock 과 달리 **큐 상태가"
                " 진짜다** — pending 창구·stock_sync 시점 정합이 여기서 검증된다."
                " 08-27부터 가용 예측 곡선까지 요구한다(킬링 장면 1 · 헌법 8)"},

        # ── 재고 있음 → 위치를 사람 말로 ────────────────────────────────────
        {"id": "real_in_stock", "needs": "in_stock_name",
         "q": f"{_n(f.get('in_stock_name'))} 어디 있어요?",
         "consumer_id": MEMBER_WITH_HISTORY, "session_id": "real-2",
         "expect_tools": ["search_products", "get_inventory"],
         "must_include": [("1층", "F1")],
         "must_not_include": [r"품절", r"F1-H-R\d"],   # 코드 그대로 노출 금지
         "why": "위치는 사람 말로. location_id 를 그대로 읽으면 손님이 못 찾는다"},

        # ── 가격 정확성 — `_norm_product` 가 없으면 여기서 죽는다 ───────────
        {"id": "real_price", "needs": "in_stock_name",
         "q": f"{_n(f.get('in_stock_name'))} 얼마예요?",
         "consumer_id": MEMBER_NONE, "session_id": "real-3",
         "expect_tools": ["search_products"],
         "must_include": [(_p(f.get('in_stock_price')),)],
         "must_not_include": [r"약\s*\d[\d,]*원", r"만\s*\d천"],
         "why": "가격은 원 단위 그대로 — 08-27에 get_product 가 camelCase 를 흘려"
                "보내 price_krw 가 None 이던 버그를 이 케이스가 잡는다"},

        # ── 이력 기반 — 요청 ④ history API 가 붙었는가 ──────────────────────
        {"id": "real_repurchase", "needs": "repeat_name",
         "q": f"{_n(f.get('repeat_name'))} 다시 살 때 됐나요?",
         "consumer_id": MEMBER_WITH_HISTORY, "session_id": "real-4",
         # ⚠ 08-27 정정: `get_purchase_history` 를 기대했는데 모델은
         #   `predict_repurchase` 를 썼고, **그쪽이 옳다** — 그 도구가 이력 조회를
         #   내부에서 하고 곡선까지 낸다. 원시 이력만 보고 "살 때 됐다"를 판정하면
         #   그건 LLM 이 주기를 눈대중한 것이라 헌법 2 위반이다. 기대치를 도구
         #   이름으로 박아 두면 **더 나은 경로를 FAIL 로 만든다** — 이 케이스가
         #   확인해야 하는 것은 "이력 창구가 산다"이지 "어느 함수를 부른다"가 아니다.
         "expect_tools": ["predict_repurchase"],
         "must_include": [],
         "must_not_include": [r"이력이 없|구매 기록이 없|처음 (구매|사)"],
         "why": "실제로 2회 이상 산 상품이다. '이력 없음'이 나오면 history 창구가"
                " 안 붙은 것(memberId vs consumerId 함정 포함)"},

        # ── 인기 — 집계를 지어내지도 회피하지도 않는가 ──────────────────────
        {"id": "real_popular", "needs": "top_name",
         "q": "요즘 뭐가 잘 나가요?",
         "consumer_id": MEMBER_WITH_HISTORY, "session_id": "real-5",
         "expect_tools": ["get_popular_products"],
         "must_include": [(_n(f.get("top_name")),)],
         "must_not_include": [r"확인이 어렵|모르겠|데이터가 없"],
         "why": "08-27에 categoryL2='' 를 보내 항상 0건이던 버그가 있었다."
                " 빈 배열을 '데이터 없음'으로 착지시키면 이 케이스가 잡는다"},

        # ── 취급 안 하는 것 — 없는 것을 지어내지 않는가 ─────────────────────
        {"id": "real_not_carried", "needs": None,
         "q": "여기 오토바이 헬멧 파나요?",
         "consumer_id": MEMBER_NONE, "session_id": "real-6",
         "expect_tools": ["search_products"],
         "must_include": [("취급", "없", "안 파", "판매하지")],
         "must_not_include": [r"\d층\s*[A-Z]구역", r"재고\s*\d+개"],
         "why": "카탈로그 5,000에 없는 품목. 위치·재고를 지어내면 안 된다"},

        # ── 행사 — 정가가 아니라 실판매가로 말하는가 ────────────────────────
        {"id": "real_promo_price", "needs": "promo_name",
         "q": f"{_n(f.get('promo_name'))} 지금 얼마예요?",
         "consumer_id": MEMBER_NONE, "session_id": "real-8",
         "expect_tools": ["search_products"],
         "must_include": [(_p(f.get('promo_final')),), ("행사", "할인", "세일")],
         "must_not_include": [],
         "why": "행사 중이면 손님이 계산대에서 낼 금액은 실판매가다. 정가만 말하면"
                " 틀린 건 아닌데 손해를 보게 한다 — 행사 사실도 같이 말해야 한다"},

        # ── 두 상품 비교 — 눈대중이 아니라 도구로 ───────────────────────────
        {"id": "real_compare", "needs": "pair_names",
         "q": f"{_n(f.get('pair_names'),0)}랑 {_n(f.get('pair_names'),1)} 중에 뭐가 더 싸요?"
              if f.get("pair_names") else "",
         "consumer_id": MEMBER_WITH_HISTORY, "session_id": "real-9",
         "expect_tools": ["compare_products"],
         "must_include": [],
         "must_not_include": [r"비슷|비등|차이가 (거의 )?없"],
         "why": "총액 비교는 compare_products 를 거친다(헌법 2 — 산술은 솔버)."
                " '비슷하다'로 얼버무리면 비교를 안 한 것이다"},

        # ── 예산 조합 — 솔버의 총액이 발화에 실렸는가 ───────────────────────
        {"id": "real_budget", "needs": "pair_budget",
         "q": f"{_n(f.get('pair_names'),0)}랑 {_n(f.get('pair_names'),1)} 중에 "
              f"{_p(f.get('pair_budget'))}원 안에서 살 수 있는 만큼 골라줘"
              if f.get("pair_names") else "",
         "consumer_id": MEMBER_WITH_HISTORY, "session_id": "real-10",
         "expect_tools": ["optimize_bundle"],
         # 솔버가 고른 총액이 발화에 있어야 한다 — "하나만 담긴다"는 결론만 있고
         # 금액이 없으면 손님이 계산대에서 확인할 방법이 없다.
         "must_include": [(f"{f['pair_budget']:,}",)] if f.get("pair_budget") else [],
         # ⚠ 08-27 정정: 원래 패턴이 `둘 다 (담|사|구매)` 였는데, 이것이
         #   **"둘 다 담으면 10,980원이라 예산을 2,545원 초과하네요"까지 FAIL 로
         #   잡았다.** 그 문장은 정확히 우리가 원하는 발화다 — 조합 최적화 결과를
         #   사람에게 설명하는 일은 **선택된 것이 아니라 탈락한 것**을 말하는 일이라,
         #   "둘 다"라는 표현은 기각 사유를 대는 자리에서 오히려 필요하다.
         #   그래서 **가능하다고 주장하는 형태만** 금지한다("둘 다 담을 수 있어요").
         #   교훈: 금지 패턴은 낱말이 아니라 **주장**을 잡아야 한다. 낱말로 잡으면
         #   좋은 발화를 죽이고, 그걸 고치려다 모델을 나쁜 쪽으로 밀게 된다.
         "must_not_include": [r"둘 다\s*\S*(담|사|구매)\S*\s*(수 있|드릴|가능|됩니다|돼요)"],
         "why": "예산 조합의 총액은 LLM 이 더한 값이 아니라 솔버의 total_krw 여야"
                " 한다. 예산을 하나만 되게 잡았으므로 '둘 다 담을 수 있다'는 산술"
                " 실패다. 반대로 '둘 다면 초과'라는 기각 사유는 좋은 발화다"},

        # ── 대체 제안 — 원 상품 확인이 먼저 ─────────────────────────────────
        {"id": "real_substitute", "needs": "in_stock_name",
         "q": f"{_n(f.get('in_stock_name'))} 말고 비슷한 거 있어요?",
         "consumer_id": MEMBER_WITH_HISTORY, "session_id": "real-11",
         "expect_tools": ["search_products"],
         "must_include": [],
         "must_not_include": [r"개발 중|준비 중인 기능|not_implemented|오류"],
         "why": "find_substitutes 가 실물에서 500 을 낸다(08-27 실측 · 미해결)."
                " 도구가 죽어도 **손님에게 내부 사정을 노출하면 안 된다** —"
                " 검색으로라도 착지해야 한다. 이 케이스는 그 착지를 지킨다"},

        # ── 명령형 — 되묻지 않는가 ──────────────────────────────────────────
        {"id": "real_imperative", "needs": "in_stock_name",
         "q": f"{_n(f.get('in_stock_name'))} 어디 있는지 알려줘",
         "consumer_id": MEMBER_WITH_HISTORY, "session_id": "real-12",
         "expect_tools": ["search_products"],
         "must_include": [("층", "구역")],
         "must_not_include": [r"어떤\s*(걸|것을|상품을)", r"드릴까요\?$"],
         "why": "명령형에는 되묻지 않는다 — 기본값으로 실행하고 결과에 근거를 담는다"},

        # ── 비회원 액션 → 로그인 안내 (담았다고 거짓말 금지) ────────────────
        {"id": "real_guest_action", "needs": None,
         "q": f"{_n(f.get('in_stock_name')) or '라자냐'} 장바구니에 담아줘",
         "consumer_id": MEMBER_NONE, "session_id": "real-13",
         "expect_tools": [],
         "must_include": [("로그인", "회원")],
         "must_not_include": [r"담았", r"완료했"],
         "why": "비회원 액션은 실패를 숨기지 말고 로그인 안내로. 액션 도구는 실물"
                " 백엔드에서도 consumer_id 가 없으면 못 부른다 — 계약이 같다"},

        # ── 일반 상식 — 범위 안내로 밀어내지 않는가 ─────────────────────────
        {"id": "real_common_sense", "needs": None,
         "q": "우유팩은 어떻게 버려요?",
         "consumer_id": MEMBER_NONE, "session_id": "real-14",
         "expect_tools": [],
         "must_include": [("헹", "씻", "말리", "펼")],
         "must_not_include": [r"제?\s*담당이 아니", r"매장 안내를 맡고 있어서"],
         "why": "답할 수 있는 상식은 답한다 — 범위 안내를 여기 쓰면 밀어내기가 된다"},

        # ── 스텁 착지 — 내부 사정을 손님에게 노출하지 않는가 ────────────────
        {"id": "real_stub_landing", "needs": "pair_names",
         "q": f"{_n(f.get('pair_names'),0)}랑 {_n(f.get('pair_names'),1)} 중에 100ml당 뭐가 이득?"
              if f.get("pair_names") else "",
         "consumer_id": MEMBER_WITH_HISTORY, "session_id": "real-15",
         "expect_tools": [],
         "must_include": [],
         "must_not_include": [r"개발 중|준비 중인 기능|not_implemented"],
         "why": "compare_unit_price 는 아직 스텁이다(08-27). 스텁 실패는 내부"
                " 사정이라 손님에게 '개발 중'이라고 노출하면 안 된다"},

        # ── 범위 밖 — 무능이 아니라 범위로 ──────────────────────────────────
        {"id": "real_out_of_scope", "needs": None,
         "q": "주차장 몇 시까지 열어요?",
         "consumer_id": MEMBER_NONE, "session_id": "real-7",
         "expect_tools": [],
         "must_include": [("매장", "상품", "안내")],
         "must_not_include": [r"\d+시까지"],       # 모르는 운영 정보를 지어내지 않는다
         "why": "운영 정보는 우리 도구에 없다. 시간을 지어내면 손님이 헛걸음한다"},
    ]


# ── 자체 검산 — 골든셋 자신도 조용히 망가진다 ────────────────────────────────
_probe = build({"restock_name": "X", "in_stock_name": "Y", "in_stock_price": 1000,
                "top_name": "Z", "repeat_name": "W", "promo_name": "P",
                "promo_final": 900, "pair_names": ["A", "B"], "pair_budget": 5000,
                "cart_ready": None, "wishlist_ready": None})
assert len(_probe) == 15, f"실물 케이스는 15개 계획(현재 {len(_probe)})"
_ids = [c["id"] for c in _probe]
assert len(set(_ids)) == len(_ids), "케이스 id 중복"
for _c in _probe:
    for _k in ("id", "q", "expect_tools", "must_include", "must_not_include",
               "why", "needs"):
        assert _k in _c, f"{_c.get('id', '?')}: {_k} 칸 누락"
