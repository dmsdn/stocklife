"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Settings, Bell, Gift, Package } from "lucide-react";
import { cn } from "@/lib/utils";

type NotificationType = "공지" | "혜택" | "주문";
type Tab = "전체" | NotificationType;

interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  href?: string;
}

const TABS: Tab[] = ["전체", "공지", "혜택", "주문"];

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  공지: Bell,
  혜택: Gift,
  주문: Package,
};

// 알림 생성 시각을 현재 시점 기준 상대 시간으로 표시
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

// TODO: 백엔드 알림 API 연동 전 목업 데이터
const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: "1",
    type: "주문",
    title: "품절이었던 상품이 재입고됐어요",
    message: "찜한 우유 1L가 다시 들어왔어요.",
    createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
    read: false,
  },
  {
    id: "2",
    type: "혜택",
    title: "이번 주 할인 정보",
    message: "소진 임박 신선식품 최대 50% 할인 중이에요.",
    createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    read: false,
  },
  {
    id: "3",
    type: "공지",
    title: "정기 점검 안내",
    message: "8월 20일 새벽 서비스 점검이 예정되어 있어요.",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    read: true,
  },
];

export default function NotificationsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("전체");
  const [notifications, setNotifications] = useState<AppNotification[]>(MOCK_NOTIFICATIONS);

  const handleClick = (item: AppNotification) => {
    // TODO: 실제 읽음 처리 API 연동
    setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
    if (item.href) router.push(item.href);
  };

  const filtered = notifications.filter((n) => tab === "전체" || n.type === tab);

  return (
    // ✅ 다른 서브페이지들과 동일한 폭/여백(mx-auto max-w-lg ... md:p-8)으로 통일
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.back()} aria-label="뒤로가기">
            <ChevronLeft size={20} />
          </button>
          <p className="text-base">알림</p>
        </div>
        <Link href="/mypage/notifications" aria-label="알림 설정" className="text-muted-foreground">
          <Settings size={20} />
        </Link>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-none rounded-full border px-3 py-1.5 text-sm",
              tab === t ? "border-primary font-medium text-primary" : "border-border text-muted-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">알림이 없어요.</p>
      ) : (
        <div className="divide-y divide-border">
          {filtered.map((item) => {
            const Icon = TYPE_ICON[item.type];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleClick(item)}
                className="flex w-full items-start gap-3 py-4 text-left"
              >
                <Icon size={20} className="mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    {!item.read && <span className="h-1.5 w-1.5 shrink-0 rounded-sm bg-primary" />}
                    <p className={cn("truncate text-sm font-medium", item.read && "text-muted-foreground")}>
                      {item.title}
                    </p>
                  </div>
                  <p className={cn("text-sm leading-relaxed", item.read ? "text-muted-foreground" : "text-foreground")}>
                    {item.message}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(item.createdAt)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
