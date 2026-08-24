"use client";

import { useRouter } from "next/navigation";
import { clearTokens } from "@/lib/api-client";
import { logout } from "@/lib/auth";

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
    router.push("/");
  };

  return (
    <button type="button" onClick={handleLogout} className={className}>
      {children}
    </button>
  );
}
