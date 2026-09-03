"use client";

import { useRouter } from "next/navigation";
import { clearTokens } from "@/lib/api-client";
import { logout } from "@/lib/auth";
import { notifySimulationLogout } from "@/lib/simulation-bridge";

interface LogoutButtonProps {
  className?: string;
  children: React.ReactNode;
}

export function LogoutButton({ className, children }: LogoutButtonProps) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      clearTokens();
    }
    // ✅ 로그아웃 후 시뮬레이션(왼쪽 화면)도 기본 캐릭터(비로그인)로 되돌림
    notifySimulationLogout();
    router.push("/");
  };

  return (
    <button type="button" onClick={handleLogout} className={className}>
      {children}
    </button>
  );
}
