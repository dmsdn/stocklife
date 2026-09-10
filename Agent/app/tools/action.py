# ============================================================================
# StoreFlow 하네스 — 액션형 도구 3종 실행부 (B안, 2026-08-14 확정)
# ============================================================================
# [역할] 에이전트가 "실제로 담기/수량 변경/빼기"를 수행하는 유일한 파일.
#
# [B안이란 — 왜 이런 모양인가]
#   사용자가 "가장 싼 우유 담아줘"라고 하면 두 가지 방식이 가능했다:
#     A안: 에이전트는 "담아라"는 쪽지만 응답에 실어 보내고 → 프론트가 실행
#     B안: 에이전트가 백엔드 장바구니 API를 직접 불러 담고 → 결과만 말한다   ← 채택
#   백엔드가 이미 B안용 내부 엔드포인트를 구현해 두어 B안으로 확정했다.
#
# [인증이 왜 특이한가 — 이 파일의 핵심 배경]
#   평소 장바구니 API(/api/cart)는 **JWT**로 사용자를 확인한다. JWT(JSON Web
#   Token)는 로그인 시 발급되는 "신분증 문자열"로, 프론트가 요청마다 들고 다닌다.
#   그런데 우리 경로는 [프론트 → 백엔드 → Agent]라서, 백엔드가 JWT를 이미
#   검증한 뒤 Agent에게는 consumer_id(숫자)만 넘긴다 — **Agent에는 신분증이 없다.**
#   그래서 백엔드가 "숫자를 직접 받는 전용 문" /internal/cart 를 열었고,
#   아무나 남의 consumer_id를 넣지 못하도록 **공유 비밀키**로 잠갔다.
#   공유 비밀키 = 백엔드와 Agent만 아는 암호 문자열. 헤더에 실어 "우리 편"임을
#   증명한다. 프론트에 노출되면 그 순간 누구나 남의 장바구니를 조작할 수 있다.
#
# [헌법 위반이 아닌 이유] 헌법 4는 "FastAPI가 **DB에 직접 쓰기** 금지"다.
#   여기서 우리는 DB가 아니라 백엔드 API를 부르고, 실제 쓰기는 백엔드의
#   CartService가 한다. 상태 변경은 여전히 백엔드 단일 경로(헌법 5)다.
#
# [주의] 이 3종은 **회원 전용**이다. 비회원은 consumer_id가 없어 부를 수 없고,
#   루프가 그런 세션에서는 도구 목록에서 빼거나 로그인 안내로 착지해야 한다.
# ============================================================================
#
# ─── 개념 사전 — 이 파일에 처음 나오는 개념 4개 ─────────────────────────────
#
# ㉒ HTTP 메서드와 상태 코드
#    같은 주소라도 "무엇을 하러 왔는지"를 메서드로 구분한다:
#      POST=새로 만들기(담기) · GET=읽기 · PATCH=일부 수정(수량) · DELETE=삭제(빼기)
#    응답의 상태 코드는 결과 요약 숫자다:
#      2xx=성공(201 만들어짐 · 204 성공했고 돌려줄 내용 없음)
#      4xx=요청 잘못(401 인증 실패 · 404 없는 대상)  5xx=서버 잘못
#
# ㉓ HTTP 헤더(header)
#    요청 본문(body)과 별개로 딸려 가는 "부가 정보 쪽지". 인증 토큰·키는 관례상
#    본문이 아니라 헤더에 싣는다(본문은 데이터, 헤더는 데이터에 대한 데이터).
#    여기서는 {"X-Internal-Service-Key": 비밀키}가 그 쪽지다.
#
# ㉔ 환경변수(environment variable)와 os.environ
#    비밀번호·API 키처럼 코드에 적으면 안 되는 값을 OS나 .env 파일에 두고
#    실행 시점에 읽어오는 방식. os.environ.get("이름", 기본값)으로 읽는다.
#    **왜 코드에 안 쓰나(실패 시나리오):** 코드에 박으면 git에 올라가고, 저장소가
#    공개되거나 팀 밖으로 새는 순간 그 키로 누구나 남의 장바구니를 조작한다.
#    한 번 커밋되면 나중에 지워도 git 이력에 영원히 남는다.
#
# ㉕ 모듈 수준 상태(전역 변수)와 set 함수
#    _CURRENT_CONSUMER_ID처럼 함수 밖에 둔 변수는 "이 모듈이 기억하는 값"이다.
#    함수 안에서 그 값을 **바꾸려면** global 선언이 필요하다(안 하면 파이썬이
#    같은 이름의 새 지역 변수를 만들어버려, 바깥 값은 그대로 남는다).
#
# ㉕-a (값, 오류) 쌍으로 돌려주기 — 파이썬의 흔한 관례
#    return 뒤에 값을 쉼표로 여럿 쓰면 파이썬이 그것을 튜플 하나로 묶는다(개념 ⑥).
#    받는 쪽은 쉼표로 한 번에 풀어 받는다(언패킹):
#        cid, err = _require_member()
#    "성공이면 (값, None) / 실패면 (None, 오류)"로 정해두면, 부르는 쪽이
#        if err: return err
#    두 줄로 끝난다. 예외를 던지는 대신 이 방식을 쓰는 이유는 이 파일의 원칙과
#    같다 — **실패는 예외가 아니라 값**이어야 LLM에게 돌려줄 수 있다.
#    타입 힌트 `-> tuple[int | None, dict | None]`이 그 약속을 적어둔 것이다(개념 ④).
#
# ㉕-b 즉석 dict + .get(키, 기본값) — 표로 분기하기
#    {401: "a", 404: "b"}.get(코드, "기본") 은 dict를 그 자리에서 만들고 바로
#    조회하는 관용구다. 변수에 담을 필요가 없어서 한 줄로 쓴다.
#    .get은 **없는 키를 물어도 죽지 않고** 기본값을 준다(대괄호 조회는 KeyError).
#    if/elif를 세 번 늘어놓는 대신 표 하나로 끝내는 방법이며, 코드가 늘어도
#    분기문이 안 늘어난다(query.py의 디스패치 테이블 ⑲과 같은 발상).
#
# ㉕-c 문자열 슬라이싱 [:N]
#    리스트에서 앞 N개를 자르던 슬라이싱(⑳)은 문자열에도 똑같이 쓰인다.
#    r.text[:200] = 응답 본문의 앞 200글자. 자바 스택트레이스가 통째로 오면
#    LLM 컨텍스트를 잡아먹으므로 앞부분만 남긴다.
# ────────────────────────────────────────────────────────────────────────────

