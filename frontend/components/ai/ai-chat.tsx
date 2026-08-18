// components/ai/ai-chat.tsx

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Camera,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Mic,
  Plus,
  Receipt,
  Search,
  SquarePen,
  X,
} from "lucide-react";

const suggestedPrompts = [
  "이번주에 장보러 가야해",
  "집에 세제가 없어",
  "이번주 식비를 아끼고 싶어",
];

type Role = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: Role;
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  date: string;
  messages: ChatMessage[];
}

interface Attachment {
  id: string;
  name: string;
  type: "photo" | "image" | "document" | "receipt";
  url?: string;
}

const mockConversations: Conversation[] = [
  {
    id: "conversation-1",
    title: "이번주 장보기 목록 만들어줘",
    date: "오늘",
    messages: [
      {
        id: "message-1",
        role: "user",
        content: "이번주 장보기 목록 만들어줘",
      },
      {
        id: "message-2",
        role: "assistant",
        content:
          "좋아요. 이번주 식사를 기준으로 장보기 목록을 만들어볼게요.\n\n필수 식재료와 생활용품을 나눠서 정리해드릴게요.",
      },
      {
        id: "message-3",
        role: "user",
        content: "5만원 안으로 해줘",
      },
      {
        id: "message-4",
        role: "assistant",
        content:
          "5만원 안에서 구매할 수 있도록 우선순위를 조정했어요.\n\n🥬 식재료\n• 계란\n• 대파\n• 양파\n• 두부\n• 닭가슴살\n\n🧻 생활용품\n• 휴지\n• 주방세제\n\n예상 금액은 약 46,000원이에요.",
      },
    ],
  },
  {
    id: "conversation-2",
    title: "냉장고에 있는 재료로 뭐 먹지?",
    date: "오늘",
    messages: [
      {
        id: "message-5",
        role: "user",
        content: "냉장고에 계란이랑 대파밖에 없어",
      },
      {
        id: "message-6",
        role: "assistant",
        content:
          "그 정도라면 간단하게 계란 대파 볶음밥을 만들어보는 건 어때요?\n\n밥과 간장만 있다면 바로 만들 수 있어요.",
      },
    ],
  },
  {
    id: "conversation-3",
    title: "세제랑 휴지 사야해",
    date: "어제",
    messages: [
      {
        id: "message-7",
        role: "user",
        content: "세제랑 휴지 사야해",
      },
      {
        id: "message-8",
        role: "assistant",
        content:
          "장보기 목록에 세제와 휴지를 추가해둘게요.\n\n근처 매장에서 함께 구매하면 동선을 줄일 수 있어요.",
      },
    ],
  },
  {
    id: "conversation-4",
    title: "자취생 일주일 식단 추천",
    date: "어제",
    messages: [
      {
        id: "message-9",
        role: "user",
        content: "자취생 일주일 식단 추천해줘",
      },
      {
        id: "message-10",
        role: "assistant",
        content:
          "재료가 겹치도록 구성하면 식비를 많이 줄일 수 있어요.\n\n월: 계란볶음밥\n화: 닭가슴살 덮밥\n수: 김치찌개\n목: 카레\n금: 볶음밥\n주말: 남은 재료 활용",
      },
    ],
  },
  {
    id: "conversation-5",
    title: "이번달 장보기 비용 줄이기",
    date: "8월 16일",
    messages: [
      {
        id: "message-11",
        role: "user",
        content: "이번달 장보기 비용이 너무 많이 나왔어",
      },
      {
        id: "message-12",
        role: "assistant",
        content:
          "최근 장보기 내역을 기준으로 불필요하게 반복 구매한 품목을 찾아보면 좋아요.\n\n영수증을 추가해주시면 구매 패턴을 분석해드릴 수 있어요.",
      },
    ],
  },
];

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createNewConversation(): Conversation {
  return {
    id: createId(),
    title: "새 대화",
    date: "방금",
    messages: [],
  };
}

interface AiChatProps {
  mode?: "page" | "panel";
  onClose?: () => void;
}

