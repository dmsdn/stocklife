#===============================================
# Agent 하네스 - 조회형 도구 10종 실행부 (definitions.py의 짝)
#===============================================
# [역할] LLM이 "search_products를 이런 인자로 불러줘"라고 하면 그 요청을 실제 함수 호출로 바꿔 실행하고 결과를 LLM에게 돌려줄 형태로 다듬음.

# [왜 sot_client를 루프에서 바로 부르지 않는가 — 이 파일의 존재 이유 4개]
# ① 크기 제한: search_products는 5,000개까지 반환할 수 있다. 그대로 LLM에게 주면 컨텍스트가 터지고 비용이 폭증한다. 상위 N개로 자르고 "더 있음"을 알린다.
# ② 필드 솎기: 바코드·이미지경로 같은 건 LLM의 판단에 쓰이지 않는다. 토큰은 돈이고 지연이므로, 답변에 쓰일 필드만 남긴다.
# ③ 인자 정화: LLM은 스키마에 없는 키를 보내거나 타입을 틀릴 수 있다. 그대로 함수에 넘기면 TypeError로 루프가 죽는다.
# ④ 실패를 결과로 변환: 조회가 실패해도 예외로 루프를 죽이지 않고, "조회 실패" 라는 도구 결과로 LLM에게 돌려준다. 그래야 LLM이 "지금 확인이 어렵네요"로 착지한다(지어내지 않고).

# [경계] 이 파일은 사실을 "가공하지 않음". 계산은 compute.py, 추론은 infer.py

#===============================================

from app import sot_client

#===============================================

# ── 현재 요청의 신원 (2026-08-20, 트러블슈팅_세션신원_미주입_되묻기) ─────────────────────────────────
# action.py의 _CURRENT_CONSUMER_ID와 같은 설계를 조회 쪽으로 확장한 것.
# member_id·session_id는 **LLM이 정하면 안 되는 값**이다 — 스키마에 칸을 두면 LLM이 채울 값이 없어 손님에게 되묻고(첫 골든셋 실호출 4케이스 FAIL),
# 남의 번호를 불러달라면 그대로 부른다(남의 구매 이력이 새는 보안 구멍).그래서 definitions의 조회·추론 스키마에서 이 두 칸을 지우고,루프가 요청마다 등록한 값을 run()이 채운다.
# LLM의 손이 닿지 않는 경로다.
_CURRENT_MEMBER_ID: int | None = None
_CURRENT_SESSION_ID: str | None = None

def set_identity(member_id: int | None, session_id: str | None) -> None:
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

# 결과 크기 상한
# 상수 절정: 'LLM컨텍스트 예산 vs 정보량'의 튜닝대상
MAX_SEARCH_RESULTS = 8          # 검색결과: 사람이 한 화면에서 비교하는 개수 정도
MAX_HISTORY_ROWS = 20           # 구매이력: 소비주기 판단에 최근 몇 건이면 충분
MAX_CHANGE_EVENTS = 10          # 변화이벤트

# 검색 결과에서 LLM에게 넘길 필드
# barcode: LLM이 쓸 일이 없음 / image_url: 프론트 몫 / spec: JSON 원본은 compute의 파서가 읽음(LLM이 읽지 않음) / 플래그 4종
_SEARCH_FIELDS = ("sku_id", "name", "brand", "price_krw", "spec_raw",
                  "category_l1", "category_l2", "lifecycle_status", "on_promo")

def _pick(row: dict, fields: tuple) -> dict:
    return {k: row[k] for k in fields if k in row}

#===============================================
# 도구별 실행 함수
# 모듈 내부용으로만 사용. 밖에서 쓸 때는 아래의 run함수 (REGISTRY)를 통해서만 사용.

def _search_products(**kw) -> dict:
    rows = sot_client.search_products(**kw)
    total = len(rows)
    trimmed = [_pick(r, _SEARCH_FIELDS) for r in rows[:MAX_SEARCH_RESULTS]]
    return {
        "total_found": total,
        "returned": len(trimmed),
        "truncated": total > len(trimmed),
        "products": trimmed,
    }

def _get_product(sku_id: int) -> dict:
    row = sot_client.get_product(sku_id)
    if row is None:
        return {"found": False, "sku_id": sku_id}
    return {"found": True, "product": row}

