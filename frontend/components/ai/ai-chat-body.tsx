// components/ai/ai-chat-body.tsx
// ✅ ai-chat.tsx(전체화면), ai-chat-panel.tsx(다이얼로그 패널), app/(main)/ai/page.tsx(라우트)
//   세 곳이 각자 따로 구현하고 있던 "세션 로드 → 메시지 목록 → 입력창 → 전송" 로직을
//   하나로 합쳤습니다. 바깥 레이아웃(전체화면 vs 다이얼로그 vs 라우트 헤더)만 각자 다르게 감싸면 됩니다.
"use client";

import { useEffect, useState } from "react";
import { X, Plus, Mic, Camera, Image as ImageIcon, FileText, Receipt } from "lucide-react";
import { apiFetch, getAccessToken } from "@/lib/api-client";
import { getOrCreateSessionId, setActiveSessionId } from "@/lib/session";
import { getClientId } from "@/lib/client-id";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatBodyProps {
  /** 저장 화면 등에서 특정 과거 세션을 열 때 사용. 없으면 현재 활성 세션(또는 새 세션)을 씀 */
  sessionIdOverride?: string;
  greeting?: string;
  suggestedPrompts?: string[];
}

const DEFAULT_PROMPTS = ["이번주에 장보러 가야해", "집에 세제가 없어", "다이어트 식단 추천해줘"];

function chatHeaders(): Record<string, string> {
  return getAccessToken() ? {} : { "X-Chat-Client-Id": getClientId() };
}

export function AiChatBody({
  sessionIdOverride,
  greeting = "안녕하세요, 무엇을 도와드릴까요?",
  suggestedPrompts = DEFAULT_PROMPTS,
}: AiChatBodyProps) {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachedNote, setAttachedNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (sessionIdOverride) {
          setActiveSessionId(sessionIdOverride);
        }
        const sessionId = await getOrCreateSessionId();
        const messages = await apiFetch<{ sender: string; content: string }[]>(
          `/api/chat/sessions/${sessionId}/messages`,
          { headers: chatHeaders() }
        );
        setTurns(
          messages.map((m) => ({ role: m.sender === "USER" ? "user" : "assistant", content: m.content }))
        );
      } catch {
        setTurns([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdOverride]);

  const handleSend = async (text?: string) => {
    const content = (text ?? message).trim();
    if (!content || sending) return;

    setTurns((prev) => [...prev, { role: "user", content }]);
    setMessage("");
    setSending(true);

    try {
      const sessionId = await getOrCreateSessionId();
      const res = await apiFetch<{ reply: string; actions: Record<string, unknown>[] }>("/api/chat", {
        method: "POST",
        headers: chatHeaders(),
        body: JSON.stringify({ sessionId, message: content }),
      });
      if (res.actions?.length) {
        // TODO: actions 스키마 확정되면 여기서 장바구니/화면 갱신 반영
        console.log("agent actions", res.actions);
      }
      setTurns((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch {
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: "지금은 답변을 가져오지 못했어요. 잠시 후 다시 시도해주세요." },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : turns.length === 0 ? (
          <>
            <p className="whitespace-pre-line text-base">{greeting}</p>
            <div className="space-y-2">
              {suggestedPrompts.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSend(prompt)}
                  className="block w-full rounded-full border border-border px-4 py-3 text-left text-sm"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </>
        ) : (
          turns.map((turn, i) => (
            <div key={i} className={turn.role === "user" ? "text-right" : "text-left"}>
              <p
                className={
                  turn.role === "user"
                    ? "inline-block rounded-2xl bg-muted px-4 py-2 text-sm"
                    : "text-sm"
                }
              >
                {turn.content}
              </p>
            </div>
          ))
        )}
        {sending && <p className="text-sm text-muted-foreground">답변을 준비하고 있어요...</p>}
      </div>

      <div className="space-y-2 border-t border-border p-3">
        {attachedNote && (
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            {attachedNote}
            <button type="button" onClick={() => setAttachedNote(null)} aria-label="첨부 제거">
              <X size={14} />
            </button>
          </div>
        )}

        {attachOpen && (
          <div className="grid grid-cols-4 gap-2 rounded-lg border border-border p-2">
            {[
              { icon: Camera, label: "카메라", note: "카메라로 촬영" },
              { icon: ImageIcon, label: "이미지", note: "이미지 첨부" },
              { icon: FileText, label: "문서", note: "문서 첨부" },
              { icon: Receipt, label: "영수증", note: "영수증 첨부" },
            ].map(({ icon: Icon, label, note }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  // TODO: 실제 업로드 API 없음 — 지금은 첨부했다는 표시만 남김
                  setAttachedNote(note);
                  setAttachOpen(false);
                }}
                className="flex flex-col items-center gap-1 rounded-md border border-border py-3 text-xs"
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 rounded-2xl border border-border p-2">
          <button
            type="button"
            onClick={() => setAttachOpen((v) => !v)}
            aria-label="첨부"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border"
          >
            <Plus size={16} />
          </button>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="물어보고 싶은 내용을 질문해보세요"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm"
          >
            <Mic size={14} />
            {sending ? "전송 중" : "전송"}
          </button>
        </div>
      </div>
    </div>
  );
}
