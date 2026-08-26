"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { QuantityStepper } from "@/components/domain/quantity-stepper";
import { trackConsumerEvent } from "@/lib/consumer-events";
import { apiFetch } from "@/lib/api-client";

interface CartItem {
  cartItemId: number;
  skuId: number;
  quantity: number;
  checked: boolean;
}

interface ProductDetail {
  skuId: number;
  name: string;
  priceKrw: number;
  imageUrl: string | null;
}

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Record<number, ProductDetail>>({});
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const loadCart = async () => {
    setLoading(true);
    try {
      const cartItems = await apiFetch<CartItem[]>("/api/cart");
      setItems(cartItems);

      const uniqueSkuIds = [...new Set(cartItems.map((i) => i.skuId))];
      const details = await Promise.all(
        uniqueSkuIds.map((skuId) =>
          apiFetch<ProductDetail>(`/api/products/${skuId}`, { auth: false }).catch(() => null)
        )
      );
      const productMap: Record<number, ProductDetail> = {};
      details.forEach((d) => {
        if (d) productMap[d.skuId] = d;
      });
      setProducts(productMap);
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
    setItems((prev) =>
      prev.map((i) => (i.cartItemId === item.cartItemId ? { ...i, quantity } : i))
    );
    await apiFetch(`/api/cart/${item.cartItemId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    });
    trackConsumerEvent({
      event_type: "LIST_EDIT",
      sku_id: item.skuId,
      payload: { action: "quantity", quantity },
    });
  };

  const handleRemove = async (item: CartItem) => {
    setItems((prev) => prev.filter((i) => i.cartItemId !== item.cartItemId));
    await apiFetch(`/api/cart/${item.cartItemId}`, { method: "DELETE" });
    trackConsumerEvent({ event_type: "LIST_EDIT", sku_id: item.skuId, payload: { action: "remove" } });
  };

  const handleCheckout = async () => {
    setCheckoutError(null);
    setCheckingOut(true);
    try {
      await apiFetch("/api/orders/checkout", { method: "POST" });
      trackConsumerEvent({ event_type: "PURCHASE" });
      router.push("/mypage/receipts");
    } catch {
      setCheckoutError("결제할 상품이 선택되지 않았거나 처리 중 오류가 발생했어요.");
    } finally {
      setCheckingOut(false);
    }
  };

  const selectedItems = items.filter((i) => i.checked);
  const total = selectedItems.reduce((sum, item) => {
    const price = products[item.skuId]?.priceKrw ?? 0;
    return sum + price * item.quantity;
  }, 0);

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
          {items.map((item) => {
            const product = products[item.skuId];
            return (
              <div key={item.cartItemId} className="flex gap-3 py-3">
                <span className="mt-1">
                  <Checkbox checked={item.checked} onChange={() => handleToggleChecked(item)} />
                </span>
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-sm border border-border bg-muted text-xs text-muted-foreground">
                  IMG
                </div>
                <div className="flex flex-1 flex-col justify-between">
                  <p className="text-sm">{product?.name ?? `상품 #${item.skuId}`}</p>
                  <p className="text-sm font-medium">
                    {product ? `${product.priceKrw.toLocaleString()}원` : "가격 확인 중..."}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <QuantityStepper
                      quantity={item.quantity}
                      onChange={(q) => handleQuantityChange(item, q)}
                      size="md"
                    />
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
            );
          })}
        </div>

        <Card className="fixed inset-x-0 bottom-16 space-y-2 rounded-none border-x-0 border-b-0 p-4 md:sticky md:top-8 md:inset-auto md:h-fit md:rounded-sm md:border">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>선택 {selectedItems.length}개</span>
            <span>{total.toLocaleString()}원</span>
          </div>
          {checkoutError && <p className="text-sm text-danger">{checkoutError}</p>}
          <Button className="w-full" disabled={checkingOut || selectedItems.length === 0} onClick={handleCheckout}>
            {checkingOut ? "결제 처리 중..." : "구매하기"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
