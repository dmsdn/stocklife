// components/ai/ai-chat-body.tsx
// ✅ 마이크 버튼 — 실제 navigator.mediaDevices.getUserMedia로 브라우저 권한 요청, 허용하면
//   MediaRecorder로 실제 녹음 시작(빨간 점+타이머), 다시 누르면 종료.
// ✅ 09-03: 별도 STT 서버 없이 브라우저 내장 Web Speech API(SpeechRecognition)로 녹음과
//   동시에 실시간 음성 인식을 돌려서, 인식된 텍스트를 입력창(message)에 그대로 채워준다.
//   지원 안 하는 브라우저(예: 구형 Firefox)에서는 recognitionRef가 null로 남고, 기존처럼
//   "음성 메모" 오디오 첨부만 되는 방식으로 자연스럽게 폴백된다.

"use client";

import { useEffect, useRef, useState } from "react";
import { RiCloseLine, RiAddLine, RiMicLine, RiSendPlaneLine, RiCameraLine, RiImageLine, RiFileTextLine, RiBillLine, RiListCheck, RiCheckboxBlankLine, RiErrorWarningLine } from "@remixicon/react";

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
import { usePermissionStatus } from "@/lib/use-permission-status";
import { PermissionRequestDialog } from "@/components/domain/permission-request-dialog";
import { useAiPanel } from "@/components/layout/ai-panel-context";

// ✅ 실제 POST /api/chat/sessions/{sessionId}/attachments 연동(멀티파트 업로드).
//   카메라/갤러리는 백엔드 입장에서 구분 없이 둘 다 type=IMAGE로 보냅니다.
function chatAttachmentHeaders(): Record<string, string> {
  return getAccessToken() ? {} : { "X-Chat-Client-Id": getClientId() };
}

async function uploadChatAttachment(
  kind: "camera" | "image" | "document" | "receipt",
  file: File
): Promise<number | null> {
  try {
    const sessionId = await getOrCreateSessionId();
    const type = kind === "document" ? "DOCUMENT" : kind === "receipt" ? "RECEIPT" : "IMAGE";
    const form = new FormData();
    form.append("file", file);

    const res = await apiFetch<{ attachmentId: number }>(
      `/api/chat/sessions/${sessionId}/attachments?type=${type}`,
      { method: "POST", body: form, headers: chatAttachmentHeaders() }
    );
    return res.attachmentId;
  } catch {
    return null;
  }
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  /** ✅ 대화 검색(기록 > 리브)에서 특정 메시지로 스크롤 이동하기 위한 식별자.
   *  백엔드가 안 주는 옛 메시지/스트리밍 중인 임시 turn은 없을 수 있음. */
  messageId?: number;
  /** ✅ 신규 — 이 유저 메시지에 대한 응답을 못 받아왔을 때(네트워크/백엔드 에러) true.
   *  "다시 보내기" 버튼을 보여주는 용도 — 답변 실패는 별도 assistant 말풍선 대신
   *  이 플래그로 표시해서, 나중에 같은 메시지를 재전송할 수 있게 함. */
  failed?: boolean;
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
  /** ✅ 실제 업로드된 첨부파일 id — 메시지 전송 시 attachmentIds에 실어 보냄.
   *  camera/image/document/receipt만 실제 업로드 대상(list/voice는 백엔드에 해당 타입이 없음). */
  attachmentId?: number;
  uploading?: boolean;
  uploadFailed?: boolean;
}

