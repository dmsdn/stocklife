# ai-server 능동 개입(HESITATION_HELP)

`Agent/`가 아니라 현재 실사용 중인 `ai-server/`에 독립 구현한 버전입니다.
나중에 최종 Agent로 편입하면 됩니다.

## 동작

Backend SSE `/internal/events/stream` 구독 → VIEW 행동 규칙 감지 → 상품/판매통계 조회 → 조건 충족 시에만 Claude 1회 호출 → Backend `/internal/chat/proactive` → Frontend SSE 말풍선.

기본 규칙:
- 90초 안에 VIEW 3회 이상
- 서로 다른 상품 2개 이상
- 마지막 행동 뒤 12초 무행동
- SCAN_ADD/PURCHASE 발생 시 망설임 상태 취소
- 같은 두 상품 조합은 세션당 1회
- 개입 쿨다운 90초, 세션당 최대 4회

## 환경변수

```text
ANTHROPIC_API_KEY=...
CLAUDE_MODEL=claude-haiku-4-5-20251001
STOREFLOW_API_BASE=http://localhost:8080
INTERNAL_SERVICE_KEY=백엔드와_같은_키
PROACTIVE_ENABLED=true
```

선택 튜닝:

```text
HESITATION_WINDOW_SEC=90
HESITATION_IDLE_SEC=12
HESITATION_MIN_VIEW_EVENTS=3
HESITATION_MIN_DISTINCT_SKUS=2
INTERVENTION_COOLDOWN_SEC=90
INTERVENTION_MAX_PER_SESSION=4
```

## 실행

```powershell
cd ai-server
python -m uvicorn main:app --host 0.0.0.0 --port 8100 --reload
```

주의: Backend의 `/internal/chat/proactive`는 해당 `sessionId`의 chat_session이 이미 존재해야 저장됩니다. 프론트/백엔드에서 장보기 세션 시작 시 채팅 세션을 만들어 두는 방식이 안전합니다.
