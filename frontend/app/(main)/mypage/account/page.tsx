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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchMyProfile, updateMyProfile, type ConsumerProfile } from "@/lib/consumer-profile";

const HOUSEHOLD_OPTIONS = [1, 2, 3, 4, 5];

export default function AccountPage() {
  const [profile, setProfile] = useState<ConsumerProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [householdSize, setHouseholdSize] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchMyProfile().then((p) => {
      setProfile(p);
      setName(p?.name ?? "");
      setGender(p?.gender ?? "");
      setBirthDate(p?.birthDate ?? "");
      setHouseholdSize(p?.householdSize ?? null);
      setLoaded(true);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const ok = await updateMyProfile({ name, gender: gender || null, birthDate: birthDate || null, householdSize });
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/mypage">
            <ChevronLeft size={20} />
          </Link>
          <p className="text-base">내 정보</p>
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-sm text-muted-foreground">
            회원정보 수정
          </button>
        )}
      </div>

      {!loaded && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}

      {loaded && !editing && (
        <div className="divide-y divide-border">
          <Row label="이름" value={name || "미입력"} />
          <Row label="휴대폰" value={profile?.phoneNumber ?? "-"} />
          <Row label="생년월일" value={birthDate || "미입력"} />
          <Row label="성별" value={gender || "미입력"} />
          <Row label="가구원 수" value={householdSize ? `${householdSize}명` : "미입력"} />
          <Link href="/mypage/account/password" className="flex items-center justify-between py-3 text-sm">
            <span>비밀번호 변경</span>
            <ChevronRight size={16} className="text-muted-foreground" />
          </Link>
        </div>
      )}

      {loaded && editing && (
        <div className="space-y-5">
          <Field label="이름">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름을 입력해주세요" />
          </Field>

          <Field label="휴대폰">
            <p className="py-2 text-sm text-muted-foreground">
              {profile?.phoneNumber ?? "미입력"} {profile?.phoneNumber && "(변경 불가)"}
            </p>
          </Field>

          <Field label="생년월일">
            {profile?.birthDate ? (
              <p className="py-2 text-sm text-muted-foreground">{profile.birthDate} (변경 불가)</p>
            ) : (
              <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            )}
          </Field>

          <Field label="성별">
            {profile?.gender ? (
              <p className="py-2 text-sm text-muted-foreground">{profile.gender} (변경 불가)</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {["남성", "여성"].map((g) => (
                  <Button key={g} variant={gender === g ? "default" : "outline"} onClick={() => setGender(g)}>
                    {g}
                  </Button>
                ))}
              </div>
            )}
          </Field>

          <Field label="가구원 수">
            <div className="grid grid-cols-5 gap-2">
              {HOUSEHOLD_OPTIONS.map((n) => (
                <Button
                  key={n}
                  variant={householdSize === n ? "default" : "outline"}
                  onClick={() => setHouseholdSize(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditing(false)}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "저장 중..." : "저장하기"}
            </Button>
          </div>
        </div>
      )}

      <button type="button" className="mt-8 block text-sm text-muted-foreground">
        회원탈퇴
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 text-sm">
      <span>{label}</span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
