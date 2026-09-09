# ============================================================================
# StoreFlow 하네스 — SoT 조회 창구 (조회형 10종 + 계산·감시자용 창구의 뒷단)
# ============================================================================
# [역할] 백엔드(SoT)에 있는 사실을 "읽어오는" 함수들을 모아둔 파일.
#   루프·도구·감시자가 재고/상품/이력을 알고 싶으면 반드시 이 파일의 함수를
#   부른다. 백엔드 URL이나 mock_data를 직접 만지는 코드는 이 파일 밖에 없다.
#   → SoT로 가는 문이 하나면 "이 숫자 어디서 왔어?"의 답이 항상 여기 있다 (헌법 1).
#
# [구조] 함수마다 첫 줄이 `if not config.USE_MOCK_SOT: return _http_get(...)`.
#   스위치가 꺼져(mock) 있으면 아래의 mock 구현이 돌고, 켜면 백엔드 HTTP를 탄다.
#   두 경로의 반환 dict "모양"을 똑같이 맞추는 것이 이 파일의 계약 —
#   그래야 스위치를 올려도 도구 코드가 한 줄도 안 바뀐다.
#
# [2026-08-21 ai-server 인수] 실물 경로를 전면 교체했다. 팀계약 v1의 경로
#   7건이 백엔드 실물과 어긋나 있었는데(예: /api/inventory/{id} → 실물은
#   /api/products/{id}/inventory), jmy의 ai-server/backend_client.py가 실측으로
#   검증한 경로 지도를 그대로 옮겼다. 상세 대조는 통합계획서 §1.4.
#   내부 전용 경로(/internal/**)는 JWT 대신 공유 비밀키(X-Internal-Service-Key)
#   헤더로 인증한다 — 우리는 서버 대 서버라 사용자 JWT가 없기 때문.
#
# [금지] 이 파일에 쓰기(INSERT/UPDATE) 함수는 존재하지 않는다.
#   헌법 4(FastAPI는 DB에 쓰지 않는다)를 "약속"이 아니라 "함수의 부재"로 지킨다.
#   유일한 예외적 POST 둘 — get_navigation_route(경로 "계산" 요청 — 조회의 일종.
#   요청 본문이 커서 GET 대신 POST일 뿐 상태를 바꾸지 않는다)와
#   push_proactive_message(자발형 말풍선 전달 — 채팅 이력에 쓰는 주체는 백엔드고
#   우리는 문장을 건네줄 뿐이다. 장바구니 액션이 tools/action.py에 있는 것과
#   같은 이유로, 이것도 "백엔드 단일 경로" 원칙(헌법 5) 안에 있다).
# ============================================================================
#
# ─── 개념 사전 — 이 파일에 처음 나오는 파이썬 개념 7개 ──────────────────────
#
# ① 모듈(module)과 import
#    파이썬 파일 하나가 곧 모듈이다. `import x`는 "x.py를 읽어서 그 안의 것들을
#    쓸 수 있게 해달라"는 뜻. `from datetime import datetime`은 datetime이라는
#    모듈(파이썬에 기본 내장된 "표준 라이브러리" 중 하나) 안에서 datetime이라는
#    이름 하나만 꺼내오는 것. 표준 라이브러리 = 설치 없이 언제나 쓸 수 있는,
#    파이썬이 기본 제공하는 도구 상자.
#
# ② 객체(object)
#    "데이터 + 그 데이터를 다루는 기능"을 한 덩어리로 묶은 것. 예: datetime 객체
#    하나는 연·월·일·시·분·초라는 데이터를 담고 있고, 다른 시각과 빼기·비교하기
#    같은 기능도 스스로 갖고 있다. `객체.기능()` 형태로 부른다 (r.json() 등).
#
# ③ datetime과 timedelta — "시각"과 "길이"
#    datetime(2026, 8, 13, 14, 20, 0) = 2026-08-13 14:20:00 이라는 **시점 하나**.
#    timedelta(days=7)               = "7일"이라는 **시간의 길이** (시점 아님).
#    둘의 산술이 이 파일의 핵심 도구다:
#        시점 - 시점   = 길이(timedelta)   예: 8/13 - 6/28 = 46일
#        시점 - 길이   = 시점              예: 8/13 - 7일  = 8/6
#    왜 문자열로 직접 계산하지 않는가: "2026-03-01"에서 하루 빼면 2월 28일인가
#    29일인가(윤년), "01-31"에 한 달 더하면? — 달력 규칙이 생각보다 지뢰밭이라
#    직접 짜면 반드시 틀린다. datetime이 그 규칙을 전부 알고 있다.
#
# ④ 타입 힌트(type hint)
#    `keyword: str | None = None` 에서 `: str | None` 부분. "이 인자는 문자열
#    아니면 None"이라고 읽는 사람에게 알려주는 **표시**일 뿐, 실행에는 아무
#    영향이 없다(어겨도 에러 안 남). `-> dict`는 "이 함수는 dict를 돌려준다".
#    강제력은 없지만, 함수 서명만 읽어도 입출력을 알 수 있게 하는 문서다.
#
# ⑤ None — "값이 없음"을 나타내는 특별한 값
#    0도 아니고 빈 문자열도 아닌, "아예 없음". 검색 조건이 "지정 안 됨"인 것과
#    "0으로 지정됨"을 구분해야 할 때 None이 필요하다(본문에서 실제 사례 나옴).
#
# ⑥ 자료구조 리터럴
#    dict:  {"키": 값}     — 키로 값을 찾는 사전. 조회가 즉시(O(1)).
#    list:  [a, b, c]      — 순서 있는 목록.
#    tuple: (a, b)         — 리스트와 비슷하나 수정 불가. dict의 키로 쓸 수 있다
#                            (리스트는 키로 못 씀 — 수정 가능한 것은 키가 될 수 없음).
#    set:   {a, b, c}      — 중복 없는 집합. "포함돼 있나?" 검사가 즉시.
#
# ⑦ 함수 정의와 docstring
#    def 이름(인자): 로 함수를 만들고, 함수 첫 줄의 """문자열"""이 docstring —
#    이 함수의 사용 설명서다. 주석(#)과 달리 파이썬이 help()로 보여줄 수 있는
#    공식 문서 취급을 받는다. 인자에 `= 값`이 붙으면 기본값(안 넘기면 그 값).
# ────────────────────────────────────────────────────────────────────────────

# ③번 개념: 시점(datetime)과 길이(timedelta)를 표준 라이브러리에서 꺼내온다.
from datetime import datetime, timedelta

# 같은 패키지(app 폴더) 안의 형제 모듈 config.py, mock_data.py를 가져온다.
# `from app import ...` 형태로 쓰면 어느 위치에서 서버를 띄워도 경로가 같아,
# 손코딩으로 옮긴 뒤에도 임포트가 그대로 성립한다.
from app import config, mock_data

# ── 실물 경로용 URL 표 (USE_MOCK_SOT=False일 때만 사용) ─────────────────────
# dict 리터럴(개념 ⑥). 키 = 함수 이름, 값 = 백엔드 API 경로.
# 값 안의 "{sku_id}"는 아직 빈칸이다 — 나중에 .format(sku_id=101042)가
# 그 자리에 실제 값을 끼워 "/api/products/101042"를 만든다.
# 경로를 함수마다 흩뿌리지 않고 표 하나로 모은 이유: 백엔드와 경로가 확정되면
# 고칠 곳이 이 표 하나다.
#
# [08-21 전면 교체 — ai-server/backend_client.py의 실측 경로]
#   /internal/** 경로는 공유 비밀키 인증(아래 _internal_headers). 백엔드의
#   같은 기능 공개판(/api/orders/frequent 등)은 사용자 JWT를 요구하는데,
#   우리는 백엔드가 서버 대 서버로 부르는 처지라 JWT가 없다. 그래서 백엔드가
#   consumerId를 직접 받는 내부판을 열어뒀다(InternalServiceAuth로 검증).
#   ⚠ 쿼리 파라미터가 camelCase(skuIds·lookbackDays)인 것은 자바 쪽 표기 —
#   우리 함수 인자(snake_case)와 다른 것이 정상이다. 여기서 변환한다.
_API = {
    "search_products":      "/api/products/search",
    "get_product":          "/api/products/{sku_id}",
    "get_products_by_skus": "/api/products/by-skus",
    "get_inventory":        "/api/products/{sku_id}/inventory",       # 구: /api/inventory/{sku_id}
    "get_purchase_history": "/internal/purchases/history",           # ✅ 09-01 팀 구현(jmy) — lookbackDays 기본 180 · 상한 365
    # ⚠ 08-27: `/api/sessions/{id}/cart` 는 **존재하지 않는다**(404). 팀계약에
    #   "백엔드 미확정"으로 적어 두고 그대로 둔 자리였다. 실물에 있는 것은
    #   `/internal/cart/session?consumerId=` — **이름은 session 인데 인자는 회원**
    #   이다(B 검수 R-4). 세션 단위 장바구니는 스키마에만 있고 창구가 없다.
    #   그래서 회원 단위로 갈아탔다. 지금 세계에선 한 회원이 한 세션이라
    #   데모에 차이가 없고, 실물과 맞는다. 비회원 장바구니는 열린 사안이다.
    "get_session_cart":     "/internal/cart/session",
    # ⚠ 공개 `/api/wishlist` 는 **사용자 JWT** 를 요구한다 — Agent 는 서버라
    #   쿠키가 없어 500 이 났다(`인증 토큰이 없습니다`). 08-28 에 내부판을 냈다.
    #   ⚠⚠ 인자는 consumerId 가 아니라 **memberId** 다. 공개판 서비스는
    #     consumerId→memberId 변환을 태우는데, 우리는 이미 member_id 축이라
    #     그 길로 가면 1001 이 10,001,001 로 둔갑해 **항상 빈다**
    #     (purchases/history 와 같은 함정 — 두 번째로 밟았다).
    "get_wishlist":         "/internal/wishlist",                          # 구: /api/members/{id}/wishlist
    "get_change_events":    "/api/inventory/change-events",           # 구: /api/events/changes
    # ── 08-21 ai-server 인수로 새로 열린 창구들 ──
    "get_frequent":         "/internal/orders/frequent",              # 반복구매 집계(백엔드가 계산)
    "get_product_metrics":  "/internal/products/metrics",             # 30일 지표·재구매율
    "compare_popularity":   "/internal/purchases/compare",            # 상품 간 판매량 비교
    "get_popular":          "/internal/purchases/popular",            # ✅ 08-27 구현 확인(요청 ①)
    "get_alt_candidates":   "/api/products/{sku_id}/alternatives/candidates",  # 대체 후보(공개)
    "navigation_route":     "/api/navigation/route",                  # A* 경로 계산(POST·공개)
    "floor_map":            "/api/map/floors/{floor_no}",             # 보행 격자(공개) — 위치 스냅 재료
    "push_proactive":       "/internal/chat/proactive",               # 자발형 말풍선 전달
    # ── 08-25 신설 요청(jmy) — 가용예측이 이것 없이는 못 선다 ──
    "pending_replenish":    "/internal/replenishment/pending",       # ✅ 08-27 구현 확인(요청 ③)
}
# 이름 앞의 밑줄(_API, _http_get)은 파이썬 관례로 "이 모듈 내부용 — 밖에서
# import해 쓰지 마라"는 표시다. 강제는 아니고 읽는 사람에 대한 신호다.


