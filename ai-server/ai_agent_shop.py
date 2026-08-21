"""
StoreFlow AI - 쇼핑 에이전트 (검색 -> 비교 -> 장바구니 / 반복구매 자동 담기)

★ 2026-08-14 요구사항 정의서 반영: DB 직접 접속 제거 ★
예전에는 compare_products가 SQLAlchemy engine으로 MySQL을 직접 재조회했다.
이제 상품 검색/비교/장바구니/반복구매 조회 전부 backend_client를 통해
Spring Boot REST API만 호출한다. 이 파일에는 DB 커넥션이 전혀 없다.

예: "우유 찾아서 제일 싼 거 2개 장바구니에 넣어줘"
    -> search_products(우유)로 백엔드 조회
    -> compare_products로 가격 정렬 (파이썬이 계산, Claude가 숫자 비교 안 함)
    -> add_to_cart로 실제 장바구니에 반영

예: "내가 항상 구매하는 휴지 장바구니에 담아줘"
    -> find_frequent_purchase(휴지)로 "휴지"가 이름에 들어간 상품 중
       사용자가 반복 구매(기본 2회 이상)한 상품과, 매번 산 평균 수량을 조회
    -> 결과에서 나온 sku_id/suggested_quantity로 바로 add_to_cart

설계 원칙 (기존 ai_agent_cart.py에서 유지):
  1) Claude는 DB에 직접 쓰지 않는다. 쓰기는 전부 Spring Boot API 호출로만 이루어진다.
  2) consumerId는 Claude가 정하지 않는다. 이 엔드포인트로 들어온 사용자 JWT를
     그대로 Spring Boot에 전달해서, 토큰 주인의 장바구니만 바뀌도록 강제한다.

추가된 원칙:
  3) "제일 싼 거", "가장 비싼 거" 같은 비교/정렬 판단은 Claude가 눈대중으로 하지 않는다.
     반드시 compare_products 도구를 호출하게 하고, 실제 정렬은 이 파일의 파이썬 코드가
     백엔드에서 다시 조회한 값으로 계산한다. Claude가 숫자를 잘못 읽어 엉뚱한 상품을
     담는 걸 막기 위함이다.
  4) search_products는 상품 사실 데이터(가격/카테고리/재고 상태)를 스스로 만들지 않고
     backend_client를 통해 백엔드(Spring Boot)에서만 가져온다.
  5) "내가 항상 사는 X" 같은 반복구매 판단도 Claude가 대화 기억에 의존해 지어내지
     않는다. 반드시 find_frequent_purchase를 호출해서 실제 주문 이력(백엔드
     /api(또는 internal)/orders/frequent) 집계 결과를 근거로 삼는다. 수량도 Claude가
     임의로 정하지 않고, 그 도구가 돌려준 suggested_quantity(과거 구매 평균)를
     기본값으로 쓴다.
"""

import os
import json

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from dotenv import load_dotenv
import anthropic

import backend_client
from budget_bundle import optimize_bundle as _run_optimize_bundle

load_dotenv()

router = APIRouter()

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

MAX_TOOL_TURNS = 6  # search -> compare -> add까지 여러 스텝이라 cart 전용(4턴)보다 여유를 둠

# 반복구매로 인정할 최소 구매 횟수. 이 값 미만은 "항상 사는 상품"으로 보지 않는다.
DEFAULT_FREQUENT_MIN_COUNT = 2

CATEGORY_LIST = [
    "신선식품", "냉장·냉동식품", "가공식품", "음료·주류", "생활용품", "주방용품",
    "뷰티·헬스", "반려용품", "홈·가전", "의류·잡화", "스포츠·레저", "완구·문구",
]