def _get_inventory(sku_id: int) -> dict:
    inv = sot_client.get_inventory(sku_id)
    locs = inv["locations"]
    pick_qty = sum(l["qty"] for l in locs if l["tier_role"] == "PICK")
    other_qty = sum(l["qty"] for l in locs if l["tier_role"] != "PICK")
    return {
        **inv,
        "pick_qty": pick_qty,
        "backup_qty": other_qty,
        "on_shelf": pick_qty > 0,
    }

def _get_purchase_history(member_id: int) -> dict:
    rows = sot_client.get_purchase_history(member_id)
    total = len(rows)
    recent = rows[-MAX_HISTORY_ROWS:]
    return {"member_id": member_id, "total_rows": total,
            "truncated": total > len(recent), "purchases": recent}

def _get_session_cart(session_id: str) -> dict:
    return sot_client.get_session_cart(session_id)

def _get_wishlist(member_id: int) -> dict:
    rows = sot_client.get_wishlist(member_id)
    out = []
    for w in rows:
        p = sot_client.get_product(w["sku_id"])
        out.append({**w, "name": p["name"] if p else None})
    return {"member_id": member_id, "items": out}

def _get_change_events(sku_ids=None, within_hours: int = 24) -> dict:
    rows = sot_client.get_change_events(sku_ids=sku_ids, within_hours=within_hours)
    total = len(rows)
    recent = rows[-MAX_CHANGE_EVENTS:]
    return {"total_rows": total, "truncated": total > len(recent), "events": recent}

# ── 조회 +3 ─────────────────────────────────────
# 셋 다 sot_client가 집계·정렬·표기 통일을 끝낸 것을 받아 상한만 건다.
# 계산이 여기 없는 이유: 지표의 정의(재구매율 = 2회 이상 구매자/전체 구매자)는 **세계의 사실**이라 SoT 쪽(백엔드, mock에선 sot_client)이 소유해야 한다.
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
    fn = REGISTRY.get(tool_name)
    if fn is None:
        return {"error": "unknown_tool", "message": f"'{tool_name}'은 없는 도구입니다."}

    # 파이썬에서 함수는 객체, __code__는 그 함수를 컴파일한 __code__ 객체
    # 앞뒤 밑줄 두개는 "파이썬이 관리하는 특수 속성"이라는 관례 / ()를 안 붙이는 이유는 실행이 아니라 꺼내보는 것이기 때문
    # 인자 정화: LLM이 보낸 키 중 이 함수가 실제로 받는 것만 남긴다.
    # fn.__code__.co_varnames = 그 함수가 선언한 인자 이름들(파이썬이 함수 객체에 담아두는 정보). co_argcount만큼 자르는 이유는 뒤쪽에 지역 변수 이름도섞여 있기 때문.
    # **kw로 받는 _search_products는 co_argcount가 0이라 이 필터를 통과하지 못하므로, 아래 예외 처리로 그대로 넘긴다.
    code = fn.__code__
    if code.co_flags & 0x08:
        clean = tool_input
    else:
        allowed = code.co_varnames[:code.co_argcount]
        clean = {k: v for k, v in tool_input.items() if k in allowed}

        # ── 신원 주입: 이 함수가 member_id·session_id를 받는 함수라면,  LLM이 뭐라고 보냈든 **등록된 값으로 덮어쓴다.**(트러블슈팅_세션신원_미주입_되묻기)
        # 스키마에 칸이 없어 보통은 보낼 일이 없지만, LLM이 지침을 무시하고 끼워 넣은 경우까지 여기서 막힌다 — 인자 정화가 신원에서는 보안 검문이 된다.
        # 등록된 값이 없으면(비회원·세션 없음) 실행하지 않고 오류를 값으로 돌려준다 — LLM이 이 결과를 보고 로그인 안내로 착지한다.
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

    # 실패를 값으로
    # 예외를 값으로 바꾸면 함수가 죽지 않음 → 대가로 죽은 걸 알아채기가 힘들어짐 ⇒ 검사할 때는 에러가 안 났나가 아니라 기대한 필드가 있나를 보아야함 (골든셋짜는 방식)
    try:
        return fn(**clean)
    except TypeError as e:
        return {"error": "bad_arguments", "message": str(e)}
    except Exception as e:
        return {"error": type(e).__name__, "message": str(e)}