# ============================================================================
# StoreFlow 하네스 — HTTP 입구 (FastAPI 앱, 실행계획 A단계 08/16)
# ============================================================================
# [역할] 하네스를 세상에 노출하는 유일한 문. 백엔드(Spring Boot)가 이 서버의
#   /agent/chat 을 부르고, 우리는 루프를 돌리고 가드로 검수한 답을 돌려준다.
#     프론트 → 백엔드 /api/chat → (여기) /agent/chat → 응답 반환
#
# [왜 이 파일은 이렇게 얇은가] 루프(loop.py)와 가드(guard.py)가 서버 없이도
#   돌 수 있어야 골든셋 러너가 HTTP를 거치지 않고 직접 채점한다. 그래서 이
#   파일은 "HTTP ↔ 파이썬 함수" 변환과 **차단 후 정책**만 갖는다.
#
# [가드 차단 정책 ⓒ — 위반 종류로 갈린다 (08/18 확정)]
#   guard.check()는 판정만 하고 정책을 정하지 않는다(그 파일의 경계). 정책은 여기다:
#     · web_only     → 1회 재생성. 근거가 원장에 있으니 다시 쓰면 맞출 수 있다.
#     · unsupported  → 안전 문구로 대체. 근거 자체가 없다 — 다시 시켜도 지어낼 뿐.
#     · 재생성 후에도 위반 → 안전 문구 (무한 재생성 방지).
#   [재생성 안전조건] 첫 패스에서 **장바구니를 건드렸다면(actions 있음) 재생성하지
#   않는다.** 루프를 다시 돌리면 LLM이 add_to_cart를 또 부를 수 있고, 그러면
#   같은 상품이 **두 번 담긴다** — 잘못된 발화보다 잘못된 상태 변경이 더 나쁘다.
#
# [안 하는 일 — 경계]
#   · 세션 저장 → 백엔드(채팅 이력 테이블). 우리는 요청에 실려 온 history만 쓴다.
#   · 자발형 SSE(/agent/stream)·행동 신호 수신(/agent/event) → 08/29 감시자와 함께.
#   · 트레이스·원장을 응답에 싣지 않는다 — 소비자 프론트에 내부 장부가 보이면
#     안 되고(헌법 7의 정신), 백엔드 DTO 계약({reply, actions})에도 없다.
# ============================================================================
#
# ─── 개념 사전 — 이 파일에 처음 나오는 개념 6개 (㊷~㊼) ──────────────────────
# (①~㊶: 앞 파일들의 사전은 아는 것으로 전제)
#
# ㊷ 파일 읽기 — open()과 with
#    with open(경로, encoding="utf-8") as f:  로 파일을 열면, 블록이 끝날 때
#    파이썬이 **알아서 닫아준다**(에러가 나도 닫는다). with 없이 f = open(...)만
#    쓰면 닫는 것을 잊기 쉽고, 안 닫힌 파일은 OS 자원을 붙들고 있는다.
#    `for line in f:` = 파일을 한 줄씩 읽으며 도는 관용구.
#
# ㊸ 데코레이터 — @이름
#    함수 정의 바로 위의 @app.post("/agent/chat")는 "방금 정의한 이 함수를
#    app에 등록해라: POST /agent/chat 이 오면 이 함수를 불러라"는 뜻이다.
#    데코레이터 = 함수를 받아 무언가를 덧붙여 돌려주는 함수. 우리는 만들 일보다
#    프레임워크가 준 것을 **붙여 쓸** 일이 훨씬 많다.
#
# ㊹ pydantic BaseModel — 타입 힌트가 강제력을 갖는 자리
#    지금까지의 타입 힌트(개념 ④)는 "표시일 뿐 강제는 아니"었다. pydantic 모델
#    안에서는 다르다 — FastAPI가 요청 JSON을 이 모델로 **검증**해서, message가
#    빠졌거나 consumerId가 숫자가 아니면 우리 코드에 닿기 전에 422 에러를 돌려준다.
#    잘못된 입력을 손수 검사하는 코드가 통째로 사라진다.
#    Field(default_factory=list): 기본값이 리스트처럼 **변할 수 있는 값**이면
#    이렇게 쓴다. `= []`로 쓰면 모든 요청이 같은 리스트 하나를 공유하는 함정이 있다.
#
# ㊺ lifespan — 서버의 시작과 끝에 끼어드는 자리
#    @asynccontextmanager를 붙인 함수에서 yield 앞은 **서버가 뜰 때 한 번**,
#    yield 뒤는 **내릴 때 한 번** 실행된다. 헌법 6("모델은 1회 로드 상주")의
#    "1회"가 물리적으로 실행되는 자리가 바로 yield 앞이다. A단계에는 로드할
#    모델이 없어 자리만 잡아둔다 — C단계에 infer.py의 상주 객체가 여기 들어온다.
#
# ㊻ def vs async def 핸들러 — 이벤트 루프를 막지 마라
#    FastAPI는 async def 핸들러를 **이벤트 루프**(한 줄로 모든 요청을 처리하는
#    회전판) 위에서 직접 돌리고, def 핸들러는 **스레드풀**(별도 일꾼들)에 맡긴다.
#    우리 루프는 anthropic·httpx의 **동기(blocking) 클라이언트**를 쓴다 — LLM
#    호출 한 번에 수 초를 그냥 서서 기다린다. 이것을 async def 안에서 하면
#    회전판이 통째로 멈춰 **다른 모든 요청이 같이 멈춘다.** 그래서 여기는 def가
#    맞다. (헌법 6의 "API 호출 라우터만 async def"는 **진짜 비동기 클라이언트를
#    쓸 때** 얘기다 — 동기 코드를 async에 넣는 것이 최악의 조합이다.)
#
# ㊼ if __name__ == "__main__": — "직접 실행했을 때만"
#    파이썬 파일은 import될 때도 위에서 아래로 실행된다. __name__은 "내가 어떻게
#    불렸나"를 담는 내장 변수로, 직접 실행하면 "__main__", import되면 모듈
#    경로가 된다. 이 조건이 없으면 골든셋 러너가 main을 import하는 순간
#    uvicorn 서버가 떠버린다.
# ────────────────────────────────────────────────────────────────────────────

