"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RiArrowLeftSLine, RiSettings3Line, RiMegaphoneLine, RiVipDiamondLine, RiShoppingCart2Line } from "@remixicon/react";
import { cn } from "@/lib/utils";
import { apiFetch, getAccessToken, AUTH_CHANGED_EVENT } from "@/lib/api-client";

type NotificationType = "공지" | "혜택" | "주문" | "리브";
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

const TABS: Tab[] = ["전체", "공지", "혜택", "주문", "리브"];

// 백엔드는 리스트 보유자의 재입고 알림(RESTOCK)을 생성합니다.
// 실제 백엔드 type이 추가되면 이 매핑만 확장하면 됩니다.
function mapBackendType(type: string): NotificationType {
  if (["PROMO","BENEFIT","PROMOTION","POINT","GRADE","COUPON"].includes(type)) return "혜택";
  if (type === "ORDER") return "주문";
  if (type === "AI_PROACTIVE" || type === "REPURCHASE" || type === "AI_CHAT" || type === "AI" || type === "CHAT") return "리브";
  return "공지";
}

// ✅ 수정(요청) — 아이콘 지정: 주문=shopping-cart-2-line, 공지=megaphone-line,
//   혜택=vip-diamond-line. 리브는 remixicon이 아니라 프로젝트 자체 아이콘(liv-line.svg)이라
//   TYPE_ICON 맵이 아니라 렌더링 쪽에서 따로 분기합니다(아래 NotificationIcon).
const TYPE_ICON: Record<Exclude<NotificationType, "리브">, typeof RiMegaphoneLine> = {
  공지: RiMegaphoneLine,
  혜택: RiVipDiamondLine,
  주문: RiShoppingCart2Line,
};

function NotificationIcon({ type }: { type: NotificationType }) {
  if (type === "리브") {
    return <img src="/icons/liv-line.svg" alt="" className="mt-0.5 h-6 w-6 shrink-0" />;
  }
  const Icon = TYPE_ICON[type];
  return <Icon size={24} className="mt-0.5 shrink-0 text-muted-foreground" />;
}

// 알림 생성 시각을 현재 시점 기준 상대 시간으로 표시
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(/(Z|[+-]\d{2}:\d{2})$/.test(iso) ? iso : iso+"Z").getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

import { readProactiveNotifications, markProactiveNotificationRead, type ProactiveNotificationRecord } from "@/lib/proactive-notifications";

function toAppNotification(n: ProactiveNotificationRecord): AppNotification {
  return {
    id: n.id,
    type: "리브",
    title: "리브가 먼저 알려드려요",
    message: n.content,
    createdAt: n.createdAt,
    read: n.read,
  };
}

export default function NotificationsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("전체");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ✅ 재적용(요청 2번 — "목업 알림 없애고 실제 ai가 던져주는 내용만") — 예전엔 항상
  //   가짜 알림 4개(MOCK_NOTIFICATIONS)로 시작해서, 백엔드 조회가 비어있어도 그 4개가
  //   계속 보였습니다. 이제 빈 배열로 시작하고, 아래 두 실제 소스만 채웁니다:
  //   1) GET /api/notifications(백엔드 알림) — 있으면 그걸로 교체
  //   2) 리브가 실제로 먼저 건넨 말(AI_PROACTIVE, lib/realtime.ts의 SSE) — 로컬에
  //      저장해뒀다가(lib/proactive-notifications.ts) 아래서 합침
  //   둘 다 없으면 정말로 "알림이 없어요"가 뜹니다(가짜로 채우지 않음).
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  // ✅ 자발형 메시지는 백엔드 알림 API가 아니라 로컬 저장소(lib/proactive-notifications.ts,
  //   lib/realtime.ts가 실시간으로 채움)에 있어서 따로 불러와 합칩니다. 이 화면이 열려있는
  //   동안 새로 도착해도(storeflow:proactive-notifications-changed) 바로 반영되게 이벤트도 구독.
  const [proactiveNotifications, setProactiveNotifications] = useState<ProactiveNotificationRecord[]>([]);
  useEffect(() => {
    const load = () => setProactiveNotifications(readProactiveNotifications());
    load();
    window.addEventListener("storeflow:proactive-notifications-changed", load);
    return () => window.removeEventListener("storeflow:proactive-notifications-changed", load);
  }, []);

  // ✅ 실제 GET /api/notifications 연동. 백엔드 응답 필드명(notificationId, linkUrl)이
  //   프론트가 쓰는 형태(id, href)랑 달라서 매핑해서 씁니다.
  useEffect(() => {
    let active = true;
    const load = () => {const token=getAccessToken();return apiFetch<
      { notificationId: number; type: string; title: string; message: string; linkUrl: string | null; read: boolean; createdAt: string }[]
    >("/api/notifications")
      .then((list) => {
        if (!active || token!==getAccessToken()) return;
        setError(null);
        setNotifications(
          list.map((n) => ({
            id: String(n.notificationId),
            type: mapBackendType(n.type),
            title: n.title,
            message: n.type === "RESTOCK"
              ? n.message.replace("장바구니에 담아두신 상품이에요!", "리스트에 담아둔 상품이에요!")
              : n.message,
            createdAt: n.createdAt,
            read: n.read,
            href: n.linkUrl ?? (n.type === "RESTOCK" ? "/saved" : undefined),
          }))
        );
      })
      .catch(() => {if(active && token===getAccessToken())setError("알림을 불러오지 못했어요. 로그인 상태를 확인하고 새로고침해 주세요.");})
      .finally(() => {if(active && token===getAccessToken())setLoading(false);});};
    load(); const timer = window.setInterval(load, 5000);
    const onAuth=()=>{setNotifications([]);load();};
    window.addEventListener(AUTH_CHANGED_EVENT, onAuth);
    return () => {active=false;window.clearInterval(timer);window.removeEventListener(AUTH_CHANGED_EVENT, onAuth);};
  }, []);

  // ✅ 백엔드/목업 알림 + 로컬 자발형 알림을 합쳐서 최신순으로.
  const allNotifications = [...notifications, ...proactiveNotifications.filter(p => !notifications.some(n => n.message === p.content || p.content.startsWith(n.message.replace(/…$/, "")))).map(toAppNotification)].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const handleClick = (item: AppNotification) => {
    if (item.id.startsWith("px-")) {
      markProactiveNotificationRead(item.id);
    } else {
      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      // ✅ 실제 읽음 처리 API — 백엔드 없으면 조용히 실패(화면 상태는 이미 반영됨)
      apiFetch(`/api/notifications/${item.id}/read`, { method: "PATCH" }).catch(() => {});
    }
    if (item.href) router.push(item.href);
  };

  const filtered = allNotifications.filter((n) => tab === "전체" || n.type === tab);

  return (
    // ✅ 다른 서브페이지들과 동일한 폭/여백(mx-auto max-w-lg ... md:p-8)으로 통일
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.back()} aria-label="뒤로가기">
            <RiArrowLeftSLine size={24} />
          </button>
          <p className="text-base">알림</p>
        </div>
        <Link href="/mypage/notifications" aria-label="알림 설정" className="text-muted-foreground">
          <RiSettings3Line size={24} />
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

      {error && <p role="alert" className="py-4 text-sm">{error}</p>}
      {loading && filtered.length === 0 ? (
        <p className="py-16 text-center text-sm">알림을 불러오는 중이에요.</p>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">알림이 없어요.</p>
      ) : (
        <div className="divide-y divide-border">
          {filtered.map((item) => {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleClick(item)}
                className="flex w-full items-start gap-3 py-4 text-left"
              >
                <NotificationIcon type={item.type} />
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
