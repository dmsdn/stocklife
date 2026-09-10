// app/(main)/mypage/orders/page.tsx
// ✅ 전면 재작성(요청) — 예전엔 그냥 주문을 위→아래로 나열만 했는데:
//   1) 연/월 "범위" 선택(OO년 OO월 ~ OO년 OO월)
//   2) 그 기간 동안의 방문 날짜와 방문 횟수를 요약으로 보여줌 — 주문 1건 = 방문 1회로 취급
//      (백엔드에 별도 "방문" 개념이 없어서 주문 발생일 기준).
//   3) 각 방문(주문)은 접혀있다가 펼치면 실제 구매한 상품 목록(이미지/이름/개당가격/수량)이
//      나오고, 오른쪽에 그 상품을 리스트에 다시 담는 저장 아이콘이 있음.
//   4) 펼친 영역 맨 아래에 "전자영수증 보기" 버튼.
//   상품 이미지는 OrderResponse.ItemDto에 없어서(skuId/productName/priceKrw/quantity만
//   있음), 화면에 나온 주문들의 skuId를 모아 배치 조회(GET /api/products/by-skus)로
//   한 번에 가져옵니다(cart-storage.ts의 hydrateServerGroups와 동일 패턴).
"use client";

import { useEffect, useMemo, useState } from "react";
import { RiArrowDownSLine, RiArrowUpSLine, RiBookmarkLine, RiBillLine } from "@remixicon/react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { ReceiptDialog } from "@/components/domain/receipt-dialog";
import { SaveToListDialog } from "@/components/domain/save-to-list-dialog";
import { apiFetch, resolveImageUrl } from "@/lib/api-client";
import { addProductToCartGroup } from "@/lib/cart-storage";

interface OrderItem {
  skuId: number;
  productName: string;
  priceKrw: number;
  quantity: number;
}
interface Order {
  orderId: number;
  totalAmount: number;
  status: string;
  items: OrderItem[];
  orderedAt?: string;
  paymentMethod?: string;
  pointsUsed?: number;
  pointsEarned?: number;
}
interface ProductBrief {
  skuId: number;
  imageUrl: string | null;
  categoryL1?: string | null;
}

const selectClass =
  "h-9 rounded-sm border border-border bg-background pl-3 pr-7 text-sm text-foreground outline-none focus-visible:border-brand appearance-none";