# ---------------------------------------------------------------------------
# 도구 정의
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "search_products",
        "description": (
            "상품명/품목/브랜드로 StoreFlow 상품을 검색해서 후보 목록을 가져온다. "
            "'제일 싼 거'처럼 비교가 필요한 요청이라도, 비교 자체는 이 도구가 아니라 "
            "compare_products로 한다. 이 도구는 후보를 모으는 용도다. "
            "'내가 항상/자주 사는 X'처럼 과거 구매 이력을 근거로 담아야 하는 요청에는 "
            "이 도구 대신 find_frequent_purchase를 써라."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "keywords": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "검색할 구체적 상품명/품목명. 예: ['우유']. 추상적 수식어(가성비, 저렴한)는 넣지 않는다.",
                },
                "category_hints": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": f"대분류 후보 (다음 중에서만): {', '.join(CATEGORY_LIST)}. 모르면 빈 배열.",
                },
            },
            "required": ["keywords", "category_hints"],
        },
    },
    {
        "name": "optimize_bundle",
        "description": (
            "정해진 예산 안에서 목적에 맞는 실제 매장 상품 세트를 계산한다. "
            "'5만원으로 우리 매장에서 캠핑 준비 세트 짜줘'처럼 목적+총예산이 함께 있는 요청에 사용한다. "
            "이 도구가 Backend 상품검색과 위치별 재고 확인을 직접 수행하고, 재고가 있는 상품만 대상으로 "
            "조합 최적화를 하므로 search_products를 품목마다 여러 번 먼저 호출할 필요가 없다. "
            "총액과 남은 예산을 LLM이 직접 더하거나 빼지 말고 이 결과를 그대로 사용한다. "
            "현재 목적형 템플릿은 캠핑을 지원한다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "budget_krw": {"type": "integer", "description": "총 예산(원). 예: 5만원 -> 50000"},
                "purpose": {"type": "string", "description": "준비 목적. 현재는 '캠핑'"},
                "max_items": {"type": ["integer", "null"], "description": "최대 품목 수. 모르면 null(기본 8)"},
            },
            "required": ["budget_krw", "purpose", "max_items"],
        },
    },
    {
        "name": "compare_products",
        "description": (
            "search_products로 찾은 후보들 중 일부를 골라 가격순으로 비교한다. "
            "'제일 싼 거', '가장 비싼 거', 'N개 추천' 같은 요청에는 반드시 이 도구로 "
            "실제 정렬 결과를 확인한 뒤에 add_to_cart를 호출해라. 직접 눈대중으로 비교하지 마라."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_ids": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "비교할 sku_id 목록 (search_products 결과에서 가져온 값)",
                },
                "sort_by": {
                    "type": "string",
                    "enum": ["price_asc", "price_desc"],
                    "description": "price_asc=싼 순, price_desc=비싼 순",
                },
            },
            "required": ["sku_ids", "sort_by"],
        },
    },
    {
        "name": "find_frequent_purchase",
        "description": (
            "사용자의 과거 주문 이력에서 '반복해서 구매한 상품'을 찾는다. "
            "'내가 항상 사는 X', '맨날 사는 거', '저번에도 샀던 거 또 담아줘'처럼 "
            "과거 구매 패턴을 근거로 담아야 하는 요청에 사용한다. "
            "keyword를 주면 그 키워드가 이름에 포함된 상품만, 안 주면 전체 반복구매 상품을 "
            "purchase_count(구매 횟수) 내림차순으로 돌려준다. 결과의 각 항목에는 매번 몇 개씩 "
            "샀는지의 평균을 반올림한 suggested_quantity가 들어있으니, add_to_cart를 부를 때 "
            "quantity로 그대로 써라 (사용자가 다른 수량을 명시하지 않는 한)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "keyword": {
                    "type": ["string", "null"],
                    "description": "찾을 상품 키워드. 예: '휴지'. 특정 상품을 안 짚었으면 null.",
                },
                "min_count": {
                    "type": ["integer", "null"],
                    "description": "반복구매로 인정할 최소 구매 횟수. 모르면 null (기본 2회 적용).",
                },
            },
            "required": ["keyword", "min_count"],
        },
    },
    {
        "name": "add_to_cart",
        "description": "특정 상품을 사용자의 장바구니에 담는다. 이미 담겨 있으면 수량이 더해진다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_id": {"type": "integer", "description": "담을 상품의 sku_id. compare_products/search_products/find_frequent_purchase로 확인된 값만 사용"},
                "quantity": {"type": "integer", "description": "담을 수량. 언급 없으면 1 (단, find_frequent_purchase로 찾은 상품은 그 결과의 suggested_quantity를 우선 사용)"},
            },
            "required": ["sku_id", "quantity"],
        },
    },
    {
        "name": "update_cart_item",
        "description": "장바구니에 이미 담긴 항목의 수량이나 체크 상태를 변경한다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "cart_item_id": {"type": "integer", "description": "변경할 장바구니 항목 ID (get_cart로 먼저 조회)"},
                "quantity": {"type": ["integer", "null"]},
                "checked": {"type": ["boolean", "null"]},
            },
            "required": ["cart_item_id", "quantity", "checked"],
        },
    },
    {
        "name": "remove_from_cart",
        "description": "장바구니에서 특정 항목을 삭제한다. 사용자가 명확히 삭제/빼줘 라고 말했을 때만 호출.",
        "input_schema": {
            "type": "object",
            "properties": {"cart_item_id": {"type": "integer"}},
            "required": ["cart_item_id"],
        },
    },
    {
        "name": "get_cart",
        "description": "현재 사용자의 장바구니 전체 목록을 조회한다.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "compare_purchase_popularity",
        "description": (
            "'A샴푸랑 B샴푸 중에 뭐가 더 많이 팔려?', 'A랑 B 중 어떤 게 인기야?'처럼 "
            "특정 상품 여러 개를 놓고 어느 쪽이 더 많이 팔렸는지 비교할 때 쓴다. "
            "search_products로 먼저 sku_id를 찾은 뒤 이 도구에 넘겨라. "
            "compare_products(가격 비교)와 다른 도구다 — 이건 가격이 아니라 판매량/구매자 수를 비교한다. "
            "결과의 purchaser_count(구매한 서로 다른 회원 수)가 인기도의 기준 지표다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_ids": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "비교할 sku_id 목록 (search_products 결과에서 가져온 값, 2개 이상)",
                },
                "lookback_days": {
                    "type": ["integer", "null"],
                    "description": "최근 며칠 기준으로 집계할지. 모르면 null (기본 90일 적용).",
                },
            },
            "required": ["sku_ids", "lookback_days"],
        },
    },
    {
        "name": "get_popular_products",
        "description": (
            "'요즘 뭐가 잘 나가?', '샴푸 중에 사람들이 많이 사는 거 추천해줘'처럼 "
            "특정 상품을 안 짚고 카테고리(또는 전체) 안에서 인기 상품 순위를 물어볼 때 쓴다. "
            "특정 상품 2개 이상을 이름으로 콕 짚어 비교하는 질문이면 이 도구 대신 "
            "compare_purchase_popularity를 써라."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "category_l2": {
                    "type": ["string", "null"],
                    "description": "소분류 카테고리명. 예: '샴푸'. 특정 카테고리를 안 짚었으면 null(전체 대상).",
                },
                "lookback_days": {
                    "type": ["integer", "null"],
                    "description": "최근 며칠 기준으로 집계할지. 모르면 null (기본 90일 적용).",
                },
                "limit": {
                    "type": ["integer", "null"],
                    "description": "상위 몇 개를 보여줄지. 모르면 null (기본 10개).",
                },
            },
            "required": ["category_l2", "lookback_days", "limit"],
        },
    },
    {
        "name": "get_product_metrics",
        "description": (
            "상품의 실제 반응 지표를 종합해서 비교할 때 쓴다. 최근 30일 판매량, 누적 판매량, "
            "최근 30일 장바구니 담기(SCAN_ADD), 검색, 조회수, 전체 구매자 수, 재구매자 수, "
            "재구매율을 Backend가 계산해서 돌려준다. 'A와 B 중 뭐가 더 반응이 좋아?', "
            "'조회수/재구매율까지 같이 비교해줘' 같은 질문은 search_products로 sku_id를 찾은 뒤 "
            "이 도구를 호출해라. 웹 평판은 이 도구에 포함되지 않는다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sku_ids": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "지표를 조회할 sku_id 목록. 한 번에 최대 20개.",
                }
            },
            "required": ["sku_ids"],
        },
    },
    {
        "name": "find_substitutes",
        "description": (
            "특정 상품을 대신할 대체상품을 찾는다. 품절/단종/가격 부담/다른 선택지를 원하는 요청에 사용한다. "
            "먼저 search_products로 원래 상품의 sku_id를 확정한 뒤 이 도구를 호출해라. "
            "Backend가 같은 소분류와 비슷한 가격대의 후보를 만들고, ai-server는 행사 여부/실판매가/구매 반응 지표와 "
            "로그인 회원의 과거 반복구매 여부를 붙여 대체 후보를 정렬한다. 원래 상품과 무관한 상품을 새로 지어내지 마라."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "original_sku_id": {
                    "type": "integer",
                    "description": "대체할 원래 상품의 sku_id. search_products 결과에서 확인한 값만 사용.",
                },
                "limit": {
                    "type": ["integer", "null"],
                    "description": "최대 후보 수. 모르면 null (기본 5개).",
                },
            },
            "required": ["original_sku_id", "limit"],
        },
    },
    {
        "name": "recommend_by_preference",
        "description": (
            "이 회원이 평소 많이 사는 카테고리를 근거로 '지금 살 만한 것'을 추천한다. "
            "'나한테 뭐 추천해줘', '내 취향에 맞는 거 있어?'처럼 막연한 추천 요청에 쓴다. "
            "여기서 말하는 '취향'은 개인 성향 설문이 아니라 실제 구매 이력 통계다 — "
            "예를 들어 청소용품을 많이 샀으면 새로 들어온 청소용품이나 할인 중인 청소용품을, "
            "육류를 많이 샀으면 신상/할인 육류를 찾아 근거(어느 카테고리를 많이 샀는지)와 "
            "함께 보여준다. 회원(로그인)만 쓸 수 있다 — 비회원이면 부르지 말고 로그인 안내를 해라. "
            "match_preferences(신상·행사 상품과 성향을 점수화해 매칭하는 더 정교한 도구)가 "
            "따로 준비 중이니, 이 도구는 그게 갖춰지기 전까지 쓰는 실용적 버전이다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "top_categories": {
                    "type": ["integer", "null"],
                    "description": "몇 개 카테고리를 기준으로 추천할지. 모르면 null (기본 3개).",
                },
                "lookback_days": {
                    "type": ["integer", "null"],
                    "description": "구매 이력을 며칠치까지 볼지. 모르면 null (기본 180일).",
                },
                "new_arrival_days": {
                    "type": ["integer", "null"],
                    "description": "'신상'으로 볼 입고 기준일. 모르면 null (기본 14일 이내 입고).",
                },
            },
            "required": ["top_categories", "lookback_days", "new_arrival_days"],
        },
    },
]

