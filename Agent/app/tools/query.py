# ============================================================================
# StoreFlow 하네스 — 조회형 도구 10종 실행부 (definitions.py의 짝)
# ============================================================================
# (7종 → 10종: 08-21 ai-server 인수로 지표·판매량 비교·인기 순위가 편입됐다.
#  셋 다 백엔드/sot_client가 집계·정렬까지 마친 수치를 "받아 전달"하므로
#  조회형이다 — 이 파일의 경계 "사실을 가공하지 않는다"가 그대로 성립한다.)
# [역할] LLM이 "search_products를 이런 인자로 불러줘"라고 하면, 그 요청을
#   실제 함수 호출로 바꿔 실행하고 결과를 LLM에게 돌려줄 형태로 다듬는다.
#
# [왜 sot_client를 루프에서 바로 부르지 않는가 — 이 파일의 존재 이유 4개]
#   ① 크기 제한: search_products는 5,000개까지 반환할 수 있다. 그대로 LLM에게
#      주면 컨텍스트가 터지고 비용이 폭증한다. 상위 N개로 자르고 "더 있음"을 알린다.
#   ② 필드 솎기: 바코드·이미지경로 같은 건 LLM의 판단에 쓰이지 않는다.
#      토큰은 돈이고 지연이므로, 답변에 쓰일 필드만 남긴다.
#   ③ 인자 정화: LLM은 스키마에 없는 키를 보내거나 타입을 틀릴 수 있다.
#      그대로 함수에 넘기면 TypeError로 루프가 죽는다.
#   ④ 실패를 결과로 변환: 조회가 실패해도 예외로 루프를 죽이지 않고,
#      "조회 실패" 라는 도구 결과로 LLM에게 돌려준다. 그래야 LLM이
#      "지금 확인이 어렵네요"로 착지한다(지어내지 않고).
#
# [경계] 이 파일은 사실을 **가공하지 않는다.** 자르고 골라낼 뿐, 값을 계산하거나
#   합치지 않는다. 계산은 compute.py, 추론은 infer.py의 몫이다.
# ============================================================================
#
# ─── 개념 사전 — 이 파일에 처음 나오는 개념 5개 ─────────────────────────────
# (①~⑦ sot_client, ⑧~⑯ definitions의 사전은 아는 것으로 전제)
#
# ⑰ **kwargs — 키워드 인자를 통째로 받기
#    def f(**kw): 라고 쓰면, f(a=1, b=2)로 부를 때 kw = {"a":1, "b":2}라는
#    dict가 된다. 반대로 f(**{"a":1})처럼 별 두 개를 붙여 넘기면 dict가 다시
#    낱개 인자로 풀린다. LLM이 어떤 인자를 보낼지 미리 알 수 없으므로,
#    일단 dict로 받아 검사한 뒤 풀어서 넘기는 이 방식이 필요하다.
#
# ⑱ try / except — 예외 처리
#    try 블록을 실행하다 오류(예외)가 나면 프로그램이 죽는 대신 except 블록으로
#    넘어간다. `except Exception as e:` = "어떤 오류든 잡아서 e라는 이름으로
#    들고 있어라". 오류를 삼키는 게 목적이 아니라, **오류를 값으로 바꿔**
#    LLM에게 돌려주는 것이 목적이다(존재 이유 ④).
#
# ⑲ 함수도 값이다 (일급 객체) — 디스패치 테이블
#    파이썬에서 함수는 숫자·문자열처럼 변수에 담고 dict의 값으로 넣을 수 있다.
#    {"search_products": _search_products} 처럼 두면, 이름 문자열로 함수를
#    꺼내 부를 수 있다: REGISTRY["search_products"](**인자).
#    if/elif를 16번 늘어놓는 대신 표 하나로 끝내는 방법이며, 도구가 늘어도
#    코드가 안 늘어난다. 함수 이름 뒤에 ()를 붙이면 "실행", 안 붙이면 "함수 자체".
#
# ⑳ 슬라이싱 [:N]
#    리스트에서 앞 N개만 잘라 새 리스트를 만든다. rows[:8] = 앞 8개.
#    원본은 그대로 두고 새 리스트를 만드는 것이라 안전하다.
#
# ㉑ 딕셔너리 컴프리헨션 {k: v for ...}
#    리스트 컴프리헨션의 dict 판. {키식: 값식 for 항목 in 목록 if 조건} 꼴로
#    새 dict를 만든다. 여기서는 "원본 dict에서 필요한 키만 골라 새 dict 만들기"
#    (필드 솎기)에 쓴다.
#
# ㉑-a 제너레이터 표현식과 sum()
#    sum(l["qty"] for l in locs if ...) 의 괄호 안이 제너레이터 표현식이다.
#    리스트 컴프리헨션([...])과 문법은 같은데 대괄호가 없다 — 차이는
#    **중간 리스트를 만들지 않고** 하나씩 흘려보내며 더한다는 것.
#        [l["qty"] for l in locs]  → 숫자들의 리스트를 통째로 메모리에 만든 뒤 더함
#        (l["qty"] for l in locs)  → 하나 꺼내 더하고 버리고, 다시 하나 꺼내고…
#    합계만 필요할 때 목록을 굳이 만들 이유가 없어서 이 형태를 쓴다.
#    sum()은 그렇게 흘러오는 숫자들을 전부 더한 값 하나를 돌려준다.
#
# ㉑-b **dict 펼치기 — {**원본, "새키": 값}
#    dict 앞의 별 두 개는 "그 dict의 모든 키·값을 여기에 쏟아 넣어라"는 뜻이다.
#        {**inv, "on_shelf": True}  =  inv의 내용 전부 + on_shelf 하나 더
#    원본 inv는 그대로 두고 **새 dict**가 만들어진다(원본을 고치지 않는다).
#    왜 이렇게 쓰나: sot_client가 준 결과를 건드리지 않은 채 요약 필드만
#    덧붙이려는 것이다. 원본을 직접 고치면 같은 dict를 보고 있는 다른 곳까지
#    조용히 바뀐다(mock_data는 모듈 전역이라 특히 위험하다).
#    ⑰의 **kwargs와 기호는 같지만 자리가 다르다: 함수 인자에서 쓰면 "풀어서
#    넘기기", dict 리터럴 안에서 쓰면 "쏟아 넣기".
# ────────────────────────────────────────────────────────────────────────────

