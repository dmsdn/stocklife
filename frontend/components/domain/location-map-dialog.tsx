// components/domain/location-map-dialog.tsx
// ✅ 신규 — 상품 상세의 "매대번호"를 눌렀을 때 그 위치 하나만 지도에 표시하는 경량
//   다이얼로그. StoreMapDialog(장바구니 그룹 + 동선 계산)와 달리 그룹/동선이 필요 없어서
//   따로 만들었습니다 — StoreMap 자체는 그대로 재사용(핀 1개, 동선 없음).
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StoreMap } from "./store-map";

interface LocationMapDialogProps {
  open: boolean;
  onClose: () => void;
  floorNo: number;
  x: number;
  y: number;
  productName: string;
  price: number;
}

export function LocationMapDialog({
  open,
  onClose,
  floorNo,
  x,
  y,
  productName,
  price,
}: LocationMapDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[95vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-y-auto p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>매대 위치</DialogTitle>
        </DialogHeader>

        <StoreMap
          floorNo={floorNo}
          pins={[{ id: 0, name: productName, price, x, y }]}
          routeOrder={[]}
        />
      </DialogContent>
    </Dialog>
  );
}
