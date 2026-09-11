// components/home/home-login-banner.tsx
// ✅ 버그 수정(요청 — "로그인 전의 카드 배너 내용이 됐음. 원래 쓰던 내용으로 다시 넣어줘")
//   — 원래 화면(첨부 스크린샷)은 흰 배경 카드에 "로그인하고 / LIV와 함께 시작해보세요"
//   문구 + 우측 상단 liv 원형 로고 + 좌하단 "STOCKLIFE 시작하기 >" 알약 버튼이었는데,
//   이전에 다른 배너(민트색 "장보기 리스트, 간편하게 만들어보세요" — 이건 PromoBanner
//   컴포넌트로 별도 위치에서 써야 했던 내용)와 섞이면서 이 화면 자리가 그 내용으로
//   덮어써졌던 것. PromoBanner는 이 카드와 레이아웃 자체가 달라서(가로형, 배경색+
//   그래픽) 재사용하지 않고, 원본 그대로 새로 구성. 로그인 버튼(bg-[#f7ded4]/
//   border-[#ffc9b4]/text-main) 스타일은 마이페이지의 "회원가입" 버튼과 동일하게 맞춤.
//   비로그인 상태에서만 노출, 누르면 로그인 화면으로 이동.
import Link from "next/link";

export function HomeLoginBanner() {
  return (
    <section className="w-full px-4 sm:px-6 lg:px-8">
      <Link
        href="/auth/login"
        className="flex w-full flex-col justify-between gap-4 rounded-[20px] border border-card-border bg-white p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">로그인하고</p>
            <p className="mt-1 text-lg font-semibold text-[#111]">LIV와 함께 시작해보세요</p>
          </div>
          <img
            src="/icons/liv-line.svg"
            alt=""
            aria-hidden="true"
            className="h-9 w-9 shrink-0"
          />
        </div>

        <span className="flex h-11 w-fit items-center gap-1 rounded-full border border-[#ffc9b4] bg-[#f7ded4] px-5 text-sm font-semibold text-main">
          STOCKLIFE 시작하기 <span aria-hidden="true">&gt;</span>
        </span>
      </Link>
    </section>
  );
}
