// app/(main)/mypage/account/page.tsx
// ✅ 닉네임: 언제든 수정 가능(링크 유지)
// ✅ 성별/나이: 값이 있으면 텍스트만 보여주고 링크 제거(수정 못 하게), 없으면 입력하러
//   갈 수 있게 링크 유지
// ✅ 등급: 금액은 숨기고 등급명 텍스트 + 다음 등급까지 진행률 바로 표시
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RiArrowLeftSLine, RiArrowRightSLine, RiLogoutBoxLine } from "@remixicon/react";
import { LogoutButton } from "@/components/domain/logout-button";
import { WithdrawButton } from "@/components/domain/withdraw-button";
import { getMyProfile, type ConsumerMe } from "@/lib/consumer-api";
import { GradeBox } from "@/components/domain/grade-box";

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

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/mypage">
            <RiArrowLeftSLine size={24} />
          </Link>
          <p className="text-base">내 정보</p>
        </div>
      </div>

      {/* 닉네임 — 항상 수정 가능 */}
      <Link href="/mypage/account/name" className="mb-4 flex items-center justify-between py-2">
        <p className="text-base font-medium">{profile?.name || (loading ? "불러오는 중..." : "닉네임 입력하기")}</p>
        <RiArrowRightSLine size={24} className="text-muted-foreground" />
      </Link>

      {/* 등급 — 마이페이지 메인 "멤버십"이랑 같은 컴포넌트 재사용 */}
      <div className="mb-6">
        <GradeBox profile={profile} />
      </div>

      <div className="divide-y divide-border">
        <Link href="/mypage/account/phone" className="flex items-center justify-between py-3 text-sm">
          <span>계정</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            {profile ? maskPhone(profile.phoneNumber) : ""}
            <RiArrowRightSLine size={24} />
          </span>
        </Link>

        <Link href="/mypage/account/password" className="flex items-center justify-between py-3 text-sm">
          <span>비밀번호 변경</span>
          <RiArrowRightSLine size={24} className="text-muted-foreground" />
        </Link>

        {/* 성별 — 값 있으면 텍스트만, 없으면 입력하러 가는 링크 */}
        {profile?.gender ? (
          <div className="flex items-center justify-between py-3 text-sm">
            <span>성별</span>
            <span className="text-muted-foreground">{genderLabel(profile.gender)}</span>
          </div>
        ) : (
          <Link href="/mypage/account/gender" className="flex items-center justify-between py-3 text-sm">
            <span>성별</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              미입력
              <RiArrowRightSLine size={24} />
            </span>
          </Link>
        )}

        {/* 나이 — 값 있으면 텍스트만, 없으면 입력하러 가는 링크 */}
        {profile?.birthDate ? (
          <div className="flex items-center justify-between py-3 text-sm">
            <span>나이</span>
            <span className="text-muted-foreground">{ageLabel(profile.birthDate)}</span>
          </div>
        ) : (
          <Link href="/mypage/account/age" className="flex items-center justify-between py-3 text-sm">
            <span>나이</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              미입력
              <RiArrowRightSLine size={24} />
            </span>
          </Link>
        )}

        <Link href="/mypage/account/household" className="flex items-center justify-between py-3 text-sm">
          <span>가구원 수</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            {profile ? householdLabel(profile.householdSize) : ""}
            <RiArrowRightSLine size={24} />
          </span>
        </Link>
      </div>

      <LogoutButton className="mt-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <RiLogoutBoxLine size={24} />
        로그아웃
      </LogoutButton>

      <WithdrawButton className="mt-4 block text-sm text-muted-foreground">
        회원탈퇴
      </WithdrawButton>
    </div>
  );
}
