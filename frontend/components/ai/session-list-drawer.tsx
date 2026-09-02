// components/ai/session-list-drawer.tsx
// ✅ 신규 — 참고 이미지(Frame 134) "이전 대화 목록". AI챗 헤더의 햄버거를 누르면
//   화면 전환 없이 왼쪽에서 슬라이드로 뜨는 패널로, 검색 + 최근 대화 목록을 보여줌.
//   데이터는 saved/page.tsx가 쓰는 것과 같은 GET /api/chat/sessions 재사용.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiSearchLine, RiCloseLine } from "@remixicon/react";
import { apiFetch, getAccessToken } from "@/lib/api-client";
import { getClientId } from "@/lib/client-id";
import { formatRelativeTime } from "@/lib/format-time";

interface ChatSession {
  sessionId: string;
  title: string | null;
  updatedAt: string;
  groupId?: number | null;
}

function chatHeaders(): Record<string, string> {
  return getAccessToken() ? {} : { "X-Chat-Client-Id": getClientId() };
}

interface SessionListDrawerProps {
  open: boolean;
  onClose: () => void;
  currentSessionId?: string;
}

export function SessionListDrawer({ open, onClose, currentSessionId }: SessionListDrawerProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    apiFetch<ChatSession[]>("/api/chat/sessions", { headers: chatHeaders() })
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [open]);

  if (!open) return null;

  const filtered = sessions.filter((s) =>
    (s.title ?? "한 줄 요약").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex md:hidden">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/20"
      />

      <div className="relative flex h-full w-[85%] max-w-xs flex-col bg-background p-4 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="flex h-10 flex-1 items-center gap-2 rounded-full bg-muted px-3">
            <RiSearchLine size={18} className="text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="대화 검색"
              className="h-full flex-1 min-w-0 bg-transparent text-sm outline-none"
            />
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 text-muted-foreground">
            <RiCloseLine size={22} />
          </button>
        </div>

        <p className="mt-5 text-xs text-muted-foreground">최근</p>

        <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">대화 내역이 없어요.</p>
          )}

          {filtered.map((s) => (
            <button
              key={s.sessionId}
              type="button"
              onClick={() => {
                onClose();
                router.push(`/ai?session=${s.sessionId}`);
              }}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2.5 text-left ${
                s.sessionId === currentSessionId ? "bg-muted" : ""
              }`}
            >
              <span className="min-w-0 truncate text-sm font-medium">{s.title ?? "한 줄 요약"}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(s.updatedAt)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
