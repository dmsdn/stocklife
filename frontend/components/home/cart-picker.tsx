import { RiArrowRightSLine, RiCloseLine } from "@remixicon/react";

import type { CartGroup } from "@/lib/cart-storage";
import type { RecommendedProduct } from "@/lib/home-data";

type CartPickerProps = {
  open: boolean;
  selectedProduct: RecommendedProduct | null;
  cartGroups: CartGroup[];
  onClose: () => void;
  onAddToCart: (groupId: number) => void;
  onCreateCart: () => void;
  /** ✅ 신규 — 담기 실패 시 보여줄 메시지(없으면 표시 안 함) */
  error?: string | null;
};

export function CartPicker({
  open,
  selectedProduct,
  cartGroups,
  onClose,
  onAddToCart,
  onCreateCart,
  error,
}: CartPickerProps) {
  if (!open || !selectedProduct) return null;

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
        aria-label="닫기"
      />

      <div className="absolute bottom-0 left-0 right-0 rounded-t-sm bg-background px-5 pb-8 pt-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">장바구니에 담기</h2>

            <p className="mt-1 text-sm text-muted-foreground">
              {selectedProduct.name}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
            aria-label="닫기"
          >
            <RiCloseLine size={24} />
          </button>
        </div>

        <div className="space-y-2">
          {error && (
            <p className="rounded-sm bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
          )}
          {cartGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => onAddToCart(group.id)}
              className="flex w-full items-center justify-between rounded-sm border border-border px-4 py-3.5 text-left hover:bg-muted"
            >
              <div>
                <p className="text-sm font-medium">{group.title}</p>

                <p className="mt-1 text-sm text-muted-foreground">
                  {group.products.length}개 상품
                </p>
              </div>

              <RiArrowRightSLine
                size={24}
                className="text-muted-foreground"
              />
            </button>
          ))}

          <button
            type="button"
            onClick={onCreateCart}
            className="flex w-full items-center justify-center rounded-sm border border-dashed border-border px-4 py-3.5 text-sm font-medium hover:bg-muted"
          >
            + 새 장바구니 만들기
          </button>
        </div>
      </div>
    </div>
  );
}
