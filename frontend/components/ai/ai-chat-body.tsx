// components/ai/ai-chat-body.tsx
// ✅ 마이크 버튼 — 실제 navigator.mediaDevices.getUserMedia로 브라우저 권한 요청, 허용하면
//   MediaRecorder로 실제 녹음 시작(빨간 점+타이머), 다시 누르면 종료.
// ⚠ 녹음한 음성을 텍스트로 바꿔주는 서버(STT)가 없어서, 지금은 "음성 메모"로 첨부만 됩니다.

"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Plus,
  Mic,
  Send,
  Camera,
  Image as ImageIcon,
  FileText,
  Receipt,
  ListChecks,
  Square,
} from "lucide-react";

// ✅ 실제 POST /api/ai/photo-search 연동 — 카메라/이미지 첨부 시 사진을 그대로 서버로 보내서
//   비슷한 상품을 찾아옵니다.
interface PhotoSearchResult {
  productName?: string;
  results?: { skuId: number; productName: string }[];
}
async function sendPhotoSearch(file: File): Promise<PhotoSearchResult | null> {
  try {
    const form = new FormData();
    form.append("photo", file);
    const res = await fetch("/api/ai/photo-search", { method: "POST", body: form });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
import { apiFetch, getAccessToken } from "@/lib/api-client";
import {
  getOrCreateSessionId,
  setActiveSessionId,
} from "@/lib/session";
import { getClientId } from "@/lib/client-id";
import { AttachListPickerDialog } from "@/components/domain/attach-list-picker-dialog";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface Attachment {
  label: string;
  kind:
    | "camera"
    | "image"
    | "document"
    | "receipt"
    | "list"
    | "voice";
}

export interface AiChatBodyProps {
  sessionIdOverride?: string;
  greeting?: string;
  suggestedPrompts?: string[];
  /** ✅ 열릴 때 입력창에 미리 채워둘 텍스트(전송은 안 함, 사용자가 수정/전송) */
  initialMessage?: string;
}

const DEFAULT_PROMPTS = [
  "이번주에 장보러 가야해",
  "집에 세제가 없어",
  "다이어트 식단 추천해줘",
];

function chatHeaders(): Record<string, string> {
  return getAccessToken()
    ? {}
    : { "X-Chat-Client-Id": getClientId() };
}

export function AiChatBody({
  sessionIdOverride,
  greeting = "안녕하세요, 무엇을 도와드릴까요?",
  suggestedPrompts = DEFAULT_PROMPTS,
  initialMessage,
}: AiChatBodyProps) {
  const [message, setMessage] = useState(initialMessage ?? "");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [listPickerOpen, setListPickerOpen] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);

      try {
        if (sessionIdOverride) {
          setActiveSessionId(sessionIdOverride);
        }

        const sessionId = await getOrCreateSessionId();

        const messages = await apiFetch<
          { sender: string; content: string }[]
        >(`/api/chat/sessions/${sessionId}/messages`, {
          headers: chatHeaders(),
        });

        setTurns(
          messages.map((m) => ({
            role: m.sender === "USER" ? "user" : "assistant",
            content: m.content,
          }))
        );
      } catch {
        setTurns([]);
      } finally {
        setLoading(false);
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdOverride]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
    };
  }, []);

  const handleSend = async (text?: string) => {
    const content = (text ?? message).trim();

    if (!content || sending) return;

    setTurns((prev) => [
      ...prev,
      {
        role: "user",
        content,
      },
    ]);

    setMessage("");
    setAttachments([]);
    setSending(true);

    try {
      const sessionId = await getOrCreateSessionId();

      const res = await apiFetch<{
        reply: string;
        actions: Record<string, unknown>[];
      }>("/api/chat", {
        method: "POST",
        headers: chatHeaders(),
        body: JSON.stringify({
          sessionId,
          message: content,
        }),
      });

      if (res.actions?.length) {
        console.log("agent actions", res.actions);
      }

      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.reply,
        },
      ]);
    } catch {
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "지금은 답변을 가져오지 못했어요. 잠시 후 다시 시도해주세요.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleFileSelected =
    (kind: Attachment["kind"]) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      if (!file) return;

      setAttachments((prev) => [
        ...prev,
        {
          label: file.name,
          kind,
        },
      ]);

      // 카메라/이미지는 실제로 서버에 보내서 비슷한 상품을 찾아옵니다.
      if (kind === "camera" || kind === "image") {
        sendPhotoSearch(file).then((result) => {
          if (!result) return;
          const found = result.productName ?? result.results?.[0]?.productName;
          if (found) {
            setTurns((prev) => [...prev, { role: "assistant", content: `사진에서 "${found}"와(과) 비슷한 상품을 찾았어요.` }]);
          }
        });
      }

      e.target.value = "";
      setAttachOpen(false);
    };

  const handleAttachList = (groupId: number, title: string) => {
    setAttachments((prev) => [
      ...prev,
      {
        label: `리스트: ${title}`,
        kind: "list",
      },
    ]);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) =>
      prev.filter((_, i) => i !== index)
    );
  };

  // ---- 마이크: 실제 권한 요청 + 녹음 ----
  const handleMicClick = async () => {
    setMicError(null);

    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError(
        "이 브라우저에서는 마이크를 사용할 수 없어요."
      );
      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());

        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
        }

        setRecording(false);

        const blob = new Blob(chunks, {
          type: "audio/webm",
        });

        void blob;

        setAttachments((prev) => [
          ...prev,
          {
            label: `음성 메모 ${recordSeconds}초`,
            kind: "voice",
          },
        ]);

        setRecordSeconds(0);
      };

      mediaRecorderRef.current = recorder;

      recorder.start();

      setRecording(true);
      setRecordSeconds(0);

      recordTimerRef.current = setInterval(
        () => setRecordSeconds((s) => s + 1),
        1000
      );
    } catch {
      setMicError(
        "마이크 권한이 거부됐어요. 브라우저 설정에서 허용해주세요."
      );
    }
  };

  const attachOptions: {
    icon: typeof Camera;
    label: string;
    onClick: () => void;
  }[] = [
    {
      icon: Camera,
      label: "카메라",
      onClick: () => cameraInputRef.current?.click(),
    },
    {
      icon: ImageIcon,
      label: "이미지",
      onClick: () => imageInputRef.current?.click(),
    },
    {
      icon: FileText,
      label: "문서",
      onClick: () => documentInputRef.current?.click(),
    },
    {
      icon: Receipt,
      label: "영수증",
      onClick: () => receiptInputRef.current?.click(),
    },
    {
      icon: ListChecks,
      label: "리스트",
      onClick: () => {
        setAttachOpen(false);
        setListPickerOpen(true);
      },
    },
  ];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelected("camera")}
      />

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected("image")}
      />

      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,image/*"
        className="hidden"
        onChange={handleFileSelected("document")}
      />

      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelected("receipt")}
      />

      {/* 메시지 영역
          - 이 영역만 세로 스크롤
          - 가로 스크롤은 허용하지 않음
          - 부모 flex 영역보다 커지지 않도록 min-w-0/min-h-0 적용 */}
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
        <div className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">
              불러오는 중...
            </p>
          ) : turns.length === 0 ? (
            <>
              <p className="whitespace-pre-line text-base">
                {greeting}
              </p>

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
              <div
                key={i}
                className={
                  turn.role === "user"
                    ? "text-right"
                    : "text-left"
                }
              >
                <p
                  className={
                    turn.role === "user"
                      ? "inline-block max-w-full rounded-2xl bg-muted px-4 py-2 text-sm break-words"
                      : "text-sm break-words"
                  }
                >
                  {turn.content}
                </p>
              </div>
            ))
          )}

          {sending && (
            <p className="text-sm text-muted-foreground">
              답변을 준비하고 있어요...
            </p>
          )}
        </div>
      </div>

      {/* 입력 영역 — 항상 하단에 고정 */}
      <div className="shrink-0 min-w-0 space-y-2 border-t border-border p-3">
        {micError && (
          <p className="text-xs text-danger">
            {micError}
          </p>
        )}

        {attachments.length > 0 && (
          <div className="flex min-w-0 flex-wrap gap-2">
            {attachments.map((a, i) => (
              <div
                key={i}
                className="flex min-w-0 max-w-full items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"
              >
                <span className="min-w-0 truncate">
                  {a.label}
                </span>

                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  aria-label="첨부 제거"
                  className="shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {attachOpen && (
          <div className="grid grid-cols-5 gap-2 rounded-lg border border-border p-2">
            {attachOptions.map(
              ({ icon: Icon, label, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className="flex min-w-0 flex-col items-center gap-1 rounded-md border border-border py-3 text-[11px]"
                >
                  <Icon size={18} />

                  <span className="truncate max-w-full">
                    {label}
                  </span>
                </button>
              )
            )}
          </div>
        )}

        <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-border p-2">
          <button
            type="button"
            onClick={() => setAttachOpen((v) => !v)}
            aria-label="첨부"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border"
          >
            <Plus size={16} />
          </button>

          {recording ? (
            <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-danger">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-danger" />

              <span className="truncate">
                녹음 중... {recordSeconds}초
              </span>
            </span>
          ) : (
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && handleSend()
              }
              placeholder="물어보고 싶은 내용을 질문해보세요"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          )}

          <button
            type="button"
            aria-label={
              recording ? "녹음 종료" : "음성 입력"
            }
            onClick={handleMicClick}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
              recording
                ? "border-danger text-danger"
                : "border-border"
            }`}
          >
            {recording ? (
              <Square size={14} />
            ) : (
              <Mic size={16} />
            )}
          </button>

          <button
            type="button"
            aria-label="전송"
            onClick={() => handleSend()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <Send size={14} />
          </button>
        </div>
      </div>

      <AttachListPickerDialog
        open={listPickerOpen}
        onClose={() => setListPickerOpen(false)}
        onSelect={handleAttachList}
      />
    </div>
  );
}