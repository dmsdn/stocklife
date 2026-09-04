// components/domain/attach-list-picker-dialog.tsx
// AI 채팅 "+"에서 "저장된 리스트 불러오기"/"전자영수증 불러오기" 선택 시 뜨는 목록.
// ✅ 수정(2026-09) — "눌러도 목록이 안 불러와짐" 원인: readCartGroups()(로컬 캐시 전용,
//   비어있을 수 있음)를 쓰고 있었음 — 이 화면 저 화면에서 반복해 겪은 것과 같은
//   버그(loadCartGroups()로 서버에서 직접 받아와야 함). 여기에 더해 애초에 "전자영수증"
//   탭 자체가 없었음(리스트만 있었음) — 실제 GET /api/orders(전자영수증 화면과 동일 API)로
//   진짜 영수증도 같이 불러오도록 탭을 나눴습니다.
//   행 높이를 키우고 구분선(border)은 없애고 대신 간격(gap)으로 나눴고, 폭이 화면
//   끝까지 늘어나던 카드도 절반을 안 넘게 왼쪽 정렬로 줄였습니다.
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { loadCartGroups, type CartGroup } from "@/lib/cart-storage";

interface AttachListPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (id: number, title: string, kind: "list" | "receipt") => void;
}

interface Order {
  orderId: number;
  totalAmount: number;
  items: { skuId: number; productName: string; priceKrw: number; quantity: number }[];
  orderedAt?: string;
}

type Tab = "receipts" | "lists";

export function AttachListPickerDialog({ open, onClose, onSelect }: AttachListPickerDialogProps) {
  const [tab, setTab] = useState<Tab>("lists");
  const [groups, setGroups] = useState<CartGroup[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab("lists");
    setGroups(null);
    setOrders(null);
    loadCartGroups().then(setGroups).catch(() => setGroups([]));
    apiFetch<Order[]>("/api/orders").then(setOrders).catch(() => setOrders([]));
  }, [open]);

  const rowClass =
    "flex h-16 w-fit max-w-[50%] items-center gap-3 rounded-sm px-3 text-left text-sm hover:bg-muted";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>불러올 항목을 선택하세요</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 rounded-full bg-muted p-1">
          <button
            type="button"
            onClick={() => setTab("receipts")}
            className={`h-9 flex-1 rounded-full text-sm font-medium transition ${tab === "receipts" ? "bg-white shadow-sm" : "text-muted-foreground"}`}
          >
            전자영수증
          </button>
          <button
            type="button"
            onClick={() => setTab("lists")}
            className={`h-9 flex-1 rounded-full text-sm font-medium transition ${tab === "lists" ? "bg-white shadow-sm" : "text-muted-foreground"}`}
          >
            리스트
          </button>
        </div>

        {tab === "lists" ? (
          <div className="flex flex-col gap-2">
            {groups === null ? (
              <p className="py-6 text-center text-sm text-muted-foreground">불러오는 중...</p>
            ) : groups.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">저장된 리스트가 없어요.</p>
            ) : (
              groups.map((group) => {
                const total = group.products
                  .filter((p) => p.checked)
                  .reduce((sum, p) => sum + p.price * p.quantity, 0);
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => {
                      onSelect(group.id, group.title, "list");
                      onClose();
                    }}
                    className={rowClass}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{group.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {group.products.length}개 · {total.toLocaleString()}원
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {orders === null ? (
              <p className="py-6 text-center text-sm text-muted-foreground">불러오는 중...</p>
            ) : orders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">전자영수증이 없어요.</p>
            ) : (
              orders.map((order) => {
                const label = order.items[0]?.productName
                  ? `${order.items[0].productName}${order.items.length > 1 ? ` 외 ${order.items.length - 1}건` : ""}`
                  : `주문 #${order.orderId}`;
                return (
                  <button
                    key={order.orderId}
                    type="button"
                    onClick={() => {
                      onSelect(order.orderId, label, "receipt");
                      onClose();
                    }}
                    className={rowClass}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{label}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {order.totalAmount.toLocaleString()}원
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
