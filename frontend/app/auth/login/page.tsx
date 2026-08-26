// app/auth/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { login, toBackendPhone } from "@/lib/auth";


function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  const parts = [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7, 11)].filter(Boolean);
  return parts.join(" - ");
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
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
      await login(toBackendPhone(phone), password);
      // TODO: keepLoggedIn(로그인 상태 유지)을 반영하려면 리프레시 토큰 만료 정책을
      // 백엔드와 맞춰야 함 — 지금은 옵션과 무관하게 항상 토큰을 저장만 함
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

      <div className="flex min-h-full items-center justify-center px-6 py-12 md:px-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-1 text-xl">
            {/* TODO: 로고 아이콘 자리 */}
            <span>AI 마트에</span>
          </div>
          <p className="mt-1 text-[28px] font-bold leading-tight">어서오세요</p>
          <p className="mt-3 text-sm text-muted-foreground">
            전화번호와 비밀번호를 입력하여 로그인 해 주세요
          </p>

          <form id="login-form" onSubmit={handleLogin} className="mt-10 space-y-3">
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="off" 
              name="phone"
              placeholder="010 - 0000 - 0000"
              value={phone}
              onChange={handlePhoneChange}
              className="rounded-none border-0 border-b-2 border-border bg-transparent px-0 focus-visible:border-foreground"
            />
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                name="password"
                placeholder="비밀번호를 입력해주세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-none border-0 border-b-2 border-border bg-transparent px-0 pr-8 focus-visible:border-foreground"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>

            {loginError && (
              <p className="text-sm text-danger">입력하신 정보를 다시 확인해주세요</p>
            )}
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-foreground">
              <Checkbox checked={keepLoggedIn} onChange={() => setKeepLoggedIn((v) => !v)} />
              로그인 상태 유지
            </label>
            {/* ⚠ 비밀번호 재설정 API가 백엔드에 없어서 이 링크는 현재 갈 곳이 없습니다.
                아래쪽 "연결 안 된 것" 정리 문서 참고 */}
            <Link href="/auth/reset-password">비밀번호 재설정</Link>
          </div>

          <Button
            type="submit"
            form="login-form"
            variant="secondary"
            className="mt-8 w-full rounded-sm text-base"
            disabled={submitting}
          >
            {submitting ? "로그인 중..." : "로그인하기"}
          </Button>

          <div className="mt-10 text-center">
            <Link href="/auth/signup/terms" className="mt-3 block">
              <Button variant="ghost" className="h-12 w-full rounded-sm">
                <span className="text-sm font-normal"> AI 마트 회원이 아니신가요?</span>
                <span className="text-base font-semibold">회원가입</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
