// lib/auth.ts
// ConsumerController(/api/consumers) 실제 스펙 기준.
//
// ⚠ 백엔드 SignupRequest에는 household(가구원 수) 필드가 아예 없고, "나이"가 아니라
//   birthDate(생년월일, LocalDate)를 받습니다. 지금 프론트 회원가입 2단계 화면은
//   가구원 수/나이를 입력받고 있는데, 나이→생년월일은 정확히 변환할 수 없어서
//   birthDate는 일단 안 보냅니다 (백엔드에는 null로 들어감). 가구원 수는 저장할 곳 자체가
//   없어서 로컬 상태로만 남고 서버에는 전송되지 않습니다.
//   → 실제 생년월일을 입력받는 화면으로 바꾸거나, 백엔드에 age/householdSize 컬럼 추가를
//     요청하는 것 중 하나로 정리가 필요합니다.
"use client";

import { apiFetch, setTokens, clearTokens } from "./api-client";

export interface SignupPayload {
  phoneNumber: string; // 01012345678 형식 (하이픈 없이)
  password: string;
  gender?: string;
  birthDate?: string; // "YYYY-MM-DD" — 현재 프론트에는 입력 UI 없음 (위 설명 참고)
  cameraConsent: boolean;
  personalInfoConsent: boolean;
  micConsent: boolean;
}

export async function signup(payload: SignupPayload): Promise<void> {
  await apiFetch("/api/consumers/signup", {
    method: "POST",
    body: JSON.stringify(payload),
    auth: false,
  });
}

export async function login(phoneNumber: string, password: string): Promise<void> {
  const res = await apiFetch<{ accessToken: string; refreshToken: string }>(
    "/api/consumers/login",
    {
      method: "POST",
      body: JSON.stringify({ phoneNumber, password }),
      auth: false,
    }
  );
  setTokens(res.accessToken, res.refreshToken);
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/api/consumers/logout", { method: "POST" });
  } finally {
    clearTokens();
  }
}

/** 하이픈 포함 화면 표시용 전화번호("010 - 0000 - 0000")를 백엔드 형식("01000000000")으로 변환 */
export function toBackendPhone(displayPhone: string): string {
  return displayPhone.replace(/\D/g, "");
}