def _internal_headers() -> dict:
    """/internal/** 경로용 인증 헤더를 만든다.

    키는 tools/action.py와 같은 환경변수(INTERNAL_SERVICE_KEY)에서 읽는다 —
    백엔드 application.yml의 internal.service-key와 같은 값이어야 하며,
    다르면 백엔드가 401을 돌려준다. 함수 안에서 매번 읽는 이유: 모듈 상수로
    굳히면 .env 적재(env.load_env)보다 먼저 import됐을 때 빈 문자열로 얼어붙는다
    (08-20 트러블슈팅 'env 키 미적재'와 같은 계열의 함정을 구조로 회피).
    """
    import os
    return {"X-Internal-Service-Key": os.environ.get("INTERNAL_SERVICE_KEY", "")}


# ── 공유 HTTP 클라이언트 (09-03) ─────────────────────────────────────────────
# 전에는 호출마다 `httpx.get(...)`·`httpx.post(...)` 모듈 함수를 썼다. 그 편의 함수는
# **매번 새 Client 를 만들고 요청 뒤 닫는다** — 즉 TCP 연결을 새로 맺는다.
#
# [실측 09-03] 같은 경로 계산 요청을 다섯 번:
#     매번 새 연결  246ms/회
#     연결 재사용    11ms/회      ← 22배
# localhost 인데도 이만큼 차이 나는 것은 윈도우의 연결 수립 비용이 크기 때문이다.
# 응답 본문은 2.5KB 라 전송은 아무 몫도 아니었다 — **전부 악수 비용**이었다.
#
# 왜 크게 걸리나: 동선 최적화는 구간 비용을 재려고 이 창구를 한 질문에 십수 번
# 부른다(4정지점 15회 · 8정지점 59회). 246ms × 59 = 15초가 순전히 연결 수립이다.
# 조회 도구도 한 번의 대화에서 여러 번 도니 이 이득은 경로만의 것이 아니다.
#
# [수명] 프로세스 하나에 클라이언트 하나. 명시적으로 닫지 않는다 — 종료 시 OS 가
# 회수하고, 중간에 닫으면 다른 스레드의 요청이 깨진다. httpx.Client 는 스레드
# 안전하므로 스레드풀·to_thread 에서 같이 써도 된다.
# [import 를 함수 안에 두는 관례] 아래 주석 참조 — mock 모드에서는 httpx 가 없어도
# 서버가 떠야 한다. 그래서 클라이언트도 **처음 쓸 때** 만든다.
_CLIENT = None


def _client():
    """공유 httpx.Client. 없으면 만든다(연결 유지 = keep-alive)."""
    global _CLIENT
    if _CLIENT is None:
        import httpx
        _CLIENT = httpx.Client(
            # 연결 풀: 백엔드 하나만 보므로 작게. keepalive 를 넉넉히 둬야
            # 동선 계산의 연속 호출이 같은 연결을 재사용한다.
            limits=httpx.Limits(max_keepalive_connections=8, max_connections=16),
        )
    return _CLIENT


def _http_get(path: str, params: dict | None = None, headers: dict | None = None):
    """백엔드에 GET 요청을 보내고 응답을 파이썬 dict/list로 돌려주는 내부 공용 함수.

    path    : _API 표에서 꺼낸 경로 문자열 (예: "/api/products/search")
    params  : URL 뒤에 ?keyword=물티슈 처럼 붙을 조건들의 dict. 없으면 None.
              (개념 ④: `dict | None = None` = dict이거나 None, 기본값 None)
    headers : 요청에 실을 HTTP 헤더 dict. /internal/** 경로일 때만
              _internal_headers()가 여기로 들어온다. 공개 경로는 None.
    """
    # httpx = HTTP 요청을 보내는 외부 라이브러리(pip로 설치하는 것 — 표준 아님).
    # import를 파일 맨 위가 아니라 함수 "안"에서 하는 이유: mock 모드로 도는
    # 동안에는 httpx가 설치돼 있지 않아도 서버가 떠야 한다. 맨 위에 두면
    # 파일을 읽는 순간 "httpx 없음" 에러로 죽는다 — 의존성은 실제로 쓰는
    # 순간에만 요구하는 것.
    # _client().get(주소, ...) = 그 주소로 GET 요청을 보내고 응답 객체(r)를 받는다.
    # timeout: 응답이 이 시간(초) 안에 안 오면 포기하고 예외를 던진다.
    #   왜 필요한가: 백엔드가 느려질 때 무한정 기다리면 사용자 화면이 멈춘
    #   것처럼 보인다. 빨리 실패하고 "지금 확인이 어렵네요"로 착지하는 게 낫다.
    r = _client().get(config.BACKEND_BASE_URL + path, params=params, headers=headers,
                      timeout=config.BACKEND_TIMEOUT_SEC)
    # raise_for_status(): 응답이 실패 코드(4xx/5xx)면 예외를 던진다(개념 ②:
    # 응답 객체 r이 스스로 가진 기능). 이걸 생략하면 에러 응답도 조용히
    # 지나가서, 도구가 빈 결과를 "재고 없음"으로 오해한다. 실패는 실패로
    # 터뜨려야 루프가 지어내지 않는다.
    r.raise_for_status()
    return r.json()   # 응답 본문(JSON 텍스트)을 파이썬 dict/list로 변환해 반환


def _http_post(path: str, json_body: dict, headers: dict | None = None):
    """조회·전달 성격의 POST. 지금 쓰는 곳은 둘 — 경로 계산(본문이 커서 POST)과
    자발형 말풍선 전달. _http_get과 짝을 이루는 최소한의 함수라 따로 뺐다.

    json=본문 으로 넘기면 httpx가 dict를 JSON 문자열로 바꾸고 Content-Type
    헤더까지 챙긴다 — json.dumps를 손으로 부를 필요가 없다.
    타임아웃을 config 값과 10초 중 큰 쪽으로 잡는 이유: A* 경로 계산은
    단순 조회보다 오래 걸릴 수 있는데, 조회 기준(3초)으로 끊으면 멀쩡한
    계산을 실패로 오판한다. max(a, b) = 둘 중 큰 값.
    """
    r = _client().post(config.BACKEND_BASE_URL + path, json=json_body, headers=headers,
                       timeout=max(config.BACKEND_TIMEOUT_SEC, 10.0))
    r.raise_for_status()
    return r.json()


def _parse_ms(ts: str) -> datetime:
    """"2026-08-13 14:02:10.320" 같은 문자열을 datetime 객체(개념 ③)로 바꾼다.

    왜 바꾸는가: 문자열끼리는 "몇 초 차이인가" 같은 산술을 못 한다. 시각을
    빼고 더하려면 datetime 객체가 필요하다.

    strptime = "string parse time"(문자열을 시각으로 해석). 둘째 인자가
    자릿수 지도다: %Y=연(4자리) %m=월 %d=일 %H=시(24h) %M=분 %S=초
    %f=초 아래 소수부(밀리초 포함).

    mock의 시각을 평소엔 문자열로 두고 계산 "직전"에만 변환하는 이유:
    저장 시점에 객체로 바꿔두면 밀리초가 유실돼도 눈치채기 어렵다.
    (밀리초 보존은 🔴 계약 — 보충 리드타임 832초가 여기서 나온다.)
    """
    return datetime.strptime(ts, "%Y-%m-%d %H:%M:%S.%f")


# ============================================================================
# 조회형 도구 7종의 뒷단.
# 반환은 전부 "JSON으로 그대로 나갈 수 있는" dict/list — datetime 객체를
# 반환하지 않는다. 이 반환값은 결국 LLM에게 도구 결과로 넘어가는데,
# 문자열이면 그대로 나가고 객체면 변환 계층이 하나 더 생기기 때문.
# ============================================================================

