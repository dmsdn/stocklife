"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export function SubpageHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <div className="mb-6 flex items-center gap-3">
      <button type="button" onClick={() => router.back()} aria-label="뒤로가기">
        <ChevronLeft size={24} />
      </button>
      <p className="text-base">{title}</p>
    </div>
  );
}
