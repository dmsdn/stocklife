// app/(main)/mypage/account/page.tsx
// ✅ "회원정보 수정" 누르면 실제 수정 폼으로 바뀝니다. 이름은 항상 수정 가능, 휴대폰/
//   생년월일/성별은 이미 값이 있으면 고정(회원가입 때 확정된 정보), 비어있으면 입력 가능.
//   가구원 수는 회원가입 때 쓰던 질문 화면과 같은 1~5 버튼 UI를 그대로 씁니다.
// ⚠ GET/PATCH /api/consumers/me가 백엔드에 아직 없어서, 지금은 조회가 항상 실패로
//   떨어지고(→ 전부 빈 값), 저장을 눌러도 서버에 실제로 반영되지 않습니다. 엔드포인트
//   생기면 lib/consumer-profile.ts만 보면 됩니다.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { LogoutButton } from "@/components/domain/logout-button";
import { WithdrawButton } from "@/components/domain/withdraw-button";
import { getMyProfile, type ConsumerMe } from "@/lib/consumer-api";

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return phone;
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

function genderLabel(gender: string | null) {
  if (gender === "M" || gender === "MALE") return "남성";
  if (gender === "F" || gender === "FEMALE") return "여성";
  return "미입력";
}

function ageLabel(birthDate: string | null) {
  if (!birthDate) return "미입력";
  const birthYear = Number(birthDate.slice(0, 4));
  if (!birthYear) return "미입력";
  const age = new Date().getFullYear() - birthYear + 1;
  return `${age}세`;
}

function householdLabel(size: number | null) {
  if (!size) return "미입력";
  return size >= 5 ? "5명 이상" : `${size}명`;
}

export default function AccountPage() {
  const [profile, setProfile] = useState<ConsumerMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyProfile()
        .then(setProfile)
        .catch(() => setProfile(null))
        .finally(() => setLoading(false));
  }, []);

  const infoRows = [
    { href: "/mypage/account/phone", label: "계정", value: profile ? maskPhone(profile.phoneNumber) : "" },
    { href: "/mypage/account/password", label: "비밀번호 변경", value: "" },
    { href: "/mypage/account/household", label: "가구원 수", value: profile ? householdLabel(profile.householdSize) : "" },
    { href: "/mypage/account/gender", label: "성별", value: profile ? genderLabel(profile.gender) : "" },
    { href: "/mypage/account/age", label: "나이", value: profile ? ageLabel(profile.birthDate) : "" },
  ];

  return (
      <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/mypage">
              <ChevronLeft size={20} />
            </Link>
            <p className="text-base">내 정보</p>
          </div>
        </div>

        {/* TODO: 프로필 사진 자리 — 백엔드에 프로필 이미지 업로드 API가 없어 자리만 유지 */}
        <div className="mb-2 flex items-center gap-3">
          <div className="h-20 w-20 rounded-full bg-muted" />
          <div>
            <p className="text-base font-medium">{profile?.name ?? (loading ? "불러오는 중..." : "")}</p>
            <p className="text-xs text-muted-foreground">
              {profile ? `${profile.grade} 등급 · 이번 달 ${profile.monthlySpendAmount.toLocaleString()}원` : ""}
            </p>
          </div>
        </div>

        <div className="mt-6 divide-y divide-border">
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

        <LogoutButton className="mt-6 flex items-center gap-1.5 text-sm text-muted-foreground">
          <LogOut size={16} />
          로그아웃
        </LogoutButton>

        <WithdrawButton className="mt-4 block text-sm text-muted-foreground">
          회원탈퇴
        </WithdrawButton>
      </div>
  );
}