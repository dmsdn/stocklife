"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { QuantityStepper } from "@/components/domain/quantity-stepper";
import { LoginRequiredDialog } from "@/components/domain/login-required-dialog";
import { trackConsumerEvent } from "@/lib/consumer-events";
import { apiFetch, isLoggedIn } from "@/lib/api-client";
import { readCartGroups, updateCartGroups } from "@/lib/cart-storage";

interface CartItem {
  cartItemId?: number;
  localGroupId?: number;
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

interface CouponItem {
  consumerCouponId: number;
  title: string;
  description: string;
  discountType: "FIXED" | "PERCENT";
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  status: "AVAILABLE" | "USED" | "EXPIRED";
  usable: boolean;
  validUntil: string;
}

interface CouponSummary {
  availableCount: number;
  coupons: CouponItem[];
}

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Record<number, ProductDetail>>({});
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [loginRequiredOpen, setLoginRequiredOpen] = useState(false);
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<number | null>(null);
  const loggedIn = isLoggedIn();

  const loadCart = async () => {
    setLoading(true);
    try {
      let cartItems: CartItem[];
      if (loggedIn) {
        cartItems = await apiFetch<CartItem[]>("/api/cart");
      } else {
        cartItems = readCartGroups().flatMap((group) =>
            group.products.map((p) => ({
              localGroupId: group.id,
              skuId: p.id,
              quantity: p.quantity,
              checked: p.checked,
            }))
        );
      }
      setItems(cartItems);

      const uniqueSkuIds = [...new Set(cartItems.map((i) => i.skuId))];
      const details = await Promise.all(
          uniqueSkuIds.map((skuId) =>
              apiFetch<ProductDetail>(`/api/products/${skuId}`, { auth: false }).catch(() => null)
          )
      );
      const productMap: Record<number, ProductDetail> = {};
      details.forEach((d) => { if (d) productMap[d.skuId] = d; });
      setProducts(productMap);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadCart(); }, []);

  useEffect(() => {
    if (!loggedIn) return;
    apiFetch<CouponSummary>("/api/coupons/me")
        .then((data) => setCoupons(data.coupons.filter((coupon) => coupon.usable)))
        .catch(() => setCoupons([]));
  }, [loggedIn]);

  const updateGuestItem = (item: CartItem, patch: Partial<Pick<CartItem, "quantity" | "checked">>) => {
    updateCartGroups((groups) => groups.map((group) =>
        group.id !== item.localGroupId ? group : {
          ...group,
          products: group.products.map((p) => p.id === item.skuId ? { ...p, ...patch } : p),
        }
    ));
  };

  const handleToggleChecked = async (item: CartItem) => {
    const checked = !item.checked;
    setItems((prev) => prev.map((i) => i === item ? { ...i, checked } : i));
    if (!loggedIn) updateGuestItem(item, { checked });
    else if (item.cartItemId != null) await apiFetch(`/api/cart/${item.cartItemId}`, { method: "PATCH", body: JSON.stringify({ checked }) });
  };

  const handleQuantityChange = async (item: CartItem, quantity: number) => {
    setItems((prev) => prev.map((i) => i === item ? { ...i, quantity } : i));
    if (!loggedIn) updateGuestItem(item, { quantity });
    else if (item.cartItemId != null) await apiFetch(`/api/cart/${item.cartItemId}`, { method: "PATCH", body: JSON.stringify({ quantity }) });
    trackConsumerEvent({ event_type: "LIST_EDIT", sku_id: item.skuId, payload: { action: "quantity", quantity } });
  };

  const handleRemove = async (item: CartItem) => {
    setItems((prev) => prev.filter((i) => i !== item));
    if (!loggedIn) {
      updateCartGroups((groups) => groups.map((group) =>
          group.id !== item.localGroupId ? group : { ...group, products: group.products.filter((p) => p.id !== item.skuId) }
      ));
    } else if (item.cartItemId != null) {
      await apiFetch(`/api/cart/${item.cartItemId}`, { method: "DELETE" });
    }
    trackConsumerEvent({ event_type: "LIST_EDIT", sku_id: item.skuId, payload: { action: "remove" } });
  };

  const handleCheckout = async () => {
    if (!loggedIn) {
      setLoginRequiredOpen(true);
      return;
    }
    setCheckoutError(null);
    setCheckingOut(true);
    try {
      await apiFetch("/api/orders/checkout", {
        method: "POST",
        body: JSON.stringify({ consumerCouponId: selectedCouponId }),
      });
      trackConsumerEvent({ event_type: "PURCHASE" });
      router.push("/mypage/receipts");
    } catch {
      setCheckoutError("결제할 상품이 선택되지 않았거나 처리 중 오류가 발생했어요.");
    } finally {
      setCheckingOut(false);
    }
  };