SYSTEM_PROMPT = (
    "너는 StoreFlow 쇼핑을 대신 도와주는 에이전트다. 검색, 가격 비교, 반복구매 조회, "
    "장바구니 조작을 도구 호출로 순서대로 수행해라.\n"
    "규칙:\n"
    "0. '내가 항상/자주/맨날 사는 X', '저번에 샀던 거 또' 같이 과거 구매 이력이 근거인 "
    "요청은 search_products가 아니라 find_frequent_purchase부터 호출해라. 결과가 비어 있으면 "
    "'반복 구매 이력이 없다'고 사용자에게 솔직히 말하고, 임의로 상품을 지어내 담지 마라. "
    "결과가 여러 개면 가장 purchase_count가 높은 것을 우선하되, 애매하면 사용자에게 어떤 걸 "
    "말하는지 되물어라.\n"
    "1. 상품을 찾아야 하면 search_products부터 호출해라. sku_id를 스스로 지어내지 마라.\n"
    "2. '제일 싼 거', '가장 비싼 거', '~중에 골라줘' 같은 비교/정렬이 필요한 요청은 "
    "반드시 compare_products를 호출해서 실제 정렬 결과를 받은 뒤에 판단해라. "
    "search_products 결과만 보고 네가 직접 가격을 비교해서 add_to_cart로 넘어가지 마라. "
    "가격을 말하거나 비교할 때는 항상 final_price_krw(행사가 반영된 실제 판매가)를 기준으로 "
    "삼아라 — regular_price_krw(정가)로 비교하면 지금 행사 중이라 실제로 더 싼 상품을 놓친다. "
    "on_promo가 true인 상품은 '지금 행사 중이라 원래 {regular_price_krw}원인데 "
    "{discount_krw}원 할인된 {final_price_krw}원'처럼 사용자에게 행사 사실을 알려줘라.\n"
    "3. 장바구니에 담기 전에 어떤 상품인지(sku_id) 명확하지 않으면 담지 말고 사용자에게 되물어라.\n"
    "4. cart_item_id가 필요한 수정/삭제인데 ID를 모르면 get_cart로 먼저 확인해라.\n"
    "5. 삭제나 큰 폭의 수량 변경은 실행 후 응답에서 무엇을 했는지 명확히 알려줘라.\n"
    "6. 'A랑 B 중에 뭐가 더 많이 팔려/인기 있어?'처럼 특정 상품 여러 개의 판매량을 비교하는 "
    "질문은 compare_purchase_popularity로 답해라 — 가격 비교(compare_products)와 다른 도구다. "
    "상품을 이름으로만 알고 있으면 search_products로 먼저 sku_id를 찾아라. "
    "'요즘 뭐가 잘 나가?'처럼 특정 상품을 안 짚고 순위를 물어보면 get_popular_products를 써라. "
    "두 도구 모두 구매자 수(purchaser_count)를 인기도 기준으로 삼되, 절대 눈대중으로 순서를 "
    "판단하지 말고 도구가 돌려준 순서/숫자를 그대로 근거로 삼아라.\n"
    "7. '최근 30일 판매량/누적 판매량/장바구니 담기/검색/조회수/재구매율까지 보고 비교해줘', "
    "'A와 B 중 실제 반응이 더 좋은 건 뭐야?'처럼 여러 행동·구매 지표를 함께 요구하면 "
    "get_product_metrics를 써라. 상품명이면 먼저 search_products로 sku_id를 확정해라. "
    "재구매율과 카운트는 Backend가 계산한 값을 그대로 사용하고 네가 다시 계산하지 마라. "
    "웹 평판은 이 도구 결과에 없으므로 있는 것처럼 지어내지 마라.\n"
    "8. '나한테 추천해줘', '내 취향에 맞는 거 있어?'처럼 막연한 개인화 추천 요청은 "
    "recommend_by_preference를 호출해라. 결과의 categories_used(회원이 많이 산 카테고리)와 "
    "items의 reason(신상/행사)을 근거로 '평소 OO을 많이 구매하셔서 신상/할인 중인 OO을 "
    "추천드려요'처럼 이유를 함께 설명해라. items가 비어 있으면 note에 있는 사유를 그대로 "
    "사용자에게 알려주고, 다른 상품을 지어내 추천하지 마라.\n"
    "9. '이거 품절인데 대신 살 거', '이 상품 말고 비슷한 거', '대체상품 추천해줘'처럼 "
    "기준 상품을 대신할 후보가 필요하면 find_substitutes를 써라. 상품명이면 먼저 search_products로 "
    "원래 상품의 sku_id를 확정해라. find_substitutes 결과는 같은 소분류/유사 가격대 후보를 Backend가 "
    "만든 뒤, 과거 반복구매 여부·행사·실판매가·반응 지표를 붙여 정렬한 것이다. 후보에 없는 상품을 "
    "임의로 대체상품이라고 만들지 마라. personalized=true 후보는 사용자가 과거 반복 구매한 이력이 있는 "
    "상품이라는 뜻이므로 추천 이유에 활용해라.\n"
    "10. '5만원으로 캠핑 준비 세트', '예산 3만원 안에서 캠핑 갈 물건 골라줘'처럼 목적과 총예산이 "
    "함께 있으면 optimize_bundle을 호출해라. 이 경우 품목별 search_products를 여러 번 호출하지 말고 "
    "optimize_bundle 하나가 실제 상품검색+재고확인+조합 계산을 맡게 해라. 반환된 total_krw, remaining_krw, "
    "items만 사용하고 총액을 직접 계산하지 마라. 예산 때문에 빠진 필요품목(not_selected_needs)이 있으면 "
    "그 사실도 짧게 알려라.\n"
    "11. 모든 도구 호출이 끝나면, 실제 도구 결과에 있는 상품명/가격/수량/지표만 근거로 "
    "2~3문장 한국어로 요약해라. 도구 결과에 없는 가격이나 상품을 지어내지 마라."
)