export interface AiChatBodyProps {
  sessionIdOverride?: string;
  greeting?: string;
  suggestedPrompts?: string[];
  /** ✅ 열릴 때 입력창에 미리 채워둘 텍스트(전송은 안 함, 사용자가 수정/전송) */
  initialMessage?: string;
  /** ✅ 기록(리브) > 대화 검색에서 넘어온 경우, 이 메시지로 스크롤 이동 + 잠깐 하이라이트.
   *  이 컴포넌트는 사이드패널 등 Suspense 경계가 보장 안 되는 곳에서도 쓰이므로
   *  useSearchParams()를 여기서 직접 읽지 않고, 이미 Suspense 안에 있는 /ai 페이지가
   *  prop으로 내려줍니다. */
  highlightMessageId?: number;
  /** ✅ 신규 — 이 컴포넌트가 실제로 활성화한(또는 새로 만든) sessionId를 부모에게 알려줌.
   *  부모(AiMobileSheet/AiPanel)가 헤더에 대화 이름을 보여주거나 이름 수정 기능을
   *  붙이려면 실제 sessionId가 있어야 하는데, sessionIdOverride가 없는 "새 대화" 상태에서는
   *  이 컴포넌트가 세션을 만들기 전까지 부모가 sessionId를 알 방법이 없었음. */
  onSessionReady?: (sessionId: string) => void;
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
  highlightMessageId: highlightMessageIdProp,
  onSessionReady,
}: AiChatBodyProps) {
  const { groupId } = useAiPanel();
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(
    highlightMessageIdProp ?? null
  );
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
  const micPermission = usePermissionStatus("microphone");
  const [showMicModal, setShowMicModal] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  // ✅ Web Speech API 인식기 — SpeechRecognition은 표준 타입 정의가 없어 any로 다룬다.
  const recognitionRef = useRef<any>(null);
  // ✅ 신규 — 녹음 중 실제 마이크 소리 크기(0~1)를 재서 파형 애니메이션에 씀.
  //   Web Audio API의 AnalyserNode로 실시간 볼륨을 읽어옴(별도 라이브러리 불필요).
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelAnimationRef = useRef<number | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>([0.2, 0.2, 0.2, 0.2, 0.2]);

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

        const sessionId = await getOrCreateSessionId(groupId);
        onSessionReady?.(sessionId);

        const messages = await apiFetch<
          { messageId: number; sender: string; content: string }[]
        >(`/api/chat/sessions/${sessionId}/messages`, {
          headers: chatHeaders(),
        });

        setTurns(
          messages.map((m) => ({
            role: m.sender === "USER" ? "user" : "assistant",
            content: m.content,
            messageId: m.messageId,
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

  // ✅ 메시지가 다 로드된 뒤 하이라이트 대상으로 스크롤 이동 + 2초 후 하이라이트 해제
  useEffect(() => {
    if (loading || highlightedMessageId == null) return;
    const el = document.getElementById(`chat-msg-${highlightedMessageId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setHighlightedMessageId(null), 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, turns]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
    };
  }, []);

  // ✅ 실제로 백엔드에 보내는 부분만 분리 — 처음 보낼 때도, 실패 후 "다시 보내기"할 때도
  //   이 함수 하나만 씀(유저 말풍선을 새로 추가하느냐만 다름).
  const sendToBackend = async (content: string, attachmentIds: number[], turnIndex: number) => {
    setSending(true);
    try {
      const sessionId = await getOrCreateSessionId(groupId);

      const res = await apiFetch<{
        reply: string;
        actions: Record<string, unknown>[];
      }>("/api/chat", {
        method: "POST",
        headers: chatHeaders(),
        body: JSON.stringify({
          sessionId,
          message: content,
          attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        }),
      });

      if (res.actions?.length) {
        console.log("agent actions", res.actions);
      }

      setTurns((prev) => [
        ...prev.map((t, i) => (i === turnIndex ? { ...t, failed: false } : t)),
        {
          role: "assistant",
          content: res.reply,
        },
      ]);
    } catch {
      // ✅ 실패해도 별도 assistant 말풍선을 안 붙이고, 이 유저 메시지 자체를 실패
      //   상태로 표시만 함 — "다시 보내기" 버튼으로 나중에 같은 내용을 재전송할 수 있게.
      setTurns((prev) => prev.map((t, i) => (i === turnIndex ? { ...t, failed: true } : t)));
    } finally {
      setSending(false);
    }
  };

  const handleSend = async (text?: string) => {
    const content = (text ?? message).trim();

    if (!content || sending) return;

    // ✅ 업로드된 첨부(camera/image/document/receipt)의 attachmentId만 모아서 같이 보냄.
    //   아직 업로드 중이거나 실패한 건 제외 — list/voice는 애초에 attachmentId가 없음.
    const attachmentIds = attachments
      .map((a) => a.attachmentId)
      .filter((id): id is number => id != null);

    const turnIndex = turns.length;
    setTurns((prev) => [
      ...prev,
      {
        role: "user",
        content,
      },
    ]);

    setMessage("");
    setAttachments([]);

    await sendToBackend(content, attachmentIds, turnIndex);
  };

  // ✅ 신규 — 실패한 유저 메시지 다시 보내기. 말풍선을 새로 안 만들고 같은 자리에서 재시도.
  const handleResend = (turnIndex: number) => {
    if (sending) return;
    const turn = turns[turnIndex];
    if (!turn || turn.role !== "user") return;
    setTurns((prev) => prev.map((t, i) => (i === turnIndex ? { ...t, failed: false } : t)));
    void sendToBackend(turn.content, [], turnIndex);
  };

  const handleFileSelected =
    (kind: Attachment["kind"]) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      if (!file) return;

      const attachmentIndex = attachments.length;
      setAttachments((prev) => [
        ...prev,
        {
          label: file.name,
          kind,
          uploading: kind === "camera" || kind === "image" || kind === "document" || kind === "receipt",
        },
      ]);

      // ✅ 실제 POST /api/chat/sessions/{sessionId}/attachments 업로드 — camera/image/document/
      //   receipt만 백엔드에 대응 타입(IMAGE/DOCUMENT/RECEIPT)이 있어서 업로드 대상.
      //   list/voice는 업로드하지 않음(list는 참조일 뿐이고, voice는 이 API가 지원 안 함).
      if (kind === "camera" || kind === "image" || kind === "document" || kind === "receipt") {
        uploadChatAttachment(kind, file).then((attachmentId) => {
          setAttachments((prev) =>
            prev.map((a, i) =>
              i === attachmentIndex
                ? attachmentId != null
                  ? { ...a, attachmentId, uploading: false }
                  : { ...a, uploading: false, uploadFailed: true }
                : a
            )
          );
        });
      }

      // 카메라/이미지는 첨부와 별개로, 실제로 서버에 보내서 비슷한 상품을 찾아옵니다.
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

  const handleAttachList = (id: number, title: string, kind: "list" | "receipt") => {
    setAttachments((prev) => [
      ...prev,
      {
        label: kind === "receipt" ? `영수증: ${title}` : `리스트: ${title}`,
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
      // ✅ 수정(요청) — "마이크를 사용할 수 없어요"만 뜨면 브라우저 자체 지원 문제처럼
      //   보이지만, 실제로는 대부분 이 경우예요: getUserMedia는 "보안 컨텍스트"(https 또는
      //   localhost)에서만 존재합니다. http://IP주소:3000 같은 주소로 접속하면(배포 전
      //   같은 와이파이에서 테스트할 때 흔함) 모바일 크롬은 사이트 설정에서 마이크를
      //   "허용"으로 보여줘도 이 API 자체가 아예 없어서 이 메시지가 뜹니다 — 배포해서
      //   https 도메인으로 열면 사라집니다(카메라 때와 동일한 원인).
      setMicError(
        window.isSecureContext
          ? "이 브라우저에서는 마이크를 사용할 수 없어요."
          : "이 주소는 보안 연결(https)이 아니라서 마이크를 쓸 수 없어요."
      );
      return;
    }

    // ✅ 이미 허용돼있으면 바로 녹음 시작, 아직 안 물어봤으면 설명 모달부터
    if (micPermission === "prompt") {
      setShowMicModal(true);
      return;
    }

    await startRecording();
  };

  const startRecording = async () => {
    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      // ✅ 신규 — 실시간 파형 애니메이션용 볼륨 분석. AnalyserNode로 짧은 주기마다
      //   실제 마이크 입력 크기를 읽어서 막대 5개 높이에 반영한다.
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 32;
        source.connect(analyser);
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(dataArray);
          // 5개 막대 — 주파수 대역을 5구간으로 나눠 평균내서 각 막대 높이로 사용
          const bucketSize = Math.floor(dataArray.length / 5) || 1;
          const levels = Array.from({ length: 5 }, (_, i) => {
            const slice = dataArray.slice(i * bucketSize, (i + 1) * bucketSize);
            const avg = slice.reduce((s, v) => s + v, 0) / (slice.length || 1);
            return Math.min(1, Math.max(0.15, avg / 160));
          });
          setAudioLevels(levels);
          levelAnimationRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // 분석 실패해도 녹음/인식 자체엔 지장 없음 — 파형만 안 움직임
      }

      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());

        // ✅ 녹음이 끝나면 파형 분석도 같이 정리.
        if (levelAnimationRef.current) {
          cancelAnimationFrame(levelAnimationRef.current);
          levelAnimationRef.current = null;
        }
        audioContextRef.current?.close().catch(() => {});
        audioContextRef.current = null;
        analyserRef.current = null;
        setAudioLevels([0.2, 0.2, 0.2, 0.2, 0.2]);

        // ✅ 녹음이 끝나면 음성 인식기도 같이 멈춘다.
        if (recognitionRef.current) {
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
          recognitionRef.current = null;
        }

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

      // ✅ Web Speech API로 실시간 음성 인식 — 지원하는 브라우저(Chrome/Edge/삼성인터넷 등)면
      //   녹음과 동시에 돌려서 인식된 문장을 입력창에 채운다. 서버/API 키 불필요.
      const SpeechRecognitionCtor =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        try {
          const recognition = new SpeechRecognitionCtor();
          recognition.lang = "ko-KR";
          recognition.continuous = true;
          recognition.interimResults = true;

          recognition.onresult = (event: any) => {
            let transcript = "";
            for (let i = 0; i < event.results.length; i++) {
              transcript += event.results[i][0].transcript;
            }
            setMessage(transcript);
          };

          // ✅ 인식기가 (녹음은 계속 켜져 있는데) 무음 등으로 스스로 멈추는 경우가 있어,
          //   아직 녹음 중이면 재시작해서 계속 듣게 한다.
          recognition.onend = () => {
            if (mediaRecorderRef.current?.state === "recording") {
              try {
                recognition.start();
              } catch {
                // 이미 시작된 상태 등 — 무시
              }
            }
          };

          recognition.onerror = () => {
            // 음성 인식 실패는 조용히 무시 — 녹음(음성 메모)은 별개로 계속 진행됨
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          recognitionRef.current = null;
        }
      }
    } catch {
      setMicError(
        "마이크 권한이 거부됐어요. 브라우저 설정에서 허용해주세요."
      );
    }
  };

  const attachOptions: {
    icon: typeof RiCameraLine;
    label: string;
    onClick: () => void;
  }[] = [
    {
      icon: RiBillLine,
      label: "전자 영수증",
      onClick: () => receiptInputRef.current?.click(),
    },
    {
      icon: RiCameraLine,
      label: "카메라",
      onClick: () => cameraInputRef.current?.click(),
    },
    {
      icon: RiImageLine,
      label: "사진",
      onClick: () => imageInputRef.current?.click(),
    },
    {
      icon: RiFileTextLine,
      label: "파일",
      onClick: () => documentInputRef.current?.click(),
    },
    {
      icon: RiListCheck,
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
              <p className="whitespace-pre-line text-2xl font-bold leading-8">
                {greeting}
              </p>

              <div className="mt-7 space-y-2">
                {suggestedPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className="block w-full rounded-md border border-[#F4F4F4] px-4 py-3 text-left text-sm"
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
                id={turn.messageId ? `chat-msg-${turn.messageId}` : undefined}
                className={
                  turn.role === "user"
                    ? "text-right"
                    : "text-left"
                }
              >
                <p
                  className={
                    turn.role === "user"
                      ? `inline-block max-w-full rounded-md px-4 py-2.5 text-sm break-words transition-colors duration-500 ${
                          turn.messageId === highlightedMessageId ? "bg-foreground/20" : "bg-muted"
                        }`
                      : `text-sm break-words rounded-md transition-colors duration-500 ${
                          turn.messageId === highlightedMessageId ? "bg-foreground/10 px-2 py-1 -mx-2" : ""
                        }`
                  }
                >
                  {turn.content}
                </p>

                {/* ✅ 신규 — 실패한 유저 메시지엔 "다시 보내기" 버튼 */}
                {turn.role === "user" && turn.failed && (
                  <button
                    type="button"
                    onClick={() => handleResend(i)}
                    disabled={sending}
                    className="mt-1 flex items-center gap-1 text-xs text-danger disabled:opacity-50"
                  >
                    <RiErrorWarningLine size={14} />
                    답변을 가져오지 못했어요 · 다시 보내기
                  </button>
                )}
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
      <div className="shrink-0 min-w-0 space-y-2 p-3">
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
                className={`flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                  a.uploadFailed ? "border-danger text-danger" : "border-border"
                }`}
              >
                <span className="min-w-0 truncate">
                  {a.uploading ? `업로드 중... ${a.label}` : a.uploadFailed ? `업로드 실패: ${a.label}` : a.label}
                </span>

                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  aria-label="첨부 제거"
                  className="shrink-0"
                >
                  <RiCloseLine size={24} />
                </button>
              </div>
            ))}
          </div>
        )}

        {attachOpen && (
          <div className="mb-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            {attachOptions.map(
              ({ icon: Icon, label, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm"
                >
                  <Icon size={20} className="shrink-0 text-muted-foreground" />
                  {label}
                </button>
              )
            )}
          </div>
        )}

        {/* ✅ 수정(요청) — 높이 60, 뒤에 옅은 그림자를 줘서 살짝 떠 있는 느낌으로.
            ✅ 수정(요청 2번) — 녹음 중엔 "녹음 중... N초" 고정 문구로 텍스트 입력칸
            자체를 가려버려서, 실시간으로 인식되고 있는 자막(message, Web Speech API가
            채워줌)이 안 보였음. 이제 녹음 중에도 이 자리에 실제 인식된 텍스트를 그대로
            보여줌(아직 아무 말도 안 했으면 안내 문구). 빨간 점 대신 실제 마이크 소리
            크기에 반응하는 막대 5개(파형)로 "듣고 있다"는 걸 보여줌. */}
        <div className="flex h-[60px] min-w-0 items-center gap-2 rounded-full border border-[#F4F4F4] bg-white p-2 shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
          <button
            type="button"
            onClick={() => setAttachOpen((v) => !v)}
            aria-label="첨부"
            className="flex h-8 w-8 shrink-0 items-center justify-center text-foreground"
          >
            <RiAddLine size={22} />
          </button>

          {recording ? (
            <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              {/* ✅ 신규 — 파형 애니메이션. audioLevels(0~1) 5개 값을 막대 높이로 매핑,
                  requestAnimationFrame으로 매 프레임 갱신되니 실제 목소리 크기에 따라
                  실시간으로 들쭉날쭉 움직임. */}
              <span className="flex h-4 shrink-0 items-end gap-[3px]" aria-hidden="true">
                {audioLevels.map((level, i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-danger transition-[height] duration-75"
                    style={{ height: `${Math.round(level * 100)}%` }}
                  />
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">
                {message.trim() ? message : "듣고 있어요..."}
              </span>
            </span>
          ) : (
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && handleSend()
              }
              placeholder="오늘은 어떤 장을 볼까요?"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          )}

          {/* ✅ 참고 이미지(Frame 128) — 입력 전엔 마이크만 보이고, 뭔가 입력하면
              전송 버튼으로 바뀜(전송 기능 자체는 그대로, Enter로도 항상 보냄) */}
          {message.trim().length === 0 && !recording ? (
            <button
              type="button"
              aria-label="음성 입력"
              onClick={handleMicClick}
              className="flex h-8 w-8 shrink-0 items-center justify-center text-foreground"
            >
              <RiMicLine size={22} />
            </button>
          ) : recording ? (
            <button
              type="button"
              aria-label="녹음 종료"
              onClick={handleMicClick}
              className="flex h-8 w-8 shrink-0 items-center justify-center text-danger"
            >
              <RiCheckboxBlankLine size={22} />
            </button>
          ) : (
            <button
              type="button"
              aria-label="전송"
              disabled={attachments.some((a) => a.uploading)}
              onClick={() => handleSend()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground disabled:opacity-40"
            >
              <RiSendPlaneLine size={18} />
            </button>
          )}
        </div>
      </div>

      <AttachListPickerDialog
        open={listPickerOpen}
        onClose={() => setListPickerOpen(false)}
        onSelect={handleAttachList}
      />
      <PermissionRequestDialog
        open={showMicModal}
        kind="microphone"
        onConfirm={() => {
          setShowMicModal(false);
          startRecording();
        }}
        onClose={() => setShowMicModal(false)}
      />
    </div>
  );
}