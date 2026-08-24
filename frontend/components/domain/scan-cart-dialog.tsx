// components/domain/scan-cart-dialog.tsx
// ✅ 영수증 느낌으로: 각 줄에 상품 이미지(왼쪽) + 이름/수량/가격, 점선 구분선.
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
            <div className="max-h-[50vh] space-y-3 overflow-y-auto rounded-sm border border-dashed border-border p-3 font-mono text-xs">
              {group.products.map((p, i) => (
                <div key={p.id}>
                  {i > 0 && <div className="mb-3 border-t border-dashed border-border" />}
                  <div className="flex items-center gap-3">
                    {/* TODO: 실제 상품 이미지 있으면 이 자리에 렌더링 */}
                    <div className="h-10 w-10 shrink-0 rounded-sm border border-border bg-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-sans text-sm">{p.name}</p>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{p.price.toLocaleString()} × {p.quantity}</span>
                        <span className="font-semibold text-foreground">
                          {(p.price * p.quantity).toLocaleString()}원
                        </span>
                      </div>
                    </div>
                  </div>
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