function YearMonthSelect({
  year,
  month,
  years,
  onChange,
}: {
  year: number;
  month: number;
  years: number[];
  onChange: (year: number, month: number) => void;
}) {
  return (
    <div className="flex gap-1.5">
      <div className="relative">
        <select value={year} onChange={(e) => onChange(Number(e.target.value), month)} className={selectClass}>
          {years.map((y) => (
            <option key={y} value={y}>{y}년</option>
          ))}
        </select>
        <RiArrowDownSLine size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
      </div>
      <div className="relative">
        <select value={month} onChange={(e) => onChange(year, Number(e.target.value))} className={selectClass}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>{m}월</option>
          ))}
        </select>
        <RiArrowDownSLine size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Map<number, ProductBrief>>(new Map());

  const now = new Date();
  // ✅ 기본값: 최근 3개월(이번 달 포함) — 연초라 3개월 전이 작년으로 넘어가는 경우도 고려.
  const defaultStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const [startYear, setStartYear] = useState(defaultStart.getFullYear());
  const [startMonth, setStartMonth] = useState(defaultStart.getMonth() + 1);
  const [endYear, setEndYear] = useState(now.getFullYear());
  const [endMonth, setEndMonth] = useState(now.getMonth() + 1);

  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [saveTarget, setSaveTarget] = useState<OrderItem | null>(null);

  useEffect(() => {
    apiFetch<Order[]>("/api/orders")
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  // ✅ 화면에 나온 주문들의 상품 이미지를 배치로 한 번에 조회
  useEffect(() => {
    const skuIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.skuId)))].filter((id) => id > 0);
    if (skuIds.length === 0) return;
    apiFetch<ProductBrief[]>(`/api/products/by-skus?skuIds=${skuIds.join(",")}`, { auth: false })
      .then((list) => {
        const map = new Map<number, ProductBrief>();
        list.forEach((p) => p && map.set(p.skuId, { ...p, imageUrl: resolveImageUrl(p.imageUrl) ?? null }));
        setProducts(map);
      })
      .catch(() => {});
  }, [orders]);

  const yearOptions = useMemo(() => {
    const years = new Set(orders.filter((o) => o.orderedAt).map((o) => new Date(o.orderedAt!).getFullYear()));
    years.add(now.getFullYear());
    years.add(now.getFullYear() - 1); // 연초 "최근 3개월" 기본값이 작년으로 넘어갈 수 있어서 항상 포함
    return Array.from(years).sort((a, b) => b - a);
  }, [orders]);

  // 선택한 범위(포함) 안에 들어오는 주문만
  const rangeStart = new Date(startYear, startMonth - 1, 1);
  const rangeEnd = new Date(endYear, endMonth, 0, 23, 59, 59); // endMonth의 마지막 날 끝시각
  const ordersInRange = useMemo(() => {
    return orders
      .filter((o) => {
        if (!o.orderedAt) return false;
        const d = new Date(o.orderedAt);
        return d >= rangeStart && d <= rangeEnd;
      })
      .sort((a, b) => new Date(b.orderedAt!).getTime() - new Date(a.orderedAt!).getTime());
  }, [orders, startYear, startMonth, endYear, endMonth]);

  // ✅ 수정(요청 — "날짜로 방문 횟수 파악하는 것 같은데 결제 개수로 파악해야 함") —
  //   예전엔 날짜를 중복 제거한 개수로 셌는데, 같은 날 두 번 결제해도 1번으로 잡혀서
  //   실제 방문(결제) 횟수보다 적게 나왔음. 이제 그 기간의 주문(결제) 건수를 그대로 씀.
  const visitCount = ordersInRange.length;

  const handleSaveConfirm = (groupIds: number[]) => {
    if (!saveTarget) return;
    const product = products.get(saveTarget.skuId);
    Promise.all(
      groupIds.map((groupId) =>
        addProductToCartGroup(groupId, {
          id: saveTarget.skuId,
          name: saveTarget.productName,
          price: saveTarget.priceKrw,
          category: product?.categoryL1 ?? undefined,
          image: product?.imageUrl ?? undefined,
        })
      )
    ).catch(() => {});
    setSaveTarget(null);
  };

  return (
    <div className="mx-auto max-w-lg p-4 pb-10 sm:max-w-xl md:max-w-3xl md:p-8">
      <SubpageHeader title="구매내역" />

      {/* ✅ 신규(요청) — 연/월 범위 선택 (OO년 OO월 ~ OO년 OO월) */}
      <div className="flex flex-wrap items-center gap-2">
        <YearMonthSelect year={startYear} month={startMonth} years={yearOptions} onChange={(y, m) => { setStartYear(y); setStartMonth(m); }} />
        <span className="text-sm text-muted-foreground">~</span>
        <YearMonthSelect year={endYear} month={endMonth} years={yearOptions} onChange={(y, m) => { setEndYear(y); setEndMonth(m); }} />
      </div>

      {/* ✅ 수정(요청 — "날짜 표시 지우고, border도 지워") — 결제 개수만 간단히 표시. */}
      {!loading && (
        <div className="mt-4 p-4">
          <p className="text-sm">
            이 기간 동안 <span className="font-semibold text-brand">{visitCount}번</span> 방문했어요
          </p>
        </div>
      )}

      {loading && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}
      {!loading && ordersInRange.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">이 기간엔 구매내역이 없어요.</p>
      )}

      {/* ✅ 방문(주문) 목록 — 접혀있다가 누르면 펼쳐져서 실제 구매 상품 목록이 나옴 */}
      <div className="mt-4 divide-y divide-border">
        {ordersInRange.map((order) => {
          const expanded = expandedOrderId === order.orderId;
          const dateLabel = order.orderedAt
            ? new Date(order.orderedAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
            : "";
          return (
            <div key={order.orderId}>
              <button
                type="button"
                onClick={() => setExpandedOrderId(expanded ? null : order.orderId)}
                className="flex w-full items-center justify-between gap-3 py-4 text-left"
              >
                <div>
                  <p className="text-sm font-medium">{dateLabel}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {order.items.length}개 품목 · {order.totalAmount.toLocaleString()}원
                  </p>
                </div>
                {expanded ? (
                  <RiArrowUpSLine size={22} className="shrink-0 text-muted-foreground" />
                ) : (
                  <RiArrowDownSLine size={22} className="shrink-0 text-muted-foreground" />
                )}
              </button>

              {expanded && (
                <div className="pb-4">
                  <div className="space-y-3">
                    {order.items.map((item) => {
                      const product = products.get(item.skuId);
                      return (
                        <div key={item.skuId} className="flex items-center gap-3">
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-sm bg-muted">
                            {product?.imageUrl && (
                              <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{item.productName}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {item.priceKrw.toLocaleString()}원 · {item.quantity}개
                            </p>
                          </div>
                          {/* ✅ 신규(요청) — 다시 리스트에 담는 저장 아이콘 */}
                          <button
                            type="button"
                            onClick={() => setSaveTarget(item)}
                            aria-label="리스트에 저장"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                          >
                            <RiBookmarkLine size={20} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* ✅ 신규(요청) — 전자영수증 보기 버튼 */}
                  <button
                    type="button"
                    onClick={() => setReceiptOrder(order)}
                    className="mt-4 flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-border text-sm font-medium"
                  >
                    <RiBillLine size={18} />
                    전자영수증 보기
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ReceiptDialog order={receiptOrder} onClose={() => setReceiptOrder(null)} />
      <SaveToListDialog open={!!saveTarget} onClose={() => setSaveTarget(null)} onSelect={handleSaveConfirm} />
    </div>
  );
}