  const selectedItems = items.filter((i) => i.checked);
  const total = selectedItems.reduce((sum, item) => sum + (products[item.skuId]?.priceKrw ?? 0) * item.quantity, 0);
  const selectedCoupon = coupons.find((coupon) => coupon.consumerCouponId === selectedCouponId) ?? null;
  const couponEligible = selectedCoupon ? total >= selectedCoupon.minOrderAmount : false;
  const estimatedDiscount = !selectedCoupon || !couponEligible ? 0 : (() => {
    if (selectedCoupon.discountType === "FIXED") return Math.min(selectedCoupon.discountValue, total);
    const percentDiscount = Math.floor(total * selectedCoupon.discountValue / 100);
    return Math.min(percentDiscount, selectedCoupon.maxDiscountAmount ?? percentDiscount, total);
  })();
  const payableTotal = total - estimatedDiscount;

  return (
      <div className="mx-auto max-w-md p-4 pb-40 md:max-w-5xl md:p-8 md:pb-8">
        <div className="mb-4 flex items-center gap-3">
          <Link href="/"><ChevronLeft size={20} /></Link>
          <p className="text-base">장바구니</p>
        </div>

        {loading && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}
        {!loading && items.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">장바구니가 비어있어요.</p>}

        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          <div className="divide-y divide-border">
            {items.map((item, index) => {
              const product = products[item.skuId];
              return (
                  <div key={item.cartItemId ?? `${item.localGroupId}-${item.skuId}-${index}`} className="flex gap-3 py-3">
                    <span className="mt-1"><Checkbox checked={item.checked} onChange={() => handleToggleChecked(item)} /></span>
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-sm border border-border bg-muted text-xs text-muted-foreground">IMG</div>
                    <div className="flex flex-1 flex-col justify-between">
                      <p className="text-sm">{product?.name ?? `상품 #${item.skuId}`}</p>
                      <p className="text-sm font-medium">{product ? `${product.priceKrw.toLocaleString()}원` : "가격 확인 중..."}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <QuantityStepper quantity={item.quantity} onChange={(q) => handleQuantityChange(item, q)} size="md" />
                        <button type="button" aria-label="삭제" onClick={() => handleRemove(item)} className="ml-auto flex h-7 w-7 items-center justify-center text-muted-foreground"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </div>
              );
            })}
          </div>

          <Card className="fixed inset-x-0 bottom-16 space-y-2 rounded-none border-x-0 border-b-0 p-4 md:sticky md:top-8 md:inset-auto md:h-fit md:rounded-sm md:border">
            <div className="flex justify-between text-sm text-muted-foreground"><span>상품 금액</span><span>{total.toLocaleString()}원</span></div>

            {loggedIn && coupons.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <label htmlFor="coupon-select" className="text-xs font-medium">쿠폰</label>
                  <select
                      id="coupon-select"
                      value={selectedCouponId ?? ""}
                      onChange={(e) => setSelectedCouponId(e.target.value ? Number(e.target.value) : null)}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  >
                    <option value="">쿠폰 사용 안 함</option>
                    {coupons.map((coupon) => (
                        <option key={coupon.consumerCouponId} value={coupon.consumerCouponId}>
                          {coupon.title}
                        </option>
                    ))}
                  </select>
                  {selectedCoupon && !couponEligible && (
                      <p className="text-xs text-danger">{selectedCoupon.minOrderAmount.toLocaleString()}원 이상 구매해야 사용할 수 있어요.</p>
                  )}
                </div>
            )}

            {estimatedDiscount > 0 && (
                <div className="flex justify-between text-sm"><span>쿠폰 할인</span><span>-{estimatedDiscount.toLocaleString()}원</span></div>
            )}
            <div className="flex justify-between border-t pt-2 text-sm font-semibold"><span>결제 금액</span><span>{payableTotal.toLocaleString()}원</span></div>
            {checkoutError && <p className="text-sm text-danger">{checkoutError}</p>}
            <Button className="w-full" disabled={checkingOut || selectedItems.length === 0 || (selectedCouponId !== null && !couponEligible)} onClick={handleCheckout}>{checkingOut ? "결제 처리 중..." : "구매하기"}</Button>
          </Card>
        </div>

        <LoginRequiredDialog open={loginRequiredOpen} onClose={() => setLoginRequiredOpen(false)} />
      </div>
  );
}