def search_products(keyword: str | None = None,
                    category_l1: str | None = None,
                    category_l2: str | None = None,
                    max_price: int | None = None,
                    on_promo_only: bool = False,
                    new_within_days: int | None = None) -> list[dict]:
    """조건 검색 — 도구 search_products의 실체.

    [입력] 전부 기본값 있는 선택 인자(개념 ⑦). LLM이 사용자 발화에서 뽑은
      조건만 값으로 넘긴다 (keyword="물티슈", max_price=20000 …).
      판단(어떤 조건을 걸지)은 LLM, 필터링(조건 적용)은 여기 — 결정적으로.
    [출력] 조건에 전부(AND) 맞는 상품 dict의 리스트. 각 dict에 on_promo
      (지금 행사 중인가)를 덧붙여 준다.
    [반환 예] [{"sku_id": 101042, "name": "아기 물티슈 …", …, "on_promo": False}, …]
    """
    if not config.USE_MOCK_SOT:
        # ⚠ **이름 정규화 — 08-27 첫 실연동에서 잡은 것.** 두 겹으로 어긋나 있었다:
        #   ① 파라미터: 백엔드는 camelCase(categoryL1·maxPrice·onPromo·recentDays)를
        #      받는데 snake 로 보내고 있었다 — Spring 은 모르는 파라미터를 조용히
        #      무시하므로 **필터가 전부 풀린 채** 200 이 온다(에러가 아니다).
        #   ② 응답: skuId·priceKrw·categoryL2 … camelCase 그대로 흘려보내면
        #      query.py 의 투영이 snake 키만 집어 **sku_id 가 증발**한다. 그러면
        #      LLM 은 재고·위치 조회로 넘어갈 열쇠가 없어 검색만 반복하다 도구
        #      한도를 태운다 — "취급하는 건 확인했는데 재고는 확인이 어렵네요"가
        #      바로 이 증상이었다. get_inventory 의 _norm_loc 과 같은 계열이며,
        #      변환은 **경계(sot_client)에서 한 번**만 한다.
        rows = _http_get(_API["search_products"], {
            "keyword": keyword, "categoryL1": category_l1, "categoryL2": category_l2,
            "maxPrice": max_price, "onPromo": on_promo_only,
            "recentDays": new_within_days})
        return [_norm_product(r) for r in (rows or [])]

    # ── 지금 행사 중인 sku 집합 만들기 ──
    # {… for … if …} = 집합 컴프리헨션: "PROMOTIONS의 각 행 p에 대해, 조건을
    # 통과하는 p의 sku_id만 모아 set(개념 ⑥)을 만들라"를 한 줄로 쓴 것.
    # set을 쓰는 이유: 아래 루프에서 "이 상품이 행사 중인가"를 `in`으로 수천 번
    # 물어보는데, set의 in은 즉시 답하고 list의 in은 목록 전체를 훑는다.
    # 조건식: 행사 시작 ≤ 지금 ≤ 행사 끝. 파이썬은 a <= b <= c 연쇄 비교가 되고,
    # 여기서 datetime 객체끼리의 비교(개념 ③)가 쓰인다. "지금"은 실제 시계가
    # 아니라 config.DEMO_NOW(고정된 세계 시계)다 — 평가 재현성 때문.
    promo_skus = {p["sku_id"] for p in mock_data.PROMOTIONS
                  if _parse_ms(p["starts_at"]) <= config.DEMO_NOW <= _parse_ms(p["ends_at"])}

    out = []   # 조건을 통과한 상품을 담을 빈 리스트 — 아래에서 append로 채운다
    # PRODUCTS는 {sku_id: 상품dict} 모양의 dict라서, .values()를 돌면
    # 키(sku_id)는 빼고 값(상품 dict)들만 하나씩 나온다.
    for p in mock_data.PRODUCTS.values():
        # 단종품도 검색에는 나온다 — "그 커피 어디 있어요?"에 "단종됐고 대신
        # 이게 있어요"라고 답하려면 행이 조회돼야 한다. 대신 dict 안에
        # lifecycle_status가 실려 있어 LLM이 상태를 안다.

        # 아래 if들은 전부 "탈락 조건"이다: 하나라도 걸리면 continue(이 상품을
        # 버리고 for의 다음 상품으로 건너뜀). 모든 관문을 통과한 상품만 맨 아래
        # out.append까지 도달한다. 이런 짜임(가드 절)은 if를 겹겹이 중첩하는
        # 것보다 관문이 늘어나도 코드가 평평하게 유지된다.

        # `keyword and ...`: keyword가 None이면(조건 지정 안 됨) and 뒤를 보지
        # 않고 전체가 거짓 → 탈락 안 함(조건 없는 것으로 취급).
        # `a in b`는 문자열 포함 검사: "물티슈" in "아기 물티슈 캡형" → True.
        # 줄 끝의 `\`는 "문장이 다음 줄로 이어진다"는 표시(줄 연속).
        if keyword and keyword not in p["name"] and keyword not in p["brand"] \
                and keyword not in p["category_l2"]:
            continue
        if category_l1 and p["category_l1"] != category_l1:
            continue
        if category_l2 and p["category_l2"] != category_l2:
            continue
        # 왜 `if max_price:`가 아니라 `is not None`인가(개념 ⑤의 실전):
        # 파이썬에서 0은 조건문에서 거짓 취급이라, max_price=0으로 지정해도
        # `if max_price:`는 "조건 없음"으로 오판한다. "지정 안 됨(None)"과
        # "0으로 지정됨"을 구분하려면 None인지 자체를 물어야 한다.
        if max_price is not None and p["price_krw"] > max_price:
            continue
        if on_promo_only and p["sku_id"] not in promo_skus:
            continue
        if new_within_days is not None:
            # 입고일은 "2026-03-02" 형태(시각 없음)라 %f 없는 형식으로 파싱.
            stocked = datetime.strptime(p["first_stocked_at"], "%Y-%m-%d")
            # timedelta 산술(개념 ③): 시점 - 길이 = 시점.
            # DEMO_NOW - timedelta(days=N) = "N일 전 시각". 입고일이 그보다
            # 이전이면 신상이 아니므로 탈락.
            if stocked < config.DEMO_NOW - timedelta(days=new_within_days):
                continue
        # {**p, "on_promo": …} = dict 병합: p의 모든 키·값을 복사한 "새" dict를
        # 만들고 거기에 on_promo 키를 추가한다. 원본 p를 직접 고치지 않는 게
        # 핵심 — mock_data는 세계의 원본이라, 여기서 수정하면 다음 조회부터
        # 오염된 값이 나온다.
        out.append({**p, "on_promo": p["sku_id"] in promo_skus})
    return out


def get_product(sku_id: int) -> dict | None:
    """상품 상세 1건 — 도구 get_product의 실체.

    [입력] sku_id 하나. [출력] 상품 dict, 없으면 None(개념 ⑤).
    없는 sku에 예외(에러)를 던지지 않는 이유: '없는 상품 문의'는 오류가 아니라
    일상 입력이다(오타 바코드, 타 매장 상품). 루프가 "못 찾았습니다"로
    자연스럽게 답할 재료이지, 서버가 죽을 일이 아니다.
    """
    if not config.USE_MOCK_SOT:
        # ⚠ `search_products` 와 **같은 부류의 버그였다**(08-27 실물 골든셋 준비 중 발견).
        #   백엔드는 camelCase 로 준다 — 원시를 흘려보내면 도구 결과에 `price_krw` 가
        #   없어 **가격이 조용히 None** 이 된다. 404 도 500 도 아니라 안 보인다.
        #   변환은 경계(이 파일)에서 한 번 — `_norm_loc`·search 와 같은 규율.
        # .format(sku_id=...) = _API 표의 "{sku_id}" 빈칸에 실제 값을 끼운다.
        r = _http_get(_API["get_product"].format(sku_id=sku_id))
        return _norm_product(r) if r else None
    # dict.get(키) = 키가 있으면 그 값을, 없으면 None을 돌려준다.
    # mock_data.PRODUCTS[sku_id]로 쓰면 없는 키에서 KeyError 예외가 터진다 —
    # "없음"이 정상 케이스인 여기서는 get이 맞다.
    return mock_data.PRODUCTS.get(sku_id)


def spec_quantity(spec) -> dict | None:
    """상품의 `spec` 에서 **수량 축과 값**만 뽑아 낸다. 없으면 None.

    [왜 파서가 아니라 이건가 — 08-27] 처음 계획은 `spec_raw`("500g")를 정규식+사전으로
    파싱하는 것이었다. 실데이터를 열어 보니 **카탈로그가 이미 정답을 들고 있다** —
    4,970개 전부 `quantity: {primary, value}` 가 정상이고, 복합 규격 331개
    ("900ml × 3입")도 접혀 있다(→ volume_ml 2700). 당연하다: 그 문자열을 만든
    `catalog.py` 가 수량을 알고 있다.

    파싱으로 갔으면 막혔다 — `spec_raw` 의 **19.4%(965개)는 숫자가 아예 없다**
    ("기본형"·"싱글"·"퀸"·"단품", 전부 count_ea 1). 정규식으로는 못 풀고 사전이
    필요한데, 그 사전은 `catalog.py` 가 새 단어를 추가하는 날 조용히 낡는다.

    > **업스트림이 이미 아는 것을 다운스트림에서 복원하지 않는다.**
    > 문자열로 납작하게 만든 뒤 다시 세우는 일은, 왕복마다 정보를 잃는다.

    [모양이 둘이다] mock 은 dict 를, 실물 백엔드는 JSON **문자열**을 준다
    (DB 컬럼이 `json` 타입이고 DTO 가 String 으로 들고 온다). 둘 다 받는다.
    **그래서 이 함수가 필요하다** — 도구가 "어느 쪽에서 왔나"를 알면 경계가 샌다.

    [왜 상품 dict 에 미리 담아 두지 않나] `_norm_product` 에서 계산해 칸으로
    넣으면 실물은 정규화를 타는데 **mock 은 안 탄다**(mock_data 는 이미
    snake_case 라 그 함수를 안 거친다). 칸이 한쪽에만 생기면 도구가 두 모양을
    받게 된다 — 창구를 하나로 두는 이 파일의 규율에 어긋난다.
    쓰는 쪽에서 `sot_client.spec_quantity(p.get("spec"))` 로 부른다.
    """
    if not spec:
        return None
    if isinstance(spec, str):
        import json
        try:
            spec = json.loads(spec)
        except Exception:                                  # noqa: BLE001
            return None                                    # 깨진 JSON — 모른다
    q = (spec or {}).get("quantity") or {}
    axis, value = q.get("primary"), q.get("value")
    if not axis or not isinstance(value, (int, float)) or value <= 0:
        return None                                        # 0·음수는 나눗셈이 안 된다
    return {"axis": str(axis), "value": float(value)}


def _norm_product(r: dict) -> dict:
    """백엔드의 camelCase 상품 한 줄 → 우리 계약(snake_case).

    [왜 공용인가] `search_products` 와 `get_product` 가 **같은 모양**을 돌려줘야
    한다 — 도구가 어느 쪽으로 상품을 얻었든 뒤 코드가 같아야 하기 때문이다.
    투영을 두 곳에 각각 적으면 한쪽만 고치는 날 조용히 갈린다.

    [`final_price_krw` 를 살리는 이유] 행사 중이면 실판매가가 다르다. 가격 발화의
    근거는 정가가 아니라 **손님이 계산대에서 낼 금액**이어야 한다.
    """
    g = r.get
    return {"sku_id": g("skuId"), "name": g("name"), "brand": g("brand"),
            "category_l1": g("categoryL1"), "category_l2": g("categoryL2"),
            "price_krw": g("priceKrw"), "unit": g("unit"), "spec_raw": g("specRaw"),
            # ⚠ 08-27 이전에는 `specRaw`(원문 문자열)만 살리고 `spec`(수량이 든
            #   JSON)을 **버리고 있었다.** 그래서 단위가격 비교가 "파서를 만들어야
            #   하는 일"로 보였다 — 실제로는 창구가 값을 안 넘긴 것뿐이다.
            "spec": g("spec"),
            "is_frozen": g("frozen"), "is_fresh": g("fresh"),
            "is_refrigerated": g("refrigerated"),
            "on_promo": bool(g("onPromo")),
            "discount_krw": g("discountKrw"), "final_price_krw": g("finalPriceKrw")}


def _norm_loc(r: dict) -> dict:
    """백엔드의 camelCase 로케이션 한 줄 → 우리 계약(snake_case).

    [왜 이 파일에 있나] 이름 변환을 도구·추론 쪽에서 하면 **경계가 새어나간다** —
    infer 가 "백엔드는 camelCase 다"를 알게 되는 순간 mock 으로 못 돌아간다.
    sot_client 가 SoT 로 가는 유일한 창구이므로 변환도 여기서 끝낸다.

    [없는 칸은 None] `min_qty`(보충 임계)는 지금 이 API 가 안 준다. 0 으로 채우면
    "임계가 0" = 절대 보충 안 함이 되어 조용히 틀린다 — 모르는 것은 None 이다.
    """
    g = r.get
    return {"location_id": g("locationId") or g("location_id"),
            "zone_id":     g("zoneId")     or g("zone_id"),
            "tier_role":   g("tierRole")   or g("tier_role"),
            "floor_no":    g("floorNo")    if g("floorNo") is not None else g("floor_no"),
            "x": g("x"), "y": g("y"), "qty": g("qty"),
            "min_qty": g("minQty") if g("minQty") is not None else g("min_qty")}


