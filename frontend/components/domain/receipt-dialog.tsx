// components/domain/receipt-dialog.tsx
// ✅ 전자 영수증을 별도 페이지 대신 모달로 표시. 디자인은 기존 상세 페이지 그대로 재사용.
"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";

interface OrderItem {
  skuId: number;
  productName: string;
  priceKrw: number;
  quantity: number;
}
interface Order {
  orderId: number;
  totalAmount: number;
  status: string;
  items: OrderItem[];
  orderedAt?: string;
  paymentMethod?: string;
}

export function ReceiptDialog({
  order,
  onClose,
}: {
  order: Order | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="p-0" style={{ width: "90%", maxWidth: 420 }}>
        {order && (
          <div className="mx-auto w-full rounded-sm bg-card p-5 font-mono text-xs leading-relaxed">
            <div className="text-center">
              <p className="text-sm font-bold">STOREFLOW MART</p>
              <p className="mt-1 text-muted-foreground">서울시 강남구 테헤란로 5길 20</p>
              <p className="text-muted-foreground">TEL. 02-0000-0000</p>
            </div>

            <div className="my-3 border-t border-dashed border-border" />

            <div className="flex justify-between text-muted-foreground">
              <span>주문번호</span>
              <span>#{order.orderId}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>결제상태</span>
              <span>{order.status === "PAID" ? "결제완료" : order.status}</span>
            </div>
            {order.orderedAt && (
              <div className="flex justify-between text-muted-foreground">
                <span>주문일시</span>
                <span>
                  {new Date(order.orderedAt).toLocaleString("ko-KR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )}
            {order.paymentMethod && (
              <div className="flex justify-between text-muted-foreground">
                <span>결제수단</span>
                <span>{order.paymentMethod}</span>
              </div>
            )}

            <div className="my-3 border-t border-dashed border-border" />

            <div className="space-y-2">
              {order.items.map((item) => (
                <div key={item.skuId}>
                  <p className="truncate">{item.productName}</p>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{item.priceKrw.toLocaleString()} × {item.quantity}</span>
                    <span className="text-foreground">{(item.priceKrw * item.quantity).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="my-3 border-t border-dashed border-border" />

            <div className="flex justify-between text-sm font-bold">
              <span>합계</span>
              <span>{order.totalAmount.toLocaleString()}원</span>
            </div>

            <div className="my-3 border-t border-dashed border-border" />

            <p className="text-center text-md text-muted-foreground">이용해 주셔서 감사합니다</p>

            <div className="mt-3 flex h-8 items-end justify-center gap-[2px]">
              {Array.from({ length: 28 }).map((_, i) => (
                <span
                  key={i}
                  className="bg-foreground"
                  style={{ width: 1.5, height: `${8 + ((i * 37) % 20)}px` }}
                />
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
