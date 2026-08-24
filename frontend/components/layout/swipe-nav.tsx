"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

const ROUTES = ["/", "/ai"] as const;

export function SwipeNav({
  current,
  children,
  className = "min-h-full",
}: {
  current: 0 | 1;
  children: React.ReactNode;
  /** ✅ 기본은 기존과 동일(min-h-full). /ai 모바일 전체화면처럼
   *  고정 높이 flex 컨테이너 안에서 써야 할 때만 다른 값을 넘긴다. */
  className?: string;
}) {
  const router = useRouter();
  const startX = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const delta = e.clientX - startX.current;
    startX.current = null;

    const THRESHOLD = 60;
    if (delta < -THRESHOLD && current === 0) router.push(ROUTES[1]);
    if (delta > THRESHOLD && current === 1) router.push(ROUTES[0]);
  };

  return (
    <div onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} className={className}>
      {children}
    </div>
  );
}
