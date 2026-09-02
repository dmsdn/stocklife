import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { sendChatMessage } from '../api/chat';

// 8번(AI 마이크 자연어 입력): 브라우저 내장 Web Speech API(SpeechRecognition)를 쓴다 —
// 별도 서버 STT 없이 바로 텍스트로 바꿔서 기존 텍스트 채팅 전송 흐름(sendChatMessage)에
// 그대로 태운다. Chrome 계열만 지원하고 타입 정의가 표준 lib에 없어서 최소한만 선언한다.
interface MinimalSpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => MinimalSpeechRecognition) | null {
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

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
  const [listening, setListening] = useState(false);
  const [micSupported] = useState(() => getSpeechRecognitionCtor() !== null);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
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

  const toggleMic = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = 'ko-KR';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
      if (event.results[event.results.length - 1].isFinal) {
        send(transcript);
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  useEffect(() => {
    // 모달을 닫아도 마이크가 백그라운드에서 계속 듣고 있지 않도록 정리.
    return () => recognitionRef.current?.stop();
  }, []);

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
          {micSupported && (
            <button
              onClick={toggleMic}
              disabled={sending}
              title={listening ? '듣는 중... (다시 눌러 중지)' : '음성으로 말하기'}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: 'none',
                background: listening ? '#ef4444' : '#374151',
                color: '#fff',
                cursor: sending ? 'default' : 'pointer',
              }}
            >
              {listening ? '🔴' : '🎤'}
            </button>
          )}
          <button
            onClick={() => send()}
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
