// components/domain/scan-cart-dialog.tsx
// "카트 내역 보기" — 저장(saved) 화면과는 다른, 지금 이 리스트에 실제로 담긴 상품만 보여주는
// 결제 직전용 화면입니다. 수량/삭제는 여기서 직접 못 건드리고 스캔으로만 바뀝니다(요청사항).
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { readCartGroups, updateCartGroups, type CartGroup } from "@/lib/cart-storage";

interface ScanCartDialogProps {
  open: boolean;
  onClose: () => void;
  groupId: number;
  onCheckedOut: () => void;
}

export function ScanCartDialog({ open, onClose, groupId, onCheckedOut }: ScanCartDialogProps) {
  const [group, setGroup] = useState<CartGroup | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setGroup(readCartGroups().find((g) => g.id === groupId) ?? null);
      setDone(false);
    }
  }, [open, groupId]);

  const total = group?.products.reduce((sum, p) => sum + p.price * p.quantity, 0) ?? 0;

  const handleCheckout = () => {
    setCheckingOut(true);
    // ⚠ 실제 결제 API 없음 — 목업으로 이 리스트를 비우는 걸로 "결제 완료" 처리
    updateCartGroups((gs) => gs.map((g) => (g.id === groupId ? { ...g, products: [] } : g)));
    setCheckingOut(false);
    setDone(true);
    onCheckedOut();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>스캔한 상품</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="py-6 text-center">
            <p className="text-sm">결제가 완료됐어요.</p>
            <Button className="mt-4 w-full" onClick={onClose}>
              닫기
            </Button>
          </div>
        ) : !group || group.products.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            아직 스캔해서 담은 상품이 없어요.
          </p>
        ) : (
          <>
            <div className="max-h-[50vh] divide-y divide-border overflow-y-auto">
              {group.products.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p>{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.price.toLocaleString()}원 × {p.quantity}
                    </p>
                  </div>
                  <span className="font-medium">{(p.price * p.quantity).toLocaleString()}원</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
              <span>총 합계</span>
              <span>{total.toLocaleString()}원</span>
            </div>

            <Button className="w-full" disabled={checkingOut} onClick={handleCheckout}>
              {checkingOut ? "처리 중..." : "결제하기"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