def get_inventory(sku_id: int) -> dict:
    """상품 하나의 재고 전모 — 도구 get_inventory의 실체.

    [입력] sku_id. [출력] {"sku_id": …, "locations": [로케이션별 dict, …]}
    [반환 예] {"sku_id": 101042, "locations": [
        {"location_id": "F2-B-R01-B05-L2", "tier_role": "PICK", "qty": 0,  "min_qty": 8, …},
        {"location_id": "F2-B-R01-B05-L5", "tier_role": "BULK", "qty": 40, "min_qty": None, …}]}

    반환이 '수량 하나'가 아니라 '로케이션 목록'인 것이 이 세계의 핵심이다.
    재고를 숫자 하나로 뭉치면 "품절이에요"밖에 못 하고, 위치별 목록이면
    매대(PICK) 0 + 바로 위(BULK) 40이 함께 보여 "약 N분 뒤 채워집니다"가 성립한다.
    """
    if not config.USE_MOCK_SOT:
        # ⚠ **실물은 모양이 다르다 — 08-26 첫 실연동에서 잡았다.**
        #   백엔드는 `[{locationId, zoneId, tierRole, floorNo, x, y, qty}, …]`
        #   **맨 리스트**를 camelCase 로 돌려준다. 그런데 mock 은 위 docstring 대로
        #   `{"sku_id":…, "locations":[… snake_case …]}` 를 준다.
        #   원시 응답을 그대로 흘려보내면 mock ↔ 실물의 **모양이 갈린다**:
        #     · `inv.get("locations")` → list 에는 .get 이 없어 AttributeError
        #     · 설령 dict 였어도 `L.get("tier_role")` 은 camelCase 를 못 읽어
        #       **PICK 매대를 못 찾고** 가용예측이 통째로 죽는다
        #   이건 404 도 500 도 아니라 조용히 틀리는 종류다 —
        #   **경계를 넘는 자리에서 한 번 정규화한다**(이 파일이 그 경계다).
        rows = _http_get(_API["get_inventory"].format(sku_id=sku_id))
        if isinstance(rows, dict):          # 혹시 백엔드가 감싸서 주면 벗긴다
            rows = rows.get("locations") or rows.get("items") or []
        return {"sku_id": int(sku_id), "locations": [_norm_loc(r) for r in (rows or [])]}

    locs = []
    # STOCKS의 키는 (sku_id, location_id) 튜플(개념 ⑥ — 수정 불가라 dict 키가
    # 될 수 있다)이다. dict를 .items()로 돌면 (키, 값) 쌍이 나오는데, 키가
    # 튜플이므로 `for (sku, loc_id), qty in …`처럼 자리에 맞춰 한 번에 풀어
    # 받을 수 있다(튜플 언패킹 — 괄호 모양이 곧 데이터 모양).
    for (sku, loc_id), qty in mock_data.STOCKS.items():
        if sku != sku_id:          # 다른 상품의 재고 행은 건너뛴다
            continue
        loc = mock_data.LOCATIONS[loc_id]              # 좌표·층·역할 정보를 붙인다(조인)
        cfg = mock_data.SHELF_CONFIGS.get((sku, loc_id))   # 매대 설정(없으면 None)
        locs.append({
            "location_id": loc_id, "zone_id": loc["zone_id"],
            "tier_role": loc["tier_role"], "floor_no": loc["floor_no"],
            "x": loc["x"], "y": loc["y"], "qty": qty,
            # `A if 조건 else B` = 한 줄짜리 조건 선택(삼항 표현).
            # min_qty(보충 임계)는 PICK 매대에만 있는 개념이라 BULK에선 None.
            "min_qty": cfg["min_qty"] if cfg else None,
        })
    return {"sku_id": sku_id, "locations": locs}


def get_purchase_history(member_id: int) -> list[dict]:
    """회원 구매 이력 — 도구 get_purchase_history의 실체. 소비주기 추정의 원료.

    [입력] member_id. [출력] 그 회원의 구매 dict 리스트, 구매 시각 **오름차순**.
    내림차순(최신 먼저)이 아닌 이유: 소비주기 계산이 "인접 구매 사이 간격"의
    나열이라 시간순이 자연스럽고, 정렬을 쓰는 쪽마다 다시 하게 두면
    방향 실수(최신→과거로 빼서 음수 간격)가 생긴다. 정렬 책임을 여기 고정한다.
    """
    if not config.USE_MOCK_SOT:
        # 요청 ④ — 08-27 에 우리가 로컬로 먼저 만들었고, **09-01 에 팀(jmy)이 공식
        #   구현**해 그쪽으로 갈아탔다(우리 판은 ljk_instant 패치에서 빠졌다).
        # ⚠ consumerId 가 아니라 memberId 다: 공개판은 consumerId→toMemberId 변환을
        #   거치는데, 그 길로 가면 시드 회원 1005 가 10,001,005 로 둔갑해 이력이
        #   항상 빈다. 내부판은 member_id 축을 그대로 받는다.
        # ⚠ lookbackDays 를 **명시**한다 (09-02). 팀 판의 기준은
        #   `Instant.now() - days` — 세계 시각(DEMO_NOW)이 아니라 **실제 시각**이다.
        #   기본 180 이면 시연 이력(05-15~09-01)이 2026-11-11 부터 하루씩 잘린다.
        #   오류가 아니라 「가장 오래된 구매가 조용히 사라지는」 종류라, 재구매
        #   간격이 어느 날부터 짧게 계산돼도 아무도 모른다. 상한 365 를 박아
        #   2027-05 까지 밀어 두고, 근본(무제한 또는 세계 시각 앵커)은 요청서에.
        #   0 이하는 「무제한」이 아니라 기본 180 으로 떨어진다 — 그래서 최댓값.
        rows = _http_get(_API["get_purchase_history"],
                         {"memberId": member_id, "lookbackDays": 365},
                         headers=_internal_headers())
        out = [{"sku_id": r.get("skuId"), "qty": r.get("qty"),
                "purchased_at": r.get("purchasedAt")} for r in (rows or [])]
        # ⚠ **실물 경로도 여기서 정렬한다** — 08-28 발견. 위 독스트링이
        #   *"정렬 책임을 여기 고정한다"* 고 약속해 놓고 mock 갈래만 지키고
        #   있었다. 실물은 백엔드가 준 순서를 그대로 흘려보냈다.
        #
        #   [왜 조용히 틀리나] 백엔드 질의가 우연히 시간순이면 아무 일도 안
        #   난다. 인덱스가 바뀌거나 JOIN 이 끼면 그날부터 순서가 달라지는데,
        #   **오류가 아니라 「가장 최근에 사신 것」이 엉뚱한 상품으로 바뀔 뿐**
        #   이다. 08-28 의 chk_cart_owner·VRAM 초과와 같은 계열 —
        #   멈추지 않는 오류가 제일 오래 안 잡힌다.
        #
        #   or "" 는 `purchased_at` 이 없는 행 때문이다. None 이 섞이면
        #   str 과 None 비교로 TypeError 가 나서 이력 조회 전체가 죽는다.
        out.sort(key=lambda r: r["purchased_at"] or "")
        return out
    # 리스트 컴프리헨션: "PURCHASES의 각 행 p 중 member_id가 일치하는 것만 모아
    # 새 리스트로" — for문 3줄을 한 줄로 쓴 것.
    rows = [p for p in mock_data.PURCHASES if p["member_id"] == member_id]
    # sorted(목록, key=함수) = key 함수가 돌려주는 값을 기준으로 정렬한 "새" 목록.
    # lambda r: r["purchased_at"] = "행 r을 받아 purchased_at 값을 돌려주는,
    # 이름 없는 한 줄짜리 함수"(정렬 기준 하나 주자고 def까지 쓰기엔 무거워서).
    # 시각이 "2026-03-08 15:22:41.000" 형태인데 이 형식은 자릿수가 고정이라
    # 문자열 사전순 = 시간순이다. 그래서 datetime 변환 없이 정렬해도 맞는다.
    return sorted(rows, key=lambda r: r["purchased_at"])


def get_session_cart(session_id: str) -> dict:
    """세션의 현재 장바구니 + 합계 — 도구 get_session_cart의 실체.

    [입력] session_id. [출력] {"session_id": …, "items": [품목 dict, …], "total_krw": 합계}

    합계를 **여기서 코드로** 계산하는 이유(헌법 2): "장바구니 얼마죠?"의 산술을
    LLM에게 시키지 않는다. 도구 결과에 합계가 이미 들어 있으면 LLM은 읽기만 한다.

    장바구니를 어디서 얻는가: 저장된 '장바구니 테이블'을 읽는 게 아니라,
    SCAN_ADD/SCAN_REMOVE 이벤트를 시간순으로 재생해 복원한다.
    이벤트가 진실이고 장바구니는 그 파생이다 — append-only 세계의 읽기 방식.
    """
    if not config.USE_MOCK_SOT:
        # 실물은 **손님(consumer)** 으로 조회한다(위 _API 주석). 세션 id 는 안 쓰이지만
        # 서명에는 남긴다 — mock 경로가 그것으로 이벤트를 재생하고, 세션 단위
        # 창구가 열리는 날 부르는 쪽을 안 고치고 갈아탈 수 있다.
        #
        # ⚠ 09-02 정정 — 축이 틀려 있었다. 전에는 `query.current_member_id()`(세계 축,
        #   10,000,005)를 `consumerId` 에 넣었다. 백엔드 `/internal/cart/session` 은
        #   `@RequestParam Long consumerId`(백엔드 축, 5)다. 없는 손님이라 **200 에 빈
        #   장바구니**가 왔고, 오류가 아니라서 부정 행동 기준선(09-02)에서야 드러났다.
        #   백엔드 축은 `action` 이 들고 있다. 골든 러너·검사기처럼 member 만 세팅한
        #   경로를 위해 역변환(member − OFFSET)을 한 번 시도한다 — 세계 회원(1001~)은
        #   OFFSET 아래라 None 으로 남고, 그건 맞는 판정이다(그 회원은 로그인 손님이 아니다).
        from app.tools import query as _q, action as _act
        cid = _act.current_consumer_id()
        if cid is None:
            cid = config.to_consumer_id(_q.current_member_id())   # 경계는 config 가 지킨다
        if cid is None:
            # 비회원이면 조회할 장바구니가 없다. 오류가 아니라 **상태**다 —
            # 액션 3종의 _require_member 와 같은 판정을 조회에서도 한다.
            return {"session_id": session_id, "items": [], "total_krw": 0,
                    "note": "비회원 세션이라 장바구니가 없습니다."}
        from app import cart_context
        return cart_context.read_cart(session_id, cid)
    # counts = {sku_id: 순수 담긴 개수}. 담으면 +1, 빼면 -1로 누적한다.
    # `: dict[int, int]`는 타입 힌트(개념 ④ — 키도 값도 int라는 표시일 뿐).
    counts: dict[int, int] = {}
    for e in mock_data.CONSUMER_EVENTS:
        if e["session_id"] != session_id:   # 다른 세션의 행동은 무시
            continue
        if e["event_type"] == "SCAN_ADD":
            # .get(키, 0) = 키가 아직 없으면 0에서 시작하라는 뜻. 이 관용구가
            # 없으면 첫 스캔에서 counts[sku]가 존재하지 않아 KeyError가 난다.
            counts[e["sku_id"]] = counts.get(e["sku_id"], 0) + 1
        elif e["event_type"] == "SCAN_REMOVE":
            counts[e["sku_id"]] = counts.get(e["sku_id"], 0) - 1

    items = []
    total = 0
    # .items() = dict의 (키, 값) 쌍을 하나씩 — 여기선 (상품번호, 순개수).
    for sku, qty in counts.items():
        # 담았다 뺐다를 반복해 0 이하가 된 상품은 장바구니에 없는 것이다.
        # (장면 2의 세제: ADD→REMOVE→ADD = 최종 1개만 남는 게 이 줄 덕분)
        if qty <= 0:
            continue
        p = mock_data.PRODUCTS[sku]
        items.append({"sku_id": sku, "name": p["name"], "qty": qty,
                      "unit_price_krw": p["price_krw"], "subtotal_krw": p["price_krw"] * qty})
        total += p["price_krw"] * qty   # += : total = total + … 의 줄임
    return {"session_id": session_id, "items": items, "total_krw": total}


