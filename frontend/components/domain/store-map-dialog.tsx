// components/domain/store-map-dialog.tsx
// ✅ 목업 상품 좌표(lib/mock-products.ts) 대신 실제 GET /api/products/{skuId}/inventory로
//   핀 위치를 가져왔던 걸, 상품 개수만큼 개별 호출하던 방식에서 배치 API
//   (GET /api/products/inventory?skuIds=1,2,3) 한 번 호출로 교체했습니다 — lib/product-location.ts.
//   통로 격자는 지난번에 이미 실제 GET /api/map/floors/{floorNo}로
//   연동해뒀고, 경로 계산은 그 실제 격자 위에서 로컬 A*로 합니다.
// ⚠ POST /api/navigation/route(서버가 직접 A*까지 계산해주는 API)는 응답 형태가 지금의
//   핀 기반 렌더링과 안 맞아서(경로만 주지 핀 좌표를 안 줌) 이번엔 안 바꿨습니다 —
//   나중에 StoreMap 렌더링 자체를 그 응답 형태에 맞게 새로 짜면 서버 계산으로 바꿀 수 있어요.
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StoreMap, type MapPin } from "./store-map";
import { readCartGroups } from "@/lib/cart-storage";
import { fetchInventoryBatch, pickLocation } from "@/lib/product-location";
import { computeNearestNeighborOrder } from "@/lib/route-order";

interface StoreMapDialogProps {
  open: boolean;
  onClose: () => void;
  groupId: number;
  collectedIds: Set<number>;
}

export function StoreMapDialog({ open, onClose, groupId, collectedIds }: StoreMapDialogProps) {
  const [pins, setPins] = useState<MapPin[] | null>(null);

  useEffect(() => {
    if (!open) return;
    const group = readCartGroups().find((g) => g.id === groupId);
    const items = group?.products ?? [];

    if (items.length === 0) {
      setPins([]);
      return;
    }

    fetchInventoryBatch(items.map((item) => item.id)).then((invMap) => {
      const result = items
        .map((item): MapPin | null => {
          const loc = pickLocation(invMap.get(item.id));
          if (!loc) return null;
          return {
            id: item.id,
            name: item.name,
            price: item.price,
            x: loc.x,
            y: loc.y,
            collected: collectedIds.has(item.id),
          };
        })
        .filter((p): p is MapPin => p !== null);
      setPins(result);
    });
  }, [open, groupId, collectedIds]);

  const remainingPins = (pins ?? []).filter((p) => !p.collected);
  const routeOrder = computeNearestNeighborOrder(
    { x: 0, y: 0 },
    remainingPins.map((p) => ({ id: p.id, x: p.x, y: p.y }))
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[95vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-y-auto p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>동선 보기</DialogTitle>
        </DialogHeader>

        {pins === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">위치 정보를 불러오는 중...</p>
        ) : pins.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            담긴 상품이 없거나 위치 정보가 없어요.
          </p>
        ) : (
          <>
            <StoreMap floorNo={1} pins={pins} routeOrder={routeOrder} />
            <p className="p-4 pt-2 text-xs text-muted-foreground">
              아직 안 담은 상품 {remainingPins.length}개 기준으로 동선을 계산했어요. 스캔해서 담으면 그 핀은
              동선에서 빠집니다.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}