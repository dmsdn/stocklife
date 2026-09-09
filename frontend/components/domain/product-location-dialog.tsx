// components/domain/product-location-dialog.tsx
// ✅ 상품 카드에 붙는 위치 텍스트("3층 유제품 코너")를 눌렀을 때 뜨는 단일 상품 위치 보기.
//   StoreMapDialog(동선 보기)와 달리 경로 계산 없이 핀 하나만 지도에 찍습니다.
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StoreMap, type MapPin } from "./store-map";
import { fetchInventoryBatch, pickLocation } from "@/lib/product-location";

interface ProductLocationDialogProps {
  open: boolean;
  onClose: () => void;
  skuId: number;
  name: string;
  price: number;
}

export function ProductLocationDialog({ open, onClose, skuId, name, price }: ProductLocationDialogProps) {
  const [pin, setPin] = useState<MapPin | null | undefined>(undefined); // undefined: 로딩중, null: 위치 없음
  const [floorNo, setFloorNo] = useState(1);

  useEffect(() => {
    if (!open) return;
    setPin(undefined);

    fetchInventoryBatch([skuId]).then((map) => {
      const loc = pickLocation(map.get(skuId));
      if (!loc) {
        setPin(null);
        return;
      }
      setFloorNo(loc.floorNo);
      setPin({ id: skuId, name, price, x: loc.x, y: loc.y });
    });
  }, [open, skuId, name, price]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[95vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-y-auto p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>{name} 위치</DialogTitle>
        </DialogHeader>

        {pin === undefined ? (
          <p className="py-8 text-center text-sm text-muted-foreground">위치 정보를 불러오는 중...</p>
        ) : pin === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">위치 정보가 없어요.</p>
        ) : (
          <StoreMap floorNo={floorNo} pins={[pin]} routeOrder={[]} showFloorBadge />
        )}
      </DialogContent>
    </Dialog>
  );
}