#===============================================
# Agent 하네스 - HTTP 입구 (FastAPI앱)
#===============================================

import os

from app import config

#===============================================

# .env 로더
def _load_env() -> None:

    path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

_load_env()

# .env를 읽은 뒤에 불러야 하는 것들
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel, Field

from app import guard, loop
from app.tools import definitions

# 요청·응답모양 (백엔드 DTO계약 [ChatService])
class HistoryItem(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    sessionId: str
    consumerId: int | None = None
    message: str
    history: list[HistoryItem] = Field(default_factory=list)

class ChatResponse(BaseModel):
    reply: str
    actions: list[dict] = Field(default_factory=list)

# 앱과 lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[agent] 기동 — mock={config.USE_MOCK_SOT} · port={config.AGENT_PORT} · "
          f"도구 {len(definitions.TOOLS)}+서버 {len(definitions.SERVER_TOOLS)} · "
          f"LLM키={'있음' if os.environ.get('ANTHROPIC_API_KEY') else '**없음**'} · "
          f"내부키={'있음' if os.environ.get('INTERNAL_SERVICE_KEY') else '없음(액션 불가)'}")
    yield
    print("[agent] 종료")

app = FastAPI(title=config.SERVICE_NAME, lifespan=lifespan)

# 차단 시 안전문구
# prompts.py의 "지금 안 되는 것" 화법과 같은 결 — 범위 밖("제 담당이 아니라서")으로 포장하지 않는다. 손님이 잠시 뒤 다시 물어볼 수 있어야 한다.
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

@app.post("/agent/chat", response_model=ChatResponse)
def agent_chat(body: ChatRequest) -> ChatResponse:
    history = [h.model_dump() for h in body.history]

    result = loop.run_chat(body.message, consumer_id = body.consumerId, session_id = body.sessionId, history = history)

    verdict = guard.check(result["reply"], result["ledgers"])
    if verdict["ok"]:
        return ChatResponse(reply=result["reply"], actions = result["actions"])


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
        retry = loop.run_chat(msg, consumer_id=body.consumerId,
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
    return {"ok": True, "mock_sot": config.USE_MOCK_SOT,
            "tools": len(definitions.TOOLS), "model": config.LLM_MODEL}


# ── 직접 실행 (개발용) ──────────────────────────────────────────────────────
if __name__ == "__main__":                                     # ㊼
    import uvicorn
    # reload=True: 파일을 저장하면 서버가 스스로 재시작한다(개발 편의).
    # 문자열 "app.main:app"으로 주는 이유 — reload가 새 프로세스에서 앱을 다시
    # import해야 해서, 객체가 아니라 "찾아가는 주소"가 필요하다.
    uvicorn.run("app.main:app", host="0.0.0.0", port=config.AGENT_PORT, reload=True)