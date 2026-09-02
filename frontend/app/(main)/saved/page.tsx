// app/(main)/saved/page.tsx
// ✅ 참고 이미지(저장_리스트, 저장_대화) 기준 전면 재작성.
//   - 타이틀 "저장" → "기록", 탭 라벨 "저장한 리스트/AI 대화" → "리스트/리브"
//   - 검색바 신설 ("상품 또는 리스트 검색" / "대화 검색") — 리스트 탭은 상품명+리스트명,
//     리브 탭은 세션 제목으로 클라이언트 필터링 (별도 백엔드 검색 API 없이 가능한 범위)
//   - "새 리스트 만들기" 버튼(풀와이드) → "새 리스트" 텍스트 링크로, 검색바 옆에 배치
//   - 리스트 카드: 회색 그라데이션 배경 + "리브에게 물어보기" 알약형 버튼(liv 로고)
//   - AI 대화 목록: 상대 시간("N시간 전") + 연결된 리스트 이름 표시
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RiSearchLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, getAccessToken } from "@/lib/api-client";
import { startNewSession } from "@/lib/session";
import { getClientId } from "@/lib/client-id";
import { formatRelativeTime, formatShoppingDate } from "@/lib/format-time";
import { searchChatMessages, highlightMatch, type ChatSearchResult } from "@/lib/chat-search";
import { readCartGroups, loadCartGroups, createCartGroup, type CartGroup } from "@/lib/cart-storage";

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
    router.push("/ai");
  };

  // ✅ 리스트에 연결된 세션 찾기 → 있으면 이어서, 없으면 그 리스트로 새 세션 생성
  const handleAskLiv = async (groupId: number) => {
    const existing = sessions.find((s) => s.groupId === groupId);
    if (existing) {
      router.push(`/ai?session=${existing.sessionId}`);
      return;
    }
    try {
      const created = await apiFetch<ChatSession>("/api/chat/sessions", {
        method: "POST",
        headers: chatHeaders(),
        body: JSON.stringify({ groupId }),
      });
      router.push(`/ai?session=${created.sessionId}`);
    } catch {
      await startNewSession();
      router.push("/ai");
    }
  };

  // ✅ 검색 — 리스트 탭: 리스트 이름 또는 그 안에 담긴 상품 이름으로 매칭.
  //   리브 탭: 세션 제목(연결된 리스트 이름 포함)으로 매칭.
  //   전부 이미 받아온 데이터(groups/sessions) 안에서 필터링 — 별도 검색 API 불필요.
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.products.some((p) => p.name.toLowerCase().includes(q))
    );
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
      <h1 className="text-xl font-bold">기록</h1>

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
        <button
          type="button"
          onClick={() => (tab === "cart" ? setShowNewGroupInput(true) : handleNewChat())}
          className="shrink-0 text-sm font-medium text-foreground"
        >
          {tab === "cart" ? "새 리스트" : "새 대화"}
        </button>
      </div>

      {tab === "cart" && (
        <div className="mt-4">
          {showNewGroupInput && (
            <div className="mb-4 space-y-2 rounded-sm border border-border p-3">
              <Input
                placeholder="리스트 이름 (예: 이번 주 장보기)"
                value={newGroupTitle}
                onChange={(e) => setNewGroupTitle(e.target.value)}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground shrink-0">장 볼 날짜 (선택)</label>
                <input
                  type="date"
                  value={newGroupDate}
                  onChange={(e) => setNewGroupDate(e.target.value)}
                  className="h-9 flex-1 rounded-sm border border-border bg-background px-2 text-sm outline-none focus-visible:border-foreground"
                />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleCreateGroup}>추가</Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowNewGroupInput(false);
                    setNewGroupDate("");
                  }}
                >
                  취소
                </Button>
              </div>
            </div>
          )}

          {filteredGroups.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {query ? "검색 결과가 없어요." : "아직 만든 리스트가 없어요."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {filteredGroups.map((group) => (
                <div
                  key={group.id}
                  className="flex aspect-[4/5] flex-col justify-between rounded-lg bg-gradient-to-br from-muted to-border p-4"
                >
                  <Link href={`/saved/${group.id}`} className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold">
                      {group.title} ({group.products.length})
                    </p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {group.products.length}개
                      {group.shoppingDate ? ` · ${formatShoppingDate(group.shoppingDate)}` : ""}
                    </p>
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleAskLiv(group.id)}
                    className="mt-3 flex shrink-0 items-center gap-1.5 self-start whitespace-nowrap rounded-full bg-background px-3 py-1.5 text-[11px] font-medium"
                  >
                    <img src="/icons/liv-full.svg" alt="" className="h-4 w-4 shrink-0" />
                    리브에게 물어보기
                  </button>
                </div>
              ))}
            </div>
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
                  <div key={r.sessionId} className="rounded-sm border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{r.title ?? "한 줄 요약"}</p>
                      {linkedTitle && <p className="shrink-0 truncate text-xs text-muted-foreground">{linkedTitle}</p>}
                    </div>

                    <div className="mt-2 space-y-1.5">
                      {r.matches.map((m) => {
                        const hl = highlightMatch(m.content, query);
                        return (
                          <Link
                            key={m.messageId}
                            href={`/ai?session=${r.sessionId}&highlight=${m.messageId}`}
                            className="block truncate rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                          >
                            {hl ? (
                              <>
                                {hl.before}
                                <mark className="rounded-sm bg-foreground/15 text-foreground">{hl.match}</mark>
                                {hl.after}
                              </>
                            ) : (
                              m.content
                            )}
                          </Link>
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
                <Link
                  key={s.sessionId}
                  href={`/ai?session=${s.sessionId}`}
                  className="flex items-start justify-between gap-3 py-4"
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
                </Link>
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
