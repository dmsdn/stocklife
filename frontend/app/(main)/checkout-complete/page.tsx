// app/(main)/checkout-complete/page.tsx
// ✅ 신규(2026-09) — scan/page.tsx의 "결제하기"가 예전엔 로컬 장바구니만 비우고 아무 화면도
//   안 띄웠음(요청 9번: "없다면 만들기"). 이제 실제 결제 결과(금액·적립 포인트)를 보여주고,
//   전자영수증으로 이동하는 버튼과 홈으로 나가는 버튼을 제공한다.
//
// 회원: scan/page.tsx가 실제 POST /api/orders/checkout으로 만든 orderId를 ?orderId=로
//   넘겨주면, 여기서 GET /api/orders/{orderId}로 실제 금액·적립 포인트를 다시 조회한다
//   (checkout 응답을 그대로 들고 오지 않고 재조회하는 이유: 새로고침해도 값이 유지되도록).
// 비회원: 백엔드 체크아웃 API가 로그인 전용이라 실제 주문이 없다. scan/page.tsx가
//   sessionStorage에 남겨둔 요약(lib/checkout-summary)을 읽어서 금액만 보여주고,
//   적립 포인트·전자영수증은 회원 전용이라 안내만 표시한다.
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RiCheckboxCircleFill, RiCoinLine, RiBillLine } from "@remixicon/react";
import { apiFetch, isLoggedIn } from "@/lib/api-client";
import { readLastCheckout } from "@/lib/checkout-summary";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";
import { StickyBottomBar } from "@/components/domain/sticky-bottom-bar";

interface OrderDetail {
  orderId: number;
  totalAmount: number;
  pointsEarned?: number;
  status: string;
}

function CheckoutCompleteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderIdParam = searchParams.get("orderId");
  const orderId = orderIdParam ? Number(orderIdParam) : null;

  const { setHidden: setBottomBarHidden } = useBottomBarVisibility();
  useEffect(() => {
    setBottomBarHidden(true);
    return () => setBottomBarHidden(false);
  }, [setBottomBarHidden]);

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [guestSummary] = useState(() => (orderId == null ? readLastCheckout() : null));
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (orderId == null) return;
    apiFetch<OrderDetail>(`/api/orders/${orderId}`)
      .then(setOrder)
      .catch(() => setLoadError(true));
  }, [orderId]);

  const totalAmount = order?.totalAmount ?? guestSummary?.totalAmount ?? 0;
  const pointsEarned = order?.pointsEarned ?? 0;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-lg flex-col items-center justify-center gap-6 px-6 pb-[140px] text-center md:max-w-xl">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-bg text-success">
        <RiCheckboxCircleFill size={40} />
      </div>

      <div>
        <p className="text-lg font-semibold">결제가 완료됐어요</p>
        {orderId != null && !loadError && (
          <p className="mt-1 text-sm text-muted-foreground">주문 #{orderId}</p>
        )}
        {loadError && (
          <p className="mt-1 text-sm text-muted-foreground">결제는 완료됐지만 상세 조회에 실패했어요.</p>
        )}
      </div>

      <div className="w-full space-y-3 rounded-[20px] border border-[#F4F4F4] bg-white p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">결제 금액</span>
          <span className="text-lg font-bold">{totalAmount.toLocaleString()}원</span>
        </div>
        <div className="flex items-center justify-between border-t border-[#F4F4F4] pt-3 text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">
            <RiCoinLine size={16} />
            적립 포인트
          </span>
          {orderId != null ? (
            <span className="font-semibold text-[#EE4908]">{pointsEarned.toLocaleString()}P</span>
          ) : guestSummary?.serverFailed ? (
            <span className="text-xs text-muted-foreground">서버 오류로 이번 건은 적립이 지연될 수 있어요</span>
          ) : (
            <span className="text-xs text-muted-foreground">비회원은 적립되지 않아요</span>
          )}
        </div>
      </div>

      <div className="w-full">
        {orderId == null && (
          <p className="text-xs text-muted-foreground">
            {guestSummary?.serverFailed
              ? "일시적인 서버 오류로 이번 건은 전자영수증이 안 남았어요. 구매 내역은 정상 반영됐어요."
              : "비회원 결제는 전자영수증이 보관되지 않아요. 로그인하면 다음 결제부터 영수증을 확인할 수 있어요."}
          </p>
        )}
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-4 text-sm text-muted-foreground underline underline-offset-2"
        >
          홈으로
        </button>
      </div>

      {orderId != null && (
        <StickyBottomBar>
          <button
            type="button"
            onClick={() => router.push(`/mypage/receipts/${orderId}`)}
            className="mx-auto flex h-[60px] w-fit items-center justify-center gap-1.5 rounded-full bg-brand px-5 text-base font-medium text-brand-foreground shadow-[0_-2px_20px_rgba(0,0,0,0.1)]"
          >
            <RiBillLine size={18} />
            전자영수증 보기
          </button>
        </StickyBottomBar>
      )}
    </div>
  );
}

export default function CheckoutCompletePage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100dvh-4rem)]" />}>
      <CheckoutCompleteInner />
    </Suspense>
  );
}
