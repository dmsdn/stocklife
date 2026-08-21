// lib/notification-prefs.ts
// ⚠ 백엔드에 알림설정 조회/변경 API가 없어서 로컬 저장입니다. marketingConsent는 회원가입 시
//   입력한 값이 있으면 그 값으로 초기화하고, 이후 변경은 로컬에만 반영됩니다(실제 반영하려면
//   백엔드에 PATCH 엔드포인트가 필요합니다).
"use client";

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

const DEFAULTS: NotificationPrefs = {
  all: true,
  stock: true,
  discount: true,
  order: true,
  membership: true,
  notice: true,
  marketing: false,
};

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
}