class AgentRequest(BaseModel):
    message: str


def _run_search_products(tool_input: dict) -> dict:
    """backend_client를 통해 백엔드에서 검색한다. 가격/재고는 항상 백엔드에서만 가져온다."""
    result = backend_client.search_products(
        keywords=tool_input.get("keywords") or None,
        category_hints=tool_input.get("category_hints") or None,
        limit=20,
    )
    if not result.get("ok"):
        return {"ok": False, "error": result.get("error") or "상품 검색에 실패했습니다."}

    items = result.get("data") or []
    normalized = [
        {
            "sku_id": item.get("skuId"),
            "name": item.get("name"),
            "brand": item.get("brand"),
            "category_l1": (item.get("category") or item.get("categoryL1")),
            "category_l2": item.get("categoryL2"),
            # regular_price_krw = 정가, final_price_krw = 행사 반영된 실제 판매가.
            # 가격을 언급하거나 비교할 때는 final_price_krw를 기준으로 말해야 한다.
            "regular_price_krw": item.get("priceKrw"),
            "final_price_krw": item.get("finalPriceKrw", item.get("priceKrw")),
            "on_promo": item.get("onPromo", False),
            "discount_krw": item.get("discountKrw", 0),
            "unit": item.get("unit"),
        }
        for item in items
    ]
    return {"ok": True, "count": len(normalized), "items": normalized}