import os

# ── .env 적재 ───────────────────────────────────────────────────────────────
# ⚠ **config 보다 먼저다 — 08-26에 순서를 뒤집었다.**
#   전에는 `from app import config` 가 위에 있고 주석이 "언제 불러도 안전"이라
#   적혀 있었다. config 가 순수 상수뿐이던 시절엔 맞는 말이었다. 그런데
#   USE_MOCK_SOT 을 환경변수로 덮을 수 있게 바꾸면서 config 가 **import 시점에
#   os.environ 을 읽게** 됐다 — 그 순간 "언제 불러도 안전"이 거짓이 됐다.
#   .env 를 나중에 읽으면 config 는 이미 기본값(mock=True)으로 얼어붙는다.
#   실제로 `.env` 에 USE_MOCK_SOT=false 를 넣었는데 서버가 mock 으로 떴다.
#   → **환경을 읽는 모듈은 환경이 채워진 뒤에 import 한다.** 이것이 규칙이고,
#     config 에 env 를 하나라도 넣는 순간 config 도 그 규칙의 대상이 된다.
# 로더(load_env)는 app/env.py에 산다 — 하네스의 입구가 둘(서버=여기, 평가=러너)
# 이라, 준비 코드를 한쪽 입구에 두면 다른 입구가 빠뜨린다. 실제로 08-20 첫
# 실호출 때 러너가 키를 못 읽어 인증 오류로 전멸했다(경위는 env.py 머리 주석).
# 두 입구가 같은 함수를 **명시적으로** 부른다 — 이 한 줄이 보이는 것이 곧 문서다.
from app.env import load_env, use_utf8_stdout

