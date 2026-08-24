"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { Button } from "@/components/ui/button";
import { getMyProfile, updateMyProfile } from "@/lib/consumer-api";

const SIZES = [1, 2, 3, 4, 5];

function ToggleRow({
                       label,
                       value,
                       onChange,
                   }: {
    label: string;
    value: boolean | null;
    onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between py-3 text-sm">
            <span>{label}</span>
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => onChange(true)}
                    className={`rounded-full border px-3 py-1 text-xs ${value === true ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
                >
                    예
                </button>
                <button
                    type="button"
                    onClick={() => onChange(false)}
                    className={`rounded-full border px-3 py-1 text-xs ${value === false ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
                >
                    아니오
                </button>
            </div>
        </div>
    );
}

export default function AccountHouseholdPage() {
    const router = useRouter();
    const [householdSize, setHouseholdSize] = useState<number | null>(null);
    const [hasPet, setHasPet] = useState<boolean | null>(null);
    const [hasChild, setHasChild] = useState<boolean | null>(null);
    const [byCar, setByCar] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getMyProfile()
            .then((p) => {
                setHouseholdSize(p.householdSize);
                setHasPet(p.hasPet);
                setHasChild(p.hasChild);
                setByCar(p.byCar);
            })
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateMyProfile({ householdSize, hasPet, hasChild, byCar });
            router.back();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
            <SubpageHeader title="가구원 수" />
            {loading ? (
                <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
            ) : (
                <>
                    <p className="mb-2 text-sm text-muted-foreground">가구원 수</p>
                    <div className="flex gap-2">
                        {SIZES.map((size) => (
                            <button
                                key={size}
                                type="button"
                                onClick={() => setHouseholdSize(size)}
                                className={`h-10 w-10 rounded-full border text-sm ${
                                    householdSize === size ? "border-primary bg-muted" : "border-border"
                                }`}
                            >
                                {size === 5 ? "5+" : size}
                            </button>
                        ))}
                    </div>

                    <div className="mt-4 divide-y divide-border border-t border-border">
                        <ToggleRow label="반려동물이 있어요" value={hasPet} onChange={setHasPet} />
                        <ToggleRow label="자녀가 있어요" value={hasChild} onChange={setHasChild} />
                        <ToggleRow label="자차로 장을 봐요" value={byCar} onChange={setByCar} />
                    </div>

                    <Button className="mt-6 w-full" disabled={saving} onClick={handleSave}>
                        {saving ? "저장 중..." : "저장"}
                    </Button>
                </>
            )}
        </div>
    );
}