# Agent 판단의 핵 - 도구 19종 정의 (LLM이 읽는 계약서)

#==============================================

# [역할] 루프가 LLM에게 "너는 이 16개 도구를 쓸 수 있다"고 건네는 목록
# name / description / input_schema가 API 요청에 그대로 실려 나가고, LLM은  description만 읽고 어느 도구를 부를지 정함

# [구성] 조회 7 + 계산 4 + 추론 5 + 액션 3 = 19종

# [description 작법 - 중요]
# 무엇을 반환하는가만 쓰면 안되고 "언제 쓰고, 언제 쓰지 않는가"까지 씀
# 실패 시나리오: get_inventory 설명이 "상품 정보를 가져온다"뿐이면, 가격 질문에도 재고조회가 나가서 왕복이 낭비되고 답이 느려짐
# 따라서 모든 설명에 ~에는 쓰지 말 것"을 명시

# [분리이유] 정의(description.py)와 실행(query.py, compute.py, infer.py)를 나눈 이유는 description 튜닝이 모델 학습 내내 반복되는 작업이기 때문
# 문구를 고칠 때 실행코드를 건드리지 않아야 "프롬프트 실험"과 "로직 변경"이 git에서 섞이지 않음

#==============================================

# 대분류 12종 - enum에 쓰려고 상수로 뺌,
# 소분류 60종은 여기 넣지 않음: 목록이 길어 스키마가 비대해지므로 시스템 프롬프트(prompts.py)에 전문을 싣고ㅗ, 스키마에서는 "프롬프트의 목록에서 고르라"고 지시

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
            "먼저 이걸로 sku를 찾은 뒤 get_inventory를 이어 부른다 — 검색 결과에는 재고가 없다."
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
            "쓸 때: '있어요?'·'어디 있어요?'류 질문 전부. 매대 수량이 0이어도 BULK·백룸에 재고가 있으면 "
            "품절이라 단정하지 말고 predict_availability로 보충 시점을 이어서 확인할 것. "
            "쓰지 말 때: 가격·규격 질문(get_product), 상품 미특정 상태(먼저 search_products)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"sku_id": {"type": "integer", "description": "상품 고유 번호"}},
            "required": ["sku_id"],
        },
    },
    {
        "name": "get_purchase_history",
        "description": (
            "회원의 과거 구매 이력 전체를 시간순으로 가져온다. "
            "쓸 때: '늘 사던 거'·'지난번에 산 거'·재구매 시점·개인화 추천의 근거가 필요할 때. "
            "쓰지 말 때: 비회원 세션(member_id가 없으면 부를 수 없다 — 이력 기반 답변 대신 일반 답변으로), "
            "지금 장바구니 질문(get_session_cart가 담당)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"member_id": {"type": "integer", "description": "회원 번호"}},
            "required": ["member_id"],
        },
    },
    {
        "name": "get_session_cart",
        "description": (
            "이번 장보기 세션의 장바구니(담은 것)와 합계 금액을 가져온다. 합계는 이미 계산되어 "
            "총액(total_krw)으로 들어 있다 — 직접 더하지 말고 그 값을 그대로 읽을 것. "
            "쓸 때: '지금 얼마 담았지?'·예산 대비 현황·담은 것 기준 제안. 그리고 "
            "**수량 변경·빼기 전에 cart_item_id를 알아내려고** 먼저 이걸 부른다. "
            "쓰지 말 때: 과거 구매(get_purchase_history), 위시리스트(get_wishlist)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"session_id": {"type": "string", "description": "장보기 세션 식별자"}},
            "required": ["session_id"],
        },
    },
    {
        "name": "get_wishlist",
        "description": (
            "회원의 위시리스트(찜 목록)를 가져온다. "
            "쓸 때: '찜해둔 거'·'사려고 저장한 거' 질문, 위시리스트 상품의 입고 여부 확인의 시작점. "
            "쓰지 말 때: 장바구니(get_session_cart)와 혼동 금지 — 위시리스트는 세션과 무관한 저장 목록이다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"member_id": {"type": "integer", "description": "회원 번호"}},
            "required": ["member_id"],
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
    # ════════════════════════════════════════════════════════════════════
    # 계산형 4종 — 규칙·솔버가 결정적으로 계산한다. 실행부는 tools/compute.py
    # LLM은 이 결과의 숫자를 절대 스스로 만들지 않는다(헌법 2).
    # ════════════════════════════════════════════════════════════════════
    {
        "name": "optimize_route",
        "description": (
            "여러 상품을 도는 최소 보행 순서와 경로를 계산한다(층 구분 포함). "
            "쓸 때: 상품이 2개 이상인 동선 질문('이것들 어떤 순서로 돌면 돼?'), 리스트 기반 안내. "
            "쓰지 말 때: 상품 1개의 위치 안내(get_inventory의 좌표로 충분). "
            "방문 순서를 직접 추측해 답하지 말 것 — 반드시 이 도구의 결과 순서를 그대로 쓴다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_ids": {"type": "array", "items": {"type": "integer"},
                            "description": "방문할 상품들(2개 이상)"},
                "start_location_id": {"type": "string",
                                      "description": "출발 위치. 모르면 비워둘 것(get_position 결과를 쓰거나 입구 기준)"},
            },
            "required": ["sku_ids"],
        },
    },
    {
        "name": "optimize_bundle",
        "description": (
            "예산·수량 제약 안에서 최적의 상품 조합을 계산한다(조합 최적화 솔버). "
            "쓸 때: '5만원으로 캠핑 준비'·'예산 안에서 이것저것' 같은 조합 질문. "
            "쓰지 말 때: 단순 합계(get_session_cart에 이미 있음), 두 상품 가격 비교(compare_unit_price). "
            "조합의 총액·구성을 직접 계산하지 말 것 — 후보 선정과 산술은 전부 솔버가 한다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "budget_krw": {"type": "integer", "description": "예산(원)"},
                "candidate_sku_ids": {"type": "array", "items": {"type": "integer"},
                                      "description": "조합 후보 상품들(먼저 search_products로 모을 것)"},
                "must_include": {"type": "array", "items": {"type": "integer"},
                                 "description": "반드시 포함할 상품. 없으면 비워둘 것"},
            },
            "required": ["budget_krw", "candidate_sku_ids"],
        },
    },
    {
        "name": "compare_unit_price",
        "description": (
            "상품 2개 이상의 단위가격(100ml당·매당 등)을 같은 잣대로 비교하고, 총액 기준 최저가도 함께 낸다. "
            "규격 파싱과 단위 환산을 솔버가 하며, 직접 비교가 불가능하면 불가 사유를 돌려준다. "
            "쓸 때: '어느 쪽이 이득?'·'제일 싼 거' 같은 비교·정렬 질문 전부, 망설임 개입의 근거. "
            "**'가장 싼 것'을 눈대중으로 고르지 말 것** — 반드시 이 도구를 거쳐 정렬 결과를 받은 뒤에 판단한다. "
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
            "품절·단종 상품의 대체 후보를 찾는다(같은 소분류 + 규격 근사 + 재고 있는 것만). "
            "쓸 때: 원하는 상품이 품절·단종으로 확인된 직후('그럼 비슷한 거 없어?'). "
            "쓰지 말 때: 원 상품의 재고를 아직 확인 안 한 상태(먼저 get_inventory), "
            "취향 기반 추천(match_preferences가 담당)."
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
            "(그때는 find_substitutes로). 확률·시간을 직접 추측해 말하지 말 것 — 이 도구의 값을 그대로 쓴다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_id": {"type": "integer", "description": "상품 고유 번호"},
                "location_id": {"type": "string", "description": "비어 있는 매대(PICK) 위치"},
            },
            "required": ["sku_id", "location_id"],
        },
    },
    {
        "name": "predict_repurchase",
        "description": (
            "회원의 소비주기로 '지금이 다시 살 때인지'를 확률로 판정한다(마지막 구매 후 경과일 반영). "
            "쓸 때: '뭐 사야 되지?'·살 때가 된 품목 선별. "
            "쓰지 말 때: 비회원(이력이 없다), 이력이 2회 미만인 품목(주기가 정의 안 됨 — 결과에 표시되어 나온다)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id": {"type": "integer", "description": "회원 번호"},
                "sku_ids": {"type": "array", "items": {"type": "integer"},
                            "description": "판정할 품목들. 비우면 이력 전 품목을 판정"},
            },
            "required": ["member_id"],
        },
    },
    {
        "name": "get_position",
        "description": (
            "사용자의 현재 매장 내 위치를 추정한다(최근 스캔 위치 앵커 기반, 층·좌표·신뢰도 반환). "
            "쓸 때: 길안내의 출발점이 필요할 때('여기서 어떻게 가?'), optimize_route의 start 인자 채우기. "
            "쓰지 말 때: 매장 밖으로 추정되는 세션(결과의 in_store가 false면 길안내 대신 "
            "'매장에서 스캔을 시작하면 안내해드려요'로), 상품 위치 질문(그건 get_inventory)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"session_id": {"type": "string", "description": "장보기 세션 식별자"}},
            "required": ["session_id"],
        },
    },
    {
        "name": "match_preferences",
        "description": (
            "회원의 구매 성향과 신상·행사 상품을 매칭해 '취향에 맞을 후보'를 점수와 근거로 돌려준다. "
            "쓸 때: '내가 좋아할 만한 신상 있어?' 같은 열린 추천 요청. "
            "쓰지 말 때: 조건이 명시된 검색('2만원 이하 세제' — search_products), 품절 대체(find_substitutes). "
            "추천 이유는 반환된 근거만 사용할 것."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "member_id": {"type": "integer", "description": "회원 번호"},
                "top_k": {"type": "integer", "description": "후보 개수(기본 3)"},
            },
            "required": ["member_id"],
        },
    },
    {
        "name": "identify_product_photo",
        "description": (
            "사용자가 올린 사진에서 동일·유사 상품 후보를 찾는다(이미지-텍스트 매칭, 후보와 유사도 반환). "
            "쓸 때: 사진이 첨부된 질문('이거 여기서 팔아?' + 사진). 사진 없이는 절대 부르지 말 것. "
            "결과는 '후보'다 — 유사도가 낮으면 단정하지 말고 후보를 보여주며 확인을 구한다."
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


# ==============================================
# 서버 사이드 도구 (2026-08-14 팀 결정으로 채택)
# [위 TOOLS와 무엇이 다른가] 위의 19개는 **우리가 구현**한다 — input_schema를 우리가 쓰고, query.py·compute.py·infer.py·action.py가 실행
#  아래 서버 사이드 도구는 **앤트로픽이 구현하고 앤트로픽 서버에서 실행**한다.
#  우리는 "이 도구를 쓸 수 있다"고 선언만 하고, 결과는 같은 응답 안에 web_search_tool_result 블록으로 실려 온다. 실행부가 없다.

# [그래서 리스트를 나눈다] 형식이 아예 다르기 때문이다:
#   우리 도구  = {name, description, input_schema}
#   서버 도구  = {type, name, (옵션)}      ← description을 우리가 쓸 수 없다
#   한 리스트에 섞으면 아래 검산이 둘 다 통과할 수 없고, 무엇보다 루프가 "이건 내가 실행할 도구인가?"를 이름만 보고 판정할 근거가 사라진다.

# [주의 2가지 — 둘 다 prompts.py가 감당한다]
#   ① description을 우리가 못 쓴다. 도구 16개에 공들인 "언제 쓰고 언제 안 쓰는가"를 여기엔 붙일 수 없으므로, 그 지침이 시스템 프롬프트로 간다:
#    재고·위치·가격·시각은 매장 도구에서만, 웹은 상품 고르는 기준·평판만.
#   ② 우리 브랜드는 가상이라 상품명으로 검색하면 0건이다("농부의아침 한우 등심"은 세상에 없다). 검색어는 브랜드를 빼고 품목·속성으로 만들도록 프롬프트가 지시해야 한다("한우 등심 고르는 법").

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
# 여기 있는 이름은 우리가 실행하지 않는다 — 앤트로픽이 이미 실행했고 결과만 온다.
# 이 판정이 없으면 루프가 web_search를 REGISTRY에서 찾다가 실패해 "unknown_tool" 에러를 LLM에게 돌려주는 사고가 난다.
SERVER_TOOL_NAMES = frozenset(t["name"] for t in SERVER_TOOLS)

#==============================================

#선언적 데이터 파일의 약점은 오타가 실행 전까지 조용함
#여기서 어기면 서버가 뜨는 순간 죽게 만들어서, 배포 후가 아니라 개발 중에 잡음
assert len(TOOLS) == 19, f"도구는 19개여야 한다(조회7+계산4+추론5+액션3): {len(TOOLS)}"

_names = [t["name"] for t in TOOLS]

# set은 중복을 자동으로 버린다. 그래서 집합 크기가 19보다 작으면 같은 이름을 두 번 적었다는 뜻이다.
# 왜 치명적인가: 이름이 겹치면 실행부(REGISTRY)에서 하나가 다른 하나를 덮어써서,  LLM이 A를 부르려는데 B가 실행되는 사고가 조용히 난다.
assert len(set(_names)) == 19, f"도구 이름 중복: {_names}"

for _t in TOOLS:
    # set(dict)는 키만 모은다(⑭). 즉 이 도구 dict가 정확히 이 세 키만 갖고 있는지 검사하는 것 — 오타로 "descripton"이라 적었다면 여기서 걸린다.
    # (앤트로픽 API가 요구하는 필수 3요소이며, 하나라도 빠지면 호출이 거부된다)
    assert set(_t) == {"name", "description", "input_schema"}, f"{_t.get('name')}: 키 구성 오류"
    assert _t["input_schema"]["type"] == "object", f"{_t['name']}: input_schema.type이 object가 아님"
    assert "required" in _t["input_schema"], f"{_t['name']}: required 누락"

# 서버 도구는 형식이 다르므로 따로 검산한다.
for _s in SERVER_TOOLS:
    # type이 없으면 앤트로픽이 어느 도구인지 알 수 없다(우리 도구엔 type이 없고, 서버 도구엔 반드시 있다 — 이 한 글자가 두 종류를 가르는 판별자다).
    assert "type" in _s and "name" in _s, f"서버 도구 형식 오류: {_s}"
    # 우리가 쓸 수 없는 칸을 실수로 넣었는지 검사. input_schema를 넣으면 API가 거부하고, description을 넣으면 조용히 무시되어 "왜 안 먹지"가 된다.
    assert "input_schema" not in _s and "description" not in _s, f"{_s['name']}: 서버 도구에는 input_schema·description을 쓸 수 없다"

assert not (set(_names) & SERVER_TOOL_NAMES), "우리 도구와 서버 도구의 이름 충돌"
assert len(ALL_TOOLS) == 19 + len(SERVER_TOOLS)