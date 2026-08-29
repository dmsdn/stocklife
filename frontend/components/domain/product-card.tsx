import { Trash2, Bookmark, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuantityStepper } from "./quantity-stepper";
import { Checkbox } from "@/components/ui/checkbox";

export interface ProductCardProps {
  skuId: number;
  name: string;
  originalPrice: number;
  discountPercent: number;
  finalPrice: number;
  unitPrice: number;
  variant?: "default" | "selectable" | "simple";
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  quantity?: number;
  onQuantityChange?: (quantity: number) => void;
  onAdd?: () => void;
  onRemove?: () => void;
  onWishlistToggle?: () => void;
  wishlisted?: boolean;
  className?: string;
  // ✅ "3층 유제품 코너" 같은 위치 텍스트. 있으면 버튼으로 렌더링하고 누르면 onLocationClick 호출.
  //   둘 다 안 넘기면 기존과 동일하게 아무것도 안 보여줌(기존 화면들 영향 없음).
  locationText?: string;
  onLocationClick?: () => void;
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
  onWishlistToggle,
  wishlisted = false,
  className,
  locationText,
  onLocationClick,
}: ProductCardProps) {
  const showSelect = variant === "selectable" || variant === "simple";

  return (
    <div className={cn("flex gap-3 py-3", className)}>
      {showSelect && (
        <span className="mt-1">
          <Checkbox checked={checked} onChange={() => onCheckedChange?.(!checked)} />
        </span>
      )}

      {/* TODO: 실제 상품 이미지 자리 — 지금은 자리만 표시 */}
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-sm border border-border bg-muted text-xs text-muted-foreground">
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

        {locationText && (
          <button
            type="button"
            onClick={onLocationClick}
            className="mt-1 flex w-fit items-center gap-1 text-xs text-muted-foreground underline underline-offset-2"
          >
            <MapPin size={24} />
            {locationText}
          </button>
        )}

        {variant === "selectable" && (
          <div className="mt-2 flex items-center gap-2">
            <QuantityStepper quantity={quantity} onChange={(q) => onQuantityChange?.(q)} size="md" />
            {onRemove && (
              <button
                type="button"
                aria-label="삭제"
                onClick={onRemove}
                className="ml-auto flex h-7 w-7 items-center justify-center text-muted-foreground"
              >
                <Trash2 size={24} />
              </button>
            )}
          </div>
        )}

        {variant === "default" && (onAdd || onWishlistToggle) && (
          <div className="mt-2 flex items-center gap-2">
            {onAdd && (
              <button
                type="button"
                onClick={onAdd}
                className="rounded-full border border-border px-3 py-1.5 text-xs"
              >
                담기
              </button>
            )}
            {onWishlistToggle && (
              <button
                type="button"
                onClick={onWishlistToggle}
                aria-label={wishlisted ? "찜 해제" : "찜하기"}
                className="flex h-7 w-7 items-center justify-center text-muted-foreground"
              >
                <Bookmark size={24} fill={wishlisted ? "currentColor" : "none"} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}