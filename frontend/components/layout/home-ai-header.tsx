"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { AiChatPanel } from "@/components/ai/ai-chat-panel";

const MOCK_UNREAD_COUNT = 2;

interface HomeAiHeaderProps {
  active: "home" | "ai";
  onAiChat?: () => void;
}

export function HomeAiHeader({
  active,
  onAiChat,
}: HomeAiHeaderProps) {
  const [
    showAiPanel,
    setShowAiPanel,
  ] = useState(false);

  const pageContext =
    active === "home"
      ? `
현재 사용자는 쇼핑 홈 화면을 보고 있습니다.

현재 화면의 주요 내용:
- 나의 쇼핑 상태
- 보유 포인트: 2,840P
- 이번 달 절약: 18,400원
- AI 활용: 12회
- 이번 주 생필품 구매 시기가 가까워짐
- 예상 장보기 금액: 약 27,800원
- 추천 상품
- AI가 발견한 할인 상품
- 나의 장바구니
- AI가 기억하고 있는 지난 장보기 계획
`
      : `
현재 사용자는 AI 쇼핑 화면을 보고 있습니다.
`;

  const handleAiClick = () => {
    if (onAiChat) {
      onAiChat();
      return;
    }

    setShowAiPanel(true);
  };

  return (
    <>
      <header className="relative z-50 flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          {active === "home" ? (
            <>
              <Image
                src="/icons/logo-shopping.svg"
                alt="쇼핑"
                width={120}
                height={40}
                priority
              />

              <span className="text-muted-foreground">
                |
              </span>

              <button
                type="button"
                onClick={handleAiClick}
                aria-label="AI Chat 열기"
                className="shrink-0 opacity-60 transition hover:opacity-100"
              >
                <Image
                  src="/icons/logo-ai.svg"
                  alt="AI Chat"
                  width={120}
                  height={40}
                  priority
                />
              </button>
            </>
          ) : (
            <>
              <Link
                href="/"
                aria-label="홈 화면으로 이동"
                className="shrink-0 opacity-60 transition hover:opacity-100"
              >
                <Image
                  src="/icons/logo-shopping.svg"
                  alt="쇼핑"
                  width={120}
                  height={40}
                />
              </Link>

              <span className="text-muted-foreground">
                |
              </span>

              <Image
                src="/icons/logo-ai.svg"
                alt="AI"
                width={120}
                height={40}
                priority
              />
            </>
          )}
        </div>

        <Link
          href="/notifications"
          aria-label="알림"
          className="relative shrink-0"
        >
          <Image
            src="/icons/bell.svg"
            alt=""
            width={24}
            height={24}
            aria-hidden
          />

          {MOCK_UNREAD_COUNT > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
              {MOCK_UNREAD_COUNT}
            </span>
          )}
        </Link>
      </header>

      {!onAiChat && (
        <AiChatPanel
          open={showAiPanel}
          onClose={() =>
            setShowAiPanel(
              false,
            )
          }
          pageContext={
            pageContext
          }
        />
      )}
    </>
  );
}