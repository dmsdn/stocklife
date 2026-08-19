// lib/signup-draft.ts

// 회원가입이 전화번호 → 추가정보 → 약관 3개 라우트로 나뉘어 있어서,
// 마지막 약관 단계에서 실제 signup API를 호출하려면 앞 단계 입력값이 필요하다.
//
// sessionStorage에 임시로 들고 있다가 최종 제출 시 한 번에 사용하고 지운다.

"use client";

const DRAFT_KEY = "storeflow_signup_draft";

export interface SignupDraft {
  phoneNumber?: string; // 하이픈 없는 형식
  password?: string;

  // 추가 회원정보
  gender?: string;
  birthDate?: string; // YYYY-MM-DD
  householdSize?: number;
}

export function readSignupDraft(): SignupDraft {
  if (typeof window === "undefined") return {};

  try {
    return JSON.parse(
      window.sessionStorage.getItem(DRAFT_KEY) ?? "{}"
    );
  } catch {
    return {};
  }
}

export function writeSignupDraft(patch: SignupDraft) {
  const merged = {
    ...readSignupDraft(),
    ...patch,
  };

  window.sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify(merged)
  );
}

export function clearSignupDraft() {
  window.sessionStorage.removeItem(DRAFT_KEY);
}