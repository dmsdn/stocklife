// components/domain/scan-cart-dialog.tsx
// ✅ 참고 이미지(Frame 127/138, 스캔 중 담긴 상품 바텀시트)에 맞춰 "영수증" 점선/모노스페이스
//   느낌을 걷어내고, 다른 화면(리스트 상세/카트)과 같은 상품 행 스타일(정사각 이미지 +
//   이름/수량×가격, rounded-sm 이미지, rounded-full 결제 버튼)로 통일. 로직은 그대로.
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
          <DialogTitle>{group?.title ?? "스캔한 상품"}</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="py-6 text-center">
            <p className="text-sm">결제가 완료됐어요.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 flex h-[60px] w-fit mx-auto px-5 items-center justify-center rounded-full bg-brand text-sm font-medium text-brand-foreground"
            >
              닫기
            </button>
          </div>
        ) : !group || group.products.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            아직 스캔해서 담은 상품이 없어요.
          </p>
        ) : (
          <>
            <div className="max-h-[50vh] divide-y divide-border overflow-y-auto">
              {group.products.map((p) => (
                <div key={p.id} className="flex gap-3 py-3">
                  {p.image ? (
                    <img src={p.image} alt="" className="h-16 w-16 shrink-0 rounded-sm border border-border object-cover" />
                  ) : (
                    <div className="h-16 w-16 shrink-0 rounded-sm border border-border bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{p.name}</p>
                    {p.category && <p className="mt-0.5 text-xs text-muted-foreground">{p.category}</p>}
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{p.quantity}개</span>
                      <span className="font-semibold">{(p.price * p.quantity).toLocaleString()}원</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ✅ 신규(요청) — 결제 금액 위 적립 예정 포인트 안내(스캔 화면 하단과 동일하게
                2% 예상 적립). */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>적립 예정 포인트</span>
              <span>{Math.floor(total * 0.02).toLocaleString()}P</span>
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
              <span>총 합계</span>
              <span>{total.toLocaleString()}원</span>
            </div>

            <button
              type="button"
              disabled={checkingOut}
              onClick={handleCheckout}
              className="flex h-[60px] w-fit mx-auto px-5 items-center justify-center rounded-full bg-brand text-sm font-medium text-brand-foreground disabled:opacity-50"
            >
              {checkingOut ? "처리 중..." : "결제하기"}
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
