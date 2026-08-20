// components/domain/store-map-dialog.tsx
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StoreMap, type MapPin } from "./store-map";
import { readCartGroups } from "@/lib/cart-storage";
import { getMockProductById } from "@/lib/mock-products";
import { computeNearestNeighborOrder } from "@/lib/route-order";

interface StoreMapDialogProps {
  open: boolean;
  onClose: () => void;
  groupId: number;
  collectedIds: Set<number>;
}

export function StoreMapDialog({ open, onClose, groupId, collectedIds }: StoreMapDialogProps) {
  const group = readCartGroups().find((g) => g.id === groupId);
  const items = group?.products ?? [];

  const pins: MapPin[] = items
    .map((item) => {
      const product = getMockProductById(item.id);
      if (!product) return null;
      return {
        id: item.id,
        name: item.name,
        price: item.price,
        x: product.location.x,
        y: product.location.y,
        collected: collectedIds.has(item.id),
      };
    })
    .filter((p): p is MapPin => !!p);

  const remainingPins = pins.filter((p) => !p.collected);
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

        {pins.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">담긴 상품이 없어요.</p>
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