def get_wishlist(member_id: int) -> list[dict]:
    """호환 이름을 유지하면서 실제 저장 리스트의 상품을 조회한다.

    09-07 결정: UI에는 찜이 없으며 cart_group/cart_item이 저장 리스트의 정본이다.
    과거 도구 호출 이력을 깨지 않도록 함수 이름만 유지하고 wishlists 테이블은 읽지 않는다.
    member 축은 config 한 곳에서 consumer 축으로 변환한다. 회원이 없으면 다른 회원이나
    세계 mock 찜으로 폴백하지 않는다. 반환은 SKU·리스트 수량·선택 상태의 현재값이다.
    """
    if config.USE_MOCK_SOT:
        return []  # 비상 mock에 폐기된 찜 데이터를 다시 넣지 않는다.
    consumer_id = config.to_consumer_id(member_id)
    if consumer_id is None:
        return []
    from app import cart_context
    return [{"sku_id": item["skuId"], "quantity": item.get("quantity", 1),
             "checked": bool(item.get("checked")), "source": "saved_list",
             "group_id": g["cartGroupId"], "group_title": g["title"]}
            for g in cart_context.groups(consumer_id) for item in g.get("items", [])
            if item.get("skuId") is not None]


def get_change_events(sku_ids: list[int] | None = None,
                      within_hours: int = 24) -> list[dict]:
    """최근 변화 이벤트(자리 이동 MOVE · 입고 RESTOCK_IN · 품절 STOCKOUT) 조회.
    진입 브리핑("늘 사시던 물티슈 자리가 바뀌었어요")과 입고 알림의 원료.

    [입력] sku_ids: 이 상품들로 좁혀서 조회(None이면 전체 — 개념 ⑤).
           within_hours: 최근 몇 시간 안의 변화만 볼지(기본 24시간).
    [출력] 조건에 맞는 이벤트 dict 리스트, 발생 시각 오름차순.

    sku_ids 필터를 "인자로" 받는 이유: 세계 감시자의 관련성 판정이 '이 회원과
    관련된 SKU'만 넘기기 때문. 전체를 받아 파이썬 쪽에서 거르는 구조로 짜면,
    실물 전환 때 그 필터를 백엔드 쿼리로 내릴 수 없어 전체 이벤트가 매번
    네트워크를 건너오게 된다.
    """
    if not config.USE_MOCK_SOT:
        # ⚠ **이름 계약**이 어긋나 400 이었다(08-27 B 검수 R-3).
        #   컨트롤러: @RequestParam List<Integer> skuIds, @RequestParam int hours
        #   우리:     sku_ids · within_hours            → 400
        #   기능은 처음부터 멀쩡했다. 404 도 500 도 아니라 "창구가 없나" 하고
        #   엉뚱한 데를 봤다 — **이름만 틀린 실패가 제일 오래 안 잡힌다.**
        #   다른 내부 창구가 전부 camelCase(skuIds·consumerId)라 우리가 맞춘다.
        #   ⚠ skuIds 는 필수다(defaultValue 가 없다) — None 이면 400 이므로,
        #     '전체 조회'는 이 창구로 못 한다. 감시자가 늘 sku 를 좁혀 부르므로
        #     지금은 무해하지만, 전체가 필요해지면 백엔드에 기본값을 요청한다.
        if not sku_ids:
            return []
        # ⚠⚠ **시계가 둘이다.** 이 창구만 시간 계산을 백엔드가 한다:
        #       InventoryService: Instant.now().minus(recentHours)
        #   그런데 우리 세계의 「지금」은 벽시계가 아니라 `config.DEMO_NOW`
        #   (2026-08-08 14:20 — DES 스냅샷 시각)다. 데모 데이터는 거기서
        #   끝나므로, 벽시계 기준 "최근 24시간"에는 **이벤트가 영원히 0건**이다.
        #   창구도 질의도 멀쩡한데 늘 빈 배열이 오는, 제일 안 잡히는 부류다
        #   (08-28 실측: 그 sku 에 이벤트 312건이 있는데 24시간 창은 0건).
        #
        #   [고치는 법] 창의 **시작점**이 `DEMO_NOW - within_hours` 에 오도록
        #   시간 수를 벌린다. 창이 뒤로 더 늘어나지만(DEMO_NOW ~ 벽시계) 그
        #   구간에는 데이터가 없으므로 결과는 의도한 창과 **정확히 같다.**
        #   세계가 벽시계를 따라잡는 날 skew 가 0이 되어 이 보정은 저절로
        #   사라진다 — 상수를 박지 않는 이유다.
        #
        #   ⚠ 백엔드에 `since` 를 받는 인자가 생기면 이 보정을 지운다.
        #     지금은 `hours` 뿐이라 부르는 쪽에서 감당한다.
        skew_h = (datetime.now() - config.DEMO_NOW).total_seconds() / 3600.0
        hours = int(within_hours) + max(0, int(skew_h) + 1)
        rows = _http_get(_API["get_change_events"],
                         {"skuIds": list(sku_ids), "hours": hours}) or []
        # ⚠ 원시 camelCase 를 흘려보내면 안 된다 — 08-27 에 `get_inventory`·
        #   `search_products` 가 정확히 그래서 **값이 조용히 None** 이 됐다.
        #   경계에서 한 번 바꾼다(이 파일의 규율).
        return [{"event_id": r.get("eventId"), "event_type": r.get("eventType"),
                 "sku_id": r.get("skuId"), "location_id": r.get("locationId"),
                 "qty": r.get("qty"), "occurred_at": r.get("occurredAt"),
                 "payload": r.get("payload")} for r in rows]

    # timedelta 산술(개념 ③): "지금 - N시간" = 조회 시작 시점.
    since = config.DEMO_NOW - timedelta(hours=within_hours)
    out = []
    for e in mock_data.SHELF_EVENTS:
        # `x not in (a, b, c)` = x가 셋 중 어느 것도 아니면 참. 변화 이벤트
        # 3종이 아닌 것(SALE·BELOW_PAR 등)은 보충 예측의 재료지, 사용자에게
        # 알릴 '변화'가 아니므로 거른다.
        if e["event_type"] not in ("MOVE", "RESTOCK_IN", "STOCKOUT"):
            continue
        # 여기도 `is not None`(개념 ⑤): sku_ids=[](빈 리스트 = 관련 상품이
        # 하나도 없음 → 결과도 0건이어야 함)와 None(전체 조회)을 구분해야 한다.
        # `if sku_ids:`로 쓰면 빈 리스트가 거짓 취급되어 "전체 조회"로 둔갑한다.
        if sku_ids is not None and e["sku_id"] not in sku_ids:
            continue
        if _parse_ms(e["occurred_at"]) < since:   # 오래된 변화는 제외
            continue
        out.append(e)
    return sorted(out, key=lambda e: e["occurred_at"])


# ============================================================================
# 2026-08-21 ai-server 인수분 — 조회 3종·집계 1종·대체 후보·경로 계산·말풍선 전달
# ============================================================================
# 실물 응답은 자바 DTO라 camelCase(skuId·purchaserCount)로 온다. **이 파일에서
# snake_case로 통일해 돌려준다** — mock과 실물의 반환 모양을 같게 맞추는 일은
# 이 파일의 계약(머리 주석)이고, 변환을 도구 쪽에 미루면 도구마다 두 표기를
# 다 알아야 해서 계약이 무너진다.

def _in_window(ts: str, days: int) -> bool:
    """시각 문자열이 '지금부터 최근 days일' 창 안인가. 지표·인기 집계의 공용 조각.
    창의 기준은 실제 시계가 아니라 DEMO_NOW다 — search_products의 행사 판정과
    같은 이유(재현성)로, mock 세계의 '지금'은 한 곳에서만 나온다."""
    return _parse_ms(ts) >= config.DEMO_NOW - timedelta(days=days)


def get_products_by_skus(sku_ids: list[int]) -> list[dict]:
    """sku 여러 개의 상품 dict를 한 번에. 계산 도구(가격 정렬·대체 후보)의 재료.

    [왜 get_product 반복 호출이 아닌가] 실물에서는 호출 1번 = 네트워크 왕복
    1번이다. 10개 비교에 10번 왕복하면 그만큼 느려지므로, 백엔드가 이미
    묶음 조회(/api/products/by-skus)를 열어뒀다. mock에서도 같은 모양을 지킨다.
    없는 sku는 조용히 빠진다(부르는 쪽이 개수 비교로 알 수 있다).
    """
    if not config.USE_MOCK_SOT:
        # 자바 쪽 파라미터 표기는 skuIds(camelCase) — 여기서 변환한다.
        rows = _http_get(_API["get_products_by_skus"], {"skuIds": sku_ids})
        # 실물 응답의 camelCase 키를 mock과 같은 snake_case로 맞춘다.
        # ⚠ 여기서 `_norm_product` 를 안 쓰고 손으로 투영하던 것이 화근이었다 —
        #   같은 상품인데 창구마다 칸이 달랐다(단위가격이 필요로 하는 `spec` 이
        #   이쪽에만 없었다). 공용 투영으로 합친다: **한 곳만 고치면 둘 다 산다.**
        #   `lifecycle_status` 는 _norm_product 에 없던 칸이라 얹어 준다.
        return [dict(_norm_product(r), lifecycle_status=r.get("lifecycleStatus"))
                for r in rows]
    # mock: PRODUCTS에서 있는 것만 골라 담는다. `if s in mock_data.PRODUCTS`가
    # 없으면 없는 sku에서 KeyError로 죽는다 — '없음'은 정상 입력(get_product와 동일).
    return [mock_data.PRODUCTS[s] for s in sku_ids if s in mock_data.PRODUCTS]