from app import sot_client

# ── 현재 요청의 신원 (B안 확장, 2026-08-20) ─────────────────────────────────
# action.py의 _CURRENT_CONSUMER_ID와 같은 설계를 조회 쪽으로 확장한 것.
# member_id·session_id는 **LLM이 정하면 안 되는 값**이다 — 스키마에 칸을 두면
# LLM이 채울 값이 없어 손님에게 되묻고(첫 골든셋 실호출 4케이스 FAIL),
# 남의 번호를 불러달라면 그대로 부른다(남의 구매 이력이 새는 보안 구멍).
# 그래서 definitions의 조회·추론 스키마에서 이 두 칸을 지우고,
# 루프가 요청마다 등록한 값을 run()이 채운다. LLM의 손이 닿지 않는 경로다.
_CURRENT_MEMBER_ID: int | None = None
_CURRENT_SESSION_ID: str | None = None


def set_identity(member_id: int | None, session_id: str | None) -> None:
    """루프가 요청을 시작할 때 현재 사용자·세션을 등록한다. 비회원이면 None."""
    global _CURRENT_MEMBER_ID, _CURRENT_SESSION_ID
    _CURRENT_MEMBER_ID = member_id
    _CURRENT_SESSION_ID = session_id


def current_member_id() -> int | None:
    """지금 요청의 회원 번호(없으면 None) — 읽기 전용 공개 창구.

    compute.py의 find_substitutes가 '개인 반복구매 가중'에 쓴다(08-21 인수).
    _CURRENT_MEMBER_ID를 직접 import하게 두지 않는 이유: 밑줄 변수를 다른
    모듈이 집어 쓰기 시작하면 '내부용'이라는 신호가 죽고, 나중에 이 변수의
    형태를 바꿀 때 어디가 물려 있는지 알 수 없게 된다. 함수 한 겹이 그 경계다.
    """
    return _CURRENT_MEMBER_ID


