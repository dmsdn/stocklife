"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMyProfile, updateMyProfile } from "@/lib/consumer-api";

export default function AccountAgePage() {
    const router = useRouter();
    const [birthDate, setBirthDate] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getMyProfile().then((p) => setBirthDate(p.birthDate ?? "")).finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        if (!birthDate) return;
        setSaving(true);
        try {
            await updateMyProfile({ birthDate });
            router.back();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
            <SubpageHeader title="생년월일" />
            {loading ? (
                <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
            ) : (
                <>
                    <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                    <Button className="mt-6 w-full" disabled={!birthDate || saving} onClick={handleSave}>
                        {saving ? "저장 중..." : "저장"}
                    </Button>
                </>
            )}
        </div>
    );
}