# ⚠ 로그보다 먼저 부른다. 윈도우 콘솔은 cp949라 한글 로그의 `—`에서
#   UnicodeEncodeError 가 나고, 그게 광범위 except 안에서 터지면
#   **개입이 통째로 사라지면서 원인도 안 남는다**(08-26 실측 · env.py 주석).
use_utf8_stdout()
load_env()

from app import config                                          # noqa: E402

# ── .env를 읽은 "뒤"에 불러야 하는 것들 ─────────────────────────────────────
# import가 위아래로 갈라진 이유(보통은 전부 맨 위에 모은다):
# action.py가 **import되는 순간** os.environ에서 INTERNAL_SERVICE_KEY를 읽는다.
# loop → action 순으로 딸려 오므로, .env 적재가 이 import보다 먼저여야 한다.
# 순서를 바꾸면 키가 빈 문자열로 굳어 모든 담기가 no_service_key로 실패한다.
from contextlib import asynccontextmanager     # noqa: E402

from fastapi import FastAPI                    # noqa: E402
from pydantic import BaseModel, Field          # noqa: E402

from app import guard, loop                    # noqa: E402
from app import searchterm                     # noqa: E402
from app.tools import definitions, infer       # noqa: E402


# ── 요청·응답 모양 (백엔드 DTO 계약 — jmy ChatService와 합의된 형태) ─────────
# 필드 이름이 camelCase인 이유: 자바 쪽 DTO가 그 표기라서다. 우리가 snake_case로
# 바꾸면 백엔드가 보낸 JSON의 키와 안 맞아 검증에서 전부 탈락한다.
class HistoryItem(BaseModel):                                  # ㊹
    role: str                    # "user" 또는 "assistant"
    content: str


class ChatRequest(BaseModel):
    sessionId: str
    consumerId: int | None = None        # 비회원이면 null로 온다
    message: str
    history: list[HistoryItem] = Field(default_factory=list)   # ㊹ 변할 수 있는 기본값
    # ── 현재 위치 (2026-08-25 추가) ──────────────────────────────────────
    # 마지막 스캔 좌표. 경로 도구의 **기본 출발점**으로 주입된다(compute.set_position).
    # ⚠ **선택 필드다.** 백엔드가 아직 안 보내도 기존 요청이 그대로 통과한다 —
    #   pydantic은 기본값이 있는 칸을 요구하지 않는다. 그래서 계약을 깨지 않고
    #   먼저 자리를 만들어 둘 수 있다(백엔드 합의 전에 우리 쪽만 준비).
    # 셋 중 하나라도 없으면 위치 없음으로 본다 — 반쪽 좌표로 경로를 짜면
    # "같은 층 아무 데나"에서 출발한 답이 나온다(compute.set_position 주석).
    posFloor: int | None = None
    posX: int | None = None
    posY: int | None = None
    # ⚠ **앵커의 나이**(초). 08-28에 신뢰 등급을 넣으면서 빠뜨렸다.
    #   `get_position`이 나이로 등급을 가르는데(high/medium/low) 이 칸이 없어
    #   `age_sec`가 늘 None이었고, 그러면 등급이 **영원히 medium 하나**다.
    #   `high`(방금 스캔 — 단정 가능)와 `low`(오래됨 — 되묻기)가 **실서비스에서
    #   도달 불가능**했다. 등급을 만들어 놓고 그 등급이 안 나오는 상태였다.
    #
    #   [왜 시각이 아니라 나이인가] 시각으로 받으면 프론트와 서버의 시계가
    #   어긋날 때 나이가 틀어진다. **경과 시간은 한 기계 안에서 재므로**
    #   시계 동기화가 필요 없다 — 프론트가 자기 스캔 이후 흐른 초를 센다.
    posAgeSec: float | None = None


class ChatResponse(BaseModel):
    reply: str
    actions: list[dict] = Field(default_factory=list)


