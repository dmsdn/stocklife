// app/(main)/mypage/spending/page.tsx
// ✅ 전면 재작성(요청) —
//   1) "소비분석페이지_아이디어.txt" 참고해서 카드 카탈로그 정리(components/domain/
//      spending-cards.tsx). 실제 보유 데이터(GET /api/orders,
//      GET /api/purchases/spending-by-category)로 바로 계산 가능한 5개 그룹(소비 금액/
//      카테고리/구매 패턴/시간/포인트)만 우선 구현. 나머지 7개 그룹(재구매·소비주기,
//      할인/프로모션, 위시리스트 연결, 주문 분석 일부, "나의 소비 성향" 2차 분석,
//      "다른 사람과 비교")은 아래 이유로 이번엔 안 넣었습니다:
//      - 재구매 주기: skuId별 구매 이력은 있어 계산 가능하긴 하지만, 이번엔 범위상 보류.
//      - 할인/프로모션: 구매 "당시" 실제 할인 여부를 저장하는 컬럼이 없어서(현재 프로모션
//        상태만 있음) 정확한 계산이 불가능합니다.
//      - 위시리스트 연결(찜→구매 전환 등): 찜 시점과 구매를 연결하는 로직이 별도로 필요.
//      - "나의 소비 성향"(주말소비형/집중소비형 등): 위 1차 지표들을 조합하는 2차 분석이라
//        1차 카드들이 자리잡은 다음 단계로 미룸.
//      - "다른 사람과 비교"(인기상품 등): ProductPopularityResponse 연동이 필요해서 범위 밖.
//   2) 카드를 자유롭게 추가/제거 — "편집" 버튼 → 카탈로그 다이얼로그(체크박스, 그룹별로
//      정리) → 저장/취소는 기존에 쓰던 SplitBottomBar/Checkbox/Dialog 그대로 재사용.
//      선택은 localStorage에 저장(다음 방문에도 유지).
//   3) 박스(border) 제거, 카드 제목 글자 크기 키움(components/domain/spending-cards.tsx
//      CardShell 참고).
//   4) 카테고리 색상 — 해시 기반이라 카테고리끼리 색이 겹쳐 보이던 문제를
//      lib/category-colors.ts에서 수정(화면에 실제로 나온 카테고리 수만큼 균등분산).
"use client";

import { useEffect, useMemo, useState } from "react";
import { RiEqualizerLine } from "@remixicon/react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { SplitBottomBar } from "@/components/domain/split-bottom-bar";
import { apiFetch } from "@/lib/api-client";
import { computeSpendingMetrics, type Order, type CategorySpending } from "@/lib/spending-metrics";
import { SPENDING_CARDS, DEFAULT_CARD_IDS } from "@/components/domain/spending-cards";

const LOOKBACK_OPTIONS = [
  { label: "최근 30일", days: 30 },
  { label: "최근 90일", days: 90 },
  { label: "최근 1년", days: 365 },
];

const CARD_PREF_KEY = "storeflow_spending_cards";

function readSelectedCardIds(): string[] {
  if (typeof window === "undefined") return DEFAULT_CARD_IDS;
  try {
    const raw = window.localStorage.getItem(CARD_PREF_KEY);
    if (!raw) return DEFAULT_CARD_IDS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_CARD_IDS;
  } catch {
    return DEFAULT_CARD_IDS;
  }
}