def current_session_id() -> str | None:
    """지금 요청의 세션 id(없으면 None) — 읽기 전용 공개 창구.

    infer.predict_repurchase가 **어느 모델을 쓸지** 가르는 데 쓴다(08-25).
    세션이 있으면 손님은 지금 장을 보는 중이고, 그러면 "그날 방문할 확률" 항이
    이미 1이라 **조건부 모델**이 맞다. 세션이 없으면 매장 밖(푸시)이다.
    current_member_id()와 같은 이유로 함수 한 겹을 둔다 — 밑줄 변수를 다른
    모듈이 집어 쓰면 '내부용'이라는 신호가 죽는다.
    """
    return _CURRENT_SESSION_ID


# ── 결과 크기 상한 ──────────────────────────────────────────────────────────
# 왜 상수로 빼는가: 이 숫자는 "LLM 컨텍스트 예산 vs 정보량"의 튜닝 대상이다.
# 너무 작으면 원하는 상품이 잘려나가 답이 틀리고, 너무 크면 느리고 비싸진다.
# W3에 골든셋을 돌리며 조정할 값이라 한곳에 모아둔다.
MAX_SEARCH_RESULTS = 8      # 검색 결과 — 사람이 한 화면에서 비교하는 개수 정도
MAX_HISTORY_ROWS = 20       # 구매 이력 — 소비주기 판단에 최근 몇 건이면 충분
MAX_CHANGE_EVENTS = 10      # 변화 이벤트

# 검색 결과에서 LLM에게 넘길 필드 (필드 솎기 — 존재 이유 ②).
# 뺀 것들과 이유: barcode(LLM이 쓸 일 없음) · image_url(프론트 몫) ·
# spec(JSON 원본은 compute의 파서가 읽지 LLM이 읽지 않음) · 플래그 4종(상세에서).
_SEARCH_FIELDS = ("sku_id", "name", "brand", "price_krw", "spec_raw",
                  "category_l1", "category_l2", "lifecycle_status", "on_promo")


def _pick(row: dict, fields: tuple) -> dict:
    """dict에서 지정한 키만 골라 새 dict를 만든다 (개념 ㉑).

    `if k in row` 조건이 붙은 이유: 실물 백엔드가 어떤 필드를 안 줄 수도 있는데,
    그때 KeyError로 죽는 대신 그 키만 빠진 채로 넘어가게 하기 위해서다.
    """
    # 읽는 법(㉑): "fields의 각 k에 대해, k가 row에 있으면, k: row[k] 쌍을 넣어라".
    # `k in row`는 dict에서 **키 중에** k가 있는지 보는 것(값이 아니라 키).
    return {k: row[k] for k in fields if k in row}


# ── 도구별 실행 함수 ────────────────────────────────────────────────────────
# 이름 앞 밑줄 = 모듈 내부용. 밖에서는 아래 REGISTRY를 통해서만 부른다.

def _search_products(**kw) -> dict:
    """조회 결과를 LLM용으로 다듬어 반환. (개념 ⑰: 인자를 dict로 받아 그대로 위임)"""
    rows = sot_client.search_products(**kw)
    # 잘라내기 전에 전체 개수를 먼저 센다 — LLM에게 "몇 개 중 몇 개를 보여주는지"
    # 알려줘야 "이게 전부인가요?"에 정직하게 답할 수 있다.
    total = len(rows)
    trimmed = [_pick(r, _SEARCH_FIELDS) for r in rows[:MAX_SEARCH_RESULTS]]  # 개념 ⑳
    return {
        "total_found": total,
        "returned": len(trimmed),
        # 잘렸다는 사실을 결과에 명시한다. 이게 없으면 LLM이 8개가 전부라고
        # 착각하고 "그 조건에는 8개뿐이에요"라는 틀린 말을 한다.
        "truncated": total > len(trimmed),
        "products": trimmed,
    }


