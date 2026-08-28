import { useState } from 'react';
import Modal from './Modal';
import { sendChatMessage } from '../api/chat';

interface ChatMsg {
  from: 'user' | 'bot';
  text: string;
}

interface Props {
  onClose: () => void;
}

// storeflow-backend(/api/chat)와 실제로 연동된 AI 챗 — 백엔드가 Agent(FastAPI) 서버로
// 릴레이해서 받은 실제 답변을 보여준다. Agent 서버(agent.base-url)가 안 떠 있으면
// 백엔드가 502/500을 주는데, 그 경우에도 화면이 멈추지 않도록 에러 문구로 대체한다.
export default function AIChatModal({ onClose }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { from: 'bot', text: '안녕하세요! 무엇을 찾으시나요?' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setMessages((prev) => [...prev, { from: 'user', text }]);
    setInput('');
    setSending(true);
    try {
      const { reply } = await sendChatMessage(text);
      setMessages((prev) => [...prev, { from: 'bot', text: reply }]);
    } catch (err) {
      console.error('[AIChatModal] sendChatMessage 실패', err);
      setMessages((prev) => [
        ...prev,
        { from: 'bot', text: 'AI 서버에 연결하지 못했어요. 백엔드/Agent 서버가 켜져 있는지 확인해주세요.' },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal title="AI 챗" onClose={onClose}>
      <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.from === 'user' ? 'flex-end' : 'flex-start',
                background: m.from === 'user' ? '#3b82f6' : '#2a2d35',
                color: '#fff',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 13,
                maxWidth: '85%',
              }}
            >
              {m.text}
            </div>
          ))}
          {sending && (
            <div
              style={{
                alignSelf: 'flex-start',
                color: '#9ca3af',
                fontSize: 12,
                padding: '2px 10px',
              }}
            >
              답변 작성 중...
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="메시지를 입력하세요"
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #333',
              background: '#12141a',
              color: '#e5e7eb',
            }}
          />
          <button
            onClick={send}
            disabled={sending}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: sending ? '#2b3a55' : '#3b82f6',
              color: '#fff',
              cursor: sending ? 'default' : 'pointer',
            }}
          >
            전송
          </button>
        </div>
      </div>
    </Modal>
  );
}
