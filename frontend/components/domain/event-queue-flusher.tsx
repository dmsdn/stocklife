"use client";

import { useEffect } from "react";
import { flushConsumerEventQueue } from "@/lib/consumer-events";

/** 루트 레이아웃에 한 번만 마운트 — 앱 진입 시 + 온라인 복귀 시 큐 재전송 */
export function EventQueueFlusher() {
  useEffect(() => {
    flushConsumerEventQueue();
    window.addEventListener("online", flushConsumerEventQueue);
    return () => window.removeEventListener("online", flushConsumerEventQueue);
  }, []);

  return null;
}
