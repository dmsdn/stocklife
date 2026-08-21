import Link from "next/link";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { Button } from "@/components/ui/button";

// ✅ 로그인 상태에서 바로 바꾸는 API는 없고, 전화번호 인증 기반 재설정(OTP) API만 있어서
//   기존 비밀번호 재설정 화면으로 연결했습니다 — 실제로 동작하는 진짜 기능입니다.
export default function AccountPasswordPage() {
  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title="비밀번호 변경" />
      <p className="py-6 text-sm text-muted-foreground">
        전화번호 인증을 통해 비밀번호를 변경할 수 있어요.
      </p>
      <Link href="/auth/reset-password">
        <Button className="w-full">전화번호 인증하고 변경하기</Button>
      </Link>
    </div>
  );
}
