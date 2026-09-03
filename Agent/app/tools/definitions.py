# ============================================================================
# StoreFlow 하네스 — 도구 정의 (LLM이 읽는 계약서, 설계서 §5·§6.5)
# ============================================================================
# [역할] 루프가 LLM에게 "너는 이 도구들을 쓸 수 있다"고 건네는 목록.
#   여기의 name·description·input_schema가 API 요청에 그대로 실려 나가고,
#   LLM은 **description만 읽고** 어느 도구를 부를지 정한다. 즉 이 파일의
#   description은 주석이 아니라 실행에 영향을 주는 프롬프트다.
#
# [구성] 조회 10 + 계산 5 + 추론 6 + **액션 3** = 24종. (09-03: 추론 +1 find_facility)
#   · 조회 7 + 계산 4 + 추론 5가 설계서의 "도구 16", 액션 3종은 B안 채택
#     (2026-08-14)으로 추가된 쓰기 도구다. 쓰기라고 해서 우리가 DB를 만지는 게
#     아니라, 백엔드의 /internal/cart API를 부르는 것 — 상태 변경은 백엔드 단일 경로.
#   · 조회 +3(지표·판매량 비교·인기 순위)과 계산 +1(가격 정렬)은 **08-21
#     ai-server 인수**로 편입됐다(팀 결정 — "뭐가 잘 팔려요?"에 답 못 하는 직원은
#     이상하다). 백엔드가 집계하고 우리는 받아 전달만 하므로 조회형이고,
#     compare_products만 파이썬이 정렬하므로 계산형이다.
#
# [description 작법 — 이 파일의 본체]
#   "무엇을 반환하는가"만 쓰면 안 되고 **"언제 쓰고, 언제 쓰지 않는가"**까지 쓴다.
#   실패 시나리오: get_inventory 설명이 "상품 정보를 가져온다"뿐이면, 가격
#   질문에도 재고 조회가 나가서 왕복이 낭비되고 답이 느려진다.
#
# [분리 이유] 정의(이 파일)와 실행(query.py·compute.py·infer.py·action.py)을
#   나눈 것은, description 튜닝이 W3 내내 반복되는 작업이라서다. 문구를 고칠 때
#   실행 코드를 건드리지 않아야 "프롬프트 실험"과 "로직 변경"이 git에서 안 섞인다.
# ============================================================================
#
# ─── 개념 사전 — 이 파일에 처음 나오는 개념 9개 ─────────────────────────────
# (sot_client.py의 사전 ①~⑦은 아는 것으로 전제)
#
# ⑧ 선언적 데이터 파일
#    이 파일에는 def(함수)가 거의 없다. 전체가 하나의 큰 리스트 상수(TOOLS)다.
#    "무엇을 하라"(명령)가 아니라 "무엇이 있다"(선언)만 적는 방식 — 읽는 주체가
#    파이썬 실행기가 아니라 LLM이기 때문이다.
#
# ⑨ JSON 스키마(JSON Schema)
#    "이 도구는 이런 모양의 입력을 받는다"를 기계가 읽게 적는 표준 형식.
#    빈칸 양식지라고 보면 된다:
#      "type": "object"   → 입력은 키-값 묶음(dict)이다
#      "properties": {…}  → 채울 수 있는 칸들의 이름·타입·설명
#      "required": [...]  → 반드시 채워야 하는 칸
#
# ⑩ enum (열거)
#    "enum": ["A","B"] = "이 칸에는 A 아니면 B만". 자유 문자열로 두면 LLM이
#    "신선 식품"처럼 미묘하게 다른 표기를 만들어 검색이 0건이 된다.
#
# ⑪ 괄호 안 문자열 자동 이어붙이기
#    파이썬은 괄호 안에서 "문자열" "문자열"을 나란히 두면 + 없이 한 줄로 잇는다.
#    긴 description을 80자 안팎으로 줄바꿔 쓰되 실제 값은 한 문장이 되게 하는 관용구.
#
# ⑫ 리스트 안의 dict (중첩 자료구조)
#    TOOLS = [ {도구1}, {도구2}, … ] — dict들을 담은 리스트. 각 dict 안에 또
#    dict(input_schema)가 있다. {}는 "이름표 붙은 칸들", []는 "순서 있는 나열".
#
# ⑬ 리스트 컴프리헨션 — "리스트 안에 반복문이 들어 있는 것"
#    [식 for 항목 in 목록]  = "목록을 하나씩 돌면서, 식의 결과를 모아 새 리스트로"
#    아래 세 줄이 완전히 같은 뜻이다:
#        out = []                              out = [t["name"] for t in TOOLS]
#        for t in TOOLS:              ≡
#            out.append(t["name"])
#    뒤에 if를 붙이면 거르기도 된다: [x for x in 목록 if 조건]
#    for가 앞이 아니라 **뒤**에 오는 게 낯선 지점인데, "무엇을 모을지"를 먼저
#    쓰고 "어디서 모을지"를 뒤에 쓴다고 읽으면 된다.
#    ({}로 감싸면 set 컴프리헨션, {k:v for …}면 dict 컴프리헨션 — 같은 문법족)
#
# ⑭ set() — 집합
#    set(리스트) = 리스트를 집합으로 바꾼다. 집합은 **중복을 자동으로 버리고**
#    순서가 없다. 그래서 len(set(목록)) != len(목록) 이면 "중복이 있다"는 뜻이다.
#    특이한 성질 하나: set(딕셔너리)를 하면 값은 버리고 **키만** 모인다.
#        set({"a":1, "b":2})  →  {"a", "b"}
#    아래 검산에서 "이 dict가 정확히 이 세 키만 갖고 있나"를 확인할 때 쓴다.
#
# ⑮ assert — 검산문 (assert = "단언하다")
#    assert 조건, "메시지"
#      → 조건이 참이면 아무 일도 안 일어나고 그냥 지나간다.
#      → 조건이 거짓이면 그 자리에서 AssertionError를 내며 프로그램이 멈추고,
#        "메시지"가 화면에 찍힌다.
#    왜 쓰나: 선언적 데이터 파일(⑧)의 약점은 **오타가 조용하다**는 것이다.
#    도구를 15개만 적어놓고 16개인 줄 알고 있으면, 에러 없이 그냥 기능 하나가
#    사라진 채로 돈다. assert를 파일 맨 아래 두면 이 파일을 import하는 순간
#    검사가 돌아서, 서버가 뜨는 그 순간에 터진다 — 발표 중이 아니라.
#    (참고: 파이썬을 -O 옵션으로 실행하면 assert는 통째로 무시된다. 그래서
#     "사용자 입력 검증"에는 쓰면 안 되고, 이런 "개발 중 자기 점검"에만 쓴다.)
#
# ⑯ f-문자열 (f-string)
#    f"…{식}…"  = 문자열 안에 {} 를 넣으면 그 안의 파이썬 식이 계산되어
#    문자열로 끼워진다. f"도구는 16개여야 한다: {len(TOOLS)}" → "…: 15"
#    f를 안 붙이면 {len(TOOLS)}가 글자 그대로 나온다. 에러 메시지에 실제 값을
#    보여주려고 쓴다 — "틀렸다"보다 "15개다"가 고치기 쉬우니까.
# ────────────────────────────────────────────────────────────────────────────