import os

from app import config

# ── 백엔드 내부 API 주소·비밀키 ─────────────────────────────────────────────
# 비밀키는 환경변수(㉔)에서 읽는다. 코드에 절대 적지 않는다.
# .env 파일에 INTERNAL_SERVICE_KEY=... 로 두고, .env는 .gitignore로 제외되어 있다.
# 백엔드의 application.yml에 있는 internal.service-key와 **같은 값**이어야 한다.
INTERNAL_SERVICE_KEY = os.environ.get("INTERNAL_SERVICE_KEY", "")
INTERNAL_CART_PATH = "/internal/cart"

# 현재 요청의 회원 번호. 루프가 매 요청 시작 시 set_consumer_id()로 채운다.
# 왜 도구 인자가 아니라 모듈 상태(㉕)로 두는가:
#   consumer_id는 **LLM이 정하면 안 되는 값**이다. 도구 스키마에 넣어두면
#   LLM이 9002 같은 남의 번호를 채워 넣을 수 있고, 그러면 남의 장바구니가
#   바뀐다. 백엔드가 JWT로 확인해 넘겨준 값만 쓰도록, LLM의 손이 닿지 않는
#   경로로 전달한다. (definitions.py의 액션 3종 스키마에 consumer_id가 없는 이유)
# ⚠ 09-03 — 요청 상태는 **ContextVar** 다, 모듈 전역이 아니다.
#   전에는 `_CURRENT_… = None` 전역이었고 요청마다 덮어썼다. 그런데 요청은 동시에
#   온다: 손님의 채팅(스레드풀)과 그 손님의 진입 브리핑(dispatch 의 to_thread)이
#   **같은 초에** 돌면 브리핑의 set_position(None) 이 채팅의 앵커를 지운다 — 09-03
#   시연 점검에서 스캔 직후 첫 질문("가장 가까운 화장실")만 번번이 "위치 모름"이
#   나온 원인. 손님 둘이 겹치면 **신원까지** 섞인다(남의 member_id 로 이력을 읽는다).
#   contextvars.ContextVar 는 스레드·태스크마다 값이 따로 산다. asyncio.to_thread 와
#   FastAPI 의 스레드풀은 컨텍스트를 **복사해서** 넘기므로 set() 이 새 스레드 안에
#   갇힌다. 읽기는 .get(), 쓰기는 .set() — 함수 껍데기(set_/current_)는 그대로라
#   호출부는 안 바뀐다.
from contextvars import ContextVar
_CURRENT_CONSUMER_ID: ContextVar = ContextVar("consumer_id", default=None)