def get_frequent_purchases(member_id: int, keyword: str | None = None,
                           min_count: int = 2) -> dict:
    """반복구매 상품 집계 — '내가 항상 사는 X 담아줘'의 근거.

    [출력] {"items": [{sku_id, name, purchase_count, avg_qty, suggested_quantity,
                       last_purchased_at}, …]}  — purchase_count 내림차순.
    suggested_quantity = 매번 산 수량의 평균을 반올림한 값. LLM이 담을 수량을
    지어내지 않고 이 값을 그대로 쓰게 한다(ai-server의 원칙을 그대로 인수).

    [실물] 집계는 백엔드 /internal/orders/frequent가 한다(consumerId를 받아
    자기 주문 테이블에서 계산). 우리는 결과를 받아 표기만 통일한다.
    [mock] 같은 계산을 PURCHASES로 직접 한다 — 두 경로의 결과 모양이 같아야
    실물 전환이 스위치 한 번이 된다.
    """
    if not config.USE_MOCK_SOT:
        # ⚠ 09-02 정정 — `/internal/orders/frequent` 도 `consumerId`(백엔드 축)를 받는다.
        #   member_id(세계 축)를 그대로 넣으면 10,000,005 번 손님의 주문 = 0 건이라
        #   **항상 빈 목록**이었다(오류 없음). 서명은 member_id 로 두고(부르는 쪽 무변경)
        #   여기서 축을 바꾼다 — 세계 회원(1001~)은 로그인 손님이 아니라 빈 결과가 맞다.
        _cid = config.to_consumer_id(member_id)      # 축 변환은 config 한 곳에서
        if _cid is None:
            return {"items": [], "note": "로그인 손님이 아니라 주문 기반 반복구매가 없습니다."}
        rows = _http_get(_API["get_frequent"],
                         {"consumerId": _cid, "keyword": keyword, "minCount": min_count},
                         headers=_internal_headers())
        items = [{"sku_id": r.get("skuId"), "name": r.get("productName") or r.get("name"),
                  "purchase_count": r.get("purchaseCount"), "avg_qty": r.get("avgQty"),
                  "suggested_quantity": r.get("suggestedQuantity"),
                  "last_purchased_at": r.get("lastPurchasedAt")}
                 for r in (rows if isinstance(rows, list) else rows.get("items", []))]
        return {"items": items}

    # ── mock 집계 ── 회원의 구매를 sku별로 모은다: {sku: [행, 행, …]}
    by_sku: dict[int, list[dict]] = {}
    for p in mock_data.PURCHASES:
        if p["member_id"] != member_id:
            continue
        # setdefault(키, []) = 키가 없으면 빈 리스트를 넣고, 있으면 기존 것을
        # 돌려준다. "없으면 만들고 이어붙이기"를 한 줄로 쓰는 dict의 관용구 —
        # counts.get(k, 0) + 1 (query의 장바구니 복원)과 같은 문제의 리스트판.
        by_sku.setdefault(p["sku_id"], []).append(p)

    items = []
    for sku, rows in by_sku.items():
        # 반복구매의 단위는 '행'이 아니라 '장바구니(basket)'다 — 한 번 장 볼 때
        # 물티슈 2개를 스캔하면 행이 2개라도 구매 1회다. set으로 중복을 접는다.
        baskets = {r["basket_id"] for r in rows}
        if len(baskets) < min_count:
            continue                       # 기준 미달 — "항상 사는 것"이 아니다
        p = mock_data.PRODUCTS.get(sku)
        name = p["name"] if p else str(sku)
        if keyword and keyword not in name:
            continue
        qty_total = sum(r["qty"] for r in rows)
        avg = qty_total / len(baskets)     # 장보기 1회당 평균 수량
        items.append({
            "sku_id": sku, "name": name,
            "purchase_count": len(baskets),
            # round(x)는 반올림. 0개를 제안하는 일이 없도록 max(1, …)로 바닥을 깐다
            # (평균 0.4개 같은 값도 '살 때는 1개'라는 뜻이므로).
            "avg_qty": round(avg, 2),
            "suggested_quantity": max(1, round(avg)),
            "last_purchased_at": max(r["purchased_at"] for r in rows),
        })
    # 구매 횟수가 많은 것이 먼저 — "항상 사는 것"의 대표를 앞에 세운다.
    # reverse=True = 내림차순. key가 돌려주는 값(횟수) 큰 순서.
    items.sort(key=lambda x: x["purchase_count"], reverse=True)
    return {"items": items}


def get_product_metrics(sku_ids: list[int]) -> dict:
    """상품별 반응 지표 묶음 — 판매량·담기·조회·재구매율 (ai-server 인수 도구).

    [출력] {"window_days": 30, "items": [{sku_id, name, sales_qty_30d,
        sales_qty_total, cart_add_count_30d, view_count_30d,
        unique_buyer_count, repeat_buyer_count, repurchase_rate_pct}, …]}
    재구매율(%) = 서로 다른 장바구니에서 2회 이상 산 사람 / 전체 구매자 × 100.

    [실물] 백엔드 /internal/products/metrics가 전부 계산해 준다(METRICS_README).
    [mock] PURCHASES·CONSUMER_EVENTS로 같은 정의를 직접 계산한다. mock 세계의
    이력이 몇 줄뿐이라 숫자는 작게 나오지만, **모양과 정의가 같다는 것**이
    골든셋이 실물 전환 후에도 유효한 근거다.
    """
    if not config.USE_MOCK_SOT:
        rows = _http_get(_API["get_product_metrics"], {"skuIds": sku_ids},
                         headers=_internal_headers())
        items = [{"sku_id": r.get("skuId"), "name": r.get("productName"),
                  "sales_qty_30d": r.get("salesQty30d"), "sales_qty_total": r.get("salesQtyTotal"),
                  "cart_add_count_30d": r.get("cartAddCount30d"),
                  "view_count_30d": r.get("viewCount30d"),
                  "unique_buyer_count": r.get("uniqueBuyerCount"),
                  "repeat_buyer_count": r.get("repeatBuyerCount"),
                  "repurchase_rate_pct": r.get("repurchaseRate")}
                 for r in (rows if isinstance(rows, list) else rows.get("items", []))]
        return {"window_days": 30, "items": items}

    items = []
    for sku in sku_ids:
        p = mock_data.PRODUCTS.get(sku)
        rows = [r for r in mock_data.PURCHASES if r["sku_id"] == sku]
        # 구매자별 장바구니 집합: {회원: {바스켓, …}} — 재구매 판정의 재료.
        buyer_baskets: dict[int, set] = {}
        for r in rows:
            buyer_baskets.setdefault(r["member_id"], set()).add(r["basket_id"])
        uniq = len(buyer_baskets)
        # 서로 다른 바스켓 2개 이상 = 다른 날 또 산 사람. sum(조건 for …)은
        # True를 1로 세는 관용구(True는 산술에서 1이다).
        repeat = sum(len(b) >= 2 for b in buyer_baskets.values())
        events = [e for e in mock_data.CONSUMER_EVENTS
                  if e.get("sku_id") == sku and _in_window(e["occurred_at"], 30)]
        items.append({
            "sku_id": sku, "name": p["name"] if p else None,
            "sales_qty_30d": sum(r["qty"] for r in rows if _in_window(r["purchased_at"], 30)),
            "sales_qty_total": sum(r["qty"] for r in rows),
            "cart_add_count_30d": sum(e["event_type"] == "SCAN_ADD" for e in events),
            "view_count_30d": sum(e["event_type"] == "VIEW" for e in events),
            "unique_buyer_count": uniq,
            "repeat_buyer_count": repeat,
            # 구매자가 0명일 때 0으로 나누면 ZeroDivisionError로 죽는다 —
            # 지표 없음은 오류가 아니라 값(0.0)으로 돌려준다.
            "repurchase_rate_pct": round(repeat / uniq * 100, 2) if uniq else 0.0,
        })
    return {"window_days": 30, "items": items}


def compare_purchase_popularity(sku_ids: list[int], lookback_days: int = 90) -> dict:
    """상품 몇 개의 판매 실적을 나란히 — 'A랑 B 중 뭐가 더 많이 팔려?'의 근거.

    [출력] {"lookback_days": N, "items": [{sku_id, name, total_qty,
            purchaser_count}, …]} — **purchaser_count 내림차순으로 정렬해서** 준다.
    정렬을 여기서 끝내는 이유(ai-server의 원칙 인수): LLM이 숫자를 눈대중으로
    비교하다 순서를 뒤집는 사고를 막는다. LLM은 1등이 누군지 '읽기만' 한다.
    인기의 기준이 판매 수량이 아니라 구매자 수인 이유: 한 명이 40개 산 상품보다
    스무 명이 하나씩 산 상품이 "많이들 사는" 상품이다.
    """
    if not config.USE_MOCK_SOT:
        rows = _http_get(_API["compare_popularity"],
                         {"skuIds": sku_ids, "lookbackDays": lookback_days},
                         headers=_internal_headers())
        items = [{"sku_id": r.get("skuId"), "name": r.get("productName"),
                  "total_qty": r.get("totalQty"), "purchaser_count": r.get("purchaserCount")}
                 for r in (rows if isinstance(rows, list) else rows.get("items", []))]
    else:
        items = []
        for sku in sku_ids:
            rows = [r for r in mock_data.PURCHASES
                    if r["sku_id"] == sku and _in_window(r["purchased_at"], lookback_days)]
            p = mock_data.PRODUCTS.get(sku)
            items.append({"sku_id": sku, "name": p["name"] if p else None,
                          "total_qty": sum(r["qty"] for r in rows),
                          "purchaser_count": len({r["member_id"] for r in rows})})
    # `x["purchaser_count"] or 0`: 실물이 null을 줄 수 있는데 None끼리는 비교가
    # 안 되어 정렬이 죽는다. None이면 0으로 취급하는 방어.
    items.sort(key=lambda x: x["purchaser_count"] or 0, reverse=True)
    return {"lookback_days": lookback_days, "items": items}


