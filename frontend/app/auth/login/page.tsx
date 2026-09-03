// app/auth/login/page.tsx
// ✅ 참고 디자인(Frame 109) 픽셀 측정 기준으로 여백/타이포 재작업.
//   360×800 기준 실측치: 좌우 여백 20px, 로고 상단 여백 180px, 로고~전화번호 입력 간격
//   ~68px, 인풋 간 간격 ~37px, 체크박스 행까지 ~13px, 버튼까지 ~31px(버튼 높이 47px),
//   버튼~하단 링크 ~44px. 상단 중앙정렬(justify-center) 대신 위에서부터 고정 위치로 배치.
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { RiEyeLine, RiEyeOffLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { login, toBackendPhone } from "@/lib/auth";
import { notifySimulationLogin } from "@/lib/simulation-bridge";


function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  const parts = [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7, 11)].filter(Boolean);
  return parts.join(" - ");
}

// ✅ useSearchParams()가 Suspense 경계 없이 쓰이면 next build의 정적 프리렌더가 실패해서
//   (다른 화면들 — saved/page.tsx, scan/page.tsx 등 — 과 동일하게) 내부 로직을 별도
//   컴포넌트로 분리하고 아래 default export에서 Suspense로 감쌌습니다.
function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [loginError, setLoginError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoginError(false);
    setSubmitting(true);
    try {
      // ✅ 로그인 유지 체크 여부를 실제로 반영 — 안 누르면 이 탭 닫을 때(sessionStorage)
      //   또는 새 탭/새 창을 열 때 로그아웃 상태로 보이게 됩니다.
      await login(toBackendPhone(phone), password, keepLoggedIn);
      // ✅ 로그인 성공 직후 시뮬레이션(왼쪽 화면)에도 로그인 사실을 알려서
      //   손님 캐릭터가 이 계정으로 전환되도록 함 (postMessage 브릿지).
      void notifySimulationLogin();
      const next = searchParams.get("next");
      router.push(next && next.startsWith("/") ? next : "/");
    } catch (e) {
      // 전화번호/비밀번호 불일치(InvalidCredentialsException)든 다른 서버 오류든
      // 백엔드가 에러 형식을 통일해두지 않아서 일단 하나로 묶어서 보여줌
      setLoginError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-full md:grid-cols-2">
      {/* TODO: 데스크톱 좌측 패널 — 내용 미정 */}
      <div className="hidden bg-muted md:block" />

      <div className="flex min-h-full justify-center px-5 md:items-center md:px-12">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center pt-[180px] md:pt-0">
            <img src="/icons/logo-shopping.svg" alt="STOCK LIFE" className="h-[50px] w-auto" />
          </div>

          <form id="login-form" onSubmit={handleLogin} className="mt-[68px] space-y-0">
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              name="phone"
              placeholder="010 - 0000 - 0000"
              value={phone}
              onChange={handlePhoneChange}
              className="h-10 rounded-none border-0 border-b-2 border-border bg-transparent px-0 py-0 text-sm focus-visible:border-brand"
            />
            <div className="relative mt-[37px]">
              <Input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                name="password"
                placeholder="비밀번호를 입력해주세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 rounded-none border-0 border-b-2 border-border bg-transparent px-0 py-0 pr-8 text-sm focus-visible:border-brand"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <RiEyeLine size={20} /> : <RiEyeOffLine size={20} />}
              </button>
            </div>

            {loginError && (
              <p className="mt-2 text-xs text-danger">입력하신 정보를 다시 확인해주세요</p>
            )}
          </form>

          <div className="mt-[13px] flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 text-foreground">
              <Checkbox checked={keepLoggedIn} onChange={() => setKeepLoggedIn((v) => !v)} variant="brand" />
              자동 로그인
            </label>
            {/* ⚠ 비밀번호 재설정 API가 백엔드에 없어서 이 링크는 현재 갈 곳이 없습니다. */}
            <Link href="/auth/reset-password" className="text-muted-foreground">
              비밀번호 재설정
            </Link>
          </div>

          <Button
            type="submit"
            form="login-form"
            variant="secondary"
            className="mt-[31px] h-[60px] w-full rounded-full text-base"
            disabled={submitting}
          >
            {submitting ? "로그인 중..." : "로그인하기"}
          </Button>

          <div className="mt-[26px] flex items-center justify-center gap-3 text-xs text-muted-foreground">
            <Link href="/auth/reset-password">비밀번호 재설정</Link>
            <span aria-hidden className="text-border">|</span>
            <Link href="/auth/signup/terms" className="font-semibold text-foreground">
              회원가입
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-full" />}>
      <LoginPageInner />
    </Suspense>
  );
}
