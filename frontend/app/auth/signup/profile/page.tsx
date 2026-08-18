// app/auth/signup/profile/page.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { writeSignupDraft } from "@/lib/signup-draft";

type Gender = "" | "MALE" | "FEMALE";

export default function SignupProfilePage() {
  const router = useRouter();

  const [form, setForm] = useState({
    householdSize: 1,
    gender: "" as Gender,
    birthDate: "",
  });

  // 가구원 수 변경
  const updateHouseholdSize = (value: number) => {
    if (value < 1 || value > 20) return;

    setForm((prev) => ({
      ...prev,
      householdSize: value,
    }));
  };

  // 성별 선택
  // 같은 버튼을 다시 누르면 선택 취소
  const selectGender = (gender: Gender) => {
    setForm((prev) => ({
      ...prev,
      gender: prev.gender === gender ? "" : gender,
    }));
  };

  // 저장하기
  const handleSave = () => {
    writeSignupDraft({
      gender: form.gender || undefined,
      birthDate: form.birthDate || undefined,
      householdSize: form.householdSize,
    });

    router.push("/auth/signup/terms");
  };

  // 건너뛰기
  const handleSkip = () => {
  writeSignupDraft({
    gender: undefined,
    birthDate: undefined,
    householdSize: undefined,
  });

  router.push("/auth/signup/terms");
};

  return (
    <div className="flex min-h-full flex-col">
      <div className="space-y-8">
        <p className="text-2xl font-semibold leading-snug">
          추천을 위한 추가 정보를
          <br />
          입력해주세요
        </p>

        <div className="space-y-8">
          {/* 가구원 수 */}
          <div className="space-y-3">
            <p className="text-sm font-medium">
              가구원 수
            </p>

            <div className="flex h-12 items-center justify-between rounded-lg border px-4">
              <button
                type="button"
                onClick={() =>
                  updateHouseholdSize(form.householdSize - 1)
                }
                disabled={form.householdSize <= 1}
                className="flex h-8 w-8 items-center justify-center text-2xl disabled:opacity-30"
                aria-label="가구원 수 줄이기"
              >
                −
              </button>

              <span className="text-base font-medium">
                {form.householdSize}명
              </span>

              <button
                type="button"
                onClick={() =>
                  updateHouseholdSize(form.householdSize + 1)
                }
                disabled={form.householdSize >= 20}
                className="flex h-8 w-8 items-center justify-center text-2xl disabled:opacity-30"
                aria-label="가구원 수 늘리기"
              >
                +
              </button>
            </div>
          </div>

          {/* 성별 */}
          <div className="space-y-3">
            <p className="text-sm font-medium">
              성별
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => selectGender("MALE")}
                className={`h-12 rounded-lg border text-sm font-medium transition ${
                  form.gender === "MALE"
                    ? "border-black bg-black text-white"
                    : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                남
              </button>

              <button
                type="button"
                onClick={() => selectGender("FEMALE")}
                className={`h-12 rounded-lg border text-sm font-medium transition ${
                  form.gender === "FEMALE"
                    ? "border-black bg-black text-white"
                    : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                여
              </button>
            </div>
          </div>

          {/* 생년월일 */}
          <div className="space-y-3">
            <p className="text-sm font-medium">
              생년월일
            </p>

            <Input
              type="date"
              value={form.birthDate}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  birthDate: e.target.value,
                }))
              }
              className="h-12 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className="mt-auto space-y-4 pt-10">
        <Button
          type="button"
          className="h-12 w-full"
          onClick={handleSave}
        >
          저장하기
        </Button>

        <button
          type="button"
          onClick={handleSkip}
          className="w-full text-center text-sm text-gray-500"
        >
          건너뛰기
        </button>
      </div>
    </div>
  );
}