"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RiSearchLine,
  RiBookmarkLine,
  RiQrScanLine,
  RiUser3Line,
  RiNotification4Line,
  RiMenuLine,
} from "@remixicon/react";

import { useAiPanel } from "./ai-panel-context";
import { useMediaQuery } from "@/lib/use-media-query";

const MOCK_UNREAD_COUNT = 2;

interface HomeAiHeaderProps {
  active?: "home" | "ai";
  onAiChat?: () => void;
  /** ✅ 신규 — 지정하면 햄버거를 눌렀을 때 /saved로 이동하는 대신 이 콜백을 호출
      (AI챗 화면에서 화면 전환 없이 이전 대화 목록 드로어를 여는 용도) */
  onHamburgerClick?: () => void;
  variant?: "inline" | "fixed-desktop";
}

export function HomeAiHeader({ active = "home", onAiChat, onHamburgerClick, variant = "inline" }: HomeAiHeaderProps) {
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
      <div className="flex min-w-0 items-center gap-2 md:gap-3 mx-4">
        <Link href="/" aria-label="홈 화면으로 이동" className="shrink-0 transition-opacity hover:opacity-70">
          <Image
            src="/icons/logo-shopping.svg"
            alt="쇼핑"
            width={181}
            height={51}
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
            width={68}
            height={51}
            priority
            className="h-10 w-auto md:h-8"
          />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* ✅ 검색/저장/스캔/마이페이지는 모바일에 이미 하단탭바로 있어서 데스크톱에서만 노출
            (여기 없어서 모바일 폭이 넘쳤던 게 알림·AI챗 입력창이 화면 밖으로 밀리던 원인) */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="주요 메뉴">
          <Link href="/search" aria-label="검색" title="검색" className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <RiSearchLine size={20} />
          </Link>
          <Link href="/saved" aria-label="저장" title="저장" className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <RiBookmarkLine size={20} />
          </Link>
          <Link href="/scan" aria-label="스캔" title="스캔" className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <RiQrScanLine size={20} />
          </Link>
          <Link href="/mypage" aria-label="마이페이지" title="마이페이지" className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <RiUser3Line size={20} />
          </Link>
        </nav>

        {/* ✅ 참고 디자인(AI챗 화면) — AI챗 화면(모바일)에서는 알림 종 대신 햄버거 메뉴를
            보여주고, 누르면 지난 대화 목록(기록 > 리브)으로 이동합니다. 그 외 화면은
            기존대로 알림 종. */}
        {active === "ai" ? (
          onHamburgerClick ? (
            <button
              type="button"
              onClick={onHamburgerClick}
              aria-label="지난 대화 목록"
              title="지난 대화 목록"
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            >
              <RiMenuLine size={20} />
            </button>
          ) : (
            <Link
              href="/saved?tab=ai"
              aria-label="지난 대화 목록"
              title="지난 대화 목록"
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            >
              <RiMenuLine size={20} />
            </Link>
          )
        ) : null}

        {/* 알림은 모바일·데스크톱 항상 노출(단, 모바일 AI챗 화면은 위 햄버거로 대체) */}
        <Link
          href="/notifications"
          aria-label="알림"
          title="알림"
          className={`relative ml-1 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground ${active === "ai" ? "hidden md:flex" : ""}`}
        >
          <RiNotification4Line size={20} />
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