def _run_compare_products(tool_input: dict) -> dict:
    """
    비교는 Claude에게 맡기지 않는다. sku_id로 백엔드를 다시 조회해서
    파이썬이 직접 정렬한다 - Claude가 검색 결과 텍스트를 잘못 읽어
    다른 가격을 '제일 싼 거'로 착각하는 걸 막기 위함.

    정렬 기준은 반드시 final_price_krw(행사 반영된 실제 판매가)여야 한다.
    price_krw(정가)로 정렬하면 행사 중인 상품이 "제일 싼 거"에서 빠지는 문제가 있었다
    (백엔드가 promo 정보를 아예 내려주지 않았던 버그 + 여기서 정가만 보던 버그).
    """
    sku_ids = tool_input.get("sku_ids") or []
    sort_by = tool_input.get("sort_by", "price_asc")

    if not sku_ids:
        return {"ok": False, "error": "비교할 sku_id가 없습니다."}

    result = backend_client.get_products_by_skus(sku_ids)
    if not result.get("ok"):
        return {"ok": False, "error": result.get("error") or "상품 비교 조회에 실패했습니다."}

    items = [
        {
            "sku_id": item.get("skuId"),
            "name": item.get("name"),
            "brand": item.get("brand"),
            "regular_price_krw": item.get("priceKrw"),
            "final_price_krw": item.get("finalPriceKrw", item.get("priceKrw")),
            "on_promo": item.get("onPromo", False),
            "discount_krw": item.get("discountKrw", 0),
            "unit": item.get("unit"),
        }
        for item in (result.get("data") or [])
    ]

    reverse = sort_by == "price_desc"
    items.sort(key=lambda x: x["final_price_krw"], reverse=reverse)

    return {"ok": True, "sort_by": sort_by, "items": items}