def set_consumer_id(consumer_id: int | None, group_id: int | None = None) -> None:
    """루프가 요청을 시작할 때 현재 사용자를 등록한다. 비회원이면 None."""
    from app import cart_context
    cart_context.set_group(group_id)
    _CURRENT_CONSUMER_ID.set(consumer_id)     # ContextVar — 이 요청(스레드·태스크)에만


def current_consumer_id() -> int | None:
    """지금 요청의 **백엔드 축** 신원(consumer_id). 비회원이면 None.

    [왜 새로 연다 — 09-02] 신원은 축이 둘이다: 백엔드 축(consumer_id, 장바구니·
    주문·로그인)과 세계 축(member_id = 10,000,000 + consumer_id, 구매 이력·찜·
    추천). `query.current_member_id()` 만 열려 있어서 `sot_client` 의 장바구니·
    반복구매 조회가 **세계 축 값을 백엔드 창구의 consumerId 에** 넣고 있었다 —
    백엔드는 10,000,005 번 손님을 모르니 200 에 빈 장바구니가 온다. 오류가 아니라
    빈 결과라 부정 행동 기준선(09-02)에서야 드러났다("장바구니가 비어 있어요"가
    데이터가 아니라 축 착오였다). 09-01 의 반대 방향 사고와 같은 계열이다.
    """
    return _CURRENT_CONSUMER_ID.get()


def _require_member() -> tuple[int | None, dict | None]:
    """회원인지 확인하고, 아니면 도구 결과로 쓸 오류 dict를 돌려준다.

    반환이 튜플 2개인 이유: 파이썬에는 "성공/실패"를 한 번에 돌려주는 관례로
    (값, 오류) 쌍을 쓰는 방식이 흔하다. 부르는 쪽에서
        cid, err = _require_member()
        if err: return err
    처럼 두 줄로 처리할 수 있어, 함수마다 같은 검사를 반복해도 짧게 유지된다.
    """
    # `is None`은 "값이 없음"인지 보는 것(개념 ⑤). `== None`이 아니라 `is None`을
    # 쓰는 게 파이썬 관례다 — None은 프로그램 전체에 딱 하나뿐인 값이라 "같은
    # 물건인가(is)"로 묻는 것이 정확하다.
    if _CURRENT_CONSUMER_ID.get() is None:
        # 실패 → (None, 오류dict). 쉼표로 두 값을 돌려주면 튜플이 된다(㉕-a).
        return None, {"ok": False, "error": "not_a_member",
                      "message": "로그인한 회원만 장바구니를 사용할 수 있습니다."}
    return _CURRENT_CONSUMER_ID.get(), None      # 성공 → (회원번호, 오류없음)


def _call(method: str, path: str, json_body: dict | None = None,
          params: dict | None = None) -> dict:
    """백엔드 내부 API를 호출하고 결과를 도구 결과 dict로 바꾼다.

    [원칙] 예외를 밖으로 던지지 않는다. 담기 실패는 시스템 오류가 아니라
      대화 중 일어날 수 있는 사건이므로, {"ok": False, ...}라는 **값**으로
      돌려줘 LLM이 "지금 담기가 안 되네요"라고 정직하게 말하게 한다.
      (query.py의 run()과 같은 철학)
    """
    if not INTERNAL_SERVICE_KEY:
        # 키가 설정 안 된 채로 호출하면 백엔드가 401을 줄 것이다. 그 전에
        # 우리가 먼저 잡아 원인을 명확히 알린다 — 401만 보면 원인 추적이 길어진다.
        return {"ok": False, "error": "no_service_key",
                "message": "INTERNAL_SERVICE_KEY가 설정되지 않았습니다(.env 확인)."}

    import httpx      # mock 모드에서 httpx 없이도 서버가 뜨도록 함수 안에서 import

    try:
        r = httpx.request(
            method,
            config.BACKEND_BASE_URL + path,
            json=json_body,          # 본문(body) — 담을 상품·수량 같은 데이터
            params=params,           # 주소 뒤 ?consumerId=9001 형태로 붙는 값
            headers={"X-Internal-Service-Key": INTERNAL_SERVICE_KEY},   # ㉓
            timeout=config.BACKEND_TIMEOUT_SEC,
        )
    except Exception as e:
        # 백엔드가 안 떠 있거나 네트워크가 끊긴 경우.
        # type(e).__name__ = 예외 객체의 **클래스 이름 문자열**('ConnectTimeout' 등).
        #   왜 이름만 주나: LLM이 "서버가 느리네요"와 "그런 항목이 없네요"를
        #   구분해 말할 수 있고, 우리도 로그에서 원인을 한눈에 본다.
        # str(e) = 예외가 품고 있는 설명 문장을 문자열로 꺼낸 것.
        return {"ok": False, "error": type(e).__name__, "message": str(e)}

    # 상태 코드(㉒)로 성패를 가른다. 2xx면 성공.
    # 파이썬은 부등호를 연달아 쓸 수 있다 — 다른 언어의 (x>=200 && x<300)과 같다.
    if 200 <= r.status_code < 300:
        # 204(성공했지만 돌려줄 내용 없음)면 본문이 비어 있어 .json()이 실패한다.
        # r.content는 응답 본문의 원시 바이트인데, 비어 있으면 "거짓"으로 취급되어
        # 조건 표현식(⑨)의 else 쪽인 None이 된다. 그래서 본문이 있을 때만 파싱한다.
        body = r.json() if r.content else None
        return {"ok": True, "status": r.status_code, "data": body}

    # 실패 코드별로 LLM이 다르게 말할 수 있게 구분해 준다(㉕-b).
    # dict를 그 자리에서 만들고 바로 .get으로 조회 — 표에 없는 코드(예: 500)가
    # 오면 두 번째 인자인 "backend_error"가 된다.
    reason = {401: "internal_auth_failed",   # 비밀키 불일치 — 설정 문제
              404: "not_found",              # 없는 장바구니 항목
              400: "bad_request"}.get(r.status_code, "backend_error")
    return {"ok": False, "error": reason, "status": r.status_code,
            "message": r.text[:200]}         # ㉕-c: 긴 스택트레이스가 오면 앞부분만


