// ✅ 한 번 입력하면 수정 불가 — 이미 값 있으면 안내만 보여주고 선택 UI 자체를 숨깁니다.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiArrowLeftSLine } from "@remixicon/react";
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
    const [alreadySet, setAlreadySet] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getMyProfile()
            .then((p) => {
                if (p.gender) setAlreadySet(true);
                setGender(p.gender);
            })
            .finally(() => setLoading(false));
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
            ) : alreadySet ? (
                <div className="py-10 text-center">
                    <p className="text-sm text-muted-foreground">성별은 한 번 입력하면 수정할 수 없어요.</p>
                    <button type="button" onClick={() => router.back()} className="mt-4 mx-auto flex items-center justify-center gap-1 text-sm">
                        <RiArrowLeftSLine size={24} />
                        돌아가기
                    </button>
                </div>
            ) : (
                <>
                    <div className="space-y-2">
                        {OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setGender(opt.value)}
                                className={`flex w-full items-center justify-between rounded-sm border px-4 py-3 text-left text-sm ${
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