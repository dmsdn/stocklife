// app/(main)/saved/page.tsx
// ✅ 참고 이미지(저장_리스트, 저장_대화) 기준 전면 재작성.
//   - 타이틀 "저장" → "기록", 탭 라벨 "저장한 리스트/AI 대화" → "리스트/리브"
//   - 검색바 신설 ("상품 또는 리스트 검색" / "대화 검색") — 리스트 탭은 상품명+리스트명,
//     리브 탭은 세션 제목으로 클라이언트 필터링 (별도 백엔드 검색 API 없이 가능한 범위)
//   - "새 리스트 만들기" 버튼(풀와이드) → "새 리스트" 텍스트 링크로, 검색바 옆에 배치
//   - 리스트 카드: 회색 그라데이션 배경 + "리브에게 물어보기" 알약형 버튼(liv 로고)
//   - AI 대화 목록: 상대 시간("N시간 전") + 연결된 리스트 이름 표시
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RiSearchLine, RiAddLine, RiCheckLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch, getAccessToken } from "@/lib/api-client";
import { startNewSession } from "@/lib/session";
import { getClientId } from "@/lib/client-id";
import { formatRelativeTime, formatShoppingDate } from "@/lib/format-time";
import { searchChatMessages, highlightMatch, type ChatSearchResult } from "@/lib/chat-search";
import { readCartGroups, loadCartGroups, createCartGroup, deleteCartGroup, type CartGroup } from "@/lib/cart-storage";
import { isGroupCompleted } from "@/lib/completed-groups";
import { BirthDatePicker } from "@/components/domain/birth-date-picker";
import { SplitBottomBar } from "@/components/domain/split-bottom-bar";
import { useAiPanel } from "@/components/layout/ai-panel-context";

interface ChatSession {
  sessionId: string;
  title: string | null;
  updatedAt: string;
  groupId?: number | null;
}

function chatHeaders(): Record<string, string> {
  return getAccessToken() ? {} : { "X-Chat-Client-Id": getClientId() };
}

