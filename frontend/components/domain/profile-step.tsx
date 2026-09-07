// components/domain/profile-step.tsx
// ✅ 참고 디자인(Frame 116~121) 기준 — 6개 추가정보 단계 화면(생년월일/성별/가구원수/
//   반려동물/자녀/차량)이 전부 같은 골격(제목 → 2줄 설명 → 선택지 목록 → 하단 고정
//   "다음" 버튼)이라 공통 레이아웃으로 뺐습니다. 실측치: 제목 상단 87px, 제목~설명 18px,
//   설명~목록 43px, 선택지 행 47px + 행간 11px, 버튼은 화면 하단에 고정(42px 여백).
//   ⚠ 참고 이미지에는 상단에 뒤로가기/전체건너뛰기 버튼이 안 보이지만, 실제 앱에서
//   뒤로 갈 방법 자체가 없어지는 건 아니라고 판단해 최소한의 형태로 유지했습니다 —
//   높이를 작게 줄여서 제목 위치(87px)에는 영향 없게 했습니다.
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RiArrowLeftLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { StickyBottomBar } from "@/components/domain/sticky-bottom-bar";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";

export function ProfileStep({
  title,
  description,
  onBack,
  children,
  nextDisabled,
  onNext,
  nextLabel = "다음",
}: {
  title: React.ReactNode;
  description?: string;
  onBack?: () => void;
  children: React.ReactNode;
  nextDisabled: boolean;
  onNext: () => void;
  nextLabel?: string;
}) {
  const router = useRouter();

  // ✅ 신규(요청) — 정보 수정 화면들은 입력에 집중하는 화면이라 하단 탭바가 안 보여야
  //   함. 이 컴포넌트를 쓰는 화면(성별/생년월일 등) 전부에 한 번에 적용됨.
  const { setHidden } = useBottomBarVisibility();
  useEffect(() => {
    setHidden(true);
    return () => setHidden(false);
  }, [setHidden]);

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-[140px]">
      {onBack && (
        <div className="flex h-8 items-center">
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-muted"
            aria-label="이전"
          >
            <RiArrowLeftLine size={20} />
          </button>
        </div>
      )}

      <div className={onBack ? "pt-[59px]" : "pt-[87px]"}>
        <h1 className="text-2xl font-bold leading-8">{title}</h1>

        {description && (
          <p className="mt-[18px] whitespace-pre-line text-xs leading-[18px] text-muted-foreground">
            {description}
          </p>
        )}

        <div className="mt-[43px] space-y-[11px]">{children}</div>
      </div>

      {/* ✅ 수정(2026-09) — mt-auto(문서 흐름 안 맨 아래) 대신 화면에 진짜 고정(StickyBottomBar).
          키보드가 올라와도 그 위에 계속 붙어있음. */}
      <StickyBottomBar>
        <Button
          className="flex mx-auto h-[60px] w-fit px-5 rounded-full shadow-[0_-2px_20px_rgba(0,0,0,0.1)]"
          disabled={nextDisabled}
          onClick={onNext}
        >
          {nextLabel}
        </Button>
      </StickyBottomBar>
    </div>
  );
}

export function ProfileChoice({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 w-full items-center justify-start rounded-sm border px-4 text-left text-sm font-medium transition ${
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground hover:bg-muted/40"
      }`}
    >
      {children}
    </button>
  );
}
