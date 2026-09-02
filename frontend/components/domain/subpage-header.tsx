"use client";

import { useRouter } from "next/navigation";
import { RiArrowLeftSLine } from "@remixicon/react";

export function SubpageHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <div className="mb-6 flex items-center gap-3">
      <button type="button" onClick={() => router.back()} aria-label="뒤로가기">
        <RiArrowLeftSLine size={24} />
      </button>
      <p className="text-base">{title}</p>
    </div>
  );
}