# ── 앱과 lifespan ───────────────────────────────────────────────────────────
@asynccontextmanager                                           # ㊺
async def lifespan(app: FastAPI):
    # yield 앞 = 서버가 뜰 때 1회. **헌법 6의 "모델 1회 로드 상주"가 여기다.**
    # 08-25에 자리가 채워졌다 — infer.load_all()이 Agent/app/artifacts/의 출하물을
    # 올린다. 요청 핸들러 안에서 로드하면 매 요청마다 수백 MB를 읽어 응답이 초
    # 단위로 늘어진다.
    # ⚠ 사진 인코더(SigLIP2 3.5GB)는 **선택 적재**다. 갤러리(10MB)만 올리면
    #   검색은 못 하고, 인코더까지 올려야 사진을 임베딩할 수 있다.
    #   데모에서 사진 기능을 안 쓰는데 3.5GB를 상주시킬 이유가 없다.
    # ⚠ 하나가 실패해도 나머지는 올라온다(load_all이 자산별로 감싼다). 실제로
    #   08-25에 sklearn 버전 차이로 소비주기 하나가 안 열렸다 — 그때 서버 전체가
    #   못 뜨면 안 된다.
    loaded = infer.load_all(with_photo_encoder=config.LOAD_PHOTO_ENCODER)
    for _k, _v in loaded.items():
        print(f"[agent] 출하물 {_k:14s} {_v}")
    if not loaded:
        print("[agent] ⚠ 출하물이 하나도 없습니다 — 추론 도구가 전부 "
              "'준비 안 됨'으로 답합니다. models/*_ship.py 를 돌리세요.")

    # 검색어 후보정 색인(08-28). 자모 색인 29KB짜리 표라 추론 자산과 성격이
    # 달라 load_all 에 안 넣었다 — 저것은 모델이고 이것은 사전이다.
    # 없어도 서버는 뜬다. 그때는 오타가 그냥 0건으로 돌아갈 뿐이다.
    print(f"[agent] 검색어 색인   {searchterm.load()}")

    print(f"[agent] 기동 — mock={config.USE_MOCK_SOT} · port={config.AGENT_PORT} · "
          f"도구 {len(definitions.TOOLS)}+서버 {len(definitions.SERVER_TOOLS)} · "
          f"LLM키={'있음' if os.environ.get('ANTHROPIC_API_KEY') else '**없음**'} · "
          f"내부키={'있음' if os.environ.get('INTERNAL_SERVICE_KEY') else '없음(액션 불가)'}")

    # 자발형 감시자 기동. asyncio.create_task = 이 코루틴을 "배경에서 돌려라"로
    # 등록만 하고 지나간다 — await로 기다리면 감시자가 무한 루프라 서버가 영영
    # 안 뜬다. 모드 분기는 runner.run() 안에 있다(mock 이면 SSE 없이 틱만).
    #
    # ⚠ 08-27 전에는 여기가 `behavior.run()` 이었다. 감시자가 셋이 되면서
    #   **구동부**(SSE 분배 + 주기 틱 + 스테이지 배출)를 `watchers/runner.py` 로
    #   올렸다. 그때 드러난 것: 옛 `behavior.run()` 은 없는 함수를 부르고 있었고
    #   `dispatch.pump()` 를 부르는 곳이 아무 데도 없어 **자발형이 통째로 죽어
    #   있었다.** 08-26 스테이징 개편이 구동 루프를 데려간 자리다.
    import asyncio
    from app.watchers import runner
    watcher_task = asyncio.create_task(runner.run(), name="watchers")

    yield

    # 내려가는 길: 감시자에게 종료 신호를 주고, 일감이 정리될 때까지 기다린다.
    # cancel까지 부르는 이유: stop 신호만으로는 SSE 수신 대기(await) 한가운데를
    # 못 깨울 수 있다 — 신호(협조 종료)와 취소(강제 종료)를 순서대로 쓴다.
    runner.stop()
    watcher_task.cancel()
    try:
        await watcher_task
    except asyncio.CancelledError:
        pass                            # 취소로 끝난 것은 정상 종료다
    print("[agent] 종료")                    # yield 뒤 = 내릴 때 1회