# ── 도구별 실행 함수 ────────────────────────────────────────────────────────

def _add_to_cart(sku_id: int, quantity: int = 1, group_id: int | None = None) -> dict:
    """장바구니에 담기 — POST /internal/cart"""
    # ㉕-a: 두 값을 한 번에 받아 푼다. err이 None이 아니면(=비회원이면)
    # 그 오류 dict를 그대로 도구 결과로 돌려주고 끝낸다. 세 함수가 전부 이 두 줄로
    # 시작하는 이유는 "회원 확인"이라는 같은 관문을 공유하기 때문이다.
    cid, err = _require_member()
    if err:
        return err
    from app import cart_context
    selected, err = cart_context.resolve_group(group_id)
    if err:
        return err
    result = _call("POST", INTERNAL_CART_PATH,
                   json_body={"consumerId": cid, "skuId": sku_id, "quantity": quantity,
                              "groupId": selected})
    if result.get("ok"):
        result["group_id"] = selected
    return result


def _update_cart_quantity(cart_item_id: int, quantity: int) -> dict:
    """수량 변경 — PATCH /internal/cart/{cartItemId}

    cart_item_id는 sku_id와 다르다: sku는 '상품 종류'의 번호이고,
    cart_item_id는 '이 사람 장바구니의 이 줄'의 번호다. 그래서 LLM이 추측할 수
    없고, get_session_cart로 먼저 확인해야 한다(도구 설명에 그렇게 적어두었다).
    """
    cid, err = _require_member()
    if err:
        return err
    from app import cart_context
    err = cart_context.check_item(cart_item_id)
    if err:
        return err
    return _call("PATCH", f"{INTERNAL_CART_PATH}/{cart_item_id}",
                 json_body={"consumerId": cid, "quantity": quantity})


def _remove_from_cart(cart_item_id: int) -> dict:
    """장바구니에서 빼기 — DELETE /internal/cart/{cartItemId}?consumerId=

    DELETE는 관례상 본문(body)을 잘 쓰지 않아서, consumerId를 주소 뒤
    쿼리 파라미터로 붙인다(백엔드 컨트롤러가 그렇게 받도록 되어 있다).
    """
    cid, err = _require_member()
    if err:
        return err
    from app import cart_context
    err = cart_context.check_item(cart_item_id)
    if err:
        return err
    return _call("DELETE", f"{INTERNAL_CART_PATH}/{cart_item_id}",
                 params={"consumerId": cid})


# ── 디스패치 테이블 (query.py와 같은 구조) ──────────────────────────────────
REGISTRY = {
    "add_to_cart":          _add_to_cart,
    "update_cart_quantity": _update_cart_quantity,
    "remove_from_cart":     _remove_from_cart,
}

# 액션 도구는 실행되면 되돌리기 어렵고, 프론트 화면과도 어긋날 수 있다.
# 루프는 이 집합을 보고 "이번 턴에 상태를 바꿨는가"를 판단해, 응답의 actions
# 배열에 실어 프론트가 장바구니 화면을 갱신하게 한다(B안의 숙제).
MUTATING_TOOLS = frozenset(REGISTRY)   # frozenset = 수정 불가능한 집합(상수용)
