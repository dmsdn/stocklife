// lib/proactive-notifications.ts
// ✅ 신규(요청 2번) — "리브가 열심히 보내고 있는데 알림에 저장이 안 됨". 자발형
//   메시지는 SSE(lib/realtime.ts)로만 흘러오고, 백엔드가 이걸 Notification 레코드로
//   따로 만들어주는 API가 없어서(EventBroadcastService는 chat_message만 만듦) 알림함
//   화면(app/(main)/notifications/page.tsx, GET /api/notifications)에는 안 보였습니다.
//   실시간으로 받는 순간 여기(로컬 저장소)에도 같이 적어두고, 알림함 화면이 그걸
//   백엔드 알림과 합쳐서 보여줍니다.
"use client";

import type { ProactiveMessage } from "./realtime";
import { AUTH_CHANGED_EVENT } from "./api-client";

const KEY = "storeflow_proactive_notifications";
const MAX_ITEMS = 50;

export interface ProactiveNotificationRecord {
  id: string; // "px-<messageId>" 또는 "px-<타임스탬프>"
  content: string;
  createdAt: string;
  read: boolean;
}

function canUseStorage() {
  return typeof window !== "undefined";
}

export function readProactiveNotifications(): ProactiveNotificationRecord[] {
  if (!canUseStorage()) return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(list: ProactiveNotificationRecord[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
}

/** ✅ 실시간으로 자발형 메시지를 받을 때마다 호출(lib/realtime.ts가 이미 messageId
 *  기준으로 중복은 걸러주므로, 여기서는 저장만 하면 됨). */
export function saveProactiveNotification(m: ProactiveMessage) {
  const record: ProactiveNotificationRecord = {
    id: m.messageId != null ? `px-${m.messageId}` : `px-${Date.now()}`,
    content: m.content,
    createdAt: m.createdAt ?? new Date().toISOString(),
    read: false,
  };
  const list = readProactiveNotifications();
  if (list.some((n) => n.id === record.id)) return; // 이미 저장된 건 다시 안 넣음
  write([record, ...list]);
  window.dispatchEvent(new Event("storeflow:proactive-notifications-changed"));
}

export function markProactiveNotificationRead(id: string) {
  const list = readProactiveNotifications();
  write(list.map((n) => (n.id === id ? { ...n, read: true } : n)));
  window.dispatchEvent(new Event("storeflow:proactive-notifications-changed"));
}

// 팀 알림 보관 기능을 오라클의 계정 전환 경계에도 연결한다.
export function clearProactiveNotifications() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("storeflow:proactive-notifications-changed"));
}
if (typeof window !== "undefined") {
  window.addEventListener(AUTH_CHANGED_EVENT, clearProactiveNotifications);
}