# title은 /docs·/openapi.json에 뜨는 이름. 문자열을 여기 박지 않고 config에서
# 받아오는 이유는 값이 길어서가 아니라, **이름이 결정 사항**이기 때문이다 —
# 팀이 이 프로세스를 뭐라 부를지는 config 한 곳에서 바뀌어야 한다(config.SERVICE_NAME 주석).
app = FastAPI(title=config.SERVICE_NAME, lifespan=lifespan)

# ── 프론트 직행 창구 3종 (09-01) ────────────────────────────────────────────
# 백엔드 `AiProxyController` 가 릴레이하는 `/api/ai/search`·`/api/products/
# {id}/alternatives`·`/api/ai/photo-search`. **설계서 §4.3 의 워크플로 경로**라
# 아래 `/agent/chat`(에이전트 경로)과 통로가 다르다 — 그래서 파일도 다르다.
# 이 줄이 없으면 세 경로가 전부 404 이고, 백엔드는 500 으로 감싸 프론트에
# 넘긴다(즉 **화면에서는 "AI 가 고장났다"로 보인다**).
from app import routes_frontend                                # noqa: E402
app.include_router(routes_frontend.router)


# ── 차단 시 안전 문구 ───────────────────────────────────────────────────────
# prompts.py의 "지금 안 되는 것" 화법과 같은 결 — 범위 밖("제 담당이 아니라서")으로
# 포장하지 않는다. 손님이 잠시 뒤 다시 물어볼 수 있어야 한다.
SAFE_REPLY = "죄송해요, 지금 정확한 정보를 확인하기 어렵네요. 잠시 뒤 다시 물어봐 주시겠어요?"

# 재생성 때 루프에 넣을 교정 지시. 사용자 발화가 아니라 검수 계층의 지시임을
# 괄호로 표시한다 — 이 문구는 대화 이력에 남지 않는다(응답만 돌려주므로).
_RETRY_MSG = {
    "web_only": ("(검수) 방금 답변의 일부 수치는 웹 검색에서 온 값이라 우리 매장의 사실이 "
                 "아닙니다. 재고·가격·위치·보충 시각은 반드시 매장 도구 결과의 값만 사용해서 "
                 "같은 질문에 다시 답해 주세요."),
    "contradicts_ledger": ("(검수) 방금 답변이 도구 결과와 반대로 말했습니다. 매대가 비어 있어도 "
                           "예비 재고가 있으면 품절이 아니라 '곧 채워진다'로 안내해야 합니다. "
                           "도구 결과를 다시 보고 같은 질문에 답해 주세요."),
}


