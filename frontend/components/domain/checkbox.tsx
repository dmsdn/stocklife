// components/domain/checkbox.tsx
// 이전 popup-store-project의 components/ui/Checkbox.tsx를 이식 — 색상만 이 프로젝트 토큰으로 교체
"use client";

export function Checkbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <span
      className={`relative inline-flex h-5 w-5 flex-none items-center justify-center rounded ${
        checked ? "bg-primary" : "bg-muted"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
      {checked && (
        <svg
          className="pointer-events-none h-3.5 w-3.5 text-primary-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      )}
    </span>
  );
}
