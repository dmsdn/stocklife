// lib/visit-schedule.ts
// ✅ "며칠 뒤 방문 예정" 표시용 — 여러 리스트 중 오늘 이후로 가장 가까운 shoppingDate를
//   가진 리스트를 찾습니다. 이미 있는 CartGroup.shoppingDate만 쓰므로 새 API 불필요.
import type { CartGroup } from "./cart-storage";

export interface UpcomingVisit {
  group: CartGroup & { shoppingDate: string };
  daysUntil: number; // 0 = 오늘, 1 = 내일 ...
}

export function findNearestUpcomingVisit(groups: CartGroup[]): UpcomingVisit | null {
  const todayStr = new Date().toISOString().slice(0, 10);

  const candidates = groups
    .filter((g): g is CartGroup & { shoppingDate: string } => !!g.shoppingDate && g.shoppingDate >= todayStr)
    .sort((a, b) => a.shoppingDate.localeCompare(b.shoppingDate));

  if (candidates.length === 0) return null;

  const group = candidates[0];
  const today = new Date(`${todayStr}T00:00:00`);
  const target = new Date(`${group.shoppingDate}T00:00:00`);
  const daysUntil = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  return { group, daysUntil };
}