def _run_compare_purchase_popularity(tool_input: dict, bearer_token: str) -> dict:
    result = backend_client.compare_purchase_popularity(
        sku_ids=tool_input.get("sku_ids") or [],
        lookback_days=tool_input.get("lookback_days"),
        bearer_token=bearer_token,
    )
    if not result.get("ok"):
        return {"ok": False, "error": result.get("error") or "판매량 비교 조회에 실패했습니다."}

    items = [
        {
            "sku_id": item.get("skuId"),
            "name": item.get("productName"),
            "total_qty": item.get("totalQty"),
            "purchaser_count": item.get("purchaserCount"),
        }
        for item in (result.get("data") or [])
    ]
    # 인기도 기준 지표(purchaser_count) 내림차순 정렬 — Claude가 눈대중으로 비교하지 않게 여기서 확정.
    items.sort(key=lambda x: x["purchaser_count"] or 0, reverse=True)
    return {"ok": True, "items": items}


def _run_get_popular_products(tool_input: dict, bearer_token: str) -> dict:
    result = backend_client.get_popular_products(
        category_l2=tool_input.get("category_l2"),
        lookback_days=tool_input.get("lookback_days"),
        limit=tool_input.get("limit"),
        bearer_token=bearer_token,
    )
    if not result.get("ok"):
        return {"ok": False, "error": result.get("error") or "인기 상품 조회에 실패했습니다."}

    items = [
        {
            "sku_id": item.get("skuId"),
            "name": item.get("productName"),
            "total_qty": item.get("totalQty"),
            "purchaser_count": item.get("purchaserCount"),
        }
        for item in (result.get("data") or [])
    ]
    return {"ok": True, "items": items}


def _run_get_product_metrics(tool_input: dict) -> dict:
    result = backend_client.get_product_metrics_internal(tool_input.get("sku_ids") or [])
    if not result.get("ok"):
        return {"ok": False, "error": result.get("error") or "상품 지표 조회에 실패했습니다."}

    items = []
    for item in (result.get("data") or []):
        items.append({
            "sku_id": item.get("skuId"),
            "name": item.get("productName"),
            "sales_qty_30d": item.get("salesQty30d"),
            "sales_qty_total": item.get("salesQtyTotal"),
            "cart_add_count_30d": item.get("cartAddCount30d"),
            "search_count_30d": item.get("searchCount30d"),
            "view_count_30d": item.get("viewCount30d"),
            "unique_buyer_count": item.get("uniqueBuyerCount"),
            "repeat_buyer_count": item.get("repeatBuyerCount"),
            "repurchase_rate_pct": item.get("repurchaseRate"),
        })
    return {
        "ok": True,
        "window_days": 30,
        "items": items,
        "note": (
            "search_count_30d는 SEARCH 이벤트에 sku_id가 기록된 경우만 집계된다. "
            "웹 평판은 Backend 지표가 아니라 Agent의 별도 웹 검색 대상이다."
        ),
    }


def _normalize_product(item: dict, reason: str, based_on_category: str) -> dict:
    return {
        "sku_id": item.get("skuId"),
        "name": item.get("name"),
        "brand": item.get("brand"),
        "category_l2": item.get("categoryL2"),
        "regular_price_krw": item.get("priceKrw"),
        "final_price_krw": item.get("finalPriceKrw", item.get("priceKrw")),
        "on_promo": item.get("onPromo", False),
        "discount_krw": item.get("discountKrw", 0),
        "unit": item.get("unit"),
        "reason": reason,                      # "청소용품 신상" / "청소용품 행사" 처럼 왜 추천됐는지
        "based_on_category": based_on_category,  # 근거가 된 회원의 다구매 카테고리
    }


