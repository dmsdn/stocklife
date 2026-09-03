// components/domain/store-map-dialog.tsx
// ✅ 실제 동선 agent API(POST /api/navigation/route, lib/navigation.ts)로 교체 — 예전엔
//   상품 위치(핀)만 실제 데이터로 가져오고 경로는 로컬 A*로 프론트에서 계산했는데, 이제
//   경로 자체를 이 API가 실시간으로 계산해준 걸 그대로 씀(흰 통로만 따라가는 것도, 여러
//   층을 오가는 것도 전부 이 API 책임 — StoreMap엔 결과 좌표만 넘겨서 그리기만 함).
//   시작 위치는 1층 (0,0) 고정(입구) — 실제 GPS/비콘 연동 전이라 RouteDialog와 동일.
// ✅ 신규 — "아무 매대나 눌러서 그 안의 상품 목록 보기". 담은 상품 핀/동선과는 별개로,
//   지도의 매대 칸을 누르면 실제 GET /api/locations/{locationId}/products를 호출해
//   그 매대에 진열된 상품을 보여줍니다.
"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StoreMap, type MapPin } from "./store-map";
import { readCartGroups, loadCartGroups, type CartGroup } from "@/lib/cart-storage";
import { fetchProductsAtLocation, type LocationProduct } from "@/lib/location-products";
import { getRoute, type RouteResult, type RouteStop } from "@/lib/navigation";
import { fetchInventoryBatch, pickLocation } from "@/lib/product-location";
import { FLOOR_MAPS } from "@/lib/map-config";
import { useOpenAiChat } from "@/lib/use-open-ai-chat";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";

interface StoreMapDialogProps {
  open: boolean;
  onClose: () => void;
  groupId: number;
  collectedIds: Set<number>;
}

