"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

const ROUTES = ["/", "/ai"] as const;

export function SwipeNav({
  current,
  children,
}: {
  current: 0 | 1;
  children: React.ReactNode;
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
    <div onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} className="min-h-full">
      {children}
    </div>
  );
}