def _run_find_substitutes(
        tool_input: dict,
        bearer_token: str | None,
        consumer_id: int | None,
) -> dict:
    """
    대체상품 추천은 3단계로 나눈다.
      1) Backend가 원상품과 같은 소분류 + 유사 가격대 후보를 만든다.
      2) Backend 지표(판매/조회/재구매율)를 붙인다.
      3) 로그인 회원이면 과거 반복구매 후보를 우선한다.

    '무엇이 비슷한 상품인가'라는 사실 후보 생성은 Backend가 담당하고,
    ai-server는 그 후보 안에서 개인화/행사/가격/반응 지표로 순서를 정한다.
    """
    original_sku_id = tool_input.get("original_sku_id")
    limit = max(1, min(int(tool_input.get("limit") or 5), 10))
    if not original_sku_id:
        return {"ok": False, "error": "원래 상품의 sku_id가 필요합니다."}

    alt_result = backend_client.get_alternatives(int(original_sku_id))
    if not alt_result.get("ok"):
        return {"ok": False, "error": alt_result.get("error") or "대체상품 후보 조회에 실패했습니다."}

    payload = alt_result.get("data") or {}
    original = payload.get("original") or {}
    raw_candidates = payload.get("alternatives") or []
    if not raw_candidates:
        return {
            "ok": True,
            "original": _normalize_product(original, "원래 상품", original.get("categoryL2")),
            "items": [],
            "note": "같은 소분류와 유사 가격대에서 대체상품 후보를 찾지 못했습니다.",
        }

    candidate_skus = [p.get("skuId") for p in raw_candidates if p.get("skuId") is not None]

    # 상품 반응 지표는 추천 보조 근거다. 실패해도 대체상품 추천 자체는 계속 진행한다.
    metrics_by_sku: dict[int, dict] = {}
    metrics_result = backend_client.get_product_metrics_internal(candidate_skus)
    if metrics_result.get("ok"):
        metrics_by_sku = {
            int(m.get("skuId")): m
            for m in (metrics_result.get("data") or [])
            if m.get("skuId") is not None
        }

    # 로그인 회원의 반복구매 이력에 후보가 있으면 가장 강한 개인화 신호로 사용한다.
    frequent_skus: set[int] = set()
    if bearer_token or consumer_id:
        freq = backend_client.find_frequent_purchase(
            {"keyword": None, "min_count": 2},
            bearer_token=bearer_token,
            consumer_id=consumer_id,
        )
        if freq.get("ok"):
            data = freq.get("data") or []
            # 엔드포인트 버전에 따라 list 또는 {items:[...]} 둘 다 허용한다.
            if isinstance(data, dict):
                data = data.get("items") or data.get("products") or []
            for f in data:
                sku = f.get("skuId", f.get("sku_id"))
                if sku is not None:
                    frequent_skus.add(int(sku))

    normalized = []
    original_final = original.get("finalPriceKrw", original.get("priceKrw")) or 0
    for p in raw_candidates:
        sku = p.get("skuId")
        m = metrics_by_sku.get(int(sku), {}) if sku is not None else {}
        final_price = p.get("finalPriceKrw", p.get("priceKrw"))
        personalized = sku is not None and int(sku) in frequent_skus
        reasons = []
        if personalized:
            reasons.append("과거 반복 구매 이력 있음")
        if p.get("onPromo", False):
            reasons.append("현재 행사 중")
        if final_price is not None and original_final and final_price < original_final:
            reasons.append("원래 상품보다 현재 판매가가 저렴함")
        if (m.get("repurchaseRate") or 0) > 0:
            reasons.append(f"재구매율 {m.get('repurchaseRate')}%")

        normalized.append({
            "sku_id": sku,
            "name": p.get("name"),
            "brand": p.get("brand"),
            "category_l2": p.get("categoryL2"),
            "regular_price_krw": p.get("priceKrw"),
            "final_price_krw": final_price,
            "on_promo": p.get("onPromo", False),
            "discount_krw": p.get("discountKrw", 0),
            "unit": p.get("unit"),
            "personalized": personalized,
            "sales_qty_30d": m.get("salesQty30d"),
            "view_count_30d": m.get("viewCount30d"),
            "repurchase_rate_pct": m.get("repurchaseRate"),
            "reasons": reasons or ["같은 소분류·유사 가격대 후보"],
        })

    # 정렬 우선순위: 내 반복구매 > 행사 > 저렴한 실판매가 > 재구매율 > 판매량.
    # 후보 유사성 자체는 Backend가 이미 보장하므로 여기서는 '어떤 후보를 먼저 보여줄지'만 결정한다.
    normalized.sort(key=lambda x: (
        0 if x["personalized"] else 1,
        0 if x["on_promo"] else 1,
        x["final_price_krw"] if x["final_price_krw"] is not None else 10**12,
        -(x["repurchase_rate_pct"] or 0),
        -(x["sales_qty_30d"] or 0),
    ))

    return {
        "ok": True,
        "original": {
            "sku_id": original.get("skuId"),
            "name": original.get("name"),
            "brand": original.get("brand"),
            "category_l2": original.get("categoryL2"),
            "regular_price_krw": original.get("priceKrw"),
            "final_price_krw": original.get("finalPriceKrw", original.get("priceKrw")),
            "on_promo": original.get("onPromo", False),
        },
        "items": normalized[:limit],
        "ranking_basis": ["개인 반복구매", "행사", "실판매가", "재구매율", "최근30일 판매량"],
    }


