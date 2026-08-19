// app/(main)/mypage/notifications/page.tsx
"use client";

import { useState } from "react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { Checkbox } from "@/components/domain/checkbox";

const items = [
  { id: "stock", label: "재고 입고 알림" },
  { id: "discount", label: "할인 / 이벤트 알림" },
  { id: "order", label: "결제 알림" },
  { id: "membership", label: "멤버십 알림" },
  { id: "notice", label: "공지사항 알림" },
];

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<Record<string, boolean>>(
    Object.fromEntries(items.map((s) => [s.id, true]))
  );

  const toggle = (id: string) => setSettings((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="mx-auto max-w-md p-4 md:max-w-2xl md:p-8">
      <SubpageHeader title="알림 설정" />
      <div className="divide-y divide-border">
        {items.map((item) => (
          <label key={item.id} className="flex items-center justify-between py-4 text-sm">
            {item.label}
            <Checkbox checked={settings[item.id]} onChange={() => toggle(item.id)} />
          </label>
        ))}
      </div>
    </div>
  );
}