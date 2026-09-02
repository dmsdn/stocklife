// lib/notification-prefs.ts
// ✅ 로컬 저장은 그대로 두고(즉시 반영용), 실제 서버 저장(GET/PATCH)도 같이 시도합니다.
//   백엔드에 아직 없으면 실패해도 로컬 값은 정상 동작합니다.
"use client";

import { apiFetch } from "./api-client";

const KEY = "storeflow_notification_prefs";

export interface NotificationPrefs {
  all: boolean;
  stock: boolean;
  discount: boolean;
  order: boolean;
  membership: boolean;
  notice: boolean;
  marketing: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  all: true,
  stock: true,
  discount: true,
  order: true,
  membership: true,
  notice: true,
  marketing: false,
};

const DEFAULTS = DEFAULT_NOTIFICATION_PREFS;

export function readNotificationPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    return { ...DEFAULTS, ...JSON.parse(window.localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function writeNotificationPrefs(prefs: NotificationPrefs) {
  window.localStorage.setItem(KEY, JSON.stringify(prefs));
  apiFetch("/api/consumers/notification-settings", {
    method: "PATCH",
    body: JSON.stringify(prefs),
  }).catch(() => {});
}

/** ✅ 서버에 저장된 값이 있으면 그걸로 로컬을 덮어씁니다(다른 기기에서 바꾼 설정 반영용) */
export async function syncNotificationPrefsFromServer(): Promise<NotificationPrefs> {
  try {
    const server = await apiFetch<NotificationPrefs>("/api/consumers/notification-settings");
    window.localStorage.setItem(KEY, JSON.stringify(server));
    return server;
  } catch {
    return readNotificationPrefs();
  }
}
