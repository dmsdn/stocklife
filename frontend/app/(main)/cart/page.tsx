// app/(main)/cart/page.tsx
// ⚠ 백엔드 GET /api/cart는 {cartItemId, skuId, quantity, checked}만 돌려주고
//   상품명·가격이 없습니다 (상품 상세 조회 API 자체가 없음). 그래서 지금은 이름 자리에
//   "상품 #skuId", 가격 자리에 "-"만 표시하고, 합계 금액 계산도 못 합니다.
//   → GET /api/products/{skuId} 같은 단건 조회 API가 생기면 이 부분을 실제 이름/가격으로
//     채우고 합계도 다시 계산하도록 고쳐야 합니다.
// ⚠ 삭제/수량변경/체크는 skuId가 아니라 cartItemId 기준입니다 (백엔드 경로가 그렇게 되어있음).
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Minus, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trackConsumerEvent } from "@/lib/consumer-events";
import { apiFetch } from "@/lib/api-client";

interface CartItem {
  cartItemId: number;
  skuId: number;
  quantity: number;
  checked: boolean;
}

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const loadCart = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<CartItem[]>("/api/cart");
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCart();
  }, []);

  const handleToggleChecked = async (item: CartItem) => {
    setItems((prev) =>
      prev.map((i) => (i.cartItemId === item.cartItemId ? { ...i, checked: !i.checked } : i))
    );
    await apiFetch(`/api/cart/${item.cartItemId}`, {
      method: "PATCH",
      body: JSON.stringify({ checked: !item.checked }),
    });
  };

  const handleQuantityChange = async (item: CartItem, quantity: number) => {
    if (quantity < 1) return;
    setItems((prev) =>
      prev.map((i) => (i.cartItemId === item.cartItemId ? { ...i, quantity } : i))
    );
    await apiFetch(`/api/cart/${item.cartItemId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    });
  };

  const handleRemove = async (item: CartItem) => {
    setItems((prev) => prev.filter((i) => i.cartItemId !== item.cartItemId));
    await apiFetch(`/api/cart/${item.cartItemId}`, { method: "DELETE" });
    trackConsumerEvent({ event_type: "CART_REMOVE", sku_id: item.skuId });
  };

  const handleCheckout = async () => {
    setCheckoutError(null);
    setCheckingOut(true);
    try {
      await apiFetch("/api/orders/checkout", { method: "POST" });
      trackConsumerEvent({ event_type: "CHECKOUT" });
      router.push("/mypage/orders");
    } catch {
      setCheckoutError("결제할 상품이 선택되지 않았거나 처리 중 오류가 발생했어요.");
    } finally {
      setCheckingOut(false);
    }
  };

  const selectedCount = items.filter((i) => i.checked).length;

  return (
    <div className="mx-auto max-w-md p-4 pb-40 md:max-w-5xl md:p-8 md:pb-8">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/">
          <ChevronLeft size={20} />
        </Link>
        <p className="text-base">장바구니</p>
      </div>

      {loading && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}

      {!loading && items.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">장바구니가 비어있어요.</p>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div key={item.cartItemId} className="flex gap-3 py-3">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => handleToggleChecked(item)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-border"
              />
              {/* TODO: 상품 이미지/이름/가격 — 상품 단건 조회 API 생기면 교체 */}
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs text-muted-foreground">
                IMG
              </div>
              <div className="flex flex-1 flex-col justify-between">
                <p className="text-sm">상품 #{item.skuId}</p>
                <p className="text-xs text-muted-foreground">가격 정보 없음</p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="수량 감소"
                    onClick={() => handleQuantityChange(item, item.quantity - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-border"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center text-sm">{item.quantity}</span>
                  <button
                    type="button"
                    aria-label="수량 증가"
                    onClick={() => handleQuantityChange(item, item.quantity + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-border"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="삭제"
                    onClick={() => handleRemove(item)}
                    className="ml-auto flex h-7 w-7 items-center justify-center text-muted-foreground"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Card className="fixed inset-x-0 bottom-16 space-y-2 rounded-none border-x-0 border-b-0 p-4 md:sticky md:top-8 md:inset-auto md:h-fit md:rounded-lg md:border">
          <p className="text-sm text-muted-foreground">
            선택 {selectedCount}개 · 금액은 결제 시 서버에서 계산돼요
          </p>
          {checkoutError && <p className="text-sm text-danger">{checkoutError}</p>}
          <Button className="w-full" disabled={checkingOut || selectedCount === 0} onClick={handleCheckout}>
            {checkingOut ? "결제 처리 중..." : "구매하기"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