# 대분류 12종 — enum(⑩)에 쓰려고 상수로 뺐다. 소분류 60은 여기 넣지 않는다:
# 목록이 길어 스키마가 비대해지므로 시스템 프롬프트(prompts.py)에 전문을 싣고,
# 스키마에서는 "프롬프트의 목록에서 고르라"고 지시한다.
CATEGORY_L1 = ["신선식품", "냉장·냉동식품", "가공식품", "음료·주류", "생활용품", "주방용품",
               "뷰티·헬스", "홈·가전", "의류·잡화", "스포츠·레저", "완구·문구", "반려용품"]

TOOLS = [
    # ════════════════════════════════════════════════════════════════════
    # 조회형 7종 — SoT(백엔드)의 사실을 읽는다. 실행부는 tools/query.py
    # ════════════════════════════════════════════════════════════════════
    {
        "name": "search_products",
        "description": (   # ⑪: 괄호 안에서 문자열이 자동으로 이어 붙는다
            "상품을 조건으로 검색한다(키워드·카테고리·가격 상한·행사 여부·신상 여부, 전부 AND 결합). "
            "쓸 때: 사용자가 상품을 이름·조건으로 찾을 때('물티슈 있어?', '2만원 이하 세제', '요즘 새로 들어온 거'). "
            "쓰지 말 때: sku_id를 이미 알면 get_product로 바로 가고, 특정 상품의 재고·위치가 궁금하면 "
            "먼저 이걸로 sku를 찾은 뒤 get_inventory를 이어 부른다 — 검색 결과에는 재고가 없다. "
            # ㉠ 08-29: 후보정 발화 규율은 결과의 `read_as` 가 싣는다(query.py:203) —
            #   토씨까지 같았다. 여기 남긴 것은 결과가 **안 싣는 것** 하나뿐이다:
            #   후보정 뒤 0건은 "정말 없다"라는 판정(그때는 read_as 가 아예 안 온다).
            "⚠ 0건이면 하네스가 오타를 한 번 후보정해 다시 찾는다 — 그 뒤에도 0건이면 정말 없는 것이다."
        ),
        "input_schema": {   # ⑨: LLM이 채울 빈칸 양식지
            "type": "object",
            "properties": {
                "keyword": {"type": "string",
                            "description": "상품명·브랜드·소분류에서 찾을 낱말. 사용자 표현 그대로가 아니라 핵심 명사만 (예: '아기 물티슈 같은 거' → '물티슈')"},
                "category_l1": {"type": "string", "enum": CATEGORY_L1,
                                "description": "대분류로 좁힐 때만. 범위 질의('주방용품 쪽에서')가 아니면 비워둘 것"},
                "category_l2": {"type": "string",
                                "description": "소분류로 좁힐 때만. 시스템 프롬프트의 소분류 60 목록에 있는 표기 그대로 쓸 것"},
                "max_price": {"type": "integer",
                              "description": "가격 상한(원). '2만원 이하' → 20000. 언급 없으면 비워둘 것"},
                "on_promo_only": {"type": "boolean",
                                  "description": "행사 상품만 볼지. '세일하는 거'류 표현일 때만 true"},
                "new_within_days": {"type": "integer",
                                    "description": "최근 N일 내 입고만('신상' 질의). 보통 30"},
            },
            "required": [],
        },
    },
    {
        "name": "get_product",
        "description": (
            "sku_id 하나로 상품 상세(이름·브랜드·가격·규격 원문·판매 상태·이미지 경로)를 가져온다. "
            "쓸 때: 어느 상품인지 이미 특정된 상태에서 가격·규격·단종 여부를 답할 때. "
            "쓰지 말 때: 재고·위치 질문(get_inventory가 담당 — 이 결과에는 재고가 없다), "
            "상품이 특정 안 된 상태(먼저 search_products)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"sku_id": {"type": "integer", "description": "상품 고유 번호"}},
            "required": ["sku_id"],
        },
    },
    {
        "name": "get_inventory",
        "description": (
            "상품 하나의 재고를 위치별 목록으로 가져온다 — 매대(PICK)와 예비 보관단(BULK)이 구분되고 "
            "각 위치의 층·좌표·수량·보충 임계가 담긴다. "
            # ㉠ 08-31: 3분기의 **처방**은 결과의 `read_as` 로 옮겼다(query.py
            #   `_get_inventory`) — 갈래마다 다음 도구가 다른데, 정의에 뭉쳐 두면
            #   세 번 중 두 번이 헛것이고 **판단이 필요한 순간과도 멀다.**
            #   ⚠ 여기 남긴 한 줄은 **라우팅의 뼈대**다: 매대 0 ≠ 품절.
            "쓸 때: '있어요?'·'어디 있어요?'류 질문 전부. **매대 0 은 품절이 아니다** — "
            "결과의 read_as 가 다음에 부를 도구를 알려준다. "
            "쓰지 말 때: 가격·규격 질문(get_product), 상품 미특정 상태(먼저 search_products)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"sku_id": {"type": "integer", "description": "상품 고유 번호"}},
            "required": ["sku_id"],
        },
    },
    # ── 신원 자동 주입 (B안 확장, 2026-08-20) ──────────────────────────────
    # 아래 조회·추론 도구들의 스키마에 member_id·session_id 칸이 **없다.**
    # 액션 3종과 같은 이유다(아래 액션 절의 주석 참조) — 회원 번호는 LLM이
    # 정하면 안 되는 값이라, 루프가 등록한 값을 query.run이 채운다.
    # 처음엔 스키마에 칸이 있었는데, 첫 골든셋 실호출에서 LLM이 그 칸을 채울
    # 값이 없어 손님에게 "회원번호 알려주시겠어요?"라고 **되묻는** 문제(4케이스
    # FAIL)와, 남의 번호를 불러달라면 그대로 부르는 보안 구멍이 함께 드러나
    # 액션과 같은 방식으로 옮겼다. (트러블슈팅/세션신원_미주입.md)
    {
        "name": "get_purchase_history",
        "description": (
            "현재 로그인한 회원의 과거 구매 이력 전체를 시간순으로 가져온다. "
            "회원 번호는 서버가 자동으로 채우므로 손님에게 묻지 않는다. "
            "쓸 때: '늘 사던 거'·'지난번에 산 거'·재구매 시점·개인화 추천의 근거가 필요할 때. "
            "쓰지 말 때: 비회원 세션(no_member 오류가 돌아온다 — 로그인하면 이력 기반 안내가 "
            "가능하다고 답할 것), 지금 장바구니 질문(get_session_cart가 담당)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_session_cart",
        "description": (
            "이번 장보기 세션의 장바구니(담은 것)와 합계 금액을 가져온다. 합계는 이미 계산되어 "
            "총액(total_krw)으로 들어 있다 — 직접 더하지 말고 그 값을 그대로 읽을 것. "
            "쓸 때: '지금 얼마 담았지?'·예산 대비 현황·담은 것 기준 제안. 그리고 "
            "**수량 변경·빼기 전에 cart_item_id를 알아내려고** 먼저 이걸 부른다. "
            "세션은 서버가 자동으로 잡으므로 손님에게 세션 ID를 묻지 않는다. "
            "쓰지 말 때: 과거 구매(get_purchase_history), 위시리스트(get_wishlist)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_wishlist",
        "description": (
            "현재 로그인한 회원의 위시리스트(찜 목록)를 가져온다. 회원 번호는 서버가 자동으로 채운다. "
            "쓸 때: '찜해둔 거'·'사려고 저장한 거' 질문, 위시리스트 상품의 입고 여부 확인의 시작점. "
            "쓰지 말 때: 비회원 세션(no_member 오류 — 로그인 안내로), "
            "장바구니(get_session_cart)와 혼동 금지 — 위시리스트는 세션과 무관한 저장 목록이다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_change_events",
        "description": (
            "최근 매장에서 '바뀐 것'만 가져온다 — 자리 이동(MOVE)·입고(RESTOCK_IN)·품절(STOCKOUT). "
            "쓸 때: '자리 바뀌었나?'·'들어왔나?' 질문. sku_ids로 관심 상품만 좁혀 부르는 것이 기본이다"
            "(전체 조회는 느리고 잡음이 많다). "
            "쓰지 말 때: 현재 재고 수량(get_inventory가 담당 — 이건 '사건'이지 '상태'가 아니다)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_ids": {"type": "array", "items": {"type": "integer"},
                            "description": "이 상품들의 변화만 조회. 반드시 좁혀서 부를 것"},
                "within_hours": {"type": "integer", "description": "최근 몇 시간(기본 24)"},
            },
            "required": ["sku_ids"],
        },
    },
    # ── 조회 +3 (2026-08-21 ai-server 인수) — 백엔드가 집계한 수치를 받아온다 ──
    {
        "name": "get_product_metrics",
        "description": (
            # ㉠ 08-29: 지표 이름 일곱을 한글로 풀어 쓰던 자리. 결과가 `sales_qty_30d`
            #   `cart_add_count_30d` `repurchase_rate_pct` … 로 전부 싣고 `window_days`
            #   까지 준다. **라우팅 낱말만 남기고** 풀이는 지웠다 — 손님이 쓸 법한
            #   말('많이 팔려요' '담은 사람' '조회수' '재구매율')이 다 살아 있어야
            #   이 도구로 온다.
            "상품의 실제 반응 지표 묶음 — 판매량(30일·누적)·장바구니 담기·조회수·구매자 수·재구매율(%). "
            "쓸 때: 'A랑 B 중 실제 반응이 좋은 건?'·'재구매율까지 비교해줘'처럼 여러 지표를 함께 물을 때. **한 상품의 반응만 물어도 부른다** — '이거 인기 있어요?'·'많이 팔려요?'처럼 상품 하나를 짚은 질문이 이 도구의 자리다(비교 도구는 상품이 둘 이상일 때다). "
            "먼저 search_products로 sku_id를 확정한 뒤 부른다. "
            "쓰지 말 때: 단순 판매량 순위(compare_purchase_popularity·get_popular_products가 담당), "
            "웹 평판(이 지표에 없다 — 있는 것처럼 지어내지 말 것). 수치는 그대로 인용하고 재계산하지 않는다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"sku_ids": {"type": "array", "items": {"type": "integer"},
                                       "description": "지표를 볼 상품들(최대 20개)"}},
            "required": ["sku_ids"],
        },
    },
    {
        "name": "compare_purchase_popularity",
        "description": (
            "특정 상품 여러 개를 놓고 어느 쪽이 더 많이 팔렸는지 비교한다 — "
            "'A샴푸랑 B샴푸 중 뭐가 인기야?' 같은 질문. 결과는 구매자 수(purchaser_count) "
            "내림차순으로 이미 정렬되어 오므로 그 순서를 그대로 쓴다(직접 순위를 매기지 말 것). "
            "먼저 search_products로 sku_id를 확정한다. "
            "쓰지 말 때: 가격 비교(compare_products), 상품을 안 짚은 순위 질문(get_popular_products)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_ids": {"type": "array", "items": {"type": "integer"},
                            "description": "비교할 상품들(2개 이상)"},
                "lookback_days": {"type": "integer",
                                  "description": "최근 며칠 기준 집계인지. 모르면 90"},
            },
            "required": ["sku_ids"],
        },
    },
    {
        "name": "get_popular_products",
        "description": (
            "카테고리(또는 매장 전체)에서 사람들이 많이 사는 상품 순위 — "
            "'요즘 뭐가 잘 나가?'·'샴푸 중에 많이들 사는 거 추천해줘'처럼 상품을 콕 짚지 않은 "
            "인기 질문에 쓴다. 특정 상품 2개 이상을 이름으로 짚어 비교하는 질문이면 "
            "이 도구 대신 compare_purchase_popularity를 쓴다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "category_l2": {"type": "string",
                                "description": "소분류명(시스템 프롬프트의 목록에서). 전체 대상이면 비워둘 것"},
                "lookback_days": {"type": "integer", "description": "최근 며칠 기준. 모르면 90"},
                "limit": {"type": "integer", "description": "상위 몇 개. 모르면 10"},
            },
            "required": [],
        },
    },
    # ════════════════════════════════════════════════════════════════════
    # 계산형 5종 — 규칙·솔버가 결정적으로 계산한다. 실행부는 tools/compute.py
    # LLM은 이 결과의 숫자를 절대 스스로 만들지 않는다(헌법 2).
    # ════════════════════════════════════════════════════════════════════
    {
        "name": "optimize_route",
        "description": (
            "정지점은 상품(sku_ids)과 시설(facility_stops — 화장실·계산대·엘리베이터 등 location_id 나 종류)을 섞을 수 있다(09-03). "
            "여러 상품을 도는 최소 보행 순서와 경로를 계산한다(층 구분 포함). "
            "쓸 때: 상품이 2개 이상인 동선 질문('이것들 어떤 순서로 돌면 돼?'), 리스트 기반 안내. "
            "쓰지 말 때: 상품 1개의 위치 안내(get_inventory의 좌표로 충분). "
            "방문 순서를 직접 추측해 답하지 말 것 — 반드시 이 도구의 결과 순서를 그대로 쓴다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_ids": {"type": "array", "items": {"type": "integer"},
                            "description": "방문할 상품들. 시설과 합쳐 2개 이상"},
                "facility_stops": {"type": "array", "items": {"type": "string"},
                                   "description": ("들를 시설. find_facility 가 준 location_id"
                                                   "('F1-X-RESTROOM_M-1') 또는 종류(RESTROOM·"
                                                   "CHECKOUT·ELEVATOR…). 종류면 출발점에서 가장 "
                                                   "가까운 것. 계산대는 보통 마지막에 넣는다")},
                # 08-21(jmy): 출발점은 location_id 문자열보다 좌표 3종(floor/x/y)이
                # 정확하다 — 실물에서 location_id는 '매대'지 '사람이 선 자리'가 아니다.
                # ⚠ 08-25: **비워 두는 것이 기본이다.** 루프가 현재 위치를 주입하므로
                #   LLM이 채울 필요가 없다(compute.set_position). 채우는 것은 손님이
                #   출발점을 **명시**했을 때뿐이고, 그 경우 주입값보다 우선한다.
                #   (옛 문구는 "셋 다 비우면 입구 기준"이었는데 구현과 달랐다 —
                #    실제로는 에러를 냈다. 설명과 코드가 어긋나 있었다.)
                "start_floor": {"type": "integer",
                                "description": "출발 층. **손님이 출발점을 명시했을 때만** 채운다. 비우면 서버가 현재 위치를 넣는다"},
                "start_x": {"type": "integer", "description": "출발 x 격자좌표. 명시했을 때만 — 보통 비운다"},
                "start_y": {"type": "integer", "description": "출발 y 격자좌표. 명시했을 때만 — 보통 비운다"},
                "start_location_id": {"type": "string",
                                      "description": "출발 위치 id(좌표를 모를 때의 차선). 둘 다 모르면 비워둘 것"},
            },
            "required": [],
        },
    },
    {
        "name": "optimize_bundle",
        "description": (
            # ㉠ 08-31: "재고 확인 포함"은 아래 "품목 검색·재고 확인·조합 계산을
            #   이 도구 하나가 다" 와 같은 말이라 지웠다.
            "예산 제약 안에서 최적의 상품 조합을 계산한다(조합 최적화 솔버). "
            "쓸 때: '5만원으로 캠핑 준비 세트 짜줘'처럼 목적+예산 요청이면 purpose에 목적을 넣는다 "
            "— 품목 검색·재고 확인·조합 계산을 이 도구 하나가 다 하므로 search_products를 먼저 "
            "여러 번 부를 필요가 없다. '이 후보들 중에서 예산 안에 골라줘'면 candidate_sku_ids를 넣는다. "
            "쓰지 말 때: 단순 합계(get_session_cart에 이미 있음), 가격 비교(compare_products). "
            # ㉠ 08-31: "빠진 품목이 있으면 알린다"는 **갈래가 있는 규율**이라
            #   결과의 `read_as` 로 옮겼다(compute.py) — 실제로 빠졌을 때만,
            #   그것도 **이름과 함께** 온다.
            "반환된 total_krw·remaining_krw를 그대로 쓰고 총액을 직접 더하지 말 것."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "budget_krw": {"type": "integer", "description": "총예산(원). 예: 5만원 → 50000"},
                "purpose": {"type": "string",
                            "description": "준비 목적(현재 '캠핑' 지원). 목적형 요청일 때만"},
                "candidate_sku_ids": {"type": "array", "items": {"type": "integer"},
                                      "description": "직접 고른 후보들로 조합할 때만(그 외엔 비워둘 것)"},
                "max_items": {"type": "integer", "description": "최대 품목 수. 모르면 비워둘 것(기본 8)"},
            },
            "required": ["budget_krw"],
        },
    },
    {
        "name": "compare_products",
        "description": (
            "상품 여러 개를 실판매가(행사가 반영) 기준으로 정렬해 준다. "
            "**'뭐가 더 싸요?'·'제일 싼 거'·'가장 비싼 거'·'이 중에 골라줘' 는 전부 이 도구다** "
            "— 손님이 '싸다'고 할 때 뜻하는 것은 계산대에서 낼 금액이다. "
            "정렬은 파이썬이 하므로 결과 순서를 그대로 쓴다 — search_products 결과만 보고 "
            "눈대중으로 가격을 비교해 add_to_cart로 넘어가지 말 것. "
            # ㉠ 08-29: 행사 안내 규율은 결과의 `read_as` 로 옮겼다(compute.py
            #   `_compare_products`). **갈래가 있는 규율**이라 정의에 두면 행사가
            #   없는 판에서도 매번 실린다 — 헛것이 대부분이다.

            "쓰지 말 때: **용량 대비** 이득('어느 쪽이 이득?'·'100ml당') — compare_unit_price, "
            "판매량·인기 비교(compare_purchase_popularity)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_ids": {"type": "array", "items": {"type": "integer"},
                            "description": "비교할 상품들(search_products 결과에서, 2개 이상)"},
                "sort_by": {"type": "string", "enum": ["price_asc", "price_desc"],
                            "description": "price_asc=싼 순(기본), price_desc=비싼 순"},
            },
            "required": ["sku_ids"],
        },
    },
    {
        "name": "compare_unit_price",
        "description": (
            "상품 2개 이상의 **단위가격**(100ml당·매당 등)을 같은 잣대로 비교한다. "
            # ㉠ 08-29: "규격 환산은 솔버가 하고 축이 다르면 불가 사유를 돌려준다"를
            #   적던 자리. 앞의 절은 아래 "직접 나눗셈으로 만들지 말 것"과 같은 말이고,
            #   뒤의 절은 결과가 `error: no_comparable_pair` + `message` 로 직접 싣는다.

            "쓸 때: **용량·개수 대비 이득**을 묻는 질문 — '어느 쪽이 이득?'·'100ml당 얼마?'·"
            "'대용량이 나아?', 그리고 망설임 개입의 근거. "
            "⚠ **축이 안 맞아 보여도 일단 부른다.** '100ml당' 인데 상품이 무게(g)라도 "
            "마찬가지다 — **비교 가능 여부를 판정하는 것이 이 솔버의 일**이고, 실제로는 "
            "같은 무게 축으로 견줘 답을 낸다. 부르지 않고 '단위가 안 맞아 비교가 "
            "어렵다'고 답하면, 낼 수 있었던 답을 안 낸 것이다. "
            "⚠ **쓰지 말 때: 그냥 '뭐가 더 싸요?'** — 그건 총액 질문이라 compare_products 다. "
            # ㉠ 08-29: 여기 있던 괄호("총액만 알면 되는 질문을 여기로 보내면
            #   **답이 없어진다**")를 지웠다. 두 이유다 — ① 근거일 뿐, 규칙은 바로
            #   앞 문장이 이미 끝냈다. ② **지금은 사실도 아니다**: 못 견주면 결과가
            #   `alternatives` 로 compare_products 를 이름으로 준다(compute.py
            #   `_compare_unit_price`). 답이 없어지지 않는다. 낡은 협박은 지운다.
            "단위가격을 직접 나눗셈으로 만들지 말 것 — 반환된 수치만 인용한다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"sku_ids": {"type": "array", "items": {"type": "integer"},
                                       "description": "비교할 상품들(2개 이상)"}},
            "required": ["sku_ids"],
        },
    },
    {
        "name": "find_substitutes",
        "description": (
            # ㉠ 축약(08-29): 628→약 380자. **뺀 것은 결과가 이미 말한다** —
            #   size_match 규율은 `read_as` 에, 순위는 `ranking_rule` 칸에
            #   토씨까지 같게 들어 있다(compute.py). 여기 남긴 것은 전부
            #   **라우팅**이다 — 언제 부르나 / 언제 안 부르나 / 손으로 다시
            #   만들지 마라. 08-28 골든셋이 흔들린 자리가 정확히 이 셋이다.
            "어떤 상품의 **대안 후보**를 찾는다(같은 소분류 + 재고 있는 것만). "
            "**쓸 때: 손님이 다른 선택지를 묻는 모든 경우.** "
            "'말고 비슷한 거', '다른 거 뭐 있어요?', '이거 말고는?' — 그리고 "
            "품절·단종으로 확인된 직후('그럼 비슷한 거 없어?'). "
            "⚠ **원 상품에 재고가 있어도 부른다.** '말고 비슷한 거'는 재고를 묻는 "
            "말이 아니라 **선택지를 묻는 말**이다. 재고가 있다고 '대체품은 필요 "
            "없다'고 판단하지 말 것 — 그건 손님이 물은 것에 답하지 않는 것이다. "
            "⚠ **검색 결과로 직접 고르지 말 것.** search_products 로 비슷한 이름을 "
            "긁어 재고를 하나씩 확인하는 것은 이 도구를 손으로 다시 만드는 일이고, "
            "그렇게 하면 규격 근사·개인 반복구매·행사 순위가 전부 빠진다. "
            "쓰지 말 때: 취향 기반 추천(match_preferences 가 담당)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"sku_id": {"type": "integer", "description": "대체할 원 상품"}},
            "required": ["sku_id"],
        },
    },
    # ════════════════════════════════════════════════════════════════════
    # 추론형 5종 — 학습된 모델이 확률·추정값을 낸다. 실행부는 tools/infer.py
    # ════════════════════════════════════════════════════════════════════
    {
        "name": "predict_availability",
        "description": (
            "매대가 비었을 때 '언제쯤 다시 채워질지'를 시점별 확률로 예측한다(예: 10분 내 40%, 20분 내 85%). "
            "쓸 때: get_inventory에서 매대(PICK) 0 + 보관단(BULK)이나 백룸에 재고가 확인된 직후. "
            "쓰지 말 때: 매대에 재고가 있을 때(예측할 게 없다), 매장 전체 어디에도 재고가 없을 때"
            # ㉠ 축약(08-29): 단위 함정과 "확률로 말하라"를 결과의 read_as 로
            #   옮겼다. 남긴 것은 라우팅 셋(언제·언제 안·어디로)뿐이다.
            "(그때는 find_substitutes로). 확률·시간을 직접 추측하지 말고 결과의 "
            "read_as 를 따를 것."
        ),
        "input_schema": {
            "type": "object",
            # ⚠ 08-27: `location_id` 를 삭제했다. **함수가 안 받는 인자를 광고하고
            #   있었다** — `infer.predict_availability(sku_id)` 뿐인데 스키마는 그것을
            #   required 로까지 걸어 두어, LLM 이 규칙대로 부를수록 반드시
            #   `bad_arguments` 로 튕겼다. 실물 골든셋에서 모델은 이 도구를 **두 번**
            #   부르고 두 번 다 실패한 뒤 "정확한 보충 시점은 확인이 어렵네요"로
            #   물러섰다 — 킬링 장면 1 이 통째로 죽어 있었는데, 도구가 실패해도
            #   발화는 그럴듯해서 골든셋이 PASS 를 줬다(그 케이스가 확률을 요구하지
            #   않았기 때문). **스텁 시절 스키마가 실물 구현을 따라오지 않은 것**이
            #   근본 원인이라, 아래 `check_schema_signature()` 로 전수 대조를 건다.
            # [왜 위치가 필요 없나] 모델의 특징은 SKU 의 par·경로형(VERTICAL/
            #   HORIZONTAL)과 **매장 전체 큐 길이**다. 위치는 sku_id 로 조회해서
            #   내부에서 얻는다 — LLM 이 넘길 이유가 없다.
            "properties": {
                "sku_id": {"type": "integer", "description": "상품 고유 번호"},
            },
            "required": ["sku_id"],
        },
    },
    {
        "name": "predict_repurchase",
        "description": (
            "현재 로그인한 회원의 소비주기로 '지금이 다시 살 때인지'를 확률로 판정한다"
            "(마지막 구매 후 경과일 반영). 회원 번호는 서버가 자동으로 채운다. "
            "쓸 때: '뭐 사야 되지?'·살 때가 된 품목 선별. "
            # ㉠ 축약(08-29): 572→약 300자. basis 규율(infer.py:507)과
            #   "90일부터는 전체 평균"(infer.py:627)이 **이미 read_as 에 있다** —
            #   그것도 산 적 없는 상품일 때만 온다. 설명문에 두면 개인 예측인
            #   경우에도 그 경고를 읽게 되고, 그건 문맥만 먹는다.
            "쓰지 말 때: 비회원(no_member 오류 — 로그인 안내로), "
            "**취향 기반 추천(match_preferences)** — 이 도구는 '살 때가 됐나'(시간)를 "
            "묻고 저쪽은 '좋아할까'(내용)를 묻는다. 같은 상품을 둘 다 밀면 중복 발화가 된다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_ids": {"type": "array", "items": {"type": "integer"},
                            "description": "판정할 품목들. 비우면 이력 전 품목을 판정"},
            },
            "required": [],
        },
    },
    {
        "name": "get_position",
        "description": (
            "사용자의 현재 매장 내 위치를 추정한다 — 마지막 스캔 매대를 앵커로 잡고 "
            "그 앞 통행 칸으로 스냅한 좌표(floor_no·x·y·snapped·read_as)를 돌려준다. "
            "쓸 때: 손님이 자기 위치를 물을 때('나 지금 어디쯤이에요?'), 위치 기준의 안내가 "
            "필요할 때('여기서 가까운 걸로'). "
            "쓰지 말 때: optimize_route의 start 채우기(출발점은 서버가 자동 주입한다 — "
            "결과를 옮겨 적지 말 것), 상품 위치 질문(그건 get_inventory). "
            # ㉠ 축약(08-29): no_scan_anchor 의 복구 지시는 **오류 message 가
            #   이미 담고 있다**("몇 층인지 물어보거나…" — infer.py). 오류가
            #   스스로 다음 행동을 가리키는 드문 경우라 설명문이 겹칠 이유가 없다.
            "⚠ 추정이다 — 얼마나 믿을지는 결과의 read_as 가 나이에 따라 정해 준다. "
            "그대로 따를 것(단정 / 기준 밝힘 / 되묻기)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "find_facility",
        "description": (
            "시설의 위치 — 화장실·엘리베이터·에스컬레이터·계산대·입구·고객센터·ATM·베이커리·"
            "푸드코트·약국·안경 센터·시식 코너·휴게 라운지·A/S 센터·가전 체험존·행사 매대·휴지통. "
            "손님 위치를 알면 **가장 가까운 것**과 걷는 거리(m)를, 모르면 층별 위치를 돌려준다. "
            "쓸 때: '화장실 어디예요?', '계산대 어디로 가요?', '엘리베이터 있어요?', "
            "'2층에 약국 있어요?'. 쓰지 말 때: 상품 위치(그건 get_inventory), 상품 사이 순서"
            "(optimize_route). ⚠ 도면에 없는 것(카트 보관대·주차장·흡연구역)은 unknown_kind 가 "
            "온다 — 없다고 말한다. 좌표 숫자는 읽지 말고 층·방향·거리로 말한다(read_as)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {
                    "type": "string",
                    "enum": ["RESTROOM", "RESTROOM_M", "RESTROOM_F", "ELEVATOR", "ESCALATOR",
                             "CHECKOUT", "ENTRANCE", "CUSTOMER_SERVICE", "ATM", "BAKERY",
                             "FOODCOURT", "PHARMACY", "OPTICAL", "TASTING", "LOUNGE",
                             "AS_CENTER", "EXPERIENCE", "EVENT", "TRASH"],
                    "description": "시설 종류. 화장실은 RESTROOM(남녀 중 가까운 쪽)."
                },
                "floor_no": {
                    "type": "integer",
                    "description": "층을 지정할 때만(1~3). 비우면 현재 층, 위치를 모르면 전 층."
                },
            },
            "required": ["kind"],
        },
    },
    {
        "name": "match_preferences",
        "description": (
            "현재 로그인한 회원이 **아직 안 산 상품 중** 취향에 맞을 후보를 근거와 함께 "
            # ㉠ 축약(08-29): "소분류당 최대 3개"·"why 만 쓴다"·"axes_inferred 는
            #   단정 금지"가 전부 결과의 read_as 에 있다(infer.py:1207).
            #   남긴 것은 라우팅 — 특히 **쓰지 말 때 넷**은 08-28 에 내가
            #   교차 참조로 채운 자리라 여기가 제자리다.
            "돌려준다. 회원 번호는 서버가 자동으로 채운다. "
            "행사 여부는 on_promo로 함께 오지만 **행사 상품만 고르는 도구가 아니다** — "
            "행사만 원하면 search_products를 쓴다. "
            "쓸 때: '내가 좋아할 만한 거 있어?' 같은 열린 추천 요청, 진입 브리핑. "
            "쓰지 말 때: 비회원(no_member 오류 — 로그인 안내로), "
            "조건이 명시된 검색('2만원 이하 세제' — search_products), 품절 대체(find_substitutes), **'살 때 된 것' 질문(predict_repurchase)** — 이 도구는 아직 안 산 것에서 고르고 저쪽은 사던 것의 주기를 본다. "
            "⚠ 재고·위치는 여기 없다 — 필요하면 get_inventory로 따로 확인한다. "
            "발화 규율은 결과의 read_as 를 따를 것."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "top_k": {"type": "integer",
                          "description": "후보 개수(기본 3, 최대 5). 넘기면 5로 자르고 "
                                         "truncated_to에 적어 돌려준다"},
            },
            "required": [],
        },
    },
    # ── 계약 개정 (08-25, T9 실측 근거) ────────────────────────────────────
    # 이전 description은 "유사도가 낮으면 단정하지 말고"라고 적었다. **그 조건은
    # 쓸 수 없다.** 실측하니 유사도가 정답 여부와 무관했다(AUC 0.465 — 오히려
    # 틀린 쪽 평균이 더 높다). 모델이 "자신 없다"를 말할 방법이 없다는 뜻이므로
    # **조건부가 아니라 무조건** 단정을 금지한다.
    #   근거: `모델비교\T9_임베딩모델_비교.md` §9
    #
    # 왜 이게 안전 문제인가: 갤러리는 우리 카탈로그 5,000개뿐인데 검색은 **언제나**
    # 최근접을 돌려준다. 손님이 우리가 안 파는 물건을 찍어도 1위가 나온다.
    # 그걸 품목명으로 단정하면 **설계된 할루시네이션**이고, 출처별 원장으로도 위반이다
    # — "이 물건이 우리 매장에 있다"는 매장 사실이고 매장 사실은 sot에서만 온다.
    #
    # ⚠ 그런데 **반대쪽 오류도 같은 무게다.** 있는 물건을 "구별 못 하겠다"는 이유로
    #   "없습니다"라고 말하면 팔 수 있었던 것을 놓친다. 매장 입장에서는 더 나쁘다.
    #   → 그래서 2단이 아니라 **3단**이고, 마지막 단의 문장이 "매장에 없습니다"가 아니라
    #     "제가 구별하기 어렵습니다"다. **재고를 주장하지 않으면 위양성이 생기지 않는다.**
    #   임계는 실측에서 뽑았다(T9 §9.5~9.6): category는 purity20>=0.3(기권 11%),
    #   confident는 itemtop5>=0.6. ⚠ confident 임계는 n=10에서 뽑은 것이라 얇다.
    {
        "name": "identify_product_photo",
        # ㉠ 축약 (08-29): 699자 → 약 200자. **뜻을 줄인 것이 아니라 옮겼다** —
        #   tier 세 단계의 말투·금지가 전부 결과의 `read_as` 로 갔다(infer.py).
        #   여기 남긴 것은 **라우팅 경계**(언제 부르나 / 언제 안 부르나)와
        #   **도구의 성격**(판정이 아니라 순위)뿐이다.
        "description": (
            "사용자가 올린 사진과 닮은 상품 **후보 목록**을 찾는다(이미지-텍스트 매칭). "
            "⚠ **무엇인지 판정하지 않는다** — 닮은 순서로 줄을 세울 뿐이라 사진 속 "
            "물건이 매장에 없어도 후보는 나온다. "
            "쓸 때: 사진이 첨부된 질문('이거 여기서 팔아?' + 사진). "
            "쓰지 말 때: 사진 없이 이름·조건으로 찾을 때(search_products). "
            "말하는 법은 결과의 read_as 가 tier 별로 준다 — 그대로 따를 것."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"image_ref": {"type": "string",
                                         "description": "업로드된 이미지 참조 ID(백엔드 릴레이가 발급)"}},
            "required": ["image_ref"],
        },
    },
    # ════════════════════════════════════════════════════════════════════
    # 액션형 3종 (B안, 2026-08-14) — 백엔드 /internal/cart를 호출해 실제로 담는다.
    # 실행부는 tools/action.py. 우리가 DB를 만지는 게 아니라 백엔드 API를 부르는
    # 것이므로 헌법 4·5(상태 변경은 백엔드 단일 경로)를 어기지 않는다.
    # 이 3종은 **회원만** 쓸 수 있다(consumer_id 필요) — 비회원이면 부르지 않는다.
    # ════════════════════════════════════════════════════════════════════
    {
        "name": "add_to_cart",
        "description": (
            "상품을 장바구니에 실제로 담는다(되돌리려면 remove_from_cart). "
            "쓸 때: 사용자가 담아달라고 **명시적으로 지시**했을 때. 어느 상품인지 sku_id로 확정된 뒤에만. "
            "'가장 싼 것'류 지시라면 compare_unit_price로 먼저 확정하고 담는다. "
            "쓰지 말 때: 사용자가 묻기만 했을 때('이거 얼마야?'에 담지 않는다), sku_id가 불확실할 때, "
            "비회원 세션일 때(담을 계정이 없다 — 로그인 안내로). "
            "담은 뒤에는 무엇을 왜 골랐는지 결과로 알린다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_id": {"type": "integer", "description": "담을 상품"},
                "quantity": {"type": "integer", "description": "수량(기본 1)"},
            },
            "required": ["sku_id"],
        },
    },
    {
        "name": "update_cart_quantity",
        "description": (
            "장바구니에 이미 담긴 항목의 수량을 바꾼다. "
            "쓸 때: '그거 2개로 해줘' 같은 수량 변경. **cart_item_id가 필요하므로 모르면 "
            "get_session_cart로 먼저 확인**한 뒤 부를 것. "
            "쓰지 말 때: 새 상품 담기(add_to_cart), 아예 빼기(remove_from_cart)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "cart_item_id": {"type": "integer", "description": "장바구니 항목 ID(get_session_cart로 확인)"},
                "quantity": {"type": "integer", "description": "새 수량(1 이상)"},
            },
            "required": ["cart_item_id", "quantity"],
        },
    },
    {
        "name": "remove_from_cart",
        "description": (
            "장바구니에서 항목을 뺀다. "
            "쓸 때: '그거 빼줘'라는 명시적 지시. cart_item_id를 모르면 get_session_cart로 먼저 확인. "
            "쓰지 말 때: 수량만 줄이는 경우(update_cart_quantity), 사용자가 망설이기만 할 때 "
            "— 빼는 것은 사용자의 결정이지 에이전트의 제안이 아니다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"cart_item_id": {"type": "integer", "description": "뺄 장바구니 항목 ID"}},
            "required": ["cart_item_id"],
        },
    },
]

