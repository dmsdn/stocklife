// components/domain/withdraw-button.tsx
// ✅ 신규 — 회원탈퇴. 실수로 눌리는 걸 막기 위해 confirm 다이얼로그를 한 번 거친다.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { withdrawMyAccount } from "@/lib/consumer-api";
import { clearTokens } from "@/lib/api-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface WithdrawButtonProps {
    className?: string;
    children: React.ReactNode;
}

export function WithdrawButton({ className, children }: WithdrawButtonProps) {
    const router = useRouter();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleWithdraw = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await withdrawMyAccount();
            clearTokens();
            router.push("/auth/login");
        } catch {
            setError("탈퇴 처리 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <button type="button" className={className} onClick={() => setConfirmOpen(true)}>
                {children}
            </button>

            <Dialog open={confirmOpen} onOpenChange={(v) => !submitting && setConfirmOpen(v)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>정말 탈퇴하시겠어요?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        탈퇴하면 로그인이 즉시 차단되고, 같은 전화번호로 언제든 다시 가입할 수 있어요.
                        장바구니·찜·저장 리스트는 더 이상 볼 수 없지만, 과거 구매 내역 자체는 보존돼요.
                    </p>
                    {error && <p className="text-sm text-danger">{error}</p>}
                    <div className="grid grid-cols-2 gap-2 pt-2">
                        <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
                            취소
                        </Button>
                        <Button variant="destructive" onClick={handleWithdraw} disabled={submitting}>
                            {submitting ? "처리 중..." : "탈퇴하기"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}