import Link from "next/link";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { LogoutButton } from "@/components/domain/logout-button";

const infoRows = [
  { href: "/mypage/account/phone", label: "계정", value: "010-****-****" },
  { href: "/mypage/account/password", label: "비밀번호 변경", value: "" },
  { href: "/mypage/account/household", label: "가구원 수", value: "1" },
  { href: "/mypage/account/gender", label: "성별", value: "1" },
  { href: "/mypage/account/age", label: "나이", value: "1" },
];

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/mypage">
            <ChevronLeft size={20} />
          </Link>
          <p className="text-base">내 정보</p>
        </div>
        <button type="button" className="text-sm text-muted-foreground">
          회원정보 수정
        </button>
      </div>

      {/* TODO: 프로필 사진 자리 */}
      <div className="mb-6 h-20 w-20 rounded-full bg-muted" />

      <div className="divide-y divide-border">
        {infoRows.map((row) => (
          <Link key={row.href} href={row.href} className="flex items-center justify-between py-3 text-sm">
            <span>{row.label}</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              {row.value}
              <ChevronRight size={16} />
            </span>
          </Link>
        ))}
      </div>

      {/* ✅ 마이페이지 메인에 있던 로그아웃 버튼을 여기로 옮겼습니다 */}
      <LogoutButton className="mt-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <LogOut size={16} />
        로그아웃
      </LogoutButton>

      <button type="button" className="mt-4 block text-sm text-muted-foreground">
        회원탈퇴
      </button>
    </div>
  );
}