# ════════════════════════════════════════════════════════════════════════════
# 서버 사이드 도구 (2026-08-14 팀 결정으로 채택)
# ════════════════════════════════════════════════════════════════════════════
# [위 TOOLS와 무엇이 다른가] 위의 19개는 **우리가 구현**한다 — input_schema를
#   우리가 쓰고, query.py·compute.py·infer.py·action.py가 실행한다.
#   아래 서버 사이드 도구는 **앤트로픽이 구현하고 앤트로픽 서버에서 실행**한다.
#   우리는 "이 도구를 쓸 수 있다"고 선언만 하고, 결과는 같은 응답 안에
#   web_search_tool_result 블록으로 실려 온다. 실행부가 없다.
#
# [그래서 리스트를 나눈다] 형식이 아예 다르기 때문이다:
#   우리 도구  = {name, description, input_schema}
#   서버 도구  = {type, name, (옵션)}      ← description을 우리가 쓸 수 없다
#   한 리스트에 섞으면 아래 검산이 둘 다 통과할 수 없고, 무엇보다 루프가
#   "이건 내가 실행할 도구인가?"를 이름만 보고 판정할 근거가 사라진다.
#
# [채택 경위] 08-14 팀 회의에서 **후기·별점 기반 상품 안내를 폐기**하고,
#   "챗봇에게 상품을 물어보면 검색해서 알려주는" 기능으로 대체하기로 결정.
#   설계서 §5.4의 기존 판정("상품 평판은 우리 도구가 아니라 LLM 플랫폼의
#   내장 웹 검색을 루프 설정으로 켠다 — 기능 1에 흡수")을 활성화한 것이다.
#
# [주의 2가지 — 둘 다 prompts.py가 감당한다]
#   ① description을 우리가 못 쓴다. 도구 16개에 공들인 "언제 쓰고 언제 안
#      쓰는가"를 여기엔 붙일 수 없으므로, 그 지침이 시스템 프롬프트로 간다:
#      재고·위치·가격·시각은 매장 도구에서만, 웹은 상품 고르는 기준·평판만.
#   ② 우리 브랜드는 가상이라 상품명으로 검색하면 0건이다("농부의아침 한우
#      등심"은 세상에 없다). 검색어는 브랜드를 빼고 품목·속성으로 만들도록
#      프롬프트가 지시해야 한다("한우 등심 고르는 법").
SERVER_TOOLS = [
    {
        # 타입 문자열의 날짜는 도구 버전이다. _20260209 판은 검색 결과를
        # 컨텍스트에 넣기 전에 걸러내는 기능이 내장돼 있어 토큰이 절약된다.
        # 이 버전은 config.LLM_MODEL(claude-sonnet-5)에서 지원된다.
        # 주의: 이 버전은 내부적으로 코드 실행을 쓰므로, code_execution 도구를
        #       따로 선언하면 실행 환경이 둘이 되어 모델이 헷갈린다. 선언 금지.
        "type": "web_search_20260209",
        "name": "web_search",
        # 한 요청당 검색 횟수 상한. 안 걸면 한 질문에 여러 번 검색해서 답이
        # 산만해진다 — 지연보다 이쪽이 데모에서 더 아프다.
        "max_uses": 4,
    },
]

