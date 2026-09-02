# ============================================================================
# StoreFlow 평가 하네스 — 골든셋 v0 (실행계획 A단계 08/17 칸)
# ============================================================================
# [역할] "정답이 정해진 질문" 목록. 러너(runner.py)가 이걸 하나씩 하네스에
#   넣고 채점한다. 프롬프트·코드를 고칠 때마다 돌려 **무엇이 깨졌는지** 본다.
#
# [무엇을 채점하는가 — 답 문장이 아니다]
#   같은 뜻을 백 가지로 말할 수 있어 문장 비교는 불가능하다. 대신 셋을 본다:
#     ① expect_tools     — 기대 도구 시퀀스(부분 수열). 답만 보면 "우연히 맞은
#                          답"과 "근거 있는 답"이 구별되지 않는다. 재고를 물었는데
#                          get_inventory를 안 불렀다면 맞은 답이어도 다음엔 틀린다.
#     ② must_include     — 답에 반드시 있어야 할 요소(동의어 묶음 허용)
#     ③ must_not_include — 답에 나오면 안 되는 것. **"품절"이 대표** — 문법적으로
#                          완벽하고 짧고 친절하기까지 한 오답은 금지어로만 잡힌다.
#   + 가드 통과(guard.check ok)를 기본 채점에 포함한다.
#
# [v0의 한계 — 알고 쓰는 것]
#   지금은 계산 4·추론 5가 스텁이라, 그 도구들은 "불렀는가"까지만 채점한다
#   (결과 내용은 not_implemented라 채점 불가). C단계에 실물이 꽂히면
#   must_include를 그 결과 기반으로 조인다. mock 상품이 6개뿐이라
#   "5,000개에서 좁히기" 능력도 여기서는 안 드러난다 — 시드 적재 후 별도 확인.
#
# [케이스 작성 규칙]
#   · 한 케이스 = 한 판단을 겨냥 (여러 판단을 한 케이스에 욱여넣지 않는다 —
#     실패했을 때 무엇이 깨졌는지 분리되지 않는다)
#   · expect_tools는 **최소한**만 적는다. LLM이 도구를 더 부르는 것은 허용
#     (부분 수열 매칭). 순서가 중요한 것만 순서로 적는다.
#   · must_include의 항목이 튜플이면 "그중 하나면 됨"(동의어 묶음).
# ============================================================================

# 케이스 dict의 칸:
#   id            : 짧은 식별자 (러너 출력·--only 필터에 쓴다)
#   q             : 사용자 발화
#   consumer_id   : 회원 번호(비회원 시나리오는 None)
#   session_id    : 세션(장바구니 케이스에서 의미 있음)
#   expect_tools  : 이 순서로 등장해야 하는 도구 이름들(사이에 다른 도구 허용)
#   must_include  : 문자열 또는 (동의어, 묶음) 튜플의 리스트
#   must_not_include : 정규식 문자열 리스트
#   why           : 이 케이스가 지키는 판단 — 실패했을 때 무엇이 깨진 것인지