def _run_recommend_by_preference(tool_input: dict, bearer_token: str | None, consumer_id: int | None) -> dict:
    """
    1단계: get_top_categories로 이 회원이 최근 많이 산 카테고리를 구한다(백엔드 집계).
    2단계: 카테고리별로 신상(recent_days 이내 입고) + 행사 중 상품을 search_by_category로 각각 조회한다.
    정렬/필터링 판단(무엇이 '신상'인지, '행사'인지)은 전부 백엔드 쿼리 조건으로 확정하고,
    이 함수는 결과를 합치고 근거 카테고리를 붙이기만 한다 — Claude가 눈대중으로 카테고리나
    신상 여부를 판단하지 않게 하기 위함.
    """
    top_n = tool_input.get("top_categories") or 3
    lookback_days = tool_input.get("lookback_days")
    new_arrival_days = tool_input.get("new_arrival_days") or 14

    cat_result = backend_client.get_top_categories(
        {"lookback_days": lookback_days, "limit": top_n},
        bearer_token=bearer_token,
        consumer_id=consumer_id,
    )
    if not cat_result.get("ok"):
        return {"ok": False, "error": cat_result.get("error") or "구매 이력 기반 취향 조회에 실패했습니다."}

    categories = cat_result.get("data") or []
    if not categories:
        return {
            "ok": True,
            "categories_used": [],
            "items": [],
            "note": "최근 구매 이력이 없어 취향 기반 추천을 만들 수 없습니다. 다른 방식(인기 상품 등)을 안내하세요.",
        }

    items: list[dict] = []
    categories_used = []
    seen_sku_ids: set[int] = set()

    for cat in categories:
        category_l2 = cat.get("categoryL2")
        if not category_l2:
            continue
        categories_used.append({
            "category_l2": category_l2,
            "total_qty": cat.get("totalQty"),
            "purchase_count": cat.get("purchaseCount"),
        })

        new_result = backend_client.search_by_category(category_l2=category_l2, recent_days=new_arrival_days)
        if new_result.get("ok"):
            for p in (new_result.get("data") or []):
                sku_id = p.get("skuId")
                if sku_id in seen_sku_ids:
                    continue
                seen_sku_ids.add(sku_id)
                items.append(_normalize_product(p, reason=f"{category_l2} 신상", based_on_category=category_l2))

        promo_result = backend_client.search_by_category(category_l2=category_l2, on_promo_only=True)
        if promo_result.get("ok"):
            for p in (promo_result.get("data") or []):
                sku_id = p.get("skuId")
                if sku_id in seen_sku_ids:
                    continue
                seen_sku_ids.add(sku_id)
                items.append(_normalize_product(p, reason=f"{category_l2} 행사 중", based_on_category=category_l2))

    return {"ok": True, "categories_used": categories_used, "items": items}


def _dispatch_tool(name: str, tool_input: dict, bearer_token: str) -> dict:
    if name == "search_products":
        return _run_search_products(tool_input)
    if name == "optimize_bundle":
        return _run_optimize_bundle(tool_input)
    if name == "compare_products":
        return _run_compare_products(tool_input)
    if name == "find_frequent_purchase":
        return backend_client.find_frequent_purchase(tool_input, bearer_token=bearer_token, consumer_id=None)
    if name in ("add_to_cart", "update_cart_item", "remove_from_cart", "get_cart"):
        return backend_client.cart_action(name, tool_input, bearer_token=bearer_token, consumer_id=None)
    if name == "compare_purchase_popularity":
        return _run_compare_purchase_popularity(tool_input, bearer_token)
    if name == "get_popular_products":
        return _run_get_popular_products(tool_input, bearer_token)
    if name == "get_product_metrics":
        return _run_get_product_metrics(tool_input)
    if name == "find_substitutes":
        return _run_find_substitutes(tool_input, bearer_token=bearer_token, consumer_id=None)
    if name == "recommend_by_preference":
        return _run_recommend_by_preference(tool_input, bearer_token=bearer_token, consumer_id=None)
    return {"ok": False, "error": f"알 수 없는 도구: {name}"}


@router.post("/api/ai/agent/shop")
def agent_shop_action(
        body: AgentRequest,
        authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    bearer_token = authorization[len("Bearer "):]

    messages = [{"role": "user", "content": body.message}]
    actions_taken = []

    for _ in range(MAX_TOOL_TURNS):
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=600,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        )

        tool_uses = [b for b in response.content if b.type == "tool_use"]

        if not tool_uses:
            final_text = "".join(b.text for b in response.content if b.type == "text")
            return {"reply": final_text, "actions": actions_taken}

        messages.append({"role": "assistant", "content": response.content})

        tool_results = []
        for tu in tool_uses:
            result = _dispatch_tool(tu.name, tu.input, bearer_token)
            actions_taken.append({"tool": tu.name, "input": tu.input, "result": result})
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tu.id,
                    "content": json.dumps(result, ensure_ascii=False),
                    "is_error": not result.get("ok", False),
                }
            )
        messages.append({"role": "user", "content": tool_results})

    return {
        "reply": "요청 처리에 단계가 예상보다 많이 필요해서 중간에 멈췄어요. 확인해주세요.",
        "actions": actions_taken,
    }