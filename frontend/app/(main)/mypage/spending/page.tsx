// app/(main)/mypage/spending/page.tsx
// ✅ 전면 재작성 —
//   1) "소비분석페이지_아이디어.txt" 참고해서 카드 카탈로그 정리(components/domain/
//      spending-cards.tsx). 실제 보유 데이터로 바로 계산 가능한 5개 그룹(소비 금액/
//      카테고리/구매 패턴/시간/포인트)만 우선 구현 — 나머지 그룹은 spending-cards.tsx
//      상단 주석 참고.
//   2) 기간 탭을 "1개월 / 1년 / 전체"로(예전엔 30일/90일/1년), 기본값은 1개월.
//      "전체"는 lookbackDays 없이 전체 주문을 다 씀(직전 기간 비교는 전체일 땐 의미가
//      없어서 prev_compare 카드가 "비교할 지난 기간 데이터가 없어요"로 자연히 처리됨).
//   3) 카드 그리드 — 2분할, 라운드 20px, 모든 카드 높이 동일(spending-cards.tsx의
//      CardShell 참고). 배치(순서+크기)는 layout(id+size 배열)로 관리, localStorage에 저장.
//   4) 편집: "수정하기" 버튼으로 진입, 완료는 하단 60px 고정 버튼으로. 카드는 "꾹 눌러서"
//      잡은 뒤에만 드래그로 순서 변경(즉시 드래그 아님 — 500ms 이상 누르고 있어야 "들림"
//      상태가 됨). 편집 중엔 카드 안쪽 스크롤을 막아서 드래그 제스처와 안 겹치게 함.
//      삭제는 카드 우상단 "-" 버튼. 추가는 "+카드 추가" 타일 → 카탈로그, 카드를 누르면
//      그 카드의 defaultSize(내용에 따라 1칸/2칸)로 바로 그리드에 반영.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RiSubtractLine, RiAddLine } from "@remixicon/react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { StickyBottomBar } from "@/components/domain/sticky-bottom-bar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { computeSpendingMetrics, type Order, type CategorySpending } from "@/lib/spending-metrics";
import {
  SPENDING_CARDS,
  SPENDING_CARDS_BY_ID,
  DEFAULT_LAYOUT,
  type SpendingLayoutItem,
} from "@/components/domain/spending-cards";

// ✅ 수정(요청) — "1개월/1년/전체"로, 기본은 1개월. days: null은 "전체"(기간 제한 없음).
const PERIOD_OPTIONS: { label: string; days: number | null }[] = [
  { label: "1개월", days: 30 },
  { label: "1년", days: 365 },
  { label: "전체", days: null },
];

const LAYOUT_KEY = "storeflow_spending_layout";
// ✅ 꾹 눌러야 드래그가 시작되는 시간(ms) — 짧게 탭한 건 그냥 탭으로 처리.
const LONG_PRESS_MS = 500;
// 누른 채로 이 거리(px) 이상 움직이면(=꾹 누르기 전에 스크롤/실수로 움직인 것으로 보고) 취소.
const MOVE_CANCEL_PX = 10;