def _get_product(sku_id: int) -> dict:
    """상품 상세. 여기서는 필드를 솎지 않는다 — 상세 조회는 애초에 1건이라
    토큰 부담이 없고, 규격·플래그가 답변에 직접 쓰인다."""
    row = sot_client.get_product(sku_id)
    if row is None:
        # 예외를 던지지 않고 '없음'을 값으로 돌려준다. LLM이 이 결과를 보고
        # "그 상품은 저희 매장에 없네요"라고 답할 수 있게 (sot_client의 정책과 동일).
        return {"found": False, "sku_id": sku_id}
    return {"found": True, "product": row}


def _get_inventory(sku_id: int) -> dict:
    """재고 전모. 로케이션은 보통 2~4개라 자르지 않는다.

    요약 필드 3개를 덧붙이는 이유: LLM에게 산술을 시키지 않기 위해서다(헌법 2).
    '매대에 있나?'를 판단하려고 LLM이 목록을 훑어 tier_role을 비교하고 수량을
    더하게 두면, 틀릴 뿐 아니라 응답도 느려진다. 판단의 재료를 미리 계산해 준다.
    """
    inv = sot_client.get_inventory(sku_id)
    locs = inv["locations"]
    # 개념 ㉑-a: 위치 목록을 훑으며 조건에 맞는 것의 qty만 더한다.
    # 읽는 법 — "locs의 각 l에 대해, l의 tier_role이 PICK이면, l의 qty를 더해라".
    # if가 뒤에 붙는 순서가 낯설지만 컴프리헨션의 고정된 어순이다.
    pick_qty = sum(l["qty"] for l in locs if l["tier_role"] == "PICK")
    other_qty = sum(l["qty"] for l in locs if l["tier_role"] != "PICK")   # != 는 "같지 않다"
    return {
        **inv,                                   # ㉑-b: 원본 내용을 통째로 쏟아 넣고
        "pick_qty": pick_qty,                    # 매대 합계
        "backup_qty": other_qty,                 # 매대 밖(보관단·백룸) 합계
        # 이 세 번째 값이 장면 1의 분기점이다:
        #   pick>0            → "있습니다"
        #   pick=0, backup>0  → "매대엔 없지만 보충 예정" (predict_availability로)
        #   둘 다 0           → "없습니다" (find_substitutes로)
        "on_shelf": pick_qty > 0,
    }


def _get_purchase_history(member_id: int) -> dict:
    """구매 이력. 최근 것이 판단에 중요하므로 **뒤에서** 자른다.

    rows[-N:] = 마지막 N개. sot_client가 오름차순(과거→최근)으로 주므로
    뒤쪽이 최근이다. 앞에서 자르면(rows[:N]) 가장 오래된 20건만 남아
    "최근에 언제 샀나"를 알 수 없게 된다 — 방향을 틀리기 쉬운 지점.
    """
    rows = sot_client.get_purchase_history(member_id)
    total = len(rows)
    recent = rows[-MAX_HISTORY_ROWS:]
    return {"member_id": member_id, "total_rows": total,
            "truncated": total > len(recent), "purchases": recent}


def _get_session_cart(session_id: str) -> dict:
    """장바구니. 합계가 이미 계산되어 있으므로 그대로 넘긴다(가공 금지)."""
    return sot_client.get_session_cart(session_id)


def _get_wishlist(member_id: int) -> dict:
    """위시리스트. 상품명이 없으면 LLM이 sku 번호만 보고 말하게 되므로,
    이름을 붙여서 준다(조인). 사실을 만드는 게 아니라 있는 사실을 붙이는 것."""
    rows = sot_client.get_wishlist(member_id)
    out = []                                     # 결과를 모을 빈 리스트
    for w in rows:                               # 위시리스트 한 줄씩
        p = sot_client.get_product(w["sku_id"])  # 그 상품의 상세를 따로 조회
        # `p["name"] if p else None` = 조건 표현식(삼항). 한 줄로 읽으면
        #   "p가 있으면 p['name'], 없으면 None". if/else를 값 자리에 쓴 형태다.
        # 왜 필요한가: 단종·삭제로 상품이 사라졌을 수 있다. 그때 p는 None인데
        #   None["name"]을 하면 TypeError로 죽는다. 이름 없이 넘기는 편이 낫다.
        out.append({**w, "name": p["name"] if p else None})   # ㉑-b + 조건 표현식
    return {"member_id": member_id, "items": out}