export function StoreMapDialog({ open, onClose, groupId, collectedIds }: StoreMapDialogProps) {
  const [group, setGroup] = useState<CartGroup | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [floorNo, setFloorNo] = useState(1);
  const openAiChat = useOpenAiChat();

  // ✅ 지도(동선) 화면일 땐 하단탭바 숨김
  const { setHidden: setBottomBarHidden } = useBottomBarVisibility();
  useEffect(() => {
    setBottomBarHidden(open);
    return () => setBottomBarHidden(false);
  }, [open, setBottomBarHidden]);

  // ✅ 매대 클릭으로 연 상품 목록
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [locationProducts, setLocationProducts] = useState<LocationProduct[] | null>(null);
  const [locationError, setLocationError] = useState(false);

  const handleLocationClick = (locationId: string) => {
    setSelectedLocationId(locationId);
    setLocationProducts(null);
    setLocationError(false);
    fetchProductsAtLocation(locationId)
      .then(setLocationProducts)
      .catch(() => setLocationError(true));
  };

  useEffect(() => {
    if (!open) return;
    // ✅ 수정(2026-09) — "동선이 안 불러와짐" 원인: readCartGroups()는 로컬(비회원) 캐시만
    //   읽는 동기 함수라, 회원인데 이 세션에서 아직 /saved를 안 들렀으면(예: 홈→스캔→바로
    //   동선 보기) 그 로컬 캐시가 비어있어서 group을 못 찾고 "담긴 상품이 없어요"로 잘못
    //   떴음. loadCartGroups()로 서버에서 최신 목록을 직접 받아오게(실패 시 로컬 폴백).
    let cancelled = false;
    (async () => {
      const groups = await loadCartGroups().catch(() => readCartGroups());
      if (cancelled) return;
      const found = groups.find((g) => g.id === groupId) ?? null;
      setGroup(found);
      const remainingItems = (found?.products ?? []).filter((p) => !collectedIds.has(p.id));

      if (remainingItems.length === 0) {
        setRoute(null);
        setRouteError("담긴 상품이 없거나 전부 스캔했어요.");
        return;
      }

      setRoute(null);
      setRouteError(null);
      setFloorNo(1);

      // ✅ 신규 — "agent가 계산해준 최적의 동선" 요청: POST /api/navigation/route는 방문
      //   순서를 스스로 안 정하고(백엔드 주석: "Agent가 자연어를 해석해서 이미 정해서
      //   넘긴다"), 넘긴 stops 배열 순서 그대로 구간만 이어줍니다. 그런데 프론트가 지금까지
      //   순서를 안 정하고 담긴 순서 그대로 넘기고 있었음 — 최적 동선이 아니었던 원인.
      //   실제 좌표(fetchInventoryBatch)를 먼저 받아서, 출발점(입구 0,0)부터 매번 가장
      //   가까운 미방문 상품을 고르는 최근접 이웃(nearest-neighbor)으로 방문 순서를 정한
      //   뒤에 그 순서로 stops를 넘깁니다 — 완벽한 최적해는 아니지만 담긴 순서 그대로보다
      //   훨씬 동선 낭비가 적습니다.
      const inventoryMap = await fetchInventoryBatch(remainingItems.map((p) => p.id));
      if (cancelled) return;

      const withLoc = remainingItems
        .map((item) => ({ item, loc: pickLocation(inventoryMap.get(item.id)) }))
        .filter((v): v is { item: (typeof remainingItems)[number]; loc: NonNullable<typeof v.loc> } => !!v.loc);
      const withoutLoc = remainingItems.filter((item) => !withLoc.some((v) => v.item.id === item.id));

      const ordered: typeof remainingItems = [];
      let cursor = { x: 0, y: 0 };
      const pool = [...withLoc];
      while (pool.length > 0) {
        let nearestIdx = 0;
        let nearestDist = Infinity;
        pool.forEach((v, i) => {
          const d = Math.hypot(v.loc.x - cursor.x, v.loc.y - cursor.y);
          if (d < nearestDist) {
            nearestDist = d;
            nearestIdx = i;
          }
        });
        const [picked] = pool.splice(nearestIdx, 1);
        ordered.push(picked.item);
        cursor = { x: picked.loc.x, y: picked.loc.y };
      }
      // 위치를 못 찾은 상품(품절 등)은 끝에 그대로 붙임 — 백엔드가 UNRESOLVED로 표시해줌
      ordered.push(...withoutLoc);

      const stops: RouteStop[] = ordered.map((item) => ({ skuId: item.id, label: item.name }));
      getRoute({ floorNo: 1, x: 0, y: 0 }, stops)
        .then((r) => !cancelled && setRoute(r))
        .catch(() => !cancelled && setRouteError("동선을 불러오지 못했어요."));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, groupId, collectedIds]);

  const remainingItems = (group?.products ?? []).filter((p) => !collectedIds.has(p.id));

  // ✅ 각 leg의 마지막 좌표(목적지)에 핀을 놓고, 그 좌표가 있는 층을 핀에 같이 기록.
  //   방문 순서(routeOrder)는 leg 배열 순서 그대로(agent가 이미 순서까지 정해줌).
  const { pinsByFloor, routeOrder, pathByFloor } = useMemo(() => {
    const pByFloor = new Map<number, MapPin[]>();
    const order: number[] = [];
    const pathMap = new Map<number, { x: number; y: number }[]>();

    if (route) {
      for (const leg of route.legs) {
        if (leg.status !== "OK" || leg.path.length === 0) continue;
        const dest = leg.path[leg.path.length - 1];
        const item = leg.skuId != null ? remainingItems.find((p) => p.id === leg.skuId) : undefined;

        const pin: MapPin = {
          id: leg.skuId ?? leg.stopIndex,
          name: item?.name ?? leg.label ?? "목적지",
          price: item?.price ?? 0,
          image: item?.image,
          x: dest.x,
          y: dest.y,
        };
        pByFloor.set(dest.floorNo, [...(pByFloor.get(dest.floorNo) ?? []), pin]);
        order.push(pin.id);

        for (const point of leg.path) {
          pathMap.set(point.floorNo, [...(pathMap.get(point.floorNo) ?? []), { x: point.x, y: point.y }]);
        }
      }
    }
    return { pinsByFloor: pByFloor, routeOrder: order, pathByFloor: pathMap };
  }, [route, remainingItems]);

  // ✅ 층 선택은 동선이 실제로 여러 층에 걸쳐 있을 때만 보이던 걸(경로 계산 실패하면
  //   아예 안 보였음), 매장 지도(FLOOR_MAPS)에 등록된 층이 여러 개면 항상 보이게 고침 —
  //   동선이 안 잡혀도 사용자가 직접 다른 층을 둘러볼 수 있어야 하니까.
  const hasMultipleFloors = FLOOR_MAPS.length > 1;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* ✅ 참고 이미지처럼 거의 풀스크린으로, 제목도 "동선 보기" 대신 실제 리스트 이름 */}
      <DialogContent className="flex h-[95vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>{group?.title ?? "리스트 이름"}</DialogTitle>
        </DialogHeader>

        {!route && !routeError ? (
          <p className="py-8 text-center text-sm text-muted-foreground">동선을 계산하는 중...</p>
        ) : routeError ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{routeError}</p>
        ) : (
          <>
            <StoreMap
              floorNo={floorNo}
              pins={pinsByFloor.get(floorNo) ?? []}
              routeOrder={routeOrder}
              precomputedPath={pathByFloor.get(floorNo) ?? []}
              onLocationClick={handleLocationClick}
              onFloorChange={hasMultipleFloors ? setFloorNo : undefined}
              onLivClick={() => openAiChat(group ? `"${group.title}" 리스트 동선 관련해서 물어볼게` : undefined, groupId)}
            />
            <p className="p-4 pt-2 text-xs text-muted-foreground">
              아직 안 담은 상품 {remainingItems.length}개 기준으로 동선을 계산했어요(1층 입구에서 출발). 스캔해서
              담으면 그 핀은 동선에서 빠집니다.
            </p>
          </>
        )}
      </DialogContent>

      {/* ✅ 매대 칸을 눌렀을 때 그 안의 상품 목록 */}
      <Dialog open={selectedLocationId !== null} onOpenChange={(v) => !v && setSelectedLocationId(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>매대 상품 목록</DialogTitle>
          </DialogHeader>

          {locationError ? (
            <p className="py-6 text-center text-sm text-muted-foreground">상품 목록을 불러오지 못했어요.</p>
          ) : locationProducts === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">불러오는 중...</p>
          ) : locationProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">이 매대엔 등록된 상품이 없어요.</p>
          ) : (
            <ul className="divide-y divide-border">
              {locationProducts.map((p) => (
                <li key={p.skuId} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">재고 {p.stock}개</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">{p.price.toLocaleString()}원</p>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}