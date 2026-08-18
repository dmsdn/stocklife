// app/auth/layout.tsx
"use client";

import { usePathname } from "next/navigation";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/auth/login";

  // 로그인 화면은 자체적으로 전체 레이아웃(모바일 상단정렬/웹 2분할)을 관리하므로 그대로 통과
  if (isLogin) {
    return <div className="min-h-full bg-background">{children}</div>;
  }

  // 나머지 인증 화면(회원가입 등)은 기존대로 가운데 정렬 카드
  return (
    <div className="flex min-h-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm md:max-w-md">{children}</div>
    </div>
  );
}