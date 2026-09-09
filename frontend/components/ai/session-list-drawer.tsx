// components/ai/session-list-drawer.tsx
// ✅ 신규 — 참고 이미지(Frame 134) "이전 대화 목록". AI챗 헤더의 햄버거를 누르면
//   화면 전환 없이 뜨는 패널로, 검색 + 최근 대화 목록을 보여줌.
//   데이터는 saved/page.tsx가 쓰는 것과 같은 GET /api/chat/sessions 재사용.
// ✅ 수정(2026-09) —
//   1) 세션을 고르면 더 이상 /ai?session=... 라우트로 이동하지 않음 — "리브 페이지"
//      자체가 없어졌으므로, 부모가 넘겨준 onSelect(sessionId)로 모달 컨텍스트만 바꿈.
//   2) 이름 수정 — 백엔드에 실제 PATCH /api/chat/sessions/{sessionId}가 생겨서 이제
//      그걸 직접 씀(로컬 임시저장 대신). 행마다 연필 아이콘으로 인라인 편집.
//   3) 위치를 두 번 바꿨습니다 — 처음엔 왼쪽 풀높이 드로어 → 리브 모달 "아래에 붙는"
//      바텀시트 → 지금은 리브 모달 상단(top-10, AiMobileSheet의 Popup과 같은 시작
//      지점)에 맞춰서 그 자리에서 아래로 펼쳐지는 패널로. 바텀시트로 두니 리브 모달
//      자체도 시트라 시트 위에 시트가 겹치는 느낌이 어색했어서, 헤더 바로 아래 드롭다운
//      처럼 상단 기준으로 정리.
"use client";

import { useEffect, useState } from "react";
import { RiSearchLine, RiCloseLine, RiPencilLine, RiCheckLine } from "@remixicon/react";
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
  currentSessionId?: string | null;
  /** ✅ 신규 — 세션을 골랐을 때 실행. 라우팅 대신 부모가 모달 상태(openSession)를 바꾼다. */
  onSelect?: (sessionId: string) => void;
}

export function SessionListDrawer({ open, onClose, currentSessionId, onSelect }: SessionListDrawerProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (!open) return;
    apiFetch<ChatSession[]>("/api/chat/sessions", { headers: chatHeaders() })
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [open]);

  if (!open) return null;

  const displayTitle = (s: ChatSession) => s.title ?? "한 줄 요약";

  const filtered = sessions.filter((s) => displayTitle(s).toLowerCase().includes(query.toLowerCase()));

  const startEdit = (s: ChatSession) => {
    setEditingId(s.sessionId);
    setEditingValue(displayTitle(s));
  };

  const commitEdit = async () => {
    const id = editingId;
    const next = editingValue.trim();
    if (!id || !next) {
      setEditingId(null);
      return;
    }
    setRenaming(true);
    try {
      await apiFetch(`/api/chat/sessions/${id}`, {
        method: "PATCH",
        headers: chatHeaders(),
        body: JSON.stringify({ title: next }),
      });
      setSessions((prev) => prev.map((s) => (s.sessionId === id ? { ...s, title: next } : s)));
    } catch {
      // 실패해도 화면엔 일단 반영
      setSessions((prev) => prev.map((s) => (s.sessionId === id ? { ...s, title: next } : s)));
    } finally {
      setRenaming(false);
      setEditingId(null);
    }
  };

  return (
    // ✅ 리브 모달(top-10부터 시작, z-[150])과 같은 top-10 기준선에서 시작해서 아래로
    //   펼쳐지는 패널. 화면 전체를 덮진 않고(max-h로 제한) 헤더 드롭다운처럼 보이게.
    <div className="fixed inset-x-0 top-10 bottom-0 z-[160] flex flex-col md:hidden">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/20"
      />

      <div className="relative flex max-h-[80%] w-full flex-col rounded-[20px] bg-background p-4 shadow-[0_4px_30px_rgba(0,0,0,0.15)]">
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

        <p className="mt-5 shrink-0 text-xs text-muted-foreground">최근</p>

        <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">대화 내역이 없어요.</p>
          )}

          {filtered.map((s) => (
            <div
              key={s.sessionId}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2.5 ${
                s.sessionId === currentSessionId ? "bg-muted" : ""
              }`}
            >
              {editingId === s.sessionId ? (
                <>
                  <input
                    autoFocus
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-8 min-w-0 flex-1 rounded-sm border border-border bg-background px-2 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={commitEdit}
                    disabled={renaming}
                    aria-label="이름 저장"
                    className="shrink-0 text-primary disabled:opacity-50"
                  >
                    <RiCheckLine size={18} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSelect?.(s.sessionId);
                    }}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                  >
                    <span className="min-w-0 truncate text-sm font-medium">{displayTitle(s)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(s.updatedAt)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    aria-label="이름 수정"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <RiPencilLine size={16} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
