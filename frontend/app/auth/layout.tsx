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

  // 나머지 인증 화면(회원가입 등)은 상단 고정 정렬 — 참고 디자인(Frame 109 등)이
  // 화면을 세로 중앙정렬하지 않고 위에서부터 고정 위치로 내용을 배치하고 있어서
  // items-center/justify-center(세로 중앙정렬)를 걷어냈습니다.
  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto w-full max-w-sm px-5 md:max-w-md">{children}</div>
    </div>
  );
}