export function AiChat({
  mode = "page",
  onClose,
}: AiChatProps) {
  const [conversations, setConversations] =
    useState<Conversation[]>(mockConversations);

  const [activeConversationId, setActiveConversationId] =
    useState("conversation-1");

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] =
    useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const activeConversation =
    conversations.find(
      (conversation) =>
        conversation.id === activeConversationId,
    ) ?? conversations[0];

  const filteredConversations = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    if (!keyword) return conversations;

    return conversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(keyword),
    );
  }, [conversations, searchQuery]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [
    activeConversationId,
    activeConversation?.messages.length,
    sending,
  ]);

  const resizeTextarea = () => {
    if (!textareaRef.current) return;

    textareaRef.current.style.height = "auto";

    textareaRef.current.style.height = `${Math.min(
      textareaRef.current.scrollHeight,
      160,
    )}px`;
  };

  const handleNewChat = () => {
    const newConversation = createNewConversation();

    setConversations((prev) => [
      newConversation,
      ...prev,
    ]);

    setActiveConversationId(newConversation.id);
    setMessage("");
    setAttachments([]);
    setShowHistory(false);

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setMessage("");
    setAttachments([]);
    setShowHistory(false);
  };

  const handleSuggestedPrompt = (prompt: string) => {
    setMessage(prompt);

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      resizeTextarea();
    });
  };

  const getMockReply = (text: string): string => {
    const lowerText = text.toLowerCase();

    if (
      lowerText.includes("장보") ||
      lowerText.includes("쇼핑")
    ) {
      return `좋아요. 장보기를 도와드릴게요.

이번주에 필요한 품목을 식재료와 생활용품으로 나눠서 정리해볼 수 있어요.

🥬 식재료
• 계란
• 대파
• 양파
• 두부
• 닭가슴살

🧻 생활용품
• 휴지
• 주방세제

예산을 알려주시면 예산에 맞춰 우선순위도 정해드릴게요.`;
    }

    if (
      lowerText.includes("세제") ||
      lowerText.includes("휴지")
    ) {
      return `확인했어요.

장보기 목록에 추가하면 좋겠어요.

• 주방세제
• 화장지

현재 장보기 목록과 함께 구매하면 매장 안에서 이동 동선도 줄일 수 있어요.`;
    }

    if (
      lowerText.includes("냉장고") ||
      lowerText.includes("재료")
    ) {
      return `냉장고에 있는 재료를 알려주시면 가지고 있는 재료를 최대한 활용해서 식단을 만들어드릴게요.

사진을 찍어서 보여주셔도 돼요. 📷`;
    }

    return `좋아요. 말씀해주신 내용을 바탕으로 필요한 정보를 정리해볼게요.

조금 더 구체적으로 알려주시면 장보기 목록이나 추천 상품까지 함께 정리해드릴 수 있어요.`;
  };

  const handleSend = () => {
    const text = message.trim();

    if (!text || sending) return;

    const conversationId = activeConversation.id;

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: text,
    };

    setConversations((prev) =>
      prev.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        return {
          ...conversation,
          title:
            conversation.messages.length === 0
              ? text.length > 28
                ? `${text.slice(0, 28)}...`
                : text
              : conversation.title,
          date: "방금",
          messages: [
            ...conversation.messages,
            userMessage,
          ],
        };
      }),
    );

    setMessage("");
    setSending(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: getMockReply(text),
      };

      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== conversationId) {
            return conversation;
          }

          return {
            ...conversation,
            date: "방금",
            messages: [
              ...conversation.messages,
              assistantMessage,
            ],
          };
        }),
      );

      setSending(false);
    }, 900);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addAttachment = (
    file: File,
    type: Attachment["type"],
  ) => {
    const attachment: Attachment = {
      id: createId(),
      name: file.name,
      type,
      url: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined,
    };

    setAttachments((prev) => [
      ...prev,
      attachment,
    ]);

    setShowAttachmentMenu(false);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) =>
      prev.filter(
        (attachment) => attachment.id !== id,
      ),
    );
  };

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: Attachment["type"],
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    addAttachment(file, type);
    e.target.value = "";
  };

  return (
    <div
      className={
        mode === "panel"
          ? "flex h-full min-h-0 flex-col bg-background"
          : "flex min-h-full flex-col bg-background"
      }
    >
      {/* =====================================================
          PANEL / PAGE HEADER
      ====================================================== */}

      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 bg-background px-4">
        <button
          type="button"
          onClick={() => setShowHistory(true)}
          className="flex min-w-0 items-center gap-1.5"
        >
          <span className="max-w-[260px] truncate text-sm font-semibold">
            {activeConversation?.title || "새 대화"}
          </span>

          <ChevronDown
            size={15}
            className="shrink-0 text-muted-foreground"
          />
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleNewChat}
            aria-label="새 대화"
            className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-muted"
          >
            <SquarePen
              size={18}
              strokeWidth={1.8}
            />
          </button>

          {mode === "panel" && (
            <button
              type="button"
              onClick={onClose}
              aria-label="AI Chat 닫기"
              className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-muted"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* =====================================================
          MESSAGES
      ====================================================== */}

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={
            mode === "panel"
              ? "w-full px-4 pb-32 pt-6"
              : "mx-auto w-full max-w-3xl px-5 pb-44 pt-10"
          }
        >
          {activeConversation.messages.length === 0 ? (
            <div
              className={
                mode === "panel"
                  ? "flex min-h-[420px] flex-col justify-center"
                  : "flex min-h-[calc(100vh-360px)] flex-col justify-center"
              }
            >
              <div className="mb-8">
                <h1
                  className={
                    mode === "panel"
                      ? "text-xl font-semibold tracking-tight"
                      : "text-2xl font-semibold tracking-tight"
                  }
                >
                  안녕하세요, OO님
                </h1>

                <p
                  className={
                    mode === "panel"
                      ? "mt-2 text-lg text-muted-foreground"
                      : "mt-2 text-xl text-muted-foreground"
                  }
                >
                  무엇을 도와드릴까요?
                </p>
              </div>

              <div className="grid gap-2">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() =>
                      handleSuggestedPrompt(prompt)
                    }
                    className="rounded-2xl border border-border px-4 py-3.5 text-left text-sm transition hover:bg-muted/60"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-9">
              {activeConversation.messages.map(
                (chat) => (
                  <div
                    key={chat.id}
                    className={
                      chat.role === "user"
                        ? "flex justify-end"
                        : "flex justify-start"
                    }
                  >
                    {chat.role === "user" ? (
                      <div className="max-w-[82%] rounded-3xl bg-muted px-4 py-3 text-[15px] leading-6">
                        {chat.content}
                      </div>
                    ) : (
                      <div className="w-full max-w-[90%]">
                        <div className="mb-2 flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[9px] font-bold text-background">
                            AI
                          </div>

                          <span className="text-xs font-medium text-muted-foreground">
                            AI
                          </span>
                        </div>

                        <div className="whitespace-pre-wrap text-[15px] leading-7">
                          {chat.content}
                        </div>
                      </div>
                    )}
                  </div>
                ),
              )}

              {sending && (
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[9px] font-bold text-background">
                    AI
                  </div>

                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* =====================================================
          INPUT
      ====================================================== */}

      <div className="shrink-0 bg-background px-3 pb-3 pt-2">
        {attachments.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs shadow-sm"
              >
                {attachment.type === "photo" && (
                  <Camera size={14} />
                )}

                {attachment.type === "image" && (
                  <ImageIcon size={14} />
                )}

                {attachment.type === "document" && (
                  <FileText size={14} />
                )}

                {attachment.type === "receipt" && (
                  <Receipt size={14} />
                )}

                <span className="max-w-32 truncate">
                  {attachment.name}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    removeAttachment(
                      attachment.id,
                    )
                  }
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-3xl border border-border bg-background p-2 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              resizeTextarea();
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="무엇이든 물어보세요"
            className="max-h-40 min-h-11 w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
          />

          <div className="flex items-center justify-between px-1 pb-1 pt-1">
            <button
              type="button"
              onClick={() =>
                setShowAttachmentMenu(true)
              }
              className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-muted"
              aria-label="자료 추가"
            >
              <Plus
                size={19}
                strokeWidth={1.8}
              />
            </button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
                aria-label="음성 입력"
              >
                <Mic
                  size={18}
                  strokeWidth={1.8}
                />
              </button>

              <button
                type="button"
                onClick={handleSend}
                disabled={
                  !message.trim() || sending
                }
                className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background transition disabled:opacity-30"
                aria-label="전송"
              >
                <ArrowUp
                  size={18}
                  strokeWidth={2.2}
                />
              </button>
            </div>
          </div>
        </div>

        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          AI의 답변은 정확하지 않을 수 있어요.
        </p>
      </div>

      {/* =====================================================
          HISTORY
      ====================================================== */}

      {showHistory && (
        <div className="fixed inset-0 z-[100]">
          <button
            type="button"
            onClick={() => setShowHistory(false)}
            className="absolute inset-0 bg-black/30"
            aria-label="닫기"
          />

          <aside className="absolute left-0 top-0 flex h-full w-[86%] max-w-sm flex-col bg-background shadow-2xl">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
              <h2 className="text-lg font-semibold">
                이전 대화
              </h2>

              <button
                type="button"
                onClick={() =>
                  setShowHistory(false)
                }
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
              >
                <X size={19} />
              </button>
            </div>

            <div className="px-3 pt-3">
              <button
                type="button"
                onClick={handleNewChat}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-muted"
              >
                <SquarePen size={18} />
                새 대화
              </button>
            </div>

            <div className="px-4 py-3">
              <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2.5">
                <Search
                  size={16}
                  className="text-muted-foreground"
                />

                <input
                  value={searchQuery}
                  onChange={(e) =>
                    setSearchQuery(e.target.value)
                  }
                  placeholder="대화 검색"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-6">
              {filteredConversations.length ===
              0 ? (
                <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                  검색 결과가 없어요.
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredConversations.map(
                    (conversation) => (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() =>
                          handleSelectConversation(
                            conversation.id,
                          )
                        }
                        className={`w-full rounded-xl px-3 py-3 text-left transition ${
                          conversation.id ===
                          activeConversationId
                            ? "bg-muted"
                            : "hover:bg-muted/60"
                        }`}
                      >
                        <p className="truncate text-sm font-medium">
                          {conversation.title}
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {conversation.date}
                        </p>
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* =====================================================
          ATTACHMENT
      ====================================================== */}

      {showAttachmentMenu && (
        <div className="fixed inset-0 z-[110]">
          <button
            type="button"
            onClick={() =>
              setShowAttachmentMenu(false)
            }
            className="absolute inset-0 bg-black/30"
            aria-label="닫기"
          />

          <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-background px-5 pb-8 pt-4 shadow-2xl">
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted" />

            <div className="mb-5">
              <h2 className="text-lg font-semibold">
                자료 추가
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                AI에게 보여줄 자료를 선택해주세요.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <AttachmentButton
                icon={<Camera size={20} />}
                label="사진 촬영"
                onClick={() =>
                  cameraInputRef.current?.click()
                }
              />

              <AttachmentButton
                icon={<ImageIcon size={20} />}
                label="이미지"
                onClick={() =>
                  imageInputRef.current?.click()
                }
              />

              <AttachmentButton
                icon={<FileText size={20} />}
                label="문서"
                onClick={() =>
                  documentInputRef.current?.click()
                }
              />

              <AttachmentButton
                icon={<Receipt size={20} />}
                label="영수증"
                onClick={() =>
                  receiptInputRef.current?.click()
                }
              />
            </div>

            <button
              type="button"
              onClick={() =>
                setShowAttachmentMenu(false)
              }
              className="mt-4 w-full rounded-xl py-3 text-sm text-muted-foreground hover:bg-muted"
            >
              취소
            </button>
          </div>
        </div>
      )}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) =>
          handleFileSelect(e, "photo")
        }
      />

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) =>
          handleFileSelect(e, "image")
        }
      />

      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx"
        className="hidden"
        onChange={(e) =>
          handleFileSelect(e, "document")
        }
      />

      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) =>
          handleFileSelect(e, "receipt")
        }
      />
    </div>
  );
}

function AttachmentButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-2xl border border-border px-2 py-4 text-xs transition hover:bg-muted active:scale-[0.98]"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>

      <span>{label}</span>
    </button>
  );
}