// ✅ useSearchParams()가 Suspense 경계 없이 쓰이면 next build의 정적 프리렌더가 실패해서
//   내부 로직을 별도 컴포넌트로 분리하고 아래 default export에서 Suspense로 감쌌습니다
//   (scan/page.tsx, signup 쪽과 동일한 패턴).
function SavedPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { open: openAiChat, openSession } = useAiPanel();
  // ✅ /ai의 "이전 대화 불러오기"와 하단탭 리브 버튼이 ?tab=ai로 곧장 리브 탭을 열 수 있게 함
  const initialTab = searchParams.get("tab") === "ai" ? "ai" : "cart";
  const [tab, setTab] = useState<"cart" | "ai">(initialTab);
  const [query, setQuery] = useState("");

  const [groups, setGroups] = useState<CartGroup[]>([]);
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [newGroupDate, setNewGroupDate] = useState(""); // ✅ 선택 입력 — 비워둬도 생성 가능

  useEffect(() => {
    loadCartGroups().then(setGroups).catch(() => setGroups(readCartGroups()));
  }, []);

  // ✅ 신규(요청) — 리스트 카드를 꾹 누르면(롱프레스) 선택모드로 들어가서 여러 개를
  //   골라 한 번에 삭제할 수 있게. 선택모드 중엔 카드를 눌러도 이동 안 하고 선택만
  //   토글되고, 하단에 취소/삭제 바가 뜸.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startLongPress = (id: number) => {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setSelectMode(true);
      setSelectedIds(new Set([id]));
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 리스트 ${selectedIds.size}개를 삭제할까요?`)) return;
    await Promise.all(Array.from(selectedIds).map((id) => deleteCartGroup(id)));
    setGroups((prev) => prev.filter((g) => !selectedIds.has(g.id)));
    exitSelectMode();
  };

  const handleCreateGroup = async () => {
    if (!newGroupTitle.trim()) return;
    const group = await createCartGroup(newGroupTitle.trim(), newGroupDate || null);
    setNewGroupTitle("");
    setNewGroupDate("");
    setShowNewGroupInput(false);
    router.push(`/saved/${group.id}`);
  };

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      setSessions(await apiFetch<ChatSession[]>("/api/chat/sessions", { headers: chatHeaders() }));
    } catch {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleNewChat = async () => {
    await startNewSession();
    openAiChat();
  };

  // ✅ 리스트에 연결된 세션 찾기 → 있으면 이어서, 없으면 그 리스트로 새 세션 생성
  const handleAskLiv = async (groupId: number) => {
    const existing = sessions.find((s) => s.groupId === groupId);
    if (existing) {
      openSession(existing.sessionId);
      return;
    }
    try {
      const created = await apiFetch<ChatSession>("/api/chat/sessions", {
        method: "POST",
        headers: chatHeaders(),
        body: JSON.stringify({ groupId }),
      });
      openSession(created.sessionId);
    } catch {
      await startNewSession();
      openAiChat();
    }
  };

  // ✅ 검색 — 리스트 탭: 리스트 이름 또는 그 안에 담긴 상품 이름으로 매칭.
  //   리브 탭: 세션 제목(연결된 리스트 이름 포함)으로 매칭.
  //   전부 이미 받아온 데이터(groups/sessions) 안에서 필터링 — 별도 검색 API 불필요.
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? groups.filter(
          (g) =>
            g.title.toLowerCase().includes(q) ||
            g.products.some((p) => p.name.toLowerCase().includes(q))
        )
      : groups;

    // 결제 완료 리스트는 아래에 모으고, 완료된 리스트끼리는 최근 결제순.
    // 결제 시각은 서버 status만 있는 경우 로컬 완료 시각을 알 수 없으므로
    // localStorage의 완료 시각을 우선 사용하고, 그 다음 updatedAt/id를 fallback으로 사용.
    const completedAt = (g: CartGroup) => {
      if (typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem("storeflow_completed_groups");
          const map = raw ? (JSON.parse(raw) as Record<number, string>) : {};
          const value = map[g.id];
          if (value) return new Date(value).getTime();
        } catch {}
      }
      return g.updatedAt ? new Date(g.updatedAt).getTime() : g.id;
    };

    return [...filtered].sort((a, b) => {
      const aCompleted = a.status === "COMPLETED" || isGroupCompleted(a.id);
      const bCompleted = b.status === "COMPLETED" || isGroupCompleted(b.id);
      if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
      if (aCompleted && bCompleted) return completedAt(b) - completedAt(a);
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : a.id;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : b.id;
      return bTime - aTime;
    });
  }, [groups, query]);

  const groupTitleById = useMemo(() => {
    const map = new Map<number, string>();
    groups.forEach((g) => map.set(g.id, g.title));
    return map;
  }, [groups]);

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => {
      const linkedTitle = s.groupId ? groupTitleById.get(s.groupId) ?? "" : "";
      return (s.title ?? "").toLowerCase().includes(q) || linkedTitle.toLowerCase().includes(q);
    });
  }, [sessions, query, groupTitleById]);

  // ✅ 대화 "내용" 검색 — 제목/리스트 이름과 달리 이미 받아온 데이터로 안 되고 실제
  //   GET /api/chat/search 호출이 필요함. 타이핑마다 매번 부르지 않도록 300ms 디바운스.
  const [contentResults, setContentResults] = useState<ChatSearchResult[]>([]);
  useEffect(() => {
    if (tab !== "ai" || !query.trim()) {
      setContentResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchChatMessages(query).then(setContentResults);
    }, 300);
    return () => clearTimeout(timer);
  }, [tab, query]);

  const contentResultSessionIds = useMemo(() => new Set(contentResults.map((r) => r.sessionId)), [contentResults]);
  // 제목/리스트 이름으로만 일치하고 내용 검색 결과에는 없는 세션 — 중복 표시 방지
  const titleOnlyMatches = useMemo(
    () => filteredSessions.filter((s) => !contentResultSessionIds.has(s.sessionId)),
    [filteredSessions, contentResultSessionIds]
  );

  return (
    <div className="mx-auto max-w-lg p-4 pb-24 sm:max-w-xl md:max-w-4xl md:p-8">
      <h1 className="text-xl font-bold">저장</h1>

      <div className="mt-4 flex gap-5 border-b border-border text-sm">
        <button
          type="button"
          onClick={() => {
            setTab("cart");
            setQuery("");
          }}
          className={`border-b-2 pb-2.5 ${tab === "cart" ? "border-foreground font-semibold" : "border-transparent text-muted-foreground"}`}
        >
          리스트
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("ai");
            setQuery("");
            exitSelectMode();
          }}
          className={`border-b-2 pb-2.5 ${tab === "ai" ? "border-foreground font-semibold" : "border-transparent text-muted-foreground"}`}
        >
          리브
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <RiSearchLine size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "cart" ? "상품 또는 리스트 검색" : "대화 검색"}
            className="h-11 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm outline-none focus-visible:border-foreground"
          />
        </div>
        {/* ✅ 수정(요청 4번) — 텍스트 링크 대신 + 아이콘 원형 버튼. border는 검색바와
            같은 border-border 색으로 맞춤. */}
        <button
          type="button"
          onClick={() => (tab === "cart" ? setShowNewGroupInput(true) : handleNewChat())}
          aria-label={tab === "cart" ? "새 리스트" : "새 대화"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground"
        >
          <RiAddLine size={22} />
        </button>
      </div>

      {tab === "cart" && (
        <div className="mt-4">
          {/* ✅ 수정(요청) — 인라인 박스 대신 진짜 모달로. 이름 입력은 아이디/비밀번호
              입력란처럼 밑줄만(테두리 박스 없이), 장 볼 날짜는 라벨을 왼쪽에 두고 값은
              테두리 없이 오른쪽 정렬로, 오늘 이전 날짜는 선택 자체가 안 되게(disablePast).
              버튼은 취소(왼쪽)/추가(오른쪽) 순서. */}
          <Dialog open={showNewGroupInput} onOpenChange={setShowNewGroupInput}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>새 리스트</DialogTitle>
              </DialogHeader>

              <Input
                placeholder="리스트 이름 (예: 이번 주 장보기)"
                value={newGroupTitle}
                onChange={(e) => setNewGroupTitle(e.target.value)}
                autoFocus
                className="h-10 rounded-none border-0 border-b-2 border-border bg-transparent px-0 py-0 text-sm focus-visible:border-brand"
              />

              <div className="flex items-center justify-between gap-2">
                <label className="shrink-0 text-sm text-muted-foreground">장 볼 날짜 (선택)</label>
                <div className="min-w-0">
                  <BirthDatePicker
                    value={newGroupDate}
                    onChange={setNewGroupDate}
                    minYear={new Date().getFullYear()}
                    maxYear={new Date().getFullYear() + 1}
                    placeholder="선택 안 함"
                    title="장 볼 날짜"
                    variant="bare"
                    align="right"
                    disablePast
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* ✅ 수정(요청) — 취소/추가 버튼을 모달 밖으로 빼서, 하나의 알약 안에서
              나뉘는 형태(SplitBottomBar)로 화면 하단에 고정. */}
          {showNewGroupInput && (
            <SplitBottomBar
              leftLabel="취소"
              onLeft={() => {
                setShowNewGroupInput(false);
                setNewGroupDate("");
                setNewGroupTitle("");
              }}
              leftTone="muted"
              rightLabel="추가"
              onRight={handleCreateGroup}
              rightTone="main"
            />
          )}

          {filteredGroups.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {query ? "검색 결과가 없어요." : "아직 만든 리스트가 없어요."}
            </p>
          ) : (
            <div className="pb-20">
              {(() => {
                const activeGroups = filteredGroups.filter(
                  (g) => !(g.status === "COMPLETED" || isGroupCompleted(g.id))
                );
                const completedGroups = filteredGroups.filter(
                  (g) => g.status === "COMPLETED" || isGroupCompleted(g.id)
                );

                const renderGroups = (list: CartGroup[]) => (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                    {list.map((group) => {
                const isSelected = selectedIds.has(group.id);
                // ✅ 신규(요청 3번) — 결제 완료된 리스트를 저장 화면에서도 알아볼 수 있게 표시
                const completed = group.status === "COMPLETED" || isGroupCompleted(group.id);
                return (
                  <div
                    key={group.id}
                    role="button"
                    tabIndex={0}
                    onPointerDown={() => startLongPress(group.id)}
                    onPointerUp={cancelLongPress}
                    onPointerLeave={cancelLongPress}
                    onPointerCancel={cancelLongPress}
                    onClick={() => {
                      if (longPressFired.current) {
                        longPressFired.current = false;
                        return;
                      }
                      if (selectMode) toggleSelected(group.id);
                      else router.push(`/saved/${group.id}`);
                    }}
                    className={`relative flex aspect-[4/5] cursor-pointer flex-col justify-between overflow-hidden rounded-lg bg-gradient-to-br from-muted to-border p-4 transition-opacity ${selectMode && !isSelected ? "opacity-60" : ""}`}
                  >
                    {/* ✅ 수정 — 우상단 배지 대신 카드 전체를 검은색으로 덮고
                        "결제완료"를 카드 정중앙에 배치.
                        ✅ 버그 수정(2026-09) — z-index가 없어서 형제 요소(제목/버튼)와의
                        페인트 순서가 기기별로 불안정했고, 카드에 overflow-hidden이 없어
                        모서리도 안 맞물렸음. z-20 + 카드 쪽 overflow-hidden으로 확실히
                        고정. 형제들보다 나중에 그려지도록 맨 아래로도 옮김. */}

                    {/* ✅ 선택모드일 때만 우상단에 체크 표시 — 눌린 카드는 채워진 원,
                        나머지는 빈 원 */}
                    {selectMode && (
                      <span
                        className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                          isSelected ? "border-brand bg-brand text-white" : "border-background bg-background/70"
                        }`}
                      >
                        {isSelected && <RiCheckLine size={16} />}
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold">
                        {group.title}
                        {group.shoppingDate ? ` (${formatShoppingDate(group.shoppingDate)})` : ""}
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">{group.products.length}개</p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (selectMode) return;
                        handleAskLiv(group.id);
                      }}
                      className="mt-3 flex shrink-0 items-center gap-1.5 self-start whitespace-nowrap rounded-full bg-background px-3 py-1.5 text-xs font-normal"
                    >
                      <img src="/icons/liv-full.svg" alt="" className="h-4 w-4 shrink-0" />
                      리브에게 물어보기
                    </button>

                    {completed && !selectMode && (
                      <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-black">
                        <span className="text-sm font-semibold text-white">결제완료</span>
                      </div>
                    )}
                  </div>
                );
                    })}
                  </div>
                );

                return (
                  <>
                    {activeGroups.length > 0 && renderGroups(activeGroups)}
                    {completedGroups.length > 0 && (
                      <section className={activeGroups.length > 0 ? "mt-8" : ""}>
                        <div className="mb-3 flex items-center gap-2 px-1">
                          <h2 className="text-sm font-semibold">결제 완료</h2>
                          <span className="text-xs text-muted-foreground">{completedGroups.length}</span>
                        </div>
                        {renderGroups(completedGroups)}
                      </section>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* ✅ 신규(요청) — 선택모드일 때 하단 취소/삭제 바 */}
          {selectMode && (
            <SplitBottomBar
              leftLabel="취소"
              onLeft={exitSelectMode}
              leftTone="muted"
              rightLabel={`삭제 (${selectedIds.size})`}
              onRight={handleDeleteSelected}
              rightTone="danger"
            />
          )}
        </div>
      )}

      {tab === "ai" && (
        <div className="mt-2">
          {loadingSessions && <p className="py-16 text-center text-sm text-muted-foreground">불러오는 중...</p>}
          {!loadingSessions && query && contentResults.length === 0 && titleOnlyMatches.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">검색 결과가 없어요.</p>
          )}
          {!loadingSessions && !query && sessions.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">대화 이력이 없어요.</p>
          )}

          {/* ✅ 대화 "내용"에 검색어가 있는 세션 — 매칭 메시지 스니펫(최대 5개) + 하이라이트.
              스니펫을 누르면 그 메시지로 바로 스크롤 이동(?highlight=messageId). */}
          {contentResults.length > 0 && (
            <div className="space-y-4">
              {contentResults.map((r) => {
                const linkedTitle = r.groupId ? groupTitleById.get(r.groupId) : null;
                return (
                  <div key={r.sessionId} className="rounded-sm p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{r.title ?? "한 줄 요약"}</p>
                      {linkedTitle && <p className="shrink-0 truncate text-xs text-muted-foreground">{linkedTitle}</p>}
                    </div>

                    <div className="mt-2 space-y-1.5">
                      {r.matches.map((m) => {
                        const hl = highlightMatch(m.content, query);
                        return (
                          <button
                            type="button"
                            key={m.messageId}
                            onClick={() => openSession(r.sessionId, m.messageId)}
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {hl ? (
                                <>
                                  {hl.before}
                                  <mark className="rounded-sm bg-foreground/15 text-foreground">{hl.match}</mark>
                                  {hl.after}
                                </>
                              ) : (
                                m.content
                              )}
                            </span>
                            {/* ✅ 신규(요청) — 언제 보낸 대화인지 오른쪽에 표시 */}
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {formatRelativeTime(m.createdAt)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className={contentResults.length > 0 ? "mt-4" : ""}>
            {titleOnlyMatches.map((s) => {
              const linkedTitle = s.groupId ? groupTitleById.get(s.groupId) : null;
              return (
                <button
                  type="button"
                  key={s.sessionId}
                  onClick={() => openSession(s.sessionId)}
                  className="flex w-full items-start justify-between gap-3 py-4 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.title ?? "한 줄 요약"}</p>
                    {linkedTitle && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">{linkedTitle}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(s.updatedAt)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SavedPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-lg p-4 pb-24 sm:max-w-xl md:max-w-4xl md:p-8" />}>
      <SavedPageInner />
    </Suspense>
  );
}
