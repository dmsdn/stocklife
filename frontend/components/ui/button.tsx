// components/ui/button.tsx
// ✅ 실사용 감사(2026-08) 결과: size prop은 프로젝트 어디서도 명시적으로 안 씀(전부 기본값),
//   variant="link"도 미사용 — 둘 다 정리했습니다. 실제 쓰는 variant는 default/outline/
//   secondary/ghost/destructive 5개뿐입니다.
// ✅ 모서리 둥글기는 globals.css 컨벤션(카드·인풋 등 "담는" 요소 = rounded-sm, 버튼·칩 같은
//   "액션" 요소 = rounded-full)을 따라 rounded-sm으로 통일했습니다 — 예전엔 기본 rounded-lg를
//   깔아두고 size=default에서만 rounded-sm으로 되엎는 식이라 헷갈렸습니다.
// 디자인 바꾸려면: 색은 globals.css의 --color-* 값만, 둥글기는 이 파일의 rounded-sm만 고치면 됩니다.
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-sm border border-transparent bg-clip-padding px-4 text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-brand text-brand-foreground hover:bg-brand/90",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        secondary:
          "bg-brand text-brand-foreground hover:bg-[color-mix(in_oklch,var(--brand),var(--foreground)_5%)] disabled:bg-secondary disabled:text-secondary-foreground",
        ghost: "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
