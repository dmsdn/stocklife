// app/(main)/mypage/notifications/page.tsx
"use client";

import { useState } from "react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { readNotificationPrefs, writeNotificationPrefs, type NotificationPrefs } from "@/lib/notification-prefs";

const items: { key: keyof Omit<NotificationPrefs, "all">; label: string }[] = [
  { key: "stock", label: "재고 입고 알림" },
  { key: "discount", label: "할인 / 이벤트 알림" },
  { key: "order", label: "결제 알림" },
  { key: "membership", label: "멤버십 알림" },
  { key: "notice", label: "공지사항 알림" },
  { key: "marketing", label: "마케팅 정보 수신 동의" },
];

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => readNotificationPrefs());

  const update = (patch: Partial<NotificationPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    writeNotificationPrefs(next);
  };

  const toggleAll = () => {
    const nextAll = !prefs.all;
    update({
      all: nextAll,
      stock: nextAll,
      discount: nextAll,
      order: nextAll,
      membership: nextAll,
      notice: nextAll,
      // marketing은 별도 법적 동의라 전체 토글에 안 딸려가게 유지
    });
  };

  return (
    <div className="mx-auto max-w-md p-4 md:max-w-2xl md:p-8">
      <SubpageHeader title="알림 설정" />

      <label className="flex items-center justify-between border-b border-border py-4 text-sm font-medium">
        전체 알림
        <input type="checkbox" checked={prefs.all} onChange={toggleAll} className="h-4 w-4 rounded border-border" />
      </label>

      <div className="divide-y divide-border">
        {items.map((item) => (
          <label key={item.key} className="flex items-center justify-between py-4 text-sm">
            {item.label}
            <input
              type="checkbox"
              checked={prefs[item.key]}
              onChange={() => update({ [item.key]: !prefs[item.key] } as Partial<NotificationPrefs>)}
              className="h-4 w-4 rounded border-border"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