function readLayout(): SpendingLayoutItem[] {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as SpendingLayoutItem[];
    const cleaned = parsed.filter((item) => SPENDING_CARDS_BY_ID.has(item.id));
    return cleaned.length > 0 ? cleaned : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export default function SpendingAnalysisPage() {
  const [periodDays, setPeriodDays] = useState<number | null>(30);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [categoryData, setCategoryData] = useState<CategorySpending[]>([]);

  // ✅ 처음엔 DEFAULT_LAYOUT으로 렌더(서버/클라 hydration 불일치 방지), 마운트 후에만
  //   localStorage 값으로 교체.
  const [layout, setLayout] = useState<SpendingLayoutItem[]>(DEFAULT_LAYOUT);
  useEffect(() => setLayout(readLayout()), []);

  const [editing, setEditing] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  useEffect(() => {
    apiFetch<Order[]>("/api/orders")
      .then(setOrders)
      .catch(() => setOrders([]));
  }, []);

  useEffect(() => {
    // "전체"는 카테고리 API에도 기간 제한 없이(아주 큰 lookbackDays로) 요청.
    const days = periodDays ?? 36500;
    apiFetch<CategorySpending[]>(`/api/purchases/spending-by-category?lookbackDays=${days}`)
      .then(setCategoryData)
      .catch(() => setCategoryData([]));
  }, [periodDays]);

  const metrics = useMemo(() => {
    if (!orders) return null;
    const now = Date.now();
    if (periodDays == null) {
      // ✅ "전체" — 일평균(avgPerDay) 계산이 실제 기간을 알아야 해서, 임의의 큰 수 대신
      //   가장 오래된 주문일부터 지금까지의 실제 일수를 씀. 비교할 "직전 기간"이라는
      //   개념은 없어서(전체보다 더 이전 기간이 없음) prevOrders는 빈 배열.
      const timestamps = orders.map((o) => (o.orderedAt ? new Date(o.orderedAt).getTime() : now)).filter((t) => !Number.isNaN(t));
      const earliest = timestamps.length > 0 ? Math.min(...timestamps) : now;
      const daysSpan = Math.max(1, Math.ceil((now - earliest) / 86400000));
      return computeSpendingMetrics(orders, [], daysSpan);
    }
    const rangeStart = now - periodDays * 86400000;
    const prevStart = now - periodDays * 2 * 86400000;
    const inRange = orders.filter((o) => o.orderedAt && new Date(o.orderedAt).getTime() >= rangeStart);
    const prevRange = orders.filter(
      (o) => o.orderedAt && new Date(o.orderedAt).getTime() >= prevStart && new Date(o.orderedAt).getTime() < rangeStart
    );
    return computeSpendingMetrics(inRange, prevRange, periodDays);
  }, [orders, periodDays]);

  const persistLayout = (next: SpendingLayoutItem[]) => {
    setLayout(next);
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
  };

  const removeCard = (id: string) => persistLayout(layout.filter((item) => item.id !== id));
  const layoutIds = layout.map((item) => item.id);
  const addCard = (id: string, size: "half" | "full") => {
    if (layoutIds.includes(id)) return;
    persistLayout([...layout, { id, size }]);
  };

  const catalogGroups = useMemo(() => {
    const map = new Map<string, typeof SPENDING_CARDS>();
    // ✅ 이미 추가된 카드는 카탈로그에서 뺌(요청: "선택한 것들 추가하면 바로 카드 반영" —
    //   추가 전용 목록이라 중복 추가할 필요가 없음).
    for (const card of SPENDING_CARDS) {
      if (layoutIds.includes(card.id)) continue;
      const list = map.get(card.group) ?? [];
      list.push(card);
      map.set(card.group, list);
    }
    return Array.from(map.entries()).filter(([, cards]) => cards.length > 0);
  }, [layoutIds]);

  // ── 드래그 재배치 (꾹 눌러야 시작 — Pointer Events, 라이브러리 없음) ──────────────
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragInfo = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number; id: string; pointerId: number } | null>(null);
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const cancelPressTimer = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressStart.current = null;
  };

  const beginDrag = (id: string, clientX: number, clientY: number) => {
    const el = cardRefs.current.get(id);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragInfo.current = { offsetX: clientX - rect.left, offsetY: clientY - rect.top };
    setDraggingId(id);
    setDragPos({ x: rect.left, y: rect.top });
  };

  // ✅ 카드를 누르는 순간 바로 드래그하지 않고, LONG_PRESS_MS만큼 꾹 누르고 있어야 드래그가
  //   시작됨(요청: "카드 이동할 때는 꾹 잡아서 끌어다 놓기로"). 누르는 중 손가락이 너무
  //   움직이면(스크롤 의도로 보고) 취소.
  const handlePointerDown = (id: string, e: React.PointerEvent) => {
    if (!editing) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const pointerId = e.pointerId;
    pressStart.current = { x: startX, y: startY, id, pointerId };
    pressTimer.current = setTimeout(() => {
      if (!pressStart.current) return;
      (e.target as HTMLElement).setPointerCapture?.(pointerId);
      beginDrag(id, startX, startY);
      pressTimer.current = null;
    }, LONG_PRESS_MS);
  };

  useEffect(() => {
    const handleMoveDuringPress = (e: PointerEvent) => {
      if (!pressStart.current || pressStart.current.pointerId !== e.pointerId) return;
      const dx = e.clientX - pressStart.current.x;
      const dy = e.clientY - pressStart.current.y;
      if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) cancelPressTimer();
    };
    const handleUpDuringPress = () => cancelPressTimer();
    window.addEventListener("pointermove", handleMoveDuringPress);
    window.addEventListener("pointerup", handleUpDuringPress);
    return () => {
      window.removeEventListener("pointermove", handleMoveDuringPress);
      window.removeEventListener("pointerup", handleUpDuringPress);
    };
  }, []);

  useEffect(() => {
    if (!draggingId) return;

    const handleMove = (e: PointerEvent) => {
      const info = dragInfo.current;
      if (!info) return;
      setDragPos({ x: e.clientX - info.offsetX, y: e.clientY - info.offsetY });

      let overId: string | null = null;
      for (const [id, el] of cardRefs.current.entries()) {
        if (id === draggingId) continue;
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          overId = id;
          break;
        }
      }
      if (overId) {
        setLayout((prev) => {
          const fromIdx = prev.findIndex((i) => i.id === draggingId);
          const toIdx = prev.findIndex((i) => i.id === overId);
          if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
          const next = [...prev];
          const [moved] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, moved);
          return next;
        });
      }
    };

    const handleUp = () => {
      setDraggingId(null);
      setDragPos(null);
      dragInfo.current = null;
      window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layoutRef.current));
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [draggingId]);

  return (
    <div className="mx-auto max-w-lg p-4 pb-10 sm:max-w-xl md:max-w-3xl md:p-8">
      <SubpageHeader title="소비 분석" />

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              disabled={editing}
              onClick={() => setPeriodDays(opt.days)}
              className={
                opt.days === periodDays
                  ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                  : "rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-50"
              }
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* ✅ 수정(요청) — "완료 버튼은 하단에 60 높이짜리로" — 편집 중엔 이 작은 버튼
            자체를 숨기고, 대신 화면 하단에 고정된 큰 버튼으로 대체(아래 StickyBottomBar). */}
        {!editing && (
          <Button variant="outline" onClick={() => setEditing(true)} className="h-9 px-4 text-xs">
            수정하기
          </Button>
        )}
      </div>

      {orders === null || metrics === null ? (
        <p className="py-16 text-center text-sm text-muted-foreground">불러오는 중...</p>
      ) : metrics.totalOrders === 0 && !editing ? (
        <p className="py-16 text-center text-sm text-muted-foreground">이 기간엔 구매 내역이 없어요.</p>
      ) : (
        <div className="relative mt-4 grid grid-cols-2 gap-3">
          {layout.map((item) => {
            const card = SPENDING_CARDS_BY_ID.get(item.id);
            if (!card || !metrics) return null;
            const isDragging = draggingId === item.id;
            return (
              <div
                key={item.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(item.id, el);
                  else cardRefs.current.delete(item.id);
                }}
                className={`${item.size === "full" ? "col-span-2" : "col-span-1"} ${isDragging ? "z-10 opacity-40" : ""}`}
              >
                <div
                  className="relative h-full touch-none"
                  onPointerDown={(e) => handlePointerDown(item.id, e)}
                >
                  {/* ✅ 수정(요청 — "카드로 잡히기보다는 텍스트 덩어리만 잡히는 느낌") —
                      카드 안쪽에 세로 스크롤(overflow-y-auto)이 있어서, 편집 중 카드를
                      꾹 눌러 드래그하려 할 때 손가락이 카드 안쪽 스크롤 영역에 먼저
                      반응해버렸던 게 원인. 편집 중엔 카드 안쪽 스크롤/클릭을 통째로
                      막아서, 카드 어디를 눌러도 항상 "카드 자체"를 잡게 함. */}
                  <div className={editing ? "pointer-events-none h-full overflow-hidden" : "h-full"}>
                    {card.render(metrics, categoryData)}
                  </div>

                  {/* ✅ 수정(요청) — 삭제는 X가 아니라 "-" 버튼으로. */}
                  {editing && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCard(item.id);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      aria-label="카드 빼기"
                      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-danger shadow"
                    >
                      <RiSubtractLine size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {editing && (
            <button
              type="button"
              onClick={() => setCatalogOpen(true)}
              className="col-span-2 flex h-20 flex-col items-center justify-center gap-1 rounded-[20px] border-2 border-dashed border-border text-muted-foreground"
            >
              <RiAddLine size={20} />
              <span className="text-sm">카드 추가</span>
            </button>
          )}
        </div>
      )}

      {/* ✅ 수정(요청) — "완료 버튼은 하단에 60 높이짜리로" */}
      {editing && (
        <StickyBottomBar>
          <Button className="mx-auto flex h-[60px] w-fit rounded-full px-8 shadow-[0_-2px_20px_rgba(0,0,0,0.1)]" onClick={() => setEditing(false)}>
            완료
          </Button>
        </StickyBottomBar>
      )}

      {/* ✅ 드래그 중인 카드를 포인터 위치에 붙여서 보여줌("들려있는" 느낌) */}
      {draggingId && dragPos && metrics && (
        <div className="pointer-events-none fixed z-50 w-[45vw] max-w-[220px] scale-105 opacity-90 shadow-2xl" style={{ left: dragPos.x, top: dragPos.y }}>
          {SPENDING_CARDS_BY_ID.get(draggingId)?.render(metrics, categoryData)}
        </div>
      )}

      {/* ✅ 카드 추가 카탈로그 — 카드마다 "1칸으로 추가"/"2칸으로 추가" 두 버튼, 누르면
          그 크기로 바로 그리드에 반영(별도 저장 단계 없음). */}
      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>카드 추가</DialogTitle>
          </DialogHeader>

          {catalogGroups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">추가할 수 있는 카드가 없어요.</p>
          ) : (
            <div className="space-y-5">
              {catalogGroups.map(([group, cards]) => (
                <div key={group}>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">{group}</p>
                  <div className="space-y-1">
                    {cards.map((card) => (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => addCard(card.id, card.defaultSize)}
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-2.5 text-left hover:bg-muted"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{card.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{card.description}</p>
                        </div>
                        <RiAddLine size={18} className="shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button className="mt-2 w-full" onClick={() => setCatalogOpen(false)}>
            완료
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
