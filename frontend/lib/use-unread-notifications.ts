// lib/use-unread-notifications.ts
// ✅ 홈 상단 종 배지 + 데스크톱 헤더 종 배지가 각자 다른 값(하드코딩 mock vs 실제)을 쓰고
//   있던 걸 하나로 통일 — GET /api/notifications(알림 페이지가 쓰는 것과 동일)를 불러와
//   read:false 개수만 세서 돌려줍니다.
"use client";

import { useEffect, useState } from "react";
import { apiFetch, AUTH_CHANGED_EVENT, getAccessToken } from "./api-client";

export function useUnreadNotificationCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () => {const token=getAccessToken(); return apiFetch<{ read: boolean }[]>("/api/notifications")
      .then((list) => active && token===getAccessToken() && setCount(list.filter((n) => !n.read).length))
      .catch(() => active && token===getAccessToken() && setCount(0));};
    load(); const timer = window.setInterval(load, 5000);
    window.addEventListener(AUTH_CHANGED_EVENT, load);
    return () => {active=false;window.clearInterval(timer);window.removeEventListener(AUTH_CHANGED_EVENT, load);};
  }, []);

  return count;
}
