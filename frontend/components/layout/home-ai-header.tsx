"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAiPanel } from "./ai-panel-context";
import { useMediaQuery } from "@/lib/use-media-query";

const MOCK_UNREAD_COUNT = 2;

interface HomeAiHeaderProps {
  active?: "home" | "ai";
  onAiChat?: () => void;

  variant?: "inline" | "fixed-desktop";
}

export function HomeAiHeader({ active = "home", onAiChat, variant = "inline" }: HomeAiHeaderProps) {
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { toggle: toggleAiPanel } = useAiPanel();

  const handleAiClick = () => {
    if (onAiChat) {
      onAiChat();
      return;
    }
    // 데스크톱은 오른쪽 분할 패널(AiPanel, 진짜 sidebar), 모바일은 /ai 전체화면으로 이동
    if (isDesktop) {
      toggleAiPanel();
    } else {
      router.push("/ai");
    }
  };

  const content = (
    <header className="flex h-16 w-full items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <Link href="/" aria-label="홈 화면으로 이동" className="shrink-0 transition-opacity hover:opacity-70">
          <Image
            src="/icons/logo-shopping.svg"
            alt="쇼핑"
            width={120}
            height={40}
            priority
            className="h-10 w-auto md:h-8"
          />
        </Link>
        <span className="text-muted-foreground">|</span>
        <button
          type="button"
          onClick={handleAiClick}
          aria-label="AI Chat 열기"
          className="shrink-0 transition-opacity hover:opacity-70"
        >
          <Image
            src="/icons/logo-ai.svg"
            alt="AI Chat"
            width={120}
            height={40}
            priority
            className="h-10 w-auto md:h-8"
          />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* ✅ 검색/저장/스캔/마이페이지는 모바일에 이미 하단탭바로 있어서 데스크톱에서만 노출
            (여기 없어서 모바일 폭이 넘쳤던 게 알림·AI챗 입력창이 화면 밖으로 밀리던 원인) */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="주요 메뉴">
          <Link href="/search" aria-label="검색" title="검색" className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <SearchIcon />
          </Link>
          <Link href="/saved" aria-label="저장" title="저장" className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <HeartIcon />
          </Link>
          <Link href="/scan" aria-label="스캔" title="스캔" className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <BarcodeIcon />
          </Link>
          <Link href="/mypage" aria-label="마이페이지" title="마이페이지" className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <UserIcon />
          </Link>
        </nav>

        {/* 알림은 모바일·데스크톱 항상 노출 */}
        <Link
          href="/notifications"
          aria-label="알림"
          title="알림"
          className="relative ml-1 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <BellIcon />
          {MOCK_UNREAD_COUNT > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
              {MOCK_UNREAD_COUNT}
            </span>
          )}
        </Link>
      </div>
    </header>
  );

  if (variant === "inline") {
    // AppShell이 데스크톱용 고정 헤더를 별도로 그리므로, 페이지 안에 박힌 이 헤더는 모바일에서만
    return <div className="md:hidden">{content}</div>;
  }

  return content;
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}
function HeartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.8 8.9c0 5.2-8.8 10.1-8.8 10.1S3.2 14.1 3.2 8.9A4.6 4.6 0 0 1 12 6.2a4.6 4.6 0 0 1 8.8 2.7Z" />
    </svg>
  );
}
function BarcodeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5v14" /><path d="M7 5v14" /><path d="M10 5v14" /><path d="M14 5v14" /><path d="M17 5v14" /><path d="M21 5v14" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" />
    </svg>
  );
}
