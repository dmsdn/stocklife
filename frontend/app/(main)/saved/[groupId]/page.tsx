// app/(main)/saved/[groupId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  Map as MapIcon,
  PlayCircle,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { QuantityStepper } from "@/components/domain/quantity-stepper";
import { StoreMapDialog } from "@/components/domain/store-map-dialog";
import {readCartGroups, loadCartGroups,updateCartGroups, deleteCartGroup, syncUpdateServerCart, syncRemoveFromServerCart, type CartGroup,} from "@/lib/cart-storage";

export default function SavedGroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = Number(params.groupId);

  const [group, setGroup] = useState<CartGroup | null>(null);
  const [routeOpen, setRouteOpen] = useState(false);

  useEffect(() => {
    loadCartGroups()
      .then((groups) => setGroup(groups.find((g) => g.id === groupId) ?? null))
      .catch(() => setGroup(readCartGroups().find((g) => g.id === groupId) ?? null));
  }, [groupId]);

  const handleQuantityChange = (
    productId: number,
    quantity: number
  ) => {
    const next = updateCartGroups((gs) =>
      gs.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              products: g.products.map((p) =>
                p.id === productId
                  ? { ...p, quantity }
                  : p
              ),
            }
      )
    );

    setGroup(next.find((g) => g.id === groupId) ?? null);

    // 실제 서버 장바구니 PATCH
    syncUpdateServerCart(next.find((g) => g.id === groupId)?.products.find((p) => p.id === productId)?.cartItemId, quantity);
  };

  const handleToggleChecked = (productId: number) => {
    const next = updateCartGroups((gs) =>
      gs.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              products: g.products.map((p) =>
                p.id === productId
                  ? { ...p, checked: !p.checked }
                  : p
              ),
            }
      )
    );

    setGroup(next.find((g) => g.id === groupId) ?? null);
    const changed = next.find((g) => g.id === groupId)?.products.find((p) => p.id === productId);
    syncUpdateServerCart(changed?.cartItemId, undefined, changed?.checked);
  };

  const handleRemove = (productId: number) => {
    const next = updateCartGroups((gs) =>
      gs.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              products: g.products.filter(
                (p) => p.id !== productId
              ),
            }
      )
    );

    setGroup(next.find((g) => g.id === groupId) ?? null);

    // 실제 서버 장바구니 DELETE
    syncRemoveFromServerCart(group.products.find((p) => p.id === productId)?.cartItemId);
  };

  if (!group) {
    return (
      <div className="mx-auto max-w-lg p-4 sm:max-w-xl">
        <p className="py-10 text-center text-sm text-muted-foreground">
          리스트를 찾을 수 없어요.
        </p>
      </div>
    );
  }

  const total = group.products.reduce(
    (sum, p) => sum + p.price * p.quantity,
    0
  );

  // 전체 상품 적립 포인트
  // 현재 상품 데이터에 별도의 point 필드가 없으므로
  // 상품 가격의 1%를 적립 포인트로 계산
  const totalPoint = Math.floor(total * 0.01);

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-24 pt-4 sm:max-w-xl md:max-w-2xl md:px-8 md:pt-8">
      {/* 상단 헤더 */}
      <div className="mb-5 flex items-center gap-3">
        <Link
          href="/saved"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-muted"
        >
          <ChevronLeft size={20} />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium">
            {group.title}
          </p>

          <p className="text-xs text-muted-foreground">
            {group.products.length}개 ·{" "}
            {total.toLocaleString()}원
          </p>
        </div>

        <button
          type="button"
          aria-label="리스트 삭제"
          onClick={() => {
            if (
              confirm(
                `"${group.title}" 리스트를 삭제할까요?`
              )
            ) {
              void deleteCartGroup(group.id).then(() => router.push("/saved"));
            }
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* 상품 목록 */}
      <div className="divide-y divide-border">
        {group.products.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            아직 담긴 상품이 없어요. 검색이나 "장보기 시작"에서
            담아보세요.
          </p>
        )}

        {group.products.map((product) => {
          const productTotal =
            product.price * product.quantity;

          const productPoint = Math.floor(
            productTotal * 0.01
          );

          return (
            <div
              key={product.id}
              className="flex gap-3 py-4"
            >
              {/* 체크 */}
              <div className="pt-1">
                <Checkbox
                  checked={product.checked}
                  onChange={() =>
                    handleToggleChecked(product.id)
                  }
                />
              </div>

              {/* 상품 이미지 */}
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
                {/* 추후 실제 상품 이미지 연결 */}
              </div>

              {/* 상품 정보 */}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm leading-5">
                      {product.name}
                    </p>
                  </div>

                  <button
                    type="button"
                    aria-label="상품 삭제"
                    onClick={() =>
                      handleRemove(product.id)
                    }
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* 가격 */}
                <div className="mt-1">
                  <p className="text-base font-semibold">
                    {product.price.toLocaleString()}원
                  </p>
                </div>

                {/* 배송비 + 적립 포인트 */}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span>배송비 무료</span>
                  <span>·</span>
                  <span>
                    적립{" "}
                    <span className="font-medium text-foreground">
                      {productPoint.toLocaleString()}P
                    </span>
                  </span>
                </div>

                {/* 수량 + 상품 총액 */}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <QuantityStepper
                    quantity={product.quantity}
                    onChange={(q) =>
                      handleQuantityChange(
                        product.id,
                        q
                      )
                    }
                    size="sm"
                  />

                  <p className="shrink-0 text-sm font-medium">
                    {productTotal.toLocaleString()}원
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 전체 결제 정보 */}
      {group.products.length > 0 && (
        <div className="mt-5 rounded-sm border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              상품 금액
            </span>
            <span>
              {total.toLocaleString()}원
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              배송비
            </span>
            <span>무료</span>
          </div>

          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              적립 예정
            </span>
            <span className="font-medium">
              {totalPoint.toLocaleString()}P
            </span>
          </div>

          <div className="my-3 border-t border-border" />

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              예상 결제 금액
            </span>
            <span className="text-lg font-semibold">
              {total.toLocaleString()}원
            </span>
          </div>
        </div>
      )}

      {/* 하단 액션 */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="flex items-center gap-1.5"
          onClick={() => setRouteOpen(true)}
        >
          <MapIcon size={16} />
          동선 보기
        </Button>

        <Button
          className="flex items-center gap-1.5"
          onClick={() =>
            router.push(`/scan?group=${groupId}`)
          }
        >
          <PlayCircle size={16} />
          장보기 시작
        </Button>
      </div>

      <StoreMapDialog
        open={routeOpen}
        onClose={() => setRouteOpen(false)}
        groupId={groupId}
        collectedIds={new Set()}
      />
    </div>
  );
}