// app/(main)/cart/page.tsx
// ✅ 참고 이미지(Frame 138, 결제 바텀시트) 기준 전면 재작성.
//   - 이 화면에 오는 상품은 이미 각 리스트 상세(/saved/[groupId])에서 체크된(checked) 것만이라
//     여기서 또 체크박스로 고르게 하지 않고, 이미지처럼 바로 수량/삭제만 가능한 확인+결제
//     화면으로 단순화함(체크 해제는 리스트 상세로 돌아가서 하면 됨).
//   - 상단은 시트 느낌의 드래그 핸들 바(장식) + 가운데 타이틀, 상품 행은 이미지+이름+카테고리+
//     위치("444 >" 자리, 실제 locationId 배치 조회) + 수량스테퍼/가격.
//   - 하단 요약은 "적립 포인트 / 총 N개 상품"만 (Figma엔 배송비 줄이 없음), "결제하기" 알약 버튼.
//   - 쿠폰 선택은 Figma 목업엔 없지만 실제 연결된 기능이라 삭제하지 않고 요약 위에 작게 유지.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiArrowLeftSLine, RiCloseLine, RiArrowRightSLine, RiBankCardLine } from "@remixicon/react";
import { QuantityStepper } from "@/components/domain/quantity-stepper";
import { LoginRequiredDialog } from "@/components/domain/login-required-dialog";
import { ProductLocationDialog } from "@/components/domain/product-location-dialog";
import { trackConsumerEvent } from "@/lib/consumer-events";
import { apiFetch, isLoggedIn, resolveImageUrl } from "@/lib/api-client";
import { readCartGroups, updateCartGroups } from "@/lib/cart-storage";
import { fetchCoupons, type Coupon } from "@/lib/coupons-mock";
import { fetchInventoryBatch, pickLocation } from "@/lib/product-location";

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
  categoryL1?: string | null;
}

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Record<number, ProductDetail>>({});
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [loginRequiredOpen, setLoginRequiredOpen] = useState(false);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<number | null>(null);
  const [locationBySkuId, setLocationBySkuId] = useState<Map<number, string>>(new Map());
  const [locationDialogSkuId, setLocationDialogSkuId] = useState<number | null>(null);
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
      details.forEach((d) => { if (d) productMap[d.skuId] = { ...d, imageUrl: resolveImageUrl(d.imageUrl) ?? null }; });
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
    // ✅ 쿠폰은 별도 시스템에서 처리 예정이라 목업(lib/coupons-mock.ts)으로 통일 —
    //   mypage/coupons/page.tsx와 같은 소스를 씀.
    fetchCoupons().then((list) => setCoupons(list.filter((coupon) => coupon.usable)));
  }, [loggedIn]);

  const updateGuestItem = (item: CartItem, patch: Partial<Pick<CartItem, "quantity" | "checked">>) => {
    updateCartGroups((groups) => groups.map((group) =>
        group.id !== item.localGroupId ? group : {
          ...group,
          products: group.products.map((p) => p.id === item.skuId ? { ...p, ...patch } : p),
        }
    ));
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

  useEffect(() => {
    if (selectedItems.length === 0) return;
    fetchInventoryBatch(selectedItems.map((i) => i.skuId))
      .then((map) => {
        const next = new Map<number, string>();
        map.forEach((invItems, skuId) => {
          const loc = pickLocation(invItems);
          if (loc) next.set(skuId, loc.locationId);
        });
        setLocationBySkuId(next);
      })
      .catch(() => setLocationBySkuId(new Map()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItems.map((i) => i.skuId).join(",")]);

  const total = selectedItems.reduce((sum, item) => sum + (products[item.skuId]?.priceKrw ?? 0) * item.quantity, 0);
  const totalPoint = Math.floor(total * 0.01);
  const selectedCoupon = coupons.find((coupon) => coupon.consumerCouponId === selectedCouponId) ?? null;
  const couponEligible = selectedCoupon ? total >= selectedCoupon.minOrderAmount : false;
  const estimatedDiscount = !selectedCoupon || !couponEligible ? 0 : (() => {
    if (selectedCoupon.discountType === "FIXED") return Math.min(selectedCoupon.discountValue, total);
    const percentDiscount = Math.floor(total * selectedCoupon.discountValue / 100);
    return Math.min(percentDiscount, selectedCoupon.maxDiscountAmount ?? percentDiscount, total);
  })();
  const payableTotal = total - estimatedDiscount;
  const locationDialogItem = selectedItems.find((i) => i.skuId === locationDialogSkuId) ?? null;
  const locationDialogProduct = locationDialogItem ? products[locationDialogItem.skuId] : null;

  return (
      <div className="mx-auto max-w-md pb-40 md:max-w-lg md:pb-8">
        {/* ✅ 시트 느낌의 상단 — 드래그 핸들(장식) + 가운데 타이틀. 실제 페이지 라우트라
            뒤로가기는 필요해서 좌측 상단에 작게만 남겨둠(Figma 바텀시트엔 없음, 스와이프로
            닫는 대신이라 페이지에선 최소한의 내비게이션으로 대체). */}
        <div className="relative flex items-center justify-center px-4 pt-4">
          <button
            type="button"
            aria-label="뒤로가기"
            onClick={() => router.back()}
            className="absolute left-4 flex h-8 w-8 items-center justify-center text-muted-foreground"
          >
            <RiArrowLeftSLine size={22} />
          </button>
          <p className="text-sm font-medium">장바구니</p>
        </div>
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-border" />

        <div className="px-4 pt-5">
          {loading && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}
          {!loading && selectedItems.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              선택된 상품이 없어요. 리스트에서 담을 상품을 체크해주세요.
            </p>
          )}

          <div className="divide-y divide-border">
            {selectedItems.map((item, index) => {
              const product = products[item.skuId];
              const locationText = locationBySkuId.get(item.skuId);
              return (
                  <div key={item.cartItemId ?? `${item.localGroupId}-${item.skuId}-${index}`} className="flex gap-3 py-4">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
                      {product?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm leading-5">{product?.name ?? `상품 #${item.skuId}`}</p>
                        <button
                          type="button"
                          aria-label="삭제"
                          onClick={() => handleRemove(item)}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <RiCloseLine size={22} />
                        </button>
                      </div>

                      {product?.categoryL1 && <p className="mt-0.5 text-xs text-muted-foreground">{product.categoryL1}</p>}

                      {locationText && (
                        <button
                          type="button"
                          onClick={() => setLocationDialogSkuId(item.skuId)}
                          className="mt-0.5 flex items-center text-sm text-muted-foreground"
                        >
                          {locationText}
                          <RiArrowRightSLine size={16} />
                        </button>
                      )}

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <QuantityStepper quantity={item.quantity} onChange={(q) => handleQuantityChange(item, q)} size="lg" />
                        <p className="shrink-0 text-base font-semibold">
                          {product ? `${(product.priceKrw * item.quantity).toLocaleString()}원` : "가격 확인 중..."}
                        </p>
                      </div>
                    </div>
                  </div>
              );
            })}
          </div>

          {loggedIn && coupons.length > 0 && (
              <div className="mt-4 space-y-1.5 border-t border-border pt-4">
                <label htmlFor="coupon-select" className="text-xs font-medium text-muted-foreground">쿠폰</label>
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
                {estimatedDiscount > 0 && (
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">쿠폰 할인</span><span>-{estimatedDiscount.toLocaleString()}원</span></div>
                )}
              </div>
          )}

          {/* ✅ Figma 요약 — 적립 포인트 / 총 N개 상품만 (배송비 줄 없음) */}
          <div className="mt-5 space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">적립 포인트</span>
              <span className="font-medium">{totalPoint.toLocaleString()} P</span>
            </div>
            <div className="flex items-center justify-between text-base font-semibold">
              <span>총 {selectedItems.reduce((n, i) => n + i.quantity, 0).toLocaleString()}개 상품</span>
              <span>{payableTotal.toLocaleString()}원</span>
            </div>
          </div>

          {checkoutError && <p className="mt-2 text-sm text-danger">{checkoutError}</p>}

          <button
            type="button"
            disabled={checkingOut || selectedItems.length === 0 || (selectedCouponId !== null && !couponEligible)}
            onClick={handleCheckout}
            className="mt-4 flex h-14 w-full items-center justify-center gap-1.5 rounded-full bg-brand text-base font-medium text-brand-foreground disabled:opacity-50"
          >
            <RiBankCardLine size={20} />
            {checkingOut ? "결제 처리 중..." : "결제하기"}
          </button>
        </div>

        <LoginRequiredDialog open={loginRequiredOpen} onClose={() => setLoginRequiredOpen(false)} />

        {locationDialogProduct && locationDialogItem && (
          <ProductLocationDialog
            open
            onClose={() => setLocationDialogSkuId(null)}
            skuId={locationDialogItem.skuId}
            name={locationDialogProduct.name}
            price={locationDialogProduct.priceKrw}
          />
        )}
      </div>
  );
}