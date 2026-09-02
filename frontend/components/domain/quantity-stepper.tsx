// components/domain/quantity-stepper.tsx
// ✅ product-card.tsx / cart / scan / saved 네 곳에 각각 하드코딩되어 있던 +/- 수량 조절
//   버튼을 하나로 통일. 크기만 다르게 쓰고 싶으면 size prop으로 조절.
"use client";

import { RiSubtractLine, RiAddLine } from "@remixicon/react";
import { cn } from "@/lib/utils";

const SIZE_MAP = {
  sm: { button: "h-6 w-6", icon: 12, text: "text-xs", gap: "gap-1.5" },
  md: { button: "h-7 w-7", icon: 14, text: "text-sm", gap: "gap-2" },
  lg: { button: "h-9 w-9", icon: 16, text: "text-sm", gap: "gap-2" },
} as const;

export interface QuantityStepperProps {
  quantity: number;
  onChange: (quantity: number) => void;
  min?: number;
  size?: keyof typeof SIZE_MAP;
  className?: string;
}

export function QuantityStepper({
  quantity,
  onChange,
  min = 1,
  size = "md",
  className,
}: QuantityStepperProps) {
  const s = SIZE_MAP[size];

  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <button
        type="button"
        aria-label="수량 감소"
        onClick={() => onChange(Math.max(min, quantity - 1))}
        className={cn("flex items-center justify-center rounded-full border border-border", s.button)}
      >
        <RiSubtractLine size={s.icon} />
      </button>
      <span className={cn("w-5 text-center", s.text)}>{quantity}</span>
      <button
        type="button"
        aria-label="수량 증가"
        onClick={() => onChange(quantity + 1)}
        className={cn("flex items-center justify-center rounded-full border border-border", s.button)}
      >
        <RiAddLine size={s.icon} />
      </button>
    </div>
  );
}
