// components/domain/withdraw-button.tsx
// ✅ 신규 — 회원탈퇴. 실수로 눌리는 걸 막기 위해 confirm 다이얼로그를 한 번 거친다.
// ✅ 수정(요청) — 확인 버튼을 모달 안에서 빼서 화면 하단에 고정, "탈퇴하기 | 취소"
//   하나의 알약 안에서 나뉘는 형태로(SplitBottomBar). 순서 요청대로 탈퇴하기가 왼쪽.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { withdrawMyAccount } from "@/lib/consumer-api";
import { clearTokens, ApiError } from "@/lib/api-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SplitBottomBar } from "@/components/domain/split-bottom-bar";

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
        } catch (e) {
            // ✅ 수정(2026-09) — 실제 원인과 무관하게 항상 같은 문구만 보여주고 있었음.
            //   apiFetch가 백엔드 에러 메시지를 읽어오면 그대로 보여줘서, 진짜 이유(예:
            //   연관 데이터 삭제 실패, 이미 탈퇴된 계정 등)를 바로 알 수 있게 함.
            setError(e instanceof ApiError ? e.message : "탈퇴 처리 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.");
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
                </DialogContent>
            </Dialog>

            {confirmOpen && (
                <SplitBottomBar
                    leftLabel={submitting ? "처리 중..." : "탈퇴하기"}
                    onLeft={handleWithdraw}
                    leftDisabled={submitting}
                    leftTone="danger"
                    rightLabel="취소"
                    onRight={() => setConfirmOpen(false)}
                    rightDisabled={submitting}
                    rightTone="muted"
                />
            )}
        </>
    );
}
