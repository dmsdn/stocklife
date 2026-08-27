// storeflow-backend(/api/chat, /api/chat/sessions)와 실제로 연동된 AI 챗.
// 비회원 흐름만 다룬다: 브라우저에 X-Chat-Client-Id(UUID)를 하나 만들어 두고,
// 그 값으로 세션을 만들고(POST /api/chat/sessions) 메시지를 보낸다(POST /api/chat).
// 백엔드가 이 요청을 Agent(FastAPI) 서버로 릴레이해서 실제 답변을 만든다.

const CLIENT_ID_KEY = 'storeflow_chat_client_id';
const SESSION_ID_KEY = 'storeflow_chat_session_id';

function getAnonymousClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

async function getOrCreateSessionId(): Promise<string> {
  const cached = localStorage.getItem(SESSION_ID_KEY);
  if (cached) return cached;

  const res = await fetch('/api/chat/sessions', {
    method: 'POST',
    headers: { 'X-Chat-Client-Id': getAnonymousClientId() },
  });
  if (!res.ok) {
    throw new Error(`POST /api/chat/sessions 실패 (${res.status})`);
  }
  const data: { sessionId: string } = await res.json();
  localStorage.setItem(SESSION_ID_KEY, data.sessionId);
  return data.sessionId;
}

export interface ChatAction {
  [key: string]: unknown;
}

export interface ChatReply {
  reply: string;
  actions: ChatAction[];
}

export async function sendChatMessage(message: string, _retried = false): Promise<ChatReply> {
  const sessionId = await getOrCreateSessionId();
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Chat-Client-Id': getAnonymousClientId(),
    },
    body: JSON.stringify({ sessionId, message }),
  });
  if (!res.ok) {
    // 세션이 서버에서 만료/삭제됐을 수 있으니 한 번은 새 세션으로 재시도한다.
    if (res.status === 404 && !_retried) {
      localStorage.removeItem(SESSION_ID_KEY);
      return sendChatMessage(message, true);
    }
    throw new Error(`POST /api/chat 실패 (${res.status})`);
  }
  const data: { reply: string; actions: ChatAction[] | null } = await res.json();
  return { reply: data.reply, actions: data.actions ?? [] };
}
