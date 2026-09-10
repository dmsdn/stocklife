// app/auth/layout.tsx
"use client";

import { usePathname } from "next/navigation";
import { BottomBarVisibilityProvider } from "@/components/layout/bottom-bar-visibility-context";

// ✅ 버그 수정(요청 — "회원가입하고 사전정보 입력하려고 다음누르면 오류남") — 원인은
//   components/domain/profile-step.tsx가 useBottomBarVisibility()를 부르는데, 이 훅은
//   BottomBarVisibilityProvider 밖에서 부르면 일부러 에러를 던지도록 만들어져 있음(디버깅
//   가치가 커서 의도된 설계 — 아래 그 파일의 주석 참고). Provider는 (main)/layout.tsx의
//   AppShell에만 있고 이 auth 레이아웃엔 없어서, 회원가입 사전정보 단계(ProfileStep을 쓰는
//   모든 화면 — 생년월일/성별/가구원수/반려동물/자녀/차량)에 진입하는 순간 크래시났음.
//   훅 자체를 관대하게 바꾸는 대신(다른 진짜 오용까지 조용히 덮어버릴 수 있어서), 이
//   레이아웃도 AppShell과 똑같이 Provider로 감싸는 쪽으로 고쳤음 — 여기엔 하단탭바 자체가
//   없지만, Provider가 있으면 훅 호출 자체는 안전하게 무해한 상태 갱신으로 끝남.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/auth/login";

  // ✅ 수정(2026-09) — "화면 아래에 흰 여백이 남는" 원인: min-h-full(=min-height:100%)은
  //   부모(body)의 높이가 "확정된 값"이어야 퍼센트가 제대로 풀리는데, body는 height가
  //   아니라 min-height만 갖고 있어서(패턴 자체는 globals.css에 있음) 퍼센트 기준이
  //   불확정 상태였음 — 그래서 실제로는 내용물 높이만큼만 채워지고, 그 아래 뷰포트
  //   끝까지는 배경(surface-subtle)이 아니라 그 뒤의 기본 흰 배경이 그대로 보였던 것.
  //   min-h-dvh(뷰포트 자체 기준, 모바일 주소창 변화에도 안전한 동적 단위)로 바꿔서
  //   조상 요소의 높이 확정 여부와 무관하게 항상 뷰포트 전체를 채우게 함.
  // 로그인 화면은 자체적으로 전체 레이아웃(모바일 상단정렬/웹 2분할)을 관리하므로 그대로 통과
  if (isLogin) {
    return (
      <BottomBarVisibilityProvider>
        <div className="min-h-dvh bg-surface-subtle">{children}</div>
      </BottomBarVisibilityProvider>
    );
  }

  // 나머지 인증 화면(회원가입 등)은 상단 고정 정렬 — 참고 디자인(Frame 109 등)이
  // 화면을 세로 중앙정렬하지 않고 위에서부터 고정 위치로 내용을 배치하고 있어서
  // items-center/justify-center(세로 중앙정렬)를 걷어냈습니다.
  return (
    <BottomBarVisibilityProvider>
      <div className="min-h-dvh bg-surface-subtle">
        <div className="mx-auto w-full max-w-sm px-5 md:max-w-md">{children}</div>
      </div>
    </BottomBarVisibilityProvider>
  );
}