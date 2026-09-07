"use client";
import { RiPhoneFill } from "@remixicon/react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { FAKE_SUPPORT_PHONE } from "@/components/domain/receipt-dialog";

// ✅ 수정(요청) — FAQ 제거하고 전화문의만 남김, 실제로 존재하지 않는 번호로 통일(영수증
//   화면과 같은 번호를 씀 — components/domain/receipt-dialog.tsx의 FAKE_SUPPORT_PHONE).
//   상단에 붙어있지 않고 화면 중앙에 훨씬 크게 배치.
export default function SupportPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-lg flex-col p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title="고객센터" />

      <a
        href={`tel:${FAKE_SUPPORT_PHONE}`}
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#fff0eb] text-main">
          <RiPhoneFill size={36} />
        </div>
        <p className="text-lg text-muted-foreground">전화 문의</p>
        <p className="text-[40px] font-bold leading-none">{FAKE_SUPPORT_PHONE}</p>
      </a>
    </div>
  );
}
