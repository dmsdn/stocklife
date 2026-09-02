"use client";
import Link from "next/link";
import { ChevronRight, Phone } from "lucide-react";
import { SubpageHeader } from "@/components/domain/subpage-header";

// TODO: 실제 고객센터 번호로 교체
const SUPPORT_PHONE = "1588-0000";

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title="고객센터" />

      <a
        href={`tel:${SUPPORT_PHONE}`}
        className="flex items-center gap-3 rounded-sm border border-border p-4"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Phone size={24} />
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">전화 문의</p>
          <p className="text-lg font-semibold">{SUPPORT_PHONE}</p>
        </div>
      </a>

      <div className="mt-6 divide-y divide-border">
        <Link href="/mypage/faq" className="flex items-center justify-between py-3 text-sm">
          FAQ
          <ChevronRight size={24} className="text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}
