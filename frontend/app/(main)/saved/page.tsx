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
  // ✅ 수정(요청) — "리스트/리브" 탭이 없어져서 tab 상태 자체를 없앰(항상 리스트만 보임).
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
  void handleNewChat; // ✅ 대화 목록(SessionListDrawer)에서 관리하게 되면서 이 페이지에선
                       // 안 쓰지만, 다른 곳에서 재사용할 수 있어 일단 남겨둠.

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

  // ✅ 수정(요청 — "저장에 리브 대화를 빼고") — 리브 탭이 없어지면서, 세션 검색/필터링
  //   (filteredSessions, contentResults, groupTitleById, titleOnlyMatches)은 전부
  //   대화 목록(SessionListDrawer)으로 옮겨서 여기선 더 이상 필요 없어 지웠습니다.
  //   sessions/handleAskLiv는 리스트 카드의 "리브에게 물어보기" 버튼이 여전히 써서 남겨둠.

  return (
    <div className="mx-auto max-w-lg p-4 pb-24 sm:max-w-xl md:max-w-4xl md:p-8">
      <h1 className="text-xl font-bold">계획</h1>

      {/* ✅ 수정(요청 — "저장에 리브 대화를 빼고, 리브 대화는 대화 목록에서 관리하게") —
          "리스트/리브" 탭 스위처를 없앰. 리브 대화는 이제 채팅 헤더의 대화 목록
          (SessionListDrawer)에서 관리합니다 — 새 대화, 꾹 눌러 삭제, 연결된 리스트
          표시까지 전부 그쪽으로 옮겼습니다. */}
      <div className="mt-4 flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <RiSearchLine size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="상품 또는 리스트 검색"
            className="h-11 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm outline-none focus-visible:border-foreground"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowNewGroupInput(true)}
          aria-label="새 리스트"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground"
        >
          <RiAddLine size={22} />
        </button>
      </div>

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
                    className={`relative flex aspect-[4/5] cursor-pointer flex-col justify-between overflow-hidden rounded-lg bg-muted p-4 transition-opacity ${selectMode && !isSelected ? "opacity-60" : ""}`}
                  >
                    {/* ✅ 수정(요청 — "회색 그라데이션 빼고 담긴 상품 이미지 옅게해서 최근
                        4개를 4분할로") — 카드 배경의 무채색 그라데이션 대신, 최근에 담은
                        상품 최대 4개의 이미지를 2x2로 채우고 옅게(opacity) 깔아서 카드
                        내용(제목·버튼)이 잘 보이게 함. 이미지가 4개 미만이면 남는 칸은
                        빈 채로 둠(무리해서 반복 안 함). */}
                    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                      {group.products.slice(-4).reverse().map((p) => (
                        <div key={p.id} className="overflow-hidden bg-card-border">
                          {p.image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image} alt="" className="h-full w-full object-cover opacity-25" />
                          )}
                        </div>
                      ))}
                    </div>

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

                    <div className="relative min-w-0 flex-1">
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
                      className="relative mt-3 flex shrink-0 items-center gap-1.5 self-start whitespace-nowrap rounded-full bg-background px-3 py-1.5 text-xs font-normal"
                    >
                      <img src="/icons/liv-full.svg" alt="" className="h-4 w-4 shrink-0" />
                      리브에게 물어보기
                    </button>

                    {/* ✅ 수정(요청 — "결제완료 왜 다시 버튼으로 돌아갔어. 배경을 어둡게
                        깔고, 결제완료 크게 넣되 그림자는 빼라") — 작은 배지 대신 카드 전체를
                        덮는 어두운 오버레이 + 가운데 큰 텍스트로 되돌림. text-shadow는
                        없앰(그림자 없이 깔끔하게). */}
                    {completed && !selectMode && (
                      <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55">
                        <span className="text-xl font-bold text-white">결제완료</span>
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
                    {/* ✅ 수정(요청 — "결제 완료 몇 개 이렇게 텍스트로 구분해둔 거 빼") —
                        아래에 배치하는 순서는 그대로 유지하되, "결제 완료 N" 제목/개수
                        텍스트는 없앰. 각 카드 자체에 이미 "결제완료" 오버레이가 있어서
                        구분은 충분함. */}
                    {completedGroups.length > 0 && (
                      <section className={activeGroups.length > 0 ? "mt-8" : ""}>
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
