import { Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "./checkbox";

export interface ProductCardProps {
  skuId: number;
  name: string;
  originalPrice: number;
  discountPercent: number;
  finalPrice: number;
  unitPrice: number;
  /** default: 검색결과용 (담기 버튼)
   *  selectable: 장바구니용 (체크박스 + 수량조절 + 삭제)
   *  simple: 찜 목록용 (체크박스만) */
  variant?: "default" | "selectable" | "simple";
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  quantity?: number;
  onQuantityChange?: (quantity: number) => void;
  /** variant="default"일 때만 사용 — 장바구니 담기 (CART_ADD 이벤트) */
  onAdd?: () => void;
  /** variant="selectable"일 때만 사용 — 장바구니에서 제거 (CART_REMOVE 이벤트) */
  onRemove?: () => void;
  className?: string;
}

export function ProductCard({
  name,
  originalPrice,
  discountPercent,
  finalPrice,
  unitPrice,
  variant = "default",
  checked = false,
  onCheckedChange,
  quantity = 1,
  onQuantityChange,
  onAdd,
  onRemove,
  className,
}: ProductCardProps) {
  const showSelect = variant === "selectable" || variant === "simple";

  return (
    <div className={cn("flex gap-3 py-3", className)}>
      {showSelect && (
  <Checkbox checked={checked} onChange={() => onCheckedChange?.(!checked)} />
)}

      {/* TODO: 실제 상품 이미지 자리 — 지금은 자리만 표시 */}
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs text-muted-foreground">
        IMG
      </div>

      <div className="flex flex-1 flex-col justify-between">
        <p className="text-sm">{name}</p>

        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground line-through">
            최대 할인 {originalPrice.toLocaleString()}원
          </p>
          <p className="text-sm">
            <span className="mr-1 font-medium">{discountPercent}%</span>
            <span className="text-base font-semibold">{finalPrice.toLocaleString()}원</span>
          </p>
          <p className="text-xs text-muted-foreground">(개당 {unitPrice.toLocaleString()}원)</p>
        </div>

        {variant === "selectable" && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              aria-label="수량 감소"
              onClick={() => onQuantityChange?.(Math.max(1, quantity - 1))}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border"
            >
              <Minus size={14} />
            </button>
            <span className="w-6 text-center text-sm">{quantity}</span>
            <button
              type="button"
              aria-label="수량 증가"
              onClick={() => onQuantityChange?.(quantity + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border"
            >
              <Plus size={14} />
            </button>
            {onRemove && (
              <button
                type="button"
                aria-label="삭제"
                onClick={onRemove}
                className="ml-auto flex h-7 w-7 items-center justify-center text-muted-foreground"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        )}

        {variant === "default" && onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="mt-2 self-start rounded-md border border-border px-3 py-1.5 text-xs"
          >
            담기
          </button>
        )}
      </div>
    </div>
  );
}
