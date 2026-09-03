// components/ui/checkbox.tsx
// ✅ 공용 체크박스 — 앱 전체 체크박스는 전부 이 컴포넌트를 가져다 씁니다.
// 선택 전: 흰 배경 + 테두리 / 선택 후: 검은 배경 + 흰 체크
"use client";

export function Checkbox({
  checked,
  onChange,
  variant = "default",
}: {
  checked: boolean;
  onChange: () => void;
  // ✅ 기본은 뉴트럴(검정) 체크 — 상품 선택 등 "상태" 표현용, 기존 화면 전부 이 값.
  //   brand는 온보딩(로그인 자동로그인, 약관 동의)처럼 Figma가 브랜드 오렌지 체크를
  //   요구하는 화면 전용 — DESIGN_TOKENS.md 원칙(primary≠brand)을 지키기 위해 컴포넌트
  //   기본값은 그대로 두고 variant로만 opt-in 하게 함.
  variant?: "default" | "brand";
}) {
  const checkedClass = variant === "brand" ? "border-brand bg-brand" : "border-primary bg-primary";
  const iconClass = variant === "brand" ? "text-brand-foreground" : "text-primary-foreground";
  return (
    <span
      className={`relative inline-flex h-5 w-5 flex-none items-center justify-center rounded border ${
        checked ? checkedClass : "border-border bg-background"
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
          className={`pointer-events-none h-3.5 w-3.5 ${iconClass}`}
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