@app.post("/agent/chat", response_model=ChatResponse)          # ㊸
def agent_chat(body: ChatRequest) -> ChatResponse:             # ㊻ def — 동기 루프를 돌리므로
    """반응형 대화의 전부. 루프 → 가드 → (정책 ⓒ) → 응답.

    [입력] body: 백엔드가 JWT 검증을 마치고 넘긴 요청 (consumerId는 믿어도 된다)
    [출력] {reply, actions} — 백엔드 DTO 계약 그대로
    """
    # pydantic 모델 → 평범한 dict 리스트로. 루프는 프레임워크를 모르는 순수
    # 파이썬이라(그래야 골든셋 러너가 직접 부른다) 모델 객체를 넘기지 않는다.
    history = [h.model_dump() for h in body.history]

    # 위치 셋이 다 있을 때만 튜플로 넘긴다. 하나라도 없으면 None —
    # 판정을 여기서 한 번에 하고 아래로는 "있다/없다"만 내려보낸다.
    # 좌표 셋이 다 있을 때만 튜플로 넘긴다. 나이는 **없어도 된다** —
    # 없으면 compute._confidence가 medium(안전한 쪽)으로 둔다.
    pos = ((body.posFloor, body.posX, body.posY, body.posAgeSec)
           if None not in (body.posFloor, body.posX, body.posY) else None)

    result = loop.run_chat(body.message, consumer_id=body.consumerId,
                           session_id=body.sessionId, history=history,
                           position=pos)

    verdict = guard.check(result["reply"], result["ledgers"])
    if verdict["ok"]:
        return ChatResponse(reply=result["reply"], actions=result["actions"])

    # ── 여기부터 정책 ⓒ ────────────────────────────────────────────────────
    # 위반 사유들을 집합으로 모은다. **고칠 재료가 원장에 있는 실패**만 재생성한다.
    #   web_only           — 값이 web 원장에 있다. sot를 보고 다시 쓰면 맞출 수 있다
    #   contradicts_ledger — 숫자는 맞는데 의미가 반대. 근거가 있으니 다시 쓰면 된다
    #   unsupported        — 근거 자체가 없다. 다시 시켜도 지어낼 뿐이라 재생성 무의미
    reasons = {v["reason"] for v in verdict["violations"]}
    RETRYABLE = {"web_only", "contradicts_ledger"}

    # 재생성 조건: ① 사유가 전부 재생성 가능(unsupported가 섞이면 안 됨)
    # ② 첫 패스에서 상태 변경 없음(재실행해도 중복 담기가 안 생김).
    if reasons and reasons <= RETRYABLE and not result["actions"]:
        # 실패한 문답을 이력에 붙이고 교정 지시를 새 발화로 — loop.py를 고치지
        # 않고 재생성을 구현하는 방법이다(루프에 재시도 전용 인자를 늘리지 않는다).
        retry_history = history + [
            {"role": "user", "content": body.message},
            {"role": "assistant", "content": result["reply"]},
        ]
        # 사유에 맞는 교정 지시를 고른다 — "웹 값을 썼다"와 "의미가 반대다"는
        # 고칠 방향이 다르므로, 뭉뚱그린 한 문장보다 사유별 문구가 잘 먹는다.
        # 둘 다 걸렸으면 web_only 쪽을 쓴다(사실 출처 문제가 더 무겁다).
        msg = _RETRY_MSG["web_only"] if "web_only" in reasons else _RETRY_MSG["contradicts_ledger"]
        retry = loop.run_chat(msg, consumer_id=body.consumerId, position=pos,
                              session_id=body.sessionId, history=retry_history)
        if guard.check(retry["reply"], retry["ledgers"])["ok"]:
            return ChatResponse(reply=retry["reply"], actions=retry["actions"])
        result = retry            # 재생성도 실패 → 아래 안전 문구로 (그 패스의
                                  # actions를 보존해야 프론트 화면이 실상과 맞는다)

    # 안전 문구로 대체하되 actions는 그대로 — 이미 일어난 상태 변경(담기 성공)을
    # 프론트에 숨기면 화면과 장바구니가 어긋난다. 발화만 바꾸고 사실은 전한다.
    return ChatResponse(reply=SAFE_REPLY, actions=result["actions"])


@app.get("/health")
def health() -> dict:
    """살아 있음 + 지금 어떤 모드인가. 백엔드·프론트가 연동 전에 찔러보는 곳."""
    # 출하물 상태를 같이 준다(08-26). 없으면 추론 도구가 전부 "준비 안 됨"으로
    # 답하는데, 그때 프론트·백엔드가 보는 첫 화면이 여기라 원인이 바로 보여야 한다.
    # (기동 로그에도 찍히지만 로그는 --log-level 에 묻히고 지나가면 사라진다)
    from app.tools import infer
    return {"ok": True, "mock_sot": config.USE_MOCK_SOT,
            "tools": len(definitions.TOOLS), "model": config.LLM_MODEL,
            "assets": infer.loaded(),
            "search_index": searchterm.count()}


# ── 직접 실행 (개발용) ──────────────────────────────────────────────────────
if __name__ == "__main__":                                     # ㊼
    import uvicorn
    # reload=True: 파일을 저장하면 서버가 스스로 재시작한다(개발 편의).
    # 문자열 "app.main:app"으로 주는 이유 — reload가 새 프로세스에서 앱을 다시
    # import해야 해서, 객체가 아니라 "찾아가는 주소"가 필요하다.
    uvicorn.run("app.main:app", host="0.0.0.0", port=config.AGENT_PORT, reload=True)
