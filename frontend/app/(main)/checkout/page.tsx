// app/(main)/checkout/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  RiArrowLeftSLine,
  RiBankCardLine,
  RiCheckboxCircleLine,
  RiCoinLine,
} from "@remixicon/react";
import { apiFetch, resolveImageUrl } from "@/lib/api-client";
import { loadCartGroups, type CartGroup } from "@/lib/cart-storage";
import { fetchCoupons, type Coupon } from "@/lib/coupons-mock";
import { readCheckoutDraft, clearCheckoutDraft } from "@/lib/checkout-draft";
import { markGroupCompleted } from "@/lib/completed-groups";
import { writeLastCheckout } from "@/lib/checkout-summary";
import { trackConsumerEvent } from "@/lib/consumer-events";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";

interface Profile {
  pointBalance: number;
}

interface ProductRow {
  id: number;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

function CheckoutInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = Number(searchParams.get("group") ?? 0);
  const { setHidden } = useBottomBarVisibility();

  const [group, setGroup] = useState<CartGroup | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<number | null>(null);
  const [pointBalance, setPointBalance] = useState(0);
  const [pointInput, setPointInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("신한카드");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHidden(true);
    return () => setHidden(false);
  }, [setHidden]);

  useEffect(() => {
    loadCartGroups()
      .then((groups) => setGroup(groups.find((g) => g.id === groupId) ?? null))
      .catch(() => setGroup(null));

    fetchCoupons().then((list) => setCoupons(list.filter((c) => c.usable))).catch(() => setCoupons([]));

    apiFetch<Profile>("/api/consumers/me")
      .then((p) => setPointBalance(Math.max(0, p.pointBalance ?? 0)))
      .catch(() => setPointBalance(0));

    // 포인트 내역 API도 실제 연동 가능. 가장 최근 balanceAfter를 보조적으로 사용합니다.
    apiFetch<Array<{ balanceAfter: number; createdAt: string }>>("/api/points/history")
      .then((history) => {
        if (history.length > 0) {
          const latest = [...history].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )[0];
          if (typeof latest.balanceAfter === "number") setPointBalance(Math.max(0, latest.balanceAfter));
        }
      })
      .catch(() => {});
  }, [groupId]);

  const draft = readCheckoutDraft();
  const scannedIds = useMemo(
    () => new Set(draft?.groupId === groupId ? draft.scannedSkuIds : []),
    [draft, groupId]
  );

  const products: ProductRow[] = useMemo(() => {
    if (!group) return [];
    return group.products
      .filter((p) => scannedIds.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        quantity: p.quantity,
        image: p.image,
      }));
  }, [group, scannedIds]);

  const subtotal = products.reduce((sum, p) => sum + p.price * p.quantity, 0);
  const selectedCoupon = coupons.find((c) => c.consumerCouponId === selectedCouponId) ?? null;
  const couponDiscount = selectedCoupon && subtotal >= selectedCoupon.minOrderAmount
    ? selectedCoupon.discountType === "FIXED"
      ? Math.min(selectedCoupon.discountValue, subtotal)
      : Math.min(
          Math.floor(subtotal * selectedCoupon.discountValue / 100),
          selectedCoupon.maxDiscountAmount ?? Infinity,
          subtotal
        )
    : 0;
  const maxPointUse = Math.min(
    pointBalance,
    Math.max(0, subtotal - couponDiscount)
  );
  const pointUse = Math.min(
    Math.max(0, Number.parseInt(pointInput || "0", 10) || 0),
    maxPointUse
  );
  const payable = Math.max(0, subtotal - couponDiscount - pointUse);

  const handlePay = async () => {
    if (!groupId || products.length === 0 || paying) return;
    setPaying(true);
    setError(null);

    try {
      // 백엔드 체크아웃 API는 pointsToUse를 JSON body가 아니라
      // query parameter로 받습니다.
      const order = await apiFetch<{ orderId: number }>(
        `/api/orders/checkout?groupId=${groupId}&pointsToUse=${pointUse}`,
        { method: "POST" }
      );

      markGroupCompleted(groupId);
      clearCheckoutDraft();
      trackConsumerEvent({ event_type: "PURCHASE" });
      router.push(`/checkout-complete?orderId=${order.orderId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "결제에 실패했습니다.");
    } finally {
      setPaying(false);
    }
  };

  if (!group) {
    return <div className="mx-auto max-w-lg p-6 text-center text-sm text-muted-foreground">결제 목록을 불러오는 중...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-lg px-5 pb-32 pt-5">
      <header className="relative flex items-center justify-center">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로가기"
          className="absolute left-0 flex h-9 w-9 items-center justify-center text-muted-foreground"
        >
          <RiArrowLeftSLine size={24} />
        </button>
        <h1 className="text-base font-semibold">결제하기</h1>
      </header>

      <section className="mt-7 rounded-[20px] border border-border bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">전자영수증</h2>
          <span className="text-xs text-muted-foreground">{products.length}개 품목</span>
        </div>
        <div className="mt-4 divide-y divide-border">
          {products.map((p) => (
            <div key={p.id} className="flex gap-3 py-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                {p.image ? <img src={resolveImageUrl(p.image) ?? p.image} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm">{p.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{p.quantity}개</p>
              </div>
              <p className="shrink-0 text-sm font-semibold">{(p.price * p.quantity).toLocaleString()}원</p>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-4 text-sm">
          <span>상품 금액</span>
          <span className="font-semibold">{subtotal.toLocaleString()}원</span>
        </div>
      </section>

      <section className="mt-4 rounded-[20px] border border-border bg-white p-5">
        <h2 className="text-base font-semibold">쿠폰</h2>
        <select
          value={selectedCouponId ?? ""}
          onChange={(e) => setSelectedCouponId(e.target.value ? Number(e.target.value) : null)}
          className="mt-3 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
        >
          <option value="">쿠폰 사용 안 함</option>
          {coupons.map((c) => (
            <option key={c.consumerCouponId} value={c.consumerCouponId}>
              {c.title} · {c.discountType === "FIXED" ? `${c.discountValue.toLocaleString()}원` : `${c.discountValue}%`}
            </option>
          ))}
        </select>
      </section>

      <section className="mt-4 rounded-[20px] border border-border bg-white p-5">
        <div className="flex items-center gap-2">
          <RiCoinLine size={19} />
          <h2 className="text-base font-semibold">포인트</h2>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            value={pointInput}
            onChange={(e) => setPointInput(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="사용할 포인트"
            className="h-11 min-w-0 flex-1 rounded-lg border border-border px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => setPointInput(String(maxPointUse))}
            className="h-11 shrink-0 rounded-lg border border-border px-3 text-sm"
          >
            전액
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          보유 {pointBalance.toLocaleString()}P · 최대 {maxPointUse.toLocaleString()}P 사용 가능
        </p>
      </section>

      <section className="mt-4 rounded-[20px] border border-border bg-white p-5">
        <h2 className="text-base font-semibold">결제 수단</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {["신한카드", "국민카드", "현대카드", "삼성카드"].map((card) => (
            <button
              key={card}
              type="button"
              onClick={() => setPaymentMethod(card)}
              className={`rounded-xl border p-3 text-left text-sm ${
                paymentMethod === card ? "border-foreground bg-muted font-semibold" : "border-border"
              }`}
            >
              <RiBankCardLine size={20} className="mb-2" />
              {card}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          <RiCheckboxCircleLine size={16} />
          목업 결제수단이에요. 실제 카드 정보는 입력하지 않아요.
        </div>
      </section>

      <section className="mt-4 rounded-[20px] border border-border bg-white p-5">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span>상품 금액</span><span>{subtotal.toLocaleString()}원</span></div>
          <div className="flex justify-between"><span>쿠폰 할인</span><span>-{couponDiscount.toLocaleString()}원</span></div>
          <div className="flex justify-between"><span>포인트 사용</span><span>-{pointUse.toLocaleString()}P</span></div>
          <div className="flex justify-between border-t border-border pt-3 text-base font-bold">
            <span>최종 결제 금액</span><span>{payable.toLocaleString()}원</span>
          </div>
        </div>
      </section>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">최종 결제 금액</p>
            <p className="text-lg font-bold">{payable.toLocaleString()}원</p>
          </div>
          <button
            type="button"
            onClick={handlePay}
            disabled={paying || products.length === 0}
            className="flex h-12 min-w-[150px] items-center justify-center gap-1.5 rounded-full bg-brand px-5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
          >
            <RiBankCardLine size={19} />
            {paying ? "결제 중..." : "결제하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <CheckoutInner />
    </Suspense>
  );
}