def _get_change_events(sku_ids=None, within_hours: int = 24) -> dict:
    """최근 변화 이벤트. 최신이 중요하므로 뒤에서 자른다(이력과 같은 이유)."""
    rows = sot_client.get_change_events(sku_ids=sku_ids, within_hours=within_hours)
    total = len(rows)
    recent = rows[-MAX_CHANGE_EVENTS:]
    return {"total_rows": total, "truncated": total > len(recent), "events": recent}


# ── 조회 +3 (2026-08-21 ai-server 인수) ─────────────────────────────────────
# 셋 다 sot_client가 집계·정렬·표기 통일을 끝낸 것을 받아 상한만 건다.
# 계산이 여기 없는 이유: 지표의 정의(재구매율 = 2회 이상 구매자/전체 구매자)는
# **세계의 사실**이라 SoT 쪽(백엔드, mock에선 sot_client)이 소유해야 한다.
# 도구층이 정의를 갖기 시작하면 mock과 실물의 숫자가 다른 이유를 찾을 수 없게 된다.

MAX_METRIC_SKUS = 20     # 지표 조회 상한 — 백엔드 API의 상한(README)과 같은 값


def _get_product_metrics(sku_ids: list) -> dict:
    """상품 반응 지표 묶음. 웹 평판은 여기 없다 — 그건 서버 도구(웹 검색)의 몫.

    상한을 앞에서 자르는 이유: 지표는 "비교"의 재료라 20개를 넘게 부를 일이
    정상 흐름엔 없고, LLM이 검색 결과 전체를 통째로 넘기는 실수를 했을 때
    백엔드에 20개 초과 요청이 나가 거부당하는 것보다 여기서 조용히 자르고
    사실(truncated)을 알리는 쪽이 낫다.
    """
    total = len(sku_ids)
    result = sot_client.get_product_metrics(sku_ids[:MAX_METRIC_SKUS])
    return {**result, "truncated": total > MAX_METRIC_SKUS}


def _compare_purchase_popularity(sku_ids: list, lookback_days: int = 90) -> dict:
    """상품 간 판매량 비교. 정렬은 sot_client가 이미 끝냈다(구매자 수 내림차순)."""
    return sot_client.compare_purchase_popularity(sku_ids, lookback_days=lookback_days)


def _get_popular_products(category_l2: str | None = None,
                          lookback_days: int = 90, limit: int = 10) -> dict:
    """카테고리(또는 전체) 인기 순위. limit 상한만 여기서 한 번 더 죈다."""
    # min(limit, 20): LLM이 limit=100을 보내도 20개까지만 — 순위표가 길어질수록
    # 답변이 목록 낭독이 되고 토큰만 탄다. 사람에게 유효한 순위는 상위 몇 개다.
    return sot_client.get_popular_products(category_l2=category_l2,
                                           lookback_days=lookback_days,
                                           limit=min(limit, 20))


# ── 디스패치 테이블 (개념 ⑲) ────────────────────────────────────────────────
# 키 = definitions.py에 선언한 도구 이름(반드시 철자가 같아야 한다).
# 값 = 그 도구를 실행할 함수 "자체"(() 없음 — 지금 부르는 게 아니라 나중에 부른다).
# 루프는 이 표에서 함수를 꺼내 실행하므로, 도구가 늘어도 루프 코드는 안 바뀐다.
REGISTRY = {
    "search_products":             _search_products,
    "get_product":                 _get_product,
    "get_inventory":               _get_inventory,
    "get_purchase_history":        _get_purchase_history,
    "get_session_cart":            _get_session_cart,
    "get_wishlist":                _get_wishlist,
    "get_change_events":           _get_change_events,
    "get_product_metrics":         _get_product_metrics,          # 08-21 인수
    "compare_purchase_popularity": _compare_purchase_popularity,  # 08-21 인수
    "get_popular_products":        _get_popular_products,         # 08-21 인수
}


