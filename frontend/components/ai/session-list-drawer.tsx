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

import { useEffect, useRef, useState } from "react";
import { RiSearchLine, RiCloseLine, RiPencilLine, RiCheckLine, RiAddLine, RiLink } from "@remixicon/react";
import { apiFetch, getAccessToken } from "@/lib/api-client";
import { getClientId } from "@/lib/client-id";
import { formatRelativeTime } from "@/lib/format-time";
import { startNewSession } from "@/lib/session";
import { hideSession, isSessionHidden } from "@/lib/hidden-sessions";
import { loadCartGroups } from "@/lib/cart-storage";

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
  /** ✅ 신규(요청 — "채팅 새로 시작하기가 없음") — "+ 새 대화"를 누르면 실행. 부모가
   *  startNewSession() 결과로 새 세션을 열어줌. */
  onNewSession?: (sessionId: string) => void;
}

export function SessionListDrawer({ open, onClose, currentSessionId, onSelect, onNewSession }: SessionListDrawerProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  // ✅ 신규(요청 — "연결된 리스트 표시") — groupId → 리스트 이름.
  const [groupTitleById, setGroupTitleById] = useState<Map<number, string>>(new Map());
  // ✅ 신규(요청 — "꾹 누르면 삭제") — 백엔드에 DELETE가 없어서(lib/hidden-sessions.ts
  //   참고) 이 기기에서만 숨기는 방식. 500ms 이상 누르고 있으면 삭제 확인.
  const [hiddenVersion, setHiddenVersion] = useState(0); // isSessionHidden 재평가 트리거용
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    apiFetch<ChatSession[]>("/api/chat/sessions", { headers: chatHeaders() })
      .then(setSessions)
      .catch(() => setSessions([]));
    loadCartGroups()
      .then((groups) => setGroupTitleById(new Map(groups.map((g) => [g.id, g.title]))))
      .catch(() => setGroupTitleById(new Map()));
  }, [open]);

  const handleNewSession = async () => {
    setCreating(true);
    try {
      const id = await startNewSession();
      onClose();
      onNewSession?.(id);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (sessionId: string) => {
    hideSession(sessionId);
    setHiddenVersion((v) => v + 1);
    setConfirmDeleteId(null);
  };

  const startPress = (sessionId: string) => {
    pressTimer.current = setTimeout(() => setConfirmDeleteId(sessionId), 500);
  };
  const cancelPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };

  if (!open) return null;

  const displayTitle = (s: ChatSession) => s.title ?? "한 줄 요약";

  const filtered = sessions
    .filter((s) => !isSessionHidden(s.sessionId))
    .filter((s) => displayTitle(s).toLowerCase().includes(query.toLowerCase()));
  void hiddenVersion; // isSessionHidden을 다시 평가하도록 리렌더만 트리거(값 자체는 안 씀)

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
    // ✅ 수정(요청 — "채팅 새로 시작하기가 없음", 데스크탑에도 필요) — 예전엔 md:hidden이라
    //   데스크탑에선 아예 안 보였음. 이제 데스크탑에서는 오른쪽 AI 패널(w-[420px]) 폭에
    //   맞춰서 그 자리에 붙는 드롭다운으로, 모바일에서는 기존처럼 전체 화면 시트로 보임.
    <div className="fixed inset-x-0 top-10 bottom-0 z-[160] flex flex-col md:inset-x-auto md:right-0 md:top-16 md:w-[420px]">
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
          {/* ✅ 수정(요청 — "X버튼 빼고, + 새 대화라고 적기. 보더·아이콘·텍스트 전부
              메인 주황색") */}
          <button
            type="button"
            onClick={handleNewSession}
            disabled={creating}
            aria-label="새 대화"
            className="flex h-10 shrink-0 items-center gap-1 rounded-full border border-brand px-3 text-sm font-medium text-brand disabled:opacity-50"
          >
            <RiAddLine size={18} />
            새 대화
          </button>
        </div>

        <p className="mt-5 shrink-0 text-xs text-muted-foreground">최근 · 꾹 누르면 삭제</p>

        <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">대화 내역이 없어요.</p>
          )}

          {filtered.map((s) => (
            <div
              key={s.sessionId}
              onPointerDown={() => editingId !== s.sessionId && startPress(s.sessionId)}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2.5 ${
                s.sessionId === currentSessionId ? "bg-muted" : ""
              }`}
            >
              {confirmDeleteId === s.sessionId ? (
                <div className="flex w-full items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-muted-foreground">이 대화를 삭제할까요?</span>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-full border border-border px-3 py-1 text-xs">
                      취소
                    </button>
                    <button type="button" onClick={() => handleDelete(s.sessionId)} className="rounded-full bg-danger px-3 py-1 text-xs text-white">
                      삭제
                    </button>
                  </div>
                </div>
              ) : editingId === s.sessionId ? (
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
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{displayTitle(s)}</span>
                      {/* ✅ 신규(요청 — "연결된 리스트 표시도 더하면 될듯") */}
                      {s.groupId != null && groupTitleById.get(s.groupId) && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <RiLink size={11} />
                          {groupTitleById.get(s.groupId)}
                        </span>
                      )}
                    </span>
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
