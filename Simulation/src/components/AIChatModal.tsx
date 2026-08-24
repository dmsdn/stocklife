import { useState } from 'react';
import Modal from './Modal';

interface ChatMsg {
  from: 'user' | 'bot';
  text: string;
}

interface Props {
  onClose: () => void;
}

// 실제 tool-calling 기반 AI 연동 전 단계의 자리 — 사용자가 뭘 입력하든
// 미리 정해둔 안내 문구로만 응답하는 스텁 챗이다.
export default function AIChatModal({ onClose }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { from: 'bot', text: '안녕하세요! 지금은 준비 중인 기능이라 실제 답변은 아직 못 드려요. (연동 예정)' },
  ]);
  const [input, setInput] = useState('');

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { from: 'user', text },
      { from: 'bot', text: '아직 실제 AI와 연결되지 않은 예시 화면이에요. 곧 상품 위치 안내 기능이 들어올 예정입니다.' },
    ]);
    setInput('');
  };

  return (
    <Modal title="AI 챗 (예정 기능 미리보기)" onClose={onClose}>
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
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: '#3b82f6',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            전송
          </button>
        </div>
      </div>
    </Modal>
  );
}
