// components/ui/checkbox.tsx
// ✅ 공용 체크박스 — 앱 전체 체크박스는 전부 이 컴포넌트를 가져다 씁니다.
// 선택 전: 흰 배경 + 테두리 / 선택 후: 검은 배경 + 흰 체크
// ✅ 수정(2026-09, 2차) — "모바일에서만 체크가 안 됨"의 진짜 원인: 눌리는 요소가 실제로는
//   opacity:0으로 완전히 투명하게 숨긴 진짜 <input type="checkbox">였는데, iOS Safari 등
//   일부 모바일 브라우저는 완전히 투명한(opacity:0) 폼 요소의 터치를 안정적으로 인식하지
//   못하는 경우가 있습니다(잘 알려진 브라우저 버그) — 마우스 클릭(데스크톱)은 이 문제가
//   없어서 "다른 건 다 잘 눌리는데 체크박스만 안 됨"과 정확히 일치합니다. 지난 수정
//   (터치 영역을 44px로 넓힌 것)은 그 자체로는 맞는 개선이지만 이 브라우저 버그 자체를
//   해결하진 못했습니다.
//   근본적으로 "숨긴 input"에 의존하는 방식을 버리고, 커스텀 체크박스의 표준 접근성
//   패턴인 role="checkbox" 버튼으로 바꿨습니다 — 버튼은 모든 브라우저에서 터치가
//   항상 안정적으로 동작합니다.
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
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label="체크박스"
      onClick={onChange}
      // ✅ 보이는 박스는 20px 그대로, 눌리는 영역은 -m-3(사방 12px)로 44px까지 넓힘.
      //   button은 opacity와 무관하게 항상 안정적으로 터치가 인식되니, 아예 투명 처리 없이
      //   테두리/배경 자체를 보이는 모양 그대로 쓰면 됨(숨긴 input이 따로 필요 없음).
      className={`-m-3 flex h-11 w-11 flex-none items-center justify-center`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded border ${
          checked ? checkedClass : "border-border bg-background"
        }`}
      >
        {checked && (
          <svg
            className={`h-3.5 w-3.5 ${iconClass}`}
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
    </button>
  );
}