# 루프가 API에 실제로 보내는 목록. 두 리스트를 합쳐 한 번에 넘긴다.
ALL_TOOLS = TOOLS + SERVER_TOOLS

# 루프가 "이 도구 호출을 내가 실행해야 하나?"를 판정할 때 쓰는 집합.
# 여기 있는 이름은 우리가 실행하지 않는다 — 앤트로픽이 이미 실행했고 결과만
# 온다. 이 판정이 없으면 루프가 web_search를 REGISTRY에서 찾다가 실패해
# "unknown_tool" 에러를 LLM에게 돌려주는 사고가 난다.
SERVER_TOOL_NAMES = frozenset(t["name"] for t in SERVER_TOOLS)


# ── 자체 검산 — 이 파일을 import하는 순간 정의 오류를 잡는다 ────────────────
# 선언적 데이터 파일(⑧)의 약점은 오타가 실행 전까지 조용하다는 것이다.
# assert(⑮)로 여기서 터뜨려, 발표 중이 아니라 서버가 뜨는 순간에 알게 한다.

# len(리스트) = 원소 개수. 23이 아니면 도구를 빠뜨렸거나 중복해 붙인 것.
# f-문자열(⑯)로 실제 개수를 함께 보여줘야 몇 개가 됐는지 바로 안다.
# (19→23은 08-21 ai-server 인수: 조회 +3, 계산 +1 — 머리 주석 [구성] 참조)
assert len(TOOLS) == 24, f"도구는 24개여야 한다(조회10+계산5+추론6+액션3): {len(TOOLS)}"

