// components/ui/checkbox.tsx
// ✅ 공용 체크박스 — 앱 전체 체크박스는 전부 이 컴포넌트를 가져다 씁니다.
// 선택 전: 흰 배경 + 테두리 / 선택 후: 검은 배경 + 흰 체크
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
      className={`relative inline-flex h-5 w-5 flex-none items-center justify-center rounded border ${
        checked ? "border-primary bg-primary" : "border-border bg-background"
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
