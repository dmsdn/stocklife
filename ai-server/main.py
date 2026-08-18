"""StoreFlow AI server entry point.

AI 서버는 DB에 직접 접속하지 않고 Spring Boot 백엔드 REST API를 통해서만
상품/장바구니/주문/이벤트 데이터를 읽고 쓴다.
"""

from fastapi import FastAPI

from agent_chat import router as agent_chat_router
from ai_agent_shop import router as ai_agent_shop_router
from ai_search import router as ai_search_router

app = FastAPI(title="StoreFlow AI")
app.include_router(ai_search_router)
app.include_router(ai_agent_shop_router)
app.include_router(agent_chat_router)


@app.get("/")
def health_check():
    return {"status": "ok", "message": "StoreFlow AI server is running"}