# 리스트 컴프리헨션(⑬): TOOLS를 돌며 각 도구 dict에서 "name" 값만 뽑아 리스트로.
#   _names = ["search_products", "get_product", …]
# 이름 앞 밑줄(_names)은 "이 모듈 내부용 임시 변수"라는 관례 표시.
_names = [t["name"] for t in TOOLS]

# set(⑭)은 중복을 자동으로 버린다. 그래서 집합 크기가 23보다 작으면
# 같은 이름을 두 번 적었다는 뜻이다.
# 왜 치명적인가: 이름이 겹치면 실행부(REGISTRY)에서 하나가 다른 하나를 덮어써서,
# LLM이 A를 부르려는데 B가 실행되는 사고가 조용히 난다.
assert len(set(_names)) == 24, f"도구 이름 중복: {_names}"

for _t in TOOLS:
    # set(dict)는 키만 모은다(⑭). 즉 이 도구 dict가 정확히 이 세 키만 갖고
    # 있는지 검사하는 것 — 오타로 "descripton"이라 적었다면 여기서 걸린다.
    # (앤트로픽 API가 요구하는 필수 3요소이며, 하나라도 빠지면 호출이 거부된다)
    assert set(_t) == {"name", "description", "input_schema"}, f"{_t.get('name')}: 키 구성 오류"
    # JSON 스키마(⑨)의 최상위는 반드시 object여야 한다(LLM이 인자를 dict로 채우므로).
    assert _t["input_schema"]["type"] == "object", f"{_t['name']}: input_schema.type이 object가 아님"
    # required 칸이 아예 없으면 API가 거부한다. 비어 있는 리스트([])는 괜찮다.
    assert "required" in _t["input_schema"], f"{_t['name']}: required 누락"

# 서버 도구는 형식이 다르므로 따로 검산한다.
for _s in SERVER_TOOLS:
    # type이 없으면 앤트로픽이 어느 도구인지 알 수 없다(우리 도구엔 type이 없고,
    # 서버 도구엔 반드시 있다 — 이 한 글자가 두 종류를 가르는 판별자다).
    assert "type" in _s and "name" in _s, f"서버 도구 형식 오류: {_s}"
    # 우리가 쓸 수 없는 칸을 실수로 넣었는지 검사. input_schema를 넣으면
    # API가 거부하고, description을 넣으면 조용히 무시되어 "왜 안 먹지"가 된다.
    assert "input_schema" not in _s and "description" not in _s, \
        f"{_s['name']}: 서버 도구에는 input_schema·description을 쓸 수 없다"

# 우리 도구와 서버 도구의 이름이 겹치면, 루프가 서버 도구를 우리 것으로 오인해
# REGISTRY에서 실행하려 든다. 지금은 안 겹치지만 나중에 도구가 늘 때를 대비.
assert not (set(_names) & SERVER_TOOL_NAMES), "우리 도구와 서버 도구의 이름 충돌"
assert len(ALL_TOOLS) == 24 + len(SERVER_TOOLS)
