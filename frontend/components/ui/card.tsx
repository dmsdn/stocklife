// components/ui/card.tsx
// ✅ 실사용 감사(2026-08) 결과: 프로젝트 전체에서 딱 한 곳(cart/page.tsx)만 Card를
//   쓰고, 그마저도 CardHeader/CardTitle/CardFooter 등 서브컴포넌트는 하나도 안 씁니다.
//   shadcn 기본 제공 서브컴포넌트들을 다 지우고 Card 하나만 남겼습니다. size="sm" 같은
//   변형도 미사용이라 같이 뺐습니다. 나중에 다시 필요해지면 shadcn add card로 재생성 가능.
// ✅ rounded-xl → rounded-sm (globals.css 컨벤션 통일)
import * as React from "react"

import { cn } from "@/lib/utils"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-4 overflow-hidden rounded-sm bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10",
        className
      )}
      {...props}
    />
  )
}

export { Card }
