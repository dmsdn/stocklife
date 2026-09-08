// lib/auth.ts
// ✅ 2026-08-19 백엔드 스키마 v2.5 반영:
//   - SignupRequest에 householdSize/hasPet/hasChild/byCar/marketingConsent 추가됨
//   - 전화번호 인증(SMS), 비밀번호 재설정 API 전부 추가됨 → 실제 연결

"use client";

import { apiFetch, setTokens, clearTokens } from "./api-client";
import {
  migrateGuestCartToAccount,
  resetCartMigrationAttempt,
} from "./cart-storage";

export interface SignupPayload {
  phoneNumber: string;
  password: string;
  name: string;
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

/**
 * 로그인한 사용자 정보
 * /api/consumers/me 응답에서 사용하는 필드
 */
interface ConsumerMeResponse {
  consumerId: number;
  name?: string | null;
  phoneNumber?: string | null;
}

/**
 * 시뮬레이션 부모 창으로 로그인 상태 전달
 */
function notifySimulationLogin(user: ConsumerMeResponse): void {
  if (typeof window === "undefined") return;

  window.parent.postMessage(
      {
        source: "storeflow-frontend",
        type: "LOGIN",
        consumerId: user.consumerId,
        name: user.name ?? null,
        phoneNumber: user.phoneNumber ?? null,
      },
      "*"
  );

  console.log("[auth] 시뮬레이션 LOGIN 메시지 전송:", {
    consumerId: user.consumerId,
    name: user.name,
    phoneNumber: user.phoneNumber,
  });
}

/**
 * 시뮬레이션 부모 창으로 로그아웃 상태 전달
 */
function notifySimulationLogout(): void {
  if (typeof window === "undefined") return;

  window.parent.postMessage(
      {
        source: "storeflow-frontend",
        type: "LOGOUT",
      },
      "*"
  );

  console.log("[auth] 시뮬레이션 LOGOUT 메시지 전송");
}

export async function signup(payload: SignupPayload): Promise<void> {
  await apiFetch("/api/consumers/signup", {
    method: "POST",
    body: JSON.stringify(payload),
    auth: false,
  });
}

export async function login(
    phoneNumber: string,
    password: string
): Promise<void> {
  // 1. 로그인
  const res = await apiFetch<{
    accessToken: string;
    refreshToken: string;
  }>("/api/consumers/login", {
    method: "POST",
    body: JSON.stringify({
      phoneNumber,
      password,
    }),
    auth: false,
  });

  // 2. JWT 저장
  setTokens(res.accessToken, res.refreshToken);
  resetCartMigrationAttempt();

  // 3. 로그인한 사용자 정보 조회
  try {
    const me = await apiFetch<ConsumerMeResponse>(
        "/api/consumers/me"
    );

    console.log("[auth] 로그인 사용자 정보:", me);

    // 4. 오른쪽 웹 → 왼쪽 시뮬레이션 로그인 정보 전달
    notifySimulationLogin({
      consumerId: me.consumerId,
      name: me.name ?? null,
      phoneNumber: me.phoneNumber ?? phoneNumber,
    });
  } catch (error) {
    console.error(
        "[auth] 로그인 사용자 정보 조회 또는 시뮬레이션 연동 실패:",
        error
    );
  }

  // 5. 로그인 성공 직후 비회원 localStorage 장바구니를 회원 DB로 승계
  // 승계 실패 시 localStorage는 남겨두고 로그인 자체는 유지
  try {
    await migrateGuestCartToAccount();
  } catch (error) {
    console.error("[auth] guest cart migration failed", error);
    // localStorage는 보존되고, 다음 로그인 때 다시 시도
  }
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/api/consumers/logout", {
      method: "POST",
    });
  } finally {
    // 토큰 삭제
    clearTokens();

    // 시뮬레이션에도 로그아웃 알림
    notifySimulationLogout();
  }
}

// ---------- 회원가입 전화번호 인증 ----------

export async function checkRegistrationStatus(
    phoneNumber: string
): Promise<{ registered: boolean }> {
  return apiFetch<{
    registered: boolean;
    nextAction: string;
  }>("/api/consumers/registration-status", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      phoneNumber,
    }),
  });
}

export async function sendSignupCode(
    phoneNumber: string
): Promise<void> {
  await apiFetch("/api/consumers/signup/send-code", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      phoneNumber,
    }),
  });
}

export async function verifySignupCode(
    phoneNumber: string,
    code: string
): Promise<void> {
  await apiFetch("/api/consumers/signup/verify-code", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      phoneNumber,
      code,
    }),
  });
}

// ---------- 비밀번호 재설정 ----------

export async function sendPasswordResetCode(
    phoneNumber: string
): Promise<void> {
  await apiFetch("/api/consumers/password/reset/send-code", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      phoneNumber,
    }),
  });
}

export async function verifyPasswordResetCode(
    phoneNumber: string,
    code: string
): Promise<void> {
  await apiFetch("/api/consumers/password/reset/verify-code", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      phoneNumber,
      code,
    }),
  });
}

export async function resetPassword(
    phoneNumber: string,
    newPassword: string
): Promise<void> {
  await apiFetch("/api/consumers/password/reset", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      phoneNumber,
      newPassword,
    }),
  });
}

/**
 * 하이픈 포함 화면 표시용 전화번호
 * "010 - 0000 - 0000"
 * ↓
 * 백엔드 형식
 * "01000000000"
 */
export function toBackendPhone(
    displayPhone: string
): string {
  return displayPhone.replace(/\D/g, "");
}