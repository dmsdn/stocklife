// components/home/home-hero-card.tsx
// ✅ 홈 화면의 핵심 UI. 사용자의 "현재 장보기 상황"을 상태 기반 3-variant로 보여줌.
//
// 상태 판단 근거(전부 실제 데이터):
//   - EMPTY: 어떤 저장 리스트(CartGroup)에도 상품이 하나도 없음
//   - SHOPPING: lib/shopping-session.ts에 기록된 세션의 groupId가 실제 존재하는 리스트를 가리킴
//     (Scan에서 바코드가 정상적으로 스캔된 이후부터 유지됨)
//   - LIST_READY: 위 둘 다 아니면서 상품이 담긴 리스트가 하나 이상 있음 → 그중 대표 1개를 표시
//
// ✅ "가장 최근" 리스트는 이제 실제 CartGroup.updatedAt(백엔드에 새로 추가됨) 기준으로
//   정렬합니다 — 예전엔 updatedAt이 없어서 id가 가장 큰(생성 순서상 최근) 것으로
//   대체했었는데, 이제 진짜 "최근에 건드린" 리스트를 보여줍니다. updatedAt이 없는(예:
//   아직 이 필드를 못 받아온 게스트 캐시 등) 경우를 위해 id 비교를 폴백으로 남겨둡니다.
"use client";

import { RiRoadMapLine, RiQrScanLine, RiCalendarLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CartGroup } from "@/lib/cart-storage";
import type { ShoppingSession } from "@/lib/shopping-session";
import { formatShoppingDate } from "@/lib/format-time";
import { findNearestUpcomingVisit } from "@/lib/visit-schedule";
import { getStoreDayInfo } from "@/lib/store-hours";

interface HomeHeroCardProps {
  loggedIn: boolean;
  cartGroups: CartGroup[];
  shoppingSession: ShoppingSession | null;
  onCreateList: () => void;
  onLoginClick: () => void;
  onOpenList: (groupId: number) => void;
  onOpenScan: (groupId: number) => void;
  onOpenRoute: (groupId: number) => void;
}

function topCategories(products: CartGroup["products"], limit = 3) {
  const counts = new Map<string, number>();
  for (const p of products) {
    if (!p.category) continue;
    counts.set(p.category, (counts.get(p.category) ?? 0) + p.quantity);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/** ✅ "며칠 뒤 방문 예정" — 여러 리스트 중 가장 가까운 shoppingDate 하나 + 그날 영업시간.
 *  Hero Card의 3가지 상태와 무관하게(=SHOPPING 중이어도) 공통으로 보여줍니다. */
function UpcomingVisitLine({ cartGroups }: { cartGroups: CartGroup[] }) {
  const visit = findNearestUpcomingVisit(cartGroups);
  if (!visit) return null;

  const dayInfo = getStoreDayInfo(new Date(`${visit.group.shoppingDate}T00:00:00`));
  const dayLabel = visit.daysUntil === 0 ? "오늘" : visit.daysUntil === 1 ? "내일" : `D-${visit.daysUntil}`;

  return (
    <div className="mt-3 flex items-start gap-2 rounded-md border border-border p-3 text-xs">
      <RiCalendarLine size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
      <p className="min-w-0 text-muted-foreground">
        <span className="font-semibold text-foreground">{dayLabel}</span> · {formatShoppingDate(visit.group.shoppingDate)} "
        {visit.group.title}" 방문 예정
        {dayInfo.closed
          ? ` · ${dayInfo.closedReason}이에요, 이 날은 매장이 쉬어요`
          : ` · 영업시간 ${dayInfo.hours.open}~${dayInfo.hours.close}`}
      </p>
    </div>
  );
}

export function HomeHeroCard({
  loggedIn,
  cartGroups,
  shoppingSession,
  onCreateList,
  onLoginClick,
  onOpenList,
  onOpenScan,
  onOpenRoute,
}: HomeHeroCardProps) {
  const shoppingGroup = shoppingSession
    ? cartGroups.find((g) => g.id === shoppingSession.groupId)
    : undefined;

  // --- SHOPPING ---------------------------------------------------------
  if (shoppingGroup && shoppingSession) {
    return (
      <section className="w-full px-4 sm:px-6 lg:px-8">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">장보고 있군요 🛒</p>
          <h2 className="mt-1 truncate text-lg font-semibold">{shoppingGroup.title}</h2>
          <p className="mt-1.5 text-sm">
            지금까지 <span className="font-semibold">{shoppingSession.scannedSkuIds.length}개</span> 담았어요
          </p>

          <UpcomingVisitLine cartGroups={cartGroups} />

          <div className="mt-4 flex gap-2">
            <Button className="min-w-0 flex-1" onClick={() => onOpenScan(shoppingGroup.id)}>
              <RiQrScanLine size={20} />
              <span className="truncate">스캔 화면 열기</span>
            </Button>
            <Button
              variant="outline"
              className="min-w-0 flex-1"
              onClick={() => onOpenRoute(shoppingGroup.id)}
            >
              <RiRoadMapLine size={20} />
              <span className="truncate">동선 보러가기</span>
            </Button>
          </div>
        </Card>
      </section>
    );
  }

  const readyGroups = cartGroups.filter((g) => g.products.length > 0);

  // --- EMPTY --------------------------------------------------------------
  if (readyGroups.length === 0) {
    return (
      <section className="w-full px-4 sm:px-6 lg:px-8">
        <Card className="p-6">
          <p className="text-lg font-semibold">필요한 걸 하나씩 담아볼까요?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {loggedIn
              ? "장보기 목록을 만들면 여기서 바로 시작할 수 있어요."
              : "로그인하면 장보기 목록을 저장하고 관리할 수 있어요."}
          </p>
          <Button className="mt-4 w-full" onClick={loggedIn ? onCreateList : onLoginClick}>
            {loggedIn ? "새 장보기 목록" : "로그인하고 시작하기"}
          </Button>

          <UpcomingVisitLine cartGroups={cartGroups} />
        </Card>
      </section>
    );
  }

  // --- LIST_READY -----------------------------------------------------
  const latestGroup = readyGroups.reduce((a, b) => {
    if (a.updatedAt && b.updatedAt) {
      return new Date(b.updatedAt).getTime() > new Date(a.updatedAt).getTime() ? b : a;
    }
    return b.id > a.id ? b : a; // updatedAt 없으면 id(생성순) 폴백
  });
  const totalCount = latestGroup.products.reduce((sum, p) => sum + p.quantity, 0);
  const cats = topCategories(latestGroup.products);

  return (
    <section className="w-full px-4 sm:px-6 lg:px-8">
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">오늘 장볼 준비됐나요? :)</p>
        <h2 className="mt-1 truncate text-lg font-semibold">{latestGroup.title}</h2>

        <p className="mt-2 text-sm">
          <span className="font-semibold">{totalCount}개</span> 상품
          {cats.length > 0 && (
            <span className="text-muted-foreground">
              {" · "}
              {cats.map(([name, count]) => `${name} ${count}`).join(" · ")}
            </span>
          )}
        </p>

        <Button className="mt-4 w-full" onClick={() => onOpenList(latestGroup.id)}>
          장보기 시작하기
        </Button>

        <UpcomingVisitLine cartGroups={cartGroups} />
      </Card>
    </section>
  );
}
