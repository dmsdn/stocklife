// app/(main)/mypage/notifications/page.tsx
"use client";

import { useEffect, useState } from "react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { Checkbox } from "@/components/ui/checkbox";
import { readNotificationPrefs, writeNotificationPrefs, syncNotificationPrefsFromServer, DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from "@/lib/notification-prefs";

const items: { key: keyof Omit<NotificationPrefs, "all">; label: string }[] = [
  { key: "stock", label: "재고 입고 알림" },
  { key: "discount", label: "할인 / 이벤트 알림" },
  { key: "order", label: "결제 알림" },
  { key: "membership", label: "멤버십 알림" },
  { key: "notice", label: "공지사항 알림" },
  { key: "marketing", label: "마케팅 정보 수신 동의" },
];

export default function NotificationSettingsPage() {
  // ⚠ 서버는 DEFAULTS를 반환하지만, 클라이언트 첫 렌더(hydration)는 이미 저장된 실제 값을
  //   읽어와 달라질 수 있어 hydration mismatch가 납니다. 항상 DEFAULTS로 시작하고,
  //   마운트 후 useEffect에서만 로컬 저장값으로 갱신합니다.
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);

  useEffect(() => {
    setPrefs(readNotificationPrefs());
  }, []);

  // ✅ 서버에 저장된 값이 있으면(다른 기기 등) 동기화
  useEffect(() => {
    syncNotificationPrefsFromServer().then(setPrefs);
  }, []);

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
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title="알림 설정" />

      <label className="flex items-center justify-between border-b border-border py-4 text-sm font-medium">
        전체 알림
        <Checkbox checked={prefs.all} onChange={toggleAll} />
      </label>

      <div className="divide-y divide-border">
        {items.map((item) => (
          <label key={item.key} className="flex items-center justify-between py-4 text-sm">
            {item.label}
            <Checkbox
              checked={prefs[item.key]}
              onChange={() => update({ [item.key]: !prefs[item.key] } as Partial<NotificationPrefs>)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