GOLDEN = [
    # ── 킬링 장면 1: 재고 3분기의 가운데 갈래 ──────────────────────────────
    # 08-20 판정: "있어요?"는 취급 질문("파니?")과 가용 질문("지금 살 수 있니?")
    # 두 갈래로 읽힌다. 이 케이스는 **가용 확인까지가 기본값**이라는 판정을
    # 강제한다 — 근거는 비용 비대칭: 취급만 원했는데 재고까지 확인하면 손해가
    # 없지만, 가용을 원했는데 취급만 답하면 헛걸음이다(트러블슈팅_표집변동 참조).
    # 그래서 검색만 하고 답한 발화는 취급 읽기로는 옳아도 FAIL이 맞다.
    {"id": "scene1_restock",
     "q": "물티슈 있어요?",
     "consumer_id": 9001, "session_id": "sess-7f3a9c",
     "expect_tools": ["search_products", "get_inventory"],
     "must_include": [("보충", "채워", "들어오", "입고", "다시")],
     "must_not_include": [r"품절", r"없습니다[.!]?\s*$"],
     "why": "매대 0 + 예비 40 → '품절'이 아니라 '곧 채워짐'(재고 3분기). "
            "'있어요?'는 가용 확인이 기본값 — 헛걸음 비용 비대칭"},

    # ── 재고 3분기: 첫 갈래(매대에 있음) ───────────────────────────────────
    {"id": "in_stock_location",
     "q": "물티슈 리필형은 어디 있어요?",
     "consumer_id": 9001, "session_id": "sess-7f3a9c",
     "expect_tools": ["search_products", "get_inventory"],
     "must_include": [("2층", "F2")],
     "must_not_include": [r"품절", r"F2-B-R\d"],   # 코드 그대로 노출도 금지(사람 말로)
     "why": "재고 있는 상품은 위치를 사람 말로 안내한다(101043: 2층, pick 18)"},

    # ── 재고 3분기: 셋째 갈래(단종) + 대체 제안 ────────────────────────────
    {"id": "discontinued_alt",
     "q": "원두 커피 홀빈 1kg 있어요?",
     "consumer_id": 9001, "session_id": "sess-7f3a9c",
     "expect_tools": ["search_products"],
     "must_include": [("단종", "판매가 종료", "취급하지 않"), ("900g", "다른", "대신")],
     "must_not_include": [r"지금\s*(구매|구입|사실 수 있)"],
     "why": "단종품(103877)은 상태를 밝히고 대체(103902)로 잇는다 — 살 수 있는 것처럼 말하면 안 됨"},

    # ── 가격 질문 — 조회 경로와 가격 정확성 ────────────────────────────────
    {"id": "price_exact",
     "q": "아기 물티슈 캡형 얼마예요?",
     "consumer_id": None, "session_id": "sess-anon",
     "expect_tools": ["search_products"],
     "must_include": ["12,900", ],
     "must_not_include": [r"약\s*1[23],?000원", r"만\s*[23]천"],   # 가격 반올림 금지
     "why": "가격은 원 단위 그대로 — 반올림하면 계산대에서 다른 금액을 본다"},

    # ── 명령형: 되묻지 않기 (+ 액션 도구 시도) ─────────────────────────────
    {"id": "imperative_no_ask",
     "q": "물티슈 제일 싼 걸로 하나 담아줘",
     "consumer_id": 9001, "session_id": "sess-7f3a9c",
     "expect_tools": ["search_products", "add_to_cart"],
     "must_include": [],
     "must_not_include": [r"어떤\s*(걸|것을|상품을)\s*(담|골라)", r"담을까요\?", r"드릴까요\?"],
     "why": "명령형에는 되묻지 않는다 — 기본값으로 실행하고 결과 보고에 근거를 담는다"},

    # ── 비회원의 액션 → 로그인 안내로 착지 ─────────────────────────────────
    # 08-20 수정: 원래 발화가 "이거 장바구니에 담아줘"였는데, '이거'의 지시대상이
    # 없어 LLM이 "뭘요?"라고 되묻는 게 **정당한** 케이스였다(사람 직원도 그런다).
    # "지시대상 해소"와 "비회원 착지" 두 판단이 섞여 실패 원인이 분리되지 않으므로
    # (케이스 작성 규칙 위반), 상품을 특정해 비회원 착지 하나만 겨냥하게 고쳤다.
    {"id": "guest_cart_landing",
     "q": "물티슈 캡형 장바구니에 담아줘",
     "consumer_id": None, "session_id": "sess-anon",
     "expect_tools": [],                       # 도구를 부르든 안 부르든, 착지가 중요
     "must_include": [("로그인", "회원")],
     "must_not_include": [r"담았", r"완료"],
     "why": "비회원 액션은 실패를 숨기지 말고 로그인 안내로 — 담았다고 거짓말하면 안 됨"},

    # ── 장바구니 합계 — 산술을 도구에 맡겼는가 ─────────────────────────────
    {"id": "cart_total",
     "q": "지금 장바구니 얼마어치 담았어요?",
     "consumer_id": 9001, "session_id": "sess-7f3a9c",
     "expect_tools": ["get_session_cart"],
     "must_include": [],                       # 금액은 이벤트 재생 결과라 케이스에 고정하지 않음
     "must_not_include": [],
     "why": "합계는 get_session_cart가 계산한 값을 읽는다(헌법 2) — 도구 호출이 증거"},

    # ── 이력 기반 개인화 ───────────────────────────────────────────────────
    {"id": "repurchase_history",
     "q": "내가 늘 사던 물티슈 이제 살 때 되지 않았어?",
     "consumer_id": 9001, "session_id": "sess-7f3a9c",
     "expect_tools": ["get_purchase_history"],
     "must_include": [],
     "must_not_include": [r"이력이 없|처음이(시|네)"],
     "why": "개인화 질문은 이력 조회를 거친다 — 9001은 물티슈 4회 반복 구매자"},

    # ── 위시리스트 ─────────────────────────────────────────────────────────
    {"id": "wishlist_read",
     "q": "내 위시리스트에 뭐 있었지?",
     "consumer_id": 9001, "session_id": "sess-7f3a9c",
     "expect_tools": ["get_wishlist"],
     "must_include": [("물티슈",)],            # 9001의 위시리스트에 101042가 있다
     "must_not_include": [r"101042"],          # 번호가 아니라 이름으로 말해야 한다
     "why": "위시리스트는 sku 번호가 아니라 상품 이름으로 읽어준다"},

    # ── 스텁 도구를 부르게 되는 질문 — 착지 품질 ───────────────────────────
    {"id": "stub_landing",
     "q": "물티슈 두 종류 중에 뭐가 더 이득이에요?",
     "consumer_id": 9001, "session_id": "sess-7f3a9c",
     "expect_tools": ["search_products"],      # compare_unit_price는 스텁이라 시도 여부만
     "must_include": [],
     "must_not_include": [r"개발 중|준비 중인 기능|not_implemented"],
     "why": "스텁 실패는 내부 사정 — 손님에게 '개발 중'이라고 노출하면 안 된다"},

    # ── 범위 밖: 무능이 아니라 범위로 ──────────────────────────────────────
    {"id": "out_of_scope_weather",
     "q": "오늘 날씨 어때?",
     "consumer_id": None, "session_id": "sess-anon",
     "expect_tools": [],
     "must_include": [("매장", "안내")],       # 무엇을 하는 에이전트인지 밝힌다
     "must_not_include": [r"^죄송합니다[,.]?\s*잘?\s*모르겠", r"모르겠습니다[.!]?\s*$"],
     "why": "범위 밖은 '모르겠습니다'가 아니라 범위 소개로 — 손님이 무엇을 물을지 배운다"},

    # ── 일반 상식: 밀어내지 않기 (범위 안내 오남용 금지) ────────────────────
    {"id": "common_sense_recycle",
     "q": "우유팩은 어떻게 버려요?",
     "consumer_id": None, "session_id": "sess-anon",
     "expect_tools": [],
     "must_include": [("헹", "씻", "말리", "펼")],
     "must_not_include": [r"제?\s*담당이 아니", r"매장 안내를 맡고 있어서"],
     "why": "답할 수 있는 상식은 답한다 — 범위 안내를 여기에 쓰면 밀어내기가 된다"},

    # ════════ 08-21 ai-server 인수분 — 계산·조회 실물화 케이스 3종 (v0.1) ════════
    # 인수 전에는 계산이 전부 스텁이라 "불렀는가"까지만 채점했다. 이제 결과가
    # 실물이므로 **결과 수치가 발화에 실렸는가**까지 조인다.

    # ── 가격 비교: 눈대중 금지 + 행사가 기준 ───────────────────────────────
    {"id": "price_compare_promo",
     "q": "물티슈 캡형이랑 리필형 중에 뭐가 더 싸요?",
     "consumer_id": 9001, "session_id": "sess-7f3a9c",
     "expect_tools": ["search_products", "compare_products"],
     # 리필형이 행사(1,000원 할인)로 6,900원 — 승자와 행사 사실이 둘 다 나와야 한다.
     "must_include": [("리필",), ("6,900", "6900"), ("행사", "할인")],
     "must_not_include": [r"품절"],
     "why": "총액 비교는 compare_products를 거친다. 행사가 반영 실판매가가 기준 — "
            "정가로 비교하면 지금 더 싼 리필형을 놓친다(ai-server 실호출 교훈)"},

    # ── 인기 순위: 집계는 SoT가, LLM은 읽기만 ──────────────────────────────
    {"id": "popular_rank",
     "q": "요즘 뭐가 잘 나가요?",
     "consumer_id": 9001, "session_id": "sess-7f3a9c",
     "expect_tools": ["get_popular_products"],
     # mock 이력(최근 90일 창)에서 구매자 수 1위는 물티슈 캡형이다.
     "must_include": [("물티슈",)],
     "must_not_include": [r"확인이 어렵|모르겠"],
     "why": "인기 질문은 지어내지도 회피하지도 않는다 — 백엔드 집계를 읽는다. "
            "mock 이력이 몇 줄뿐이어도 '그 몇 줄의 1위'를 정확히 말해야 한다"},

    # ── 예산 조합: 산술은 솔버가 ───────────────────────────────────────────
    {"id": "budget_combo",
     "q": "물티슈 두 종류랑 세제 중에 2만원 안에서 살 수 있는 만큼 골라줘",
     "consumer_id": 9001, "session_id": "sess-7f3a9c",
     "expect_tools": ["search_products", "optimize_bundle"],
     # 최적해: 캡형 12,900 + 리필 6,900(행사가) = 19,800원. 총액이 발화에 있어야 한다.
     "must_include": [("19,800", "19800")],
     "must_not_include": [r"21,?800|22,?800"],   # 정가 합(오답) — 직접 더한 흔적
     "why": "예산 조합의 총액은 LLM이 더한 값이 아니라 솔버의 total_krw여야 한다. "
            "정가 합계가 나오면 행사가 반영 없이 눈대중으로 더한 것"},

    # ── 위치 신뢰 등급 넷 (2026-08-28 신설) ────────────────────────────────
    #
    # [왜 이 넷이 필요한가] 08-28 에 가드가 위치 발화를 **막고 있었는데**
    #   골든셋 45/45 가 통과했다. 위치 케이스가 하나도 없어서다.
    #   그리고 같은 날 `posAgeSec` 가 요청 스키마에 없어 등급이 늘 medium
    #   이었던 것도 드러났다 — 둘 다 **재는 자가 없어서 산 결함**이다.
    #
    # [무엇을 재나] `get_position` 이 나이로 등급을 가르고 등급마다
    #   `read_as` 가 다른 말하기를 시킨다. 그 지시를 따르는지를 잰다.
    #   ⚠ 이 규율은 **정의가 아니라 결과에** 있으므로(㉠ 축약에도 안 깎인다),
    #     모델이 결과를 읽는지를 직접 재는 유일한 자리다.
    #
    # ⚠ **넷 다 구역을 금지어로 건다.** 이 도구는 층과 좌표만 알고
    #   존은 모른다(08-28 read_as 정정). 존을 말하면 지어낸 것이고,
    #   가드도 그것을 막는다.
    {"id": "position_high_assert",
     "q": "나 지금 어디쯤이에요?",
     "consumer_id": 9001, "session_id": "sess-pos-h",
     "position": (3, 12, 40, 5),          # 방금 스캔 → high
     "expect_tools": ["get_position"],
     "must_include": [("3층", "3 층")],
     "must_not_include": [r"[A-H]\s*구역", r"혹시.*계신가요", r"기준으로는"],
     "why": "high 는 단정해도 되는 유일한 등급이다. 되묻거나 기준을 밝히면 "
            "read_as 를 안 읽은 것 — 있는 근거를 안 쓰는 것도 결함이다"},

    {"id": "position_medium_hedge",
     "q": "나 지금 어디쯤이에요?",
     "consumer_id": 9001, "session_id": "sess-pos-m",
     "position": (3, 12, 40, 60),         # 1분 지남 → medium
     "expect_tools": ["get_position"],
     "must_include": [("3층", "3 층"), ("스캔", "아까", "기준")],
     "must_not_include": [r"[A-H]\s*구역"],
     "why": "medium 은 **기준을 밝히고** 말한다. 층은 말하되 '아까 스캔하신 "
            "자리 기준으로는' 이 붙어야 한다 — 단정과 되묻기 사이의 자리"},

    {"id": "position_low_ask_back",
     "q": "나 지금 어디쯤이에요?",
     "consumer_id": 9001, "session_id": "sess-pos-l",
     "position": (3, 12, 40, 900),        # 15분 지남 → low
     "expect_tools": ["get_position"],
     "must_include": [("?", "까요", "신가요")],
     "must_not_include": [r"[A-H]\s*구역", r"지금 계신 3층"],
     "why": "low 는 **되묻는 등급**이다. 오래된 앵커로 단정하면 손님이 엉뚱한 "
            "데로 걸어간다 — 틀린 위치 안내는 위치를 모르는 것보다 나쁘다"},

    {"id": "position_no_anchor",
     "q": "나 지금 어디쯤이에요?",
     "consumer_id": 9001, "session_id": "sess-pos-n",
     "position": None,                    # 앵커 없음
     "expect_tools": ["get_position"],
     "must_include": [("몇 층", "어느 층", "층을", "층이신")],
     "must_not_include": [r"\d\s*층에 계", r"[A-H]\s*구역"],
     "why": "앵커가 없으면 **손님에게 층을 묻는다.** 입구를 추측해 답하면 "
            "그것이 지어낸 위치다 — 스캔 기록이 없는 상태가 곧 모르는 상태다"},
]

# ── 자체 검산 — 골든셋 자신도 조용히 망가질 수 있다 ──────────────────────────
_ids = [c["id"] for c in GOLDEN]
assert len(set(_ids)) == len(_ids), "케이스 id 중복"
assert 12 <= len(GOLDEN) <= 24, f"v0 12~15 + 위치 4 (현재 {len(GOLDEN)})"
# ⚠ `position` 은 **선택 칸**이다 — 없으면 러너가 앵커 없이 돌린다.
#   있는 케이스는 (층, x, y, 나이초) 넷이고, 나이가 등급을 가른다.
for _c in GOLDEN:
    _p = _c.get("position")
    assert _p is None or (isinstance(_p, tuple) and len(_p) == 4), (
        f"{_c['id']}: position 은 (층,x,y,나이초) 네 칸이어야 한다")
for _c in GOLDEN:
    for _k in ("id", "q", "expect_tools", "must_include", "must_not_include", "why"):
        assert _k in _c, f"{_c.get('id', '?')}: {_k} 칸 누락"
