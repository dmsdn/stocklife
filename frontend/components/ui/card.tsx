// components/ui/card.tsx
// ✅ 홈 화면 카드가 Figma 기준 큰 라운드(24px)를 써서 rounded-sm(8px) 대신 rounded-lg로 조정.
//   실사용처는 home-hero-card.tsx 하나뿐이라 여기서 바꿔도 다른 화면에 영향 없음.
import * as React from "react"

import { cn } from "@/lib/utils"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-4 overflow-hidden rounded-lg bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10",
        className
      )}
      {...props}
    />
  )
}

export { Card }
