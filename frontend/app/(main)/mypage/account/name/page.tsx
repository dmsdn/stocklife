// app/(main)/mypage/account/name/page.tsx
// ✅ 신규 — 닉네임(이름)은 성별/나이랑 다르게 언제든 수정 가능합니다.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMyProfile, updateMyProfile } from "@/lib/consumer-api";

export default function AccountNamePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title="닉네임" />
      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
      ) : (
        <>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="닉네임을 입력해주세요" />
          <Button className="mt-6 w-full" disabled={!name.trim() || saving} onClick={handleSave}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </>
      )}
    </div>
  );
}
