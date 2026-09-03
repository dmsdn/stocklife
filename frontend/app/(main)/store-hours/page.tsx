// app/(main)/store-hours/page.tsx
// ✅ 신규(2026-09, 요청 6번) — 홈 화면의 "매장 운영 시간" 이미지 배너를 누르면 오는 페이지.
//   텍스트 내용은 예전에 홈 화면에 있던 것을 그대로 옮겨왔습니다.
"use client";

import Link from "next/link";
import { RiArrowLeftSLine } from "@remixicon/react";
import { SubpageHeader } from "@/components/domain/subpage-header";

export default function StoreHoursPage() {
  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title="매장 운영 시간" />

      <div className="mt-4 rounded-[20px] border border-card-border bg-white p-5">
        <p className="text-sm text-content-tertiary">영업중 · 11:00 마감</p>

        <p className="mt-6 text-xs text-content-tertiary">· 정규 영업시간</p>
        <p className="mt-2 text-sm">평　　일　오전 10시 ~ 오후 11시</p>
        <p className="text-sm">주말, 공휴일　오전 9시 ~ 오후 11시</p>

        <p className="mt-4 text-xs text-content-tertiary">· 9월 휴일</p>
        <p className="mt-2 text-sm font-semibold text-main">7일, 21일</p>

        <p className="mt-4 text-sm text-main">* 추석 연휴 정상 운영됩니다.</p>
      </div>

      <Link href="/" className="mt-4 flex items-center gap-1 text-sm text-muted-foreground">
        <RiArrowLeftSLine size={16} />
        홈으로
      </Link>
    </div>
  );
}
