// lib/auth.ts
// ✅ 2026-08-19 백엔드 스키마 v2.5 반영:
//   - SignupRequest에 householdSize/hasPet/hasChild/byCar/marketingConsent 추가됨
//   - 전화번호 인증(SMS), 비밀번호 재설정 API 전부 추가됨 → 실제 연결
"use client";

import { apiFetch, setTokens, clearTokens, getOrCreateGuestSessionId } from "./api-client";
import { migrateGuestCartToAccount } from "./cart-storage";

export interface SignupPayload {
  phoneNumber: string;
  password: string;
  gender?: string;
  birthDate?: string; // "YYYY-MM-DD"
  cameraConsent: boolean;
  personalInfoConsent: boolean;
  micConsent: boolean;
  marketingConsent?: boolean;
  householdSize?: number; // 1~5 (5 = "5명 이상")
  hasPet?: boolean;
  hasChild?: boolean;
  byCar?: boolean;
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
      body: JSON.stringify({ phoneNumber, password, sessionId: getOrCreateGuestSessionId() }),
      auth: false,
    }
  );
  setTokens(res.accessToken, res.refreshToken);

  // 로그인 성공 직후 비회원 localStorage 장바구니를 회원 DB로 승계한다.
  // 승계 실패 시 localStorage는 남겨두고 로그인 자체는 유지한다.
  try {
    await migrateGuestCartToAccount();
  } catch {
    // 다음 장바구니 로드 때 다시 승계할 수 있도록 로컬 데이터 보존.
  }
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/api/consumers/logout", { method: "POST" });
  } finally {
    clearTokens();
  }
}

// ---------- 회원가입 전화번호 인증 ----------

export async function checkRegistrationStatus(phoneNumber: string): Promise<{ registered: boolean }> {
  return apiFetch<{ registered: boolean; nextAction: string }>("/api/consumers/registration-status", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ phoneNumber }),
  });
}

export async function sendSignupCode(phoneNumber: string): Promise<void> {
  await apiFetch("/api/consumers/signup/send-code", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ phoneNumber }),
  });
}

export async function verifySignupCode(phoneNumber: string, code: string): Promise<void> {
  await apiFetch("/api/consumers/signup/verify-code", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ phoneNumber, code }),
  });
}

// ---------- 비밀번호 재설정 ----------

export async function sendPasswordResetCode(phoneNumber: string): Promise<void> {
  await apiFetch("/api/consumers/password/reset/send-code", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ phoneNumber }),
  });
}

export async function verifyPasswordResetCode(phoneNumber: string, code: string): Promise<void> {
  await apiFetch("/api/consumers/password/reset/verify-code", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ phoneNumber, code }),
  });
}

export async function resetPassword(phoneNumber: string, newPassword: string): Promise<void> {
  await apiFetch("/api/consumers/password/reset", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ phoneNumber, newPassword }),
  });
}

/** 하이픈 포함 화면 표시용 전화번호("010 - 0000 - 0000")를 백엔드 형식("01000000000")으로 변환 */
export function toBackendPhone(displayPhone: string): string {
  return displayPhone.replace(/\D/g, "");
}
