
// ⚠ 회원가입 시 한 번만 저장되고, 가입 후 수정하는 API가 백엔드에 없습니다.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { Button } from "@/components/ui/button";
import { getMyProfile, updateMyProfile } from "@/lib/consumer-api";

const OPTIONS = [
    { value: "MALE", label: "남성" },
    { value: "FEMALE", label: "여성" },
];

export default function AccountGenderPage() {
    const router = useRouter();
    const [gender, setGender] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getMyProfile().then((p) => setGender(p.gender)).finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        if (!gender) return;
        setSaving(true);
        try {
            await updateMyProfile({ gender });
            router.back();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
            <SubpageHeader title="성별" />
            {loading ? (
                <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
            ) : (
                <>
                    <div className="space-y-2">
                        {OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setGender(opt.value)}
                                className={`flex w-full items-center justify-between rounded-md border px-4 py-3 text-left text-sm ${
                                    gender === opt.value ? "border-primary bg-muted" : "border-border"
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <Button className="mt-6 w-full" disabled={!gender || saving} onClick={handleSave}>
                        {saving ? "저장 중..." : "저장"}
                    </Button>
                </>
            )}
        </div>
    );
}