export default function SpendingAnalysisPage() {
  const [lookbackDays, setLookbackDays] = useState(90);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [categoryData, setCategoryData] = useState<CategorySpending[]>([]);

  // ✅ 처음엔 DEFAULT_CARD_IDS로 렌더(서버/클라 hydration 불일치 방지), 마운트 후에만
  //   localStorage 값으로 교체.
  const [selectedIds, setSelectedIds] = useState<string[]>(DEFAULT_CARD_IDS);
  useEffect(() => setSelectedIds(readSelectedCardIds()), []);

  const [editOpen, setEditOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);

  useEffect(() => {
    apiFetch<Order[]>("/api/orders")
      .then(setOrders)
      .catch(() => setOrders([]));
  }, []);

  useEffect(() => {
    apiFetch<CategorySpending[]>(`/api/purchases/spending-by-category?lookbackDays=${lookbackDays}`)
      .then(setCategoryData)
      .catch(() => setCategoryData([]));
  }, [lookbackDays]);

  const metrics = useMemo(() => {
    if (!orders) return null;
    const now = Date.now();
    const rangeStart = now - lookbackDays * 86400000;
    const prevStart = now - lookbackDays * 2 * 86400000;
    const inRange = orders.filter((o) => o.orderedAt && new Date(o.orderedAt).getTime() >= rangeStart);
    const prevRange = orders.filter(
      (o) => o.orderedAt && new Date(o.orderedAt).getTime() >= prevStart && new Date(o.orderedAt).getTime() < rangeStart
    );
    return computeSpendingMetrics(inRange, prevRange, lookbackDays);
  }, [orders, lookbackDays]);

  const openEdit = () => {
    setDraftIds(selectedIds);
    setEditOpen(true);
  };
  const toggleDraft = (id: string) => {
    setDraftIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const saveEdit = () => {
    setSelectedIds(draftIds);
    window.localStorage.setItem(CARD_PREF_KEY, JSON.stringify(draftIds));
    setEditOpen(false);
  };

  const groups = useMemo(() => {
    const map = new Map<string, typeof SPENDING_CARDS>();
    for (const card of SPENDING_CARDS) {
      const list = map.get(card.group) ?? [];
      list.push(card);
      map.set(card.group, list);
    }
    return Array.from(map.entries());
  }, []);

  const visibleCards = SPENDING_CARDS.filter((c) => selectedIds.includes(c.id));

  return (
    <div className="mx-auto max-w-lg p-4 pb-10 sm:max-w-xl md:max-w-3xl md:p-8">
      <SubpageHeader title="소비 분석" />

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {LOOKBACK_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              type="button"
              onClick={() => setLookbackDays(opt.days)}
              className={
                opt.days === lookbackDays
                  ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  : "rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"
              }
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* ✅ 신규(요청) — 카드 추가/제거 편집 */}
        <button
          type="button"
          onClick={openEdit}
          aria-label="카드 편집"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <RiEqualizerLine size={20} />
        </button>
      </div>

      {orders === null || metrics === null ? (
        <p className="py-16 text-center text-sm text-muted-foreground">불러오는 중...</p>
      ) : metrics.totalOrders === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">이 기간엔 구매 내역이 없어요.</p>
      ) : visibleCards.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          표시할 카드가 없어요. 오른쪽 위 편집 버튼으로 카드를 추가해보세요.
        </p>
      ) : (
        // ✅ 수정(요청) — 카드마다 박스(border)로 안 나누고, 구분선 하나로만 쭉 이어지게.
        <div className="divide-y divide-border">
          {visibleCards.map((card) => (
            <div key={card.id}>{card.render(metrics, categoryData)}</div>
          ))}
        </div>
      )}

      {/* ✅ 신규(요청) — 카드 편집 다이얼로그: 기존에 쓰던 Dialog/Checkbox/SplitBottomBar
          그대로 재사용. 그룹별로 정리, 체크박스로 추가/제거. */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>카드 편집</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {groups.map(([group, cards]) => (
              <div key={group}>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{group}</p>
                <div className="space-y-1">
                  {cards.map((card) => (
                    <div
                      key={card.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleDraft(card.id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggleDraft(card.id))}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-2.5 text-left hover:bg-muted"
                    >
                      <span onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={draftIds.includes(card.id)} onChange={() => toggleDraft(card.id)} variant="brand" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{card.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{card.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {editOpen && (
        <SplitBottomBar
          leftLabel="취소"
          onLeft={() => setEditOpen(false)}
          leftTone="muted"
          rightLabel="저장"
          onRight={saveEdit}
          rightTone="main"
        />
      )}
    </div>
  );
}
