#===============================================
# Agent 하네스 - 조회형 도구 7종 실행부 (definitions.py의 짝)
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
        "returned" : len(trimmed),
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

def _get_wishlist(member_id:int) -> dict:
    rows = sot_client.get_wishlist(member_id)
    out = []
    for w in rows:
        p = sot_client.get_product(w["sku_id"])
        out.append({**w, "name": p["name"] if p else None})
    return {"member_id": member_id, "items": out}

def _get_change_events(sku_ids = None, within_hours:int =24) -> dict:
    rows = sot_client.get_change_events(sku_ids=sku_ids, within_hours=within_hours)
    total = len(rows)
    recent = rows[-MAX_CHANGE_EVENTS:]
    return{"total_rows": total, "truncated": total > len(recent), "events": recent}

#===============================================
# 디스패치 테이블
# 키 = definitions.py에 선언한 도구이름
# 값 = 도구를 실행할 함수 자체
# 파이썬에서 함수는 숫자·문자열처럼 변수에 담고 dict의 값으로 넣을 수 있는 값
# 루프는 이 표에서 함수를 꺼내 실행하므로, 도구가 늘어도 루프 코드는 바뀌지 않음
# ()를 붙이면 실행, 안 붙이면 '함수 그 자체" / 이름 문자열로 함수를 꺼내 부를 수 있음
REGISTRY = {
    "search_products": _search_products,
    "get_product": _get_product,
    "get_inventory": _get_inventory,
    "get_purchase_history": _get_purchase_history,
    "get_session_cart": _get_session_cart,
    "get_wishlist": _get_wishlist,
    "get_change_events": _get_change_events,
}

def run(tool_name: str, tool_input: dict) -> dict:
    fn = REGISTRY.get(tool_name)
    if fn is None:
        return {"error": "unknown_tool", "message": f"'{tool_name}'은 없는 도구입니다"}

    # 파이썬에서 함수는 객체, __code__는 그 함수를 컴파일한 __code__ 객체
    # 앞뒤 밑줄 두개는 "파이썬이 관리하는 특수 속성"이라는 관례 / ()를 안 붙이는 이유는 실행이 아니라 꺼내보는 것이기 때문
    code = fn.__code__
    if code.co_flags & 0x08:
        clean = tool_input
    else:
        allowed = code.co_varnames[:code.co_argcount]
        clean = {k: v for k, v in tool_input.items() if k in allowed}

    # 실패를 값으로
    # 예외를 값으로 바꾸면 함수가 죽지 않음 → 대가로 죽은 걸 알아채기가 힘들어짐 ⇒ 검사할 때는 에러가 안 났나가 아니라 기대한 필드가 있나를 보아야함 (골든셋짜는 방식)
    try:
        return fn(**clean)
    except TypeError as e:
        return {"error": "bad_arguments", "message": str(e)}
    except Exception as e:
        return {"error": type(e).__name__, "message": str(e)}