def get_popular_products(category_l2: str | None = None,
                         lookback_days: int = 90, limit: int = 10) -> dict:
    """카테고리(또는 전체) 인기 순위 — '요즘 뭐가 잘 나가?'의 근거.

    [출력] compare_purchase_popularity와 같은 모양(같은 질문의 '순위판'이므로).
    ✅ **08-27 구현 확인** — 내부판이 열렸다. 이 경로가 따로 있는 이유는 남긴다:
    공개판 /api/purchases/popular 는 JWT 필수라 서버 대 서버(사용자 토큰 없음)로는
    못 부른다. 그래서 X-Internal-Service-Key 로 인증하는 내부판을 요청했다.

    ⚠ **백엔드가 상한을 말없이 깎는다**(08-27 B 실측): lookbackDays 최대 365 ·
      limit 최대 50. 넘겨도 400 이 아니라 **잘린 결과가 200 으로** 온다 —
      "60개를 부탁했는데 50개만 왔다"를 두 번 조사하지 않도록 여기 적어 둔다.
      발화가 틀리지는 않으므로 방어 코드는 넣지 않는다.
    """
    if not config.USE_MOCK_SOT:
        # ⚠ **빈 문자열을 보내면 안 된다 — 08-27 실연동에서 잡았다.**
        #   백엔드 쿼리는 `(:categoryL2 IS NULL OR pr.categoryL2 = :categoryL2)` 라
        #   **null 이어야 "전체"** 다. 우리가 `""` 를 보내면 "카테고리 이름이
        #   빈 문자열인 상품"을 찾게 되어 **항상 0건**이 온다.
        #   404 도 500 도 아니고 200 + 빈 배열이라 조용히 틀린다 — 실제로
        #   "이번 주에 뭐가 잘 팔려요?" 가 계속 "데이터가 없다"로 답했다.
        #   None 인 칸은 아예 빼서 보낸다(httpx 는 None 을 그대로 &k=None 으로
        #   직렬화하지 않고 빼 주지만, 빈 문자열은 빼지 않는다).
        params = {"lookbackDays": lookback_days, "limit": limit}
        if category_l2:                       # ""·None 이면 안 넣는다 = 전체
            params["categoryL2"] = category_l2
        rows = _http_get(_API["get_popular"], params,
                         headers=_internal_headers())
        items = [{"sku_id": r.get("skuId"), "name": r.get("productName"),
                  "total_qty": r.get("totalQty"), "purchaser_count": r.get("purchaserCount")}
                 for r in (rows if isinstance(rows, list) else rows.get("items", []))]
        return {"lookback_days": lookback_days, "category_l2": category_l2, "items": items}

    # mock: 창 안의 구매를 sku별로 모은 뒤, 카테고리 조건을 걸러 순위를 만든다.
    stats: dict[int, dict] = {}
    for r in mock_data.PURCHASES:
        if not _in_window(r["purchased_at"], lookback_days):
            continue
        p = mock_data.PRODUCTS.get(r["sku_id"])
        if p is None or (category_l2 and p["category_l2"] != category_l2):
            continue
        s = stats.setdefault(r["sku_id"], {"sku_id": r["sku_id"], "name": p["name"],
                                           "total_qty": 0, "buyers": set()})
        s["total_qty"] += r["qty"]
        s["buyers"].add(r["member_id"])
    items = [{"sku_id": s["sku_id"], "name": s["name"], "total_qty": s["total_qty"],
              "purchaser_count": len(s["buyers"])} for s in stats.values()]
    items.sort(key=lambda x: x["purchaser_count"], reverse=True)
    return {"lookback_days": lookback_days, "category_l2": category_l2,
            "items": items[:limit]}


def get_alternative_candidates(sku_id: int, limit: int = 8) -> list[dict]:
    """대체 후보의 원료 — 같은 소분류 + 비슷한 가격대의 상품들.

    후보를 '만드는' 곳이지 '고르는' 곳이 아니다. 순위 매기기(행사·개인 이력·
    지표 가중)는 계산 도구 find_substitutes(tools/compute.py)의 몫 — 이 분리가
    있어야 실물 전환 시 후보 생성만 백엔드로 넘어가고 정렬 로직은 그대로 남는다.
    """
    if not config.USE_MOCK_SOT:
        rows = _http_get(_API["get_alt_candidates"].format(sku_id=sku_id),
                         {"limit": limit})
        # ⚠ 응답이 `{original, alternatives}` 다 — 목록 칸의 이름이
        #   **`alternatives`** 이지 `items` 가 아니다. 08-28 까지 `items` 만
        #   봐서 **항상 빈 목록**이 왔고, 그래서 `find_substitutes` 가
        #   `ok=True · substitutes=[]` 로 "정상"처럼 보였다.
        #   404 도 500 도 아니라 200 에 빈 배열이라 제일 안 잡히는 부류다
        #   (오늘만 세 번째 — get_inventory · search_products 와 같은 병).
        if isinstance(rows, dict):
            rows = rows.get("alternatives") or rows.get("items") or []
        return [{"sku_id": r.get("skuId"), "name": r.get("name"), "brand": r.get("brand"),
                 "price_krw": r.get("priceKrw"), "category_l2": r.get("categoryL2"),
                 # 규격 근사 판정의 재료 — 없으면 find_substitutes 가 크기를
                 # 못 견주고 1L 의 대체로 300ml 을 올린다.
                 "spec": r.get("spec"), "spec_raw": r.get("specRaw"),
                 "lifecycle_status": r.get("lifecycleStatus")}
                for r in (rows if isinstance(rows, list) else [])]

    org = mock_data.PRODUCTS.get(sku_id)
    if org is None:
        return []
    out = []
    for p in mock_data.PRODUCTS.values():
        if p["sku_id"] == sku_id or p["category_l2"] != org["category_l2"]:
            continue
        # 가격대 ±60%: 1L 우유의 대체로 10배짜리 선물세트가 오르지 못하게 하는
        # 느슨한 울타리. 규격 정합(1L vs 200ml)은 08/27의 규격 파서 몫이라
        # 여기서는 가격으로만 거른다 — 후보는 넓게, 최종 판단은 계산 도구에서.
        if not (org["price_krw"] * 0.4 <= p["price_krw"] <= org["price_krw"] * 1.6):
            continue
        out.append(p)
    # 원상품과 가격이 가까운 순 — abs(차이)는 방향(더 싸다/비싸다)을 지운 거리.
    out.sort(key=lambda p: abs(p["price_krw"] - org["price_krw"]))
    return out[:limit]


def get_current_prices(sku_ids: list[int]) -> dict:
    """sku별 '지금 실제로 내는 값' — {sku: {regular, discount, final, on_promo}}.

    가격 비교(compare_products)·조합(optimize_bundle)의 공용 재료다.
    행사가 반영을 SoT 층에서 끝내는 이유: 정가로 비교하면 지금 행사 중이라
    실제로 더 싼 상품을 놓친다(ai-server가 실호출로 겪고 프롬프트에 박았던
    함정). 그 판정을 도구마다 반복하게 두면 하나쯤 정가로 비교하는 놈이 생긴다.
    """
    if not config.USE_MOCK_SOT:
        rows = _http_get(_API["get_products_by_skus"], {"skuIds": sku_ids})
        out = {}
        for r in rows:
            sku = r.get("skuId")
            regular = r.get("priceKrw")
            # dict.get(키, 기본값)의 기본값 자리에 다른 키의 값을 넣는 관용구 —
            # 백엔드가 finalPriceKrw를 안 실어주면 정가를 실판매가로 취급한다.
            final = r.get("finalPriceKrw", regular)
            out[sku] = {"regular": regular, "final": final,
                        "discount": r.get("discountKrw", 0),
                        "on_promo": bool(r.get("onPromo", False))}
        return out

    # mock: 지금(DEMO_NOW) 활성인 행사에서 sku별 할인액을 찾는다.
    active = {p["sku_id"]: p["discount_krw"] for p in mock_data.PROMOTIONS
              if _parse_ms(p["starts_at"]) <= config.DEMO_NOW <= _parse_ms(p["ends_at"])}
    out = {}
    for sku in sku_ids:
        p = mock_data.PRODUCTS.get(sku)
        if p is None:
            continue
        disc = active.get(sku, 0)
        out[sku] = {"regular": p["price_krw"], "discount": disc,
                    "final": p["price_krw"] - disc, "on_promo": sku in active}
    return out


class Unavailable(str):
    """실패 사유를 담되 **거짓(falsy)으로 평가되는** 문자열.

    [왜 이런 게 필요한가 — 08-27 사고] `get_pending_replenishments`가 실패 사유를
    평범한 `str`로 돌려주게 바꿨더니, 이미 있던 호출부가 조용히 깨졌다.

        for row in (sot.get_pending_replenishments() or [])[:300]:

    `"sot_unreachable"`은 **참**이라 `or []`를 통과하고, 슬라이스가 되고,
    루프가 **글자 하나하나를 행으로** 돌린다. 그래서 에러가 `row.get`에서
    나 원인이 세 단계 떨어진 곳에 보인다("왜 str에 get이 없지?").

    [고친 방식] 사유를 없애지 않고 **거짓으로 만든다.** 그러면
      · `x or []`      → `[]`          (목록으로 쓰는 쪽은 그냥 산다)
      · `if not x:`    → 참             (실패 처리도 자연스럽다)
      · `isinstance(x, str)` · `x == "auth_failed"` → 그대로 (사유를 읽는 쪽도 산다)
    **호출부가 앞으로 늘어나도 같은 사고가 안 난다** — 규율이 아니라 타입이
    막는다(§2-5a "경계를 구조로 만드는 것").

    [왜 예외가 아닌가] 예외로 올리면 `infer`가 `why`를 갈라 적을 수 없고,
    골든셋 재료 수집처럼 **없으면 건너뛰면 그만인** 자리까지 죽는다.
    """

    __slots__ = ()

    def __bool__(self) -> bool:
        return False


