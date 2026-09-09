// lib/spending-metrics.ts
// ✅ 신규(요청) — 소비 분석 화면에서 쓰는 지표를 전부 여기서 계산합니다. 목업 없이
//   실제 데이터(GET /api/orders의 items[].priceKrw/quantity/skuId, orderedAt,
//   pointsEarned/pointsUsed, GET /api/purchases/spending-by-category)만 씁니다.
//   카테고리(대/중분류)는 주문 항목(OrderItem)에 없어서(skuId/productName/priceKrw/
//   quantity만 있음) 카테고리 관련 지표는 별도 백엔드 엔드포인트(spending-by-category)
//   결과를 그대로 씁니다 — 나머지(금액/패턴/시간/상품/포인트)는 주문 목록에서 직접 계산.

export interface OrderItem {
  skuId: number;
  productName: string;
  priceKrw: number;
  quantity: number;
}
export interface Order {
  orderId: number;
  totalAmount: number;
  status: string;
  items: OrderItem[];
  orderedAt?: string;
  pointsUsed?: number;
  pointsEarned?: number;
}
export interface CategorySpending {
  categoryL1: string;
  categoryL2: string | null;
  totalQty: number;
  purchaseCount: number;
  totalSpentKrw: number;
}

export interface ProductAgg {
  skuId: number;
  name: string;
  qty: number;
  spent: number;
  purchaseCount: number;
}

export interface DayAmount {
  dateLabel: string; // "9/5" 등 표시용
  isoDate: string; // 정렬/키용
  amount: number;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export interface SpendingMetrics {
  orders: Order[];
  totalSpent: number;
  totalOrders: number;
  totalQty: number;
  daysInRange: number;
  avgPerDay: number;
  avgPerOrder: number;
  avgPricePerItem: number;
  dailySeries: DayAmount[]; // 날짜 오름차순
  maxSpendDay: DayAmount | null;
  minSpendDay: DayAmount | null;
  avgIntervalDays: number | null; // 구매~구매 평균 간격(일)
  productAgg: ProductAgg[]; // 소비액 내림차순
  weekdaySpent: number[]; // index 0=일 ~ 6=토
  weekdayCount: number[];
  weekendSpent: number;
  weekdaySpentTotal: number;
  hourSpent: number[]; // 24칸
  pointsEarned: number;
  pointsUsed: number;
  // 직전 동일 길이 기간 대비
  prevTotalSpent: number;
  prevTotalOrders: number;
}

function toDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** orders는 이미 [start, end) 범위로 필터링된 것을 넘겨주세요. prevOrders는 그 직전
 *  동일 길이 기간(비교용, "지난 기간 대비" 카드용) — 없으면 0으로 처리. */
export function computeSpendingMetrics(
  orders: Order[],
  prevOrders: Order[],
  daysInRange: number
): SpendingMetrics {
  const totalSpent = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalOrders = orders.length;
  const totalQty = orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);

  // 날짜별 합계
  const byDate = new Map<string, number>();
  for (const o of orders) {
    if (!o.orderedAt) continue;
    const key = toDateKey(o.orderedAt);
    byDate.set(key, (byDate.get(key) ?? 0) + o.totalAmount);
  }
  const dailySeries: DayAmount[] = Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([iso, amount]) => {
      const d = new Date(`${iso}T00:00:00`);
      return { isoDate: iso, dateLabel: `${d.getMonth() + 1}/${d.getDate()}`, amount };
    });
  const maxSpendDay = dailySeries.reduce<DayAmount | null>(
    (max, d) => (!max || d.amount > max.amount ? d : max),
    null
  );
  const minSpendDay = dailySeries.reduce<DayAmount | null>(
    (min, d) => (!min || d.amount < min.amount ? d : min),
    null
  );

  // 구매 간격(정렬된 주문 시각 기준)
  const sortedDates = orders
    .filter((o) => o.orderedAt)
    .map((o) => new Date(o.orderedAt!).getTime())
    .sort((a, b) => a - b);
  let avgIntervalDays: number | null = null;
  if (sortedDates.length >= 2) {
    const totalGapMs = sortedDates[sortedDates.length - 1] - sortedDates[0];
    avgIntervalDays = Math.round((totalGapMs / (sortedDates.length - 1) / 86400000) * 10) / 10;
  }

  // 상품별 집계
  const productMap = new Map<number, ProductAgg>();
  for (const o of orders) {
    for (const item of o.items) {
      const cur = productMap.get(item.skuId) ?? {
        skuId: item.skuId,
        name: item.productName,
        qty: 0,
        spent: 0,
        purchaseCount: 0,
      };
      cur.qty += item.quantity;
      cur.spent += item.priceKrw * item.quantity;
      cur.purchaseCount += 1;
      productMap.set(item.skuId, cur);
    }
  }
  const productAgg = Array.from(productMap.values()).sort((a, b) => b.spent - a.spent);

  // 요일/시간대별
  const weekdaySpent = new Array(7).fill(0);
  const weekdayCount = new Array(7).fill(0);
  const hourSpent = new Array(24).fill(0);
  for (const o of orders) {
    if (!o.orderedAt) continue;
    const d = new Date(o.orderedAt);
    weekdaySpent[d.getDay()] += o.totalAmount;
    weekdayCount[d.getDay()] += 1;
    hourSpent[d.getHours()] += o.totalAmount;
  }
  const weekendSpent = weekdaySpent[0] + weekdaySpent[6];
  const weekdaySpentTotal = totalSpent - weekendSpent;

  const pointsEarned = orders.reduce((sum, o) => sum + (o.pointsEarned ?? 0), 0);
  const pointsUsed = orders.reduce((sum, o) => sum + (o.pointsUsed ?? 0), 0);

  return {
    orders,
    totalSpent,
    totalOrders,
    totalQty,
    daysInRange,
    avgPerDay: daysInRange > 0 ? Math.round(totalSpent / daysInRange) : 0,
    avgPerOrder: totalOrders > 0 ? Math.round(totalSpent / totalOrders) : 0,
    avgPricePerItem: totalQty > 0 ? Math.round(totalSpent / totalQty) : 0,
    dailySeries,
    maxSpendDay,
    minSpendDay,
    avgIntervalDays,
    productAgg,
    weekdaySpent,
    weekdayCount,
    weekendSpent,
    weekdaySpentTotal,
    hourSpent,
    pointsEarned,
    pointsUsed,
    prevTotalSpent: prevOrders.reduce((sum, o) => sum + o.totalAmount, 0),
    prevTotalOrders: prevOrders.length,
  };
}

export function weekdayLabel(index: number): string {
  return WEEKDAY_LABELS[index] ?? "";
}
