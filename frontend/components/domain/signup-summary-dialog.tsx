"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { SignupDraft } from "@/lib/signup-draft";

interface SignupSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: SignupDraft;
  onEdit: () => void;
  onConfirm: () => void;
  submitting?: boolean;
}

export function SignupSummaryDialog({
  open,
  onOpenChange,
  draft,
  onEdit,
  onConfirm,
  submitting = false,
}: SignupSummaryDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent
        showCloseButton
        className="max-w-sm"
      >
        <DialogHeader>
          <DialogTitle>
            입력한 정보를 확인해주세요
          </DialogTitle>

          <DialogDescription>
            선택하지 않은 항목은 저장되지 않아요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 회원정보 */}
          <section>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              회원정보
            </p>

            <div className="overflow-hidden rounded-[8px] border border-border">
              <SummaryRow
                label="전화번호"
                value={
                  draft.phoneNumber
                    ? formatPhone(
                        draft.phoneNumber
                      )
                    : "없음"
                }
              />

              <SummaryRow
                label="비밀번호"
                value={
                  draft.password
                    ? "설정됨"
                    : "없음"
                }
                last
              />
            </div>
          </section>

          {/* 추가정보 */}
          <section>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              추가정보
            </p>

            <div className="overflow-hidden rounded-[8px] border border-border">
              <SummaryRow
                label="생년월일"
                value={
                  draft.birthDate
                    ? formatBirthDate(
                        draft.birthDate
                      )
                    : "선택 안함"
                }
              />

              <SummaryRow
                label="성별"
                value={
                  draft.gender ===
                  "MALE"
                    ? "남"
                    : draft.gender ===
                        "FEMALE"
                      ? "여"
                      : "선택 안함"
                }
              />

              <SummaryRow
                label="가구원 수"
                value={
                  draft.householdSize ==
                    null
                    ? "선택 안함"
                    : draft.householdSize ===
                        5
                      ? "5명 이상"
                      : `${draft.householdSize}명`
                }
              />

              <SummaryRow
                label="반려동물"
                value={
                  draft.hasPet ==
                    null
                    ? "선택 안함"
                    : draft.hasPet
                      ? "예"
                      : "아니오"
                }
              />

              <SummaryRow
                label="어린 자녀"
                value={
                  draft.hasChild ==
                    null
                    ? "선택 안함"
                    : draft.hasChild
                      ? "예"
                      : "아니오"
                }
              />

              <SummaryRow
                label="방문 방법"
                value={
                  draft.byCar ==
                    null
                    ? "선택 안함"
                    : draft.byCar
                      ? "차량"
                      : "도보·대중교통"
                }
                last
              />
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-[8px]"
            onClick={onEdit}
            disabled={submitting}
          >
            수정하기
          </Button>

          <Button
            type="button"
            className="rounded-[8px]"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting
              ? "가입 처리 중..."
              : "확인하고 가입하기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`
        flex items-center justify-between
        px-4 py-3.5
        ${
          !last
            ? "border-b border-border"
            : ""
        }
      `}
    >
      <span className="text-sm text-muted-foreground">
        {label}
      </span>

      <span
        className={`
          text-sm font-medium
          ${
            value === "선택 안함"
              ? "text-muted-foreground/45"
              : ""
          }
        `}
      >
        {value}
      </span>
    </div>
  );
}

function formatBirthDate(
  value: string
) {
  const [year, month, day] =
    value.split("-");

  return `${year}.${month}.${day}`;
}

function formatPhone(
  value: string
) {
  const digits = value.replace(
    /\D/g,
    ""
  );

  if (digits.length !== 11) {
    return value;
  }

  return `${digits.slice(
    0,
    3
  )}-${digits.slice(
    3,
    7
  )}-${digits.slice(7)}`;
}