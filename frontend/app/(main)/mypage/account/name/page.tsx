// app/(main)/mypage/account/name/page.tsx
// ✅ 신규 — 닉네임(이름)은 성별/나이랑 다르게 언제든 수정 가능합니다.
// ✅ 수정(요청) — 회원가입 화면(app/auth/signup/page.tsx의 이름 입력 단계)과 완전히
//   똑같은 레이아웃으로 통일: 상단 고정폭 제목(pt-87), 밑줄 입력란, 하단 고정된
//   좌우 텍스트 폭 맞춤 h-60 원형 알약 저장 버튼(StickyBottomBar).
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiArrowLeftLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StickyBottomBar } from "@/components/domain/sticky-bottom-bar";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";
import { getMyProfile, updateMyProfile } from "@/lib/consumer-api";

const underlineInput =
  "rounded-none border-0 border-b-2 border-border bg-transparent px-0 focus-visible:border-brand disabled:opacity-50";

export default function AccountNamePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ✅ 신규(요청) — 정보 수정 화면은 하단 탭바 숨김.
  const { setHidden } = useBottomBarVisibility();
  useEffect(() => {
    setHidden(true);
    return () => setHidden(false);
  }, [setHidden]);

  useEffect(() => {
    getMyProfile()
      .then((p) => setName(p.name ?? ""))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateMyProfile({ name: name.trim() });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-[140px] pt-[59px]">
      <div className="flex h-8 items-center">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-muted"
          aria-label="이전"
        >
          <RiArrowLeftLine size={20} />
        </button>
      </div>

      <h1 className="mt-6 text-2xl font-bold leading-8">닉네임을 입력해주세요</h1>

      {loading ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
      ) : (
        <div className="mt-[43px]">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            placeholder="닉네임을 입력해주세요"
            className={`h-10 py-0 text-sm ${underlineInput}`}
          />
        </div>
      )}

      <StickyBottomBar>
        <Button
          className="flex mx-auto h-[60px] w-fit px-5 rounded-full shadow-[0_-2px_20px_rgba(0,0,0,0.1)]"
          disabled={!name.trim() || saving}
          onClick={handleSave}
        >
          {saving ? "저장 중..." : "저장"}
        </Button>
      </StickyBottomBar>
    </div>
  );
}