def get_pending_replenishments() -> list[dict]:
    """지금 par 밑이라 **보충 대기 중인 매대 전부**. 매장 단위 집계다.

    [왜 SKU 하나가 아니라 전부인가] 가용예측 모델의 입력 절반이 **큐 상태**다 —
    "내 앞에 몇 건이 밀려 있고 그것들이 얼마나 걸릴 일인가". 그건 SKU 하나를
    봐서는 알 수 없다. `get_inventory(sku_id)`로는 만들 수 없는 유일한 값이다.

    [없으면 얼마나 나쁜가 — 실측] 큐 5칸을 빼고 다시 학습해 봤다(08-25):
        전체(83열)       Brier 0.04064
        큐 제거(78열)    Brier 0.07507   ← 85% 악화. 규칙 바닥(0.1248)에 가까워진다
    **중앙값으로 채워 넣으면 "그럴듯한 거짓"이 된다.** 그래서 이 창구가 없으면
    infer가 확률을 안 내고 "시간을 지어내지 마세요"로 답한다.

    [반환] [{sku_id, location_id, floor_no, has_bulk, queued_at}, …]
      has_bulk : 바로 위 BULK에 재고가 있나 → **경로유형**이 여기서 갈린다.
                 있으면 수직(백룸에서 내려 채움·빠름), 없으면 수평/층간(느림).
      queued_at: par 밑으로 떨어진 시각. 대기 시간의 원점.

    ✅ **08-27 구현 확인**(요청 ③ — `InternalReplenishmentController`). 응답 다섯 칸이
      우리 매핑과 1:1 이고, 부탁한 "큐가 없어도 200 []"(404 아님)까지 지켜져 있다.

    [반환이 세 갈래인 이유] 0건과 미지원을 구분해야 하므로 예외를 삼키지 않는다:
      list  정상 (빈 리스트 = 진짜 대기 0건)
      None  창구 없음(404)
      Unavailable("auth_failed" | "sot_unreachable") — 우리 쪽 설정·통신 문제.
            **거짓으로 평가되는 str** 이라 `or []`·`if not` 관용구가 그대로 산다
    ⚠ `queuedAt` 은 null 이 올 수 있다(BELOW_PAR 이벤트가 없으면 — 백엔드 DTO 주석).
      지금 infer 는 이 값을 특징으로 쓰지 않아 무해하지만, 나중에 대기시간을
      특징에 넣는다면 **null 이 0 이 되지 않게** 해야 한다.
    """
    if not config.USE_MOCK_SOT:
        # ⚠ **실패를 가려서 잡는다 — 08-27 B 검수 지적.**
        #   전에는 `except Exception: return None` 으로 모든 실패를 "창구 없음"으로
        #   뭉갰다. 창구가 실제로 없던 동안(요청 ③ 구현 전)은 맞는 근사였지만
        #   이제는 창구가 있다 — 그 상태에서 **키가 틀려 401이 와도** 에이전트가
        #   *"보충 대기를 조회할 창구가 아직 없습니다"* 라고 **사용자에게 거짓**을
        #   말한다. 원인은 인증인데 화면에는 미구현이라 뜨니 아무도 못 고친다.
        #
        #   그래서 셋을 가른다:
        #     404          창구 없음        → None ("모른다" — infer 가 시간을 안 말한다)
        #     그 외 실패    통신·인증 오류    → 예외를 그대로 올린다
        #                                     (query.py 원칙 ④가 값으로 바꿔 LLM 이
        #                                      "지금 조회가 안 된다"로 착지하고,
        #                                      로그에는 진짜 원인이 남는다)
        #   404 도 "모른다"인 것은 같지만, **왜 모르는지**가 로그에서 갈린다.
        try:
            rows = _http_get(_API["pending_replenish"], headers=_internal_headers())
        except Exception as e:                             # noqa: BLE001
            # 원인을 **문자열로 갈라** 돌려준다. 셋 다 확률을 안 내는 것은 같지만
            # infer 가 `why` 를 다르게 적어야 운영자가 원인을 안다.
            #   404      창구 없음        (지금 문구 그대로)
            #   401·403  키·권한 — 우리 설정 문제
            #   그 외     백엔드 미기동·타임아웃
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status == 404:
                return None
            reason = "auth_failed" if status in (401, 403) else "sot_unreachable"
            print(f"[sot] pending 조회 실패 {reason}"
                  f"({status or type(e).__name__}): {e}")
            return Unavailable(reason)
        return [{"sku_id": r.get("skuId"), "location_id": r.get("locationId"),
                 "floor_no": r.get("floorNo"), "has_bulk": bool(r.get("hasBulk")),
                 "queued_at": r.get("queuedAt")}
                for r in (rows if isinstance(rows, list) else rows.get("items", []))]

    # mock: PICK 매대 중 재고가 min_qty 밑인 것을 훑는다. 실물 백엔드가 할 일과
    # 같은 판정이다 — par는 SHELF_CONFIGS에, 현재 수량은 STOCKS에 있다.
    out = []
    for (sku, loc), cfg in mock_data.SHELF_CONFIGS.items():
        qty = mock_data.STOCKS.get((sku, loc))
        if qty is None or qty >= cfg["min_qty"]:
            continue
        meta = mock_data.LOCATIONS.get(loc, {})
        # 같은 sku의 BULK 자리에 재고가 남았나 — 경로유형이 여기서 갈린다.
        has_bulk = any(q > 0 for (s2, l2), q in mock_data.STOCKS.items()
                       if s2 == sku and mock_data.LOCATIONS.get(l2, {}).get("tier_role") == "BULK")
        out.append({"sku_id": sku, "location_id": loc,
                    "floor_no": meta.get("floor_no"), "has_bulk": has_bulk,
                    # mock에는 par 밑으로 떨어진 시각 기록이 없다. 데모 현재시각을
                    # 그대로 쓴다 — 대기 0으로 보는 셈이라 **낙관 쪽**이고, 그 사실을
                    # 여기 적어 둔다(실물이 붙으면 진짜 시각이 온다).
                    "queued_at": config.DEMO_NOW.isoformat(sep=" ")})
    return out


def resolve_location(location_id: str) -> dict | None:
    """location_id → {floor_no, x, y}. 동선 계산의 출발점 해석용(mock 전용).

    실물 모드에서 None을 돌려주는 이유: 실물의 출발점은 location_id가 아니라
    get_position이 주는 사람의 좌표 3종이다 — 매대 id로 사람 위치를 흉내내는 건
    mock에서만 허용되는 근사다. compute.py가 None을 받으면 좌표를 요구하는
    오류를 값으로 돌려 LLM이 get_position부터 부르게 유도한다.
    """
    if not config.USE_MOCK_SOT:
        return None
    loc = mock_data.LOCATIONS.get(location_id)
    if loc is None:
        return None
    return {"floor_no": loc["floor_no"], "x": loc["x"], "y": loc["y"]}


def get_floor_map(floor_no: int) -> dict | None:
    """층 하나의 보행 격자 — GET /api/map/floors/{n} (공개 조회).

    반환 {"floorNo": n, "cells": [{"x","y","passable","transitId"}, …], "zones": […]}.
    위치 추정(infer.get_position)의 **스냅 재료**다. 격자의 정본은 백엔드
    nav_cells 하나뿐이고(world_gen.py: "동선 솔버와 위치 스냅이 같은 격자를
    봐야 한다"), 우리가 sim에서 따로 구우면 지도가 두 벌이 되어 프론트가
    그리는 매장과 에이전트가 아는 매장이 갈린다.

    [언제 불리나] lifespan에서 층별 1회 — 층당 7,125칸(95×75)이라 요청마다
    받으면 그게 병목이다. 상주 캐시는 infer._STATE가 맡는다(헌법 6과 같은 규율).

    [mock] None — mock 세계에는 격자가 없다(LOCATIONS 좌표는 근사 소품).
    스냅은 실물 전용이고, mock의 get_position은 앵커를 그대로 돌려준다.
    """
    if config.USE_MOCK_SOT:
        return None
    return _http_get(_API["floor_map"].format(floor_no=int(floor_no)))


def get_navigation_route(start_floor: int, start_x: int, start_y: int,
                         stops: list[dict], *, escalators_only: bool = False) -> dict:
    """백엔드 A* 경로 계산기 호출 — 동선 계산(optimize_route)의 실물 비용 원천.

    stops = [{"skuId": 101042, "label": "물티슈"}, …]. **순서를 바꾸지 않는다** —
    방문 순서는 우리 솔버(compute.py)가 정하고, 백엔드는 그 순서의 실제 보행
    경로(장애물·무빙워크 반영)와 거리만 계산한다. 역할 분담: 순서는 최적화
    문제(우리 몫), 경로는 지도 문제(지도를 가진 백엔드 몫).

    mock 모드에서 부르면 즉시 예외 — compute.py가 mock에서는 좌표 휴리스틱을
    쓰기로 되어 있어, 여기 도달한 것 자체가 분기 버그다. 조용히 빈 값을 주면
    그 버그가 "경로 없음"으로 위장되므로 시끄럽게 죽는 쪽을 고른다.
    """
    if config.USE_MOCK_SOT:
        raise RuntimeError("mock 모드에서는 백엔드 경로 계산을 부르지 않는다 (compute.py의 분기 버그)")
    return _http_post(_API["navigation_route"], {
        "startFloor": int(start_floor), "startX": int(start_x), "startY": int(start_y),
        "stops": stops, "escalatorsOnly": escalators_only,
    })


def get_navigation_matrix(start: dict, stops: list[dict]) -> dict:
    """장보기 솔버용 실제 보행 비용. 표시 경로와 같은 ESC 정책을 강제한다.

    백엔드 한 요청 안에서 지도 스냅샷을 재사용한다. 상품마다 HTTP 왕복을
    n²번 하는 대신 좌표 후보 전체를 한 번 보내며 null 비용은 단절로 보존한다.
    """
    return _http_post("/api/navigation/matrix", {
        "startFloor": start["floorNo"], "startX": start["x"], "startY": start["y"],
        "stops": stops, "escalatorsOnly": True,
    })


def push_proactive_message(session_id: str, content: str) -> dict:
    """자발형 발화를 백엔드에 전달한다 — 저장·프론트 SSE 중계는 백엔드가 한다.

    [경로] 감시자 → (예절·가드 통과한) 문장 → 여기 → POST /internal/chat/proactive
           → 백엔드가 chat_message 저장 + /api/realtime/stream으로 프론트에 밀어줌.
    ⚠ 백엔드 제약(ai-server PROACTIVE_README에서 인수): 그 sessionId의
    chat_session이 이미 있어야 저장된다. 프론트가 장보기 세션 시작 때 채팅
    세션을 만들어 두는 흐름이 전제다.

    [mock] 네트워크 없이 print로 흘리고 성공 모양을 돌려준다 — 감시자·예절·
    가드의 오프라인 스모크가 이 지점까지 실제 코드로 통과할 수 있게.
    """
    if config.USE_MOCK_SOT:
        print(f"[proactive:mock] session={session_id} :: {content}")
        return {"ok": True, "mock": True}
    # ⚠ 09-02 시연 점검에서 잡힘 — 백엔드는 200 에 저장된 메시지 자체
    # ({"messageId": 78, "sender": "AI_PROACTIVE", ...})를 돌려준다. "ok" 키가
    # 없으므로 그대로 넘기면 dispatch 가 **전달된 발화를 "전달 실패"로** 적고
    # 예절 장부(etiquette.record)와 감시자 상태 비우기(on_delivered)를 건너뛴다
    # — 사안당 1회·총량 상한이 안 깎여 같은 브리핑이 다음 스캔에 또 나갈 수 있다.
    # 여기서 모양을 통일한다: 성공이면 ok=True 와 message_id, 실패(4xx·5xx·통신)면
    # ok=False 와 사유. dispatch 는 ok 만 본다.
    import httpx                       # 이 파일의 관례 — 의존성은 쓰는 자리에서 (158행)
    try:
        body = _http_post(_API["push_proactive"],
                          {"sessionId": session_id, "content": content},
                          headers=_internal_headers())
    except httpx.HTTPStatusError as e:
        # 404 = 그 sessionId 의 chat_session 이 없다(프론트가 세션을 안 만들었다).
        return {"ok": False, "status": e.response.status_code,
                "reason": e.response.text[:200]}
    except httpx.HTTPError as e:
        return {"ok": False, "status": None, "reason": f"{type(e).__name__}: {e}"}
    message_id = body.get("messageId") if isinstance(body, dict) else None
    return {"ok": True, "message_id": message_id, "raw": body}


def get_product_cards(sku_ids: list[int]) -> list[dict]:
    """Screen-only projection: retain image/lifecycle without exposing them to tool text."""
    if config.USE_MOCK_SOT:
        return get_products_by_skus(sku_ids)
    rows = _http_get(_API["get_products_by_skus"], {"skuIds": sku_ids}) if sku_ids else []
    return [dict(_norm_product(r), image_url=r.get("imageUrl"),
                 discontinued=r.get("discontinued", False), lifecycle_status=r.get("lifecycleStatus")) for r in rows]
