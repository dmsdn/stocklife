import Link from "next/link";
import { Plus } from "lucide-react";

const chips = [
  { href: "/", label: "홈" },
  { href: "/ai", label: "AI" },
  { href: "/mypage", label: "구매목록" },
];

export function QuickTabChips() {
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {chips.map((chip) => (
        <Link
          key={chip.href}
          href={chip.href}
          className="whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm"
        >
          {chip.label}
        </Link>
      ))}
      <button
        type="button"
        aria-label="새 목록 추가"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