def run(tool_name: str, tool_input: dict) -> dict:
    """도구 하나를 실행하고 결과 dict를 돌려준다. 루프가 부르는 유일한 입구.

    [입력] tool_name: LLM이 고른 도구 이름 / tool_input: LLM이 채운 인자 dict
    [출력] 성공하면 도구 결과 dict, 실패하면 {"error": ...} dict
    [원칙] **예외를 밖으로 던지지 않는다.** 조회 실패는 시스템 오류가 아니라
      대화 중 일어날 수 있는 사건이므로, 값으로 바꿔 LLM에게 돌려준다.
      그래야 루프가 "지금 확인이 어렵네요"로 착지한다 — 서버가 죽는 대신.
    """
    fn = REGISTRY.get(tool_name)
    if fn is None:
        # 정의에 없는 도구를 LLM이 지어낸 경우(환각). 실제로 드물지만 일어난다.
        return {"error": "unknown_tool", "message": f"'{tool_name}'은 없는 도구입니다."}

    # 인자 정화(존재 이유 ③): LLM이 보낸 키 중 이 함수가 실제로 받는 것만 남긴다.
    # fn.__code__.co_varnames = 그 함수가 선언한 인자 이름들(파이썬이 함수 객체에
    # 담아두는 정보). co_argcount만큼 자르는 이유는 뒤쪽에 지역 변수 이름도
    # 섞여 있기 때문. **kw로 받는 _search_products는 co_argcount가 0이라
    # 이 필터를 통과하지 못하므로, 아래 예외 처리로 그대로 넘긴다.
    code = fn.__code__
    if code.co_flags & 0x08:            # 0x08 = 이 함수가 **kwargs를 받는다는 표시
        clean = tool_input             # 그런 함수는 아무 키나 받으므로 통과
    else:
        allowed = code.co_varnames[:code.co_argcount]
        clean = {k: v for k, v in tool_input.items() if k in allowed}

        # ── 신원 주입 (B안 확장): 이 함수가 member_id·session_id를 받는 함수라면,
        # LLM이 뭐라고 보냈든 **등록된 값으로 덮어쓴다.** 스키마에 칸이 없어
        # 보통은 보낼 일이 없지만, LLM이 지침을 무시하고 끼워 넣은 경우까지
        # 여기서 막힌다 — 인자 정화(③)가 신원에서는 보안 검문이 된다.
        # 등록된 값이 없으면(비회원·세션 없음) 실행하지 않고 오류를 값으로
        # 돌려준다(원칙 ④) — LLM이 이 결과를 보고 로그인 안내로 착지한다.
        if "member_id" in allowed:
            if _CURRENT_MEMBER_ID is None:
                return {"error": "no_member",
                        "message": "비회원 세션이라 회원 정보를 쓸 수 없습니다. "
                                   "손님에게 회원번호를 묻지 말고, 로그인하면 "
                                   "이용할 수 있다고 안내하세요."}
            clean["member_id"] = _CURRENT_MEMBER_ID
        if "session_id" in allowed:
            if _CURRENT_SESSION_ID is None:
                return {"error": "no_session",
                        "message": "장보기 세션이 없습니다. 앱에서 장보기를 "
                                   "시작하면 자동으로 연결된다고 안내하세요."}
            clean["session_id"] = _CURRENT_SESSION_ID

    try:                                # 개념 ⑱
        return fn(**clean)             # 개념 ⑰: dict를 낱개 인자로 풀어 호출
    except TypeError as e:
        # 인자가 모자라거나 타입이 안 맞는 경우 (예: 필수 sku_id를 안 보냄)
        return {"error": "bad_arguments", "message": str(e)}
    except Exception as e:
        # 그 밖의 모든 실패 (백엔드 다운·타임아웃·데이터 이상 등).
        # 클래스 이름(예: 'ConnectTimeout')을 함께 주는 이유: LLM이 실패의
        # 성격을 구분해 다르게 말할 수 있고, 우리도 로그에서 원인을 본다.
        return {"error": type(e).__name__, "message": str(e)}
