"use client";

const DRAFT_KEY = "storeflow_signup_draft";

export interface SignupDraft {
  phoneNumber?: string;
  password?: string;

  // 추가정보
  gender?: string | null;
  birthDate?: string | null;

  // 가구 관련 추가정보
  householdSize?: 1 | 2 | 3 | 4 | 5 | null;
  hasPet?: boolean | null;
  hasChild?: boolean | null;
  byCar?: boolean | null;

  // 약관 동의
  personalInfoConsent?: boolean;
  cameraConsent?: boolean;
  micConsent?: boolean;
  marketingConsent?: boolean;
}

export function readSignupDraft(): SignupDraft {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return JSON.parse(
      window.sessionStorage.getItem(DRAFT_KEY) ?? "{}"
    );
  } catch {
    return {};
  }
}

export function writeSignupDraft(
  patch: SignupDraft
) {
  const current = readSignupDraft();

  const merged: SignupDraft = {
    ...current,
    ...patch,
  };

  window.sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify(merged)
  );
}

/*
 * 추가정보만 초기화.
 *
 * 전화번호 / 비밀번호 / 약관 동의는 유지한다.
 */
export function clearSignupProfileDraft() {
  const current = readSignupDraft();

  const next: SignupDraft = {
    phoneNumber: current.phoneNumber,
    password: current.password,

    personalInfoConsent:
      current.personalInfoConsent,

    cameraConsent:
      current.cameraConsent,

    micConsent:
      current.micConsent,

    marketingConsent:
      current.marketingConsent,
  };

  window.sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify(next)
  );
}

export function clearSignupDraft() {
  window.sessionStorage.removeItem(DRAFT_KEY);
}