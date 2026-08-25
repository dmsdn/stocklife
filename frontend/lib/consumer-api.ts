// lib/consumer-api.ts
// ✅ 신규 — GET/PATCH /api/consumers/me 연동. 마이페이지 "내 정보"가 하드코딩되어 있던 걸
//   실제 회원 데이터로 교체하기 위한 얇은 래퍼.
"use client";

import { apiFetch } from "./api-client";

export interface ConsumerMe {
    consumerId: number;
    phoneNumber: string;
    name: string;
    gender: string | null;
    birthDate: string | null; // "YYYY-MM-DD"
    householdSize: number | null;
    hasPet: boolean | null;
    hasChild: boolean | null;
    byCar: boolean | null;
    grade: string;
    monthlySpendAmount: number;
    marketingConsent: boolean;
    cameraConsent: boolean;
    micConsent: boolean;
}

export interface UpdateConsumerPayload {
    gender?: string | null;
    birthDate?: string | null;
    householdSize?: number | null;
    hasPet?: boolean | null;
    hasChild?: boolean | null;
    byCar?: boolean | null;
    marketingConsent?: boolean | null;
}

export function getMyProfile() {
    return apiFetch<ConsumerMe>("/api/consumers/me");
}

export function updateMyProfile(payload: UpdateConsumerPayload) {
    return apiFetch<ConsumerMe>("/api/consumers/me", {
        method: "PATCH",
        body: JSON.stringify(payload),
    });
}

/** 회원탈퇴. 성공하면(204) 호출한 쪽에서 토큰을 지우고 로그인 화면으로 보내야 한다. */
export function withdrawMyAccount() {
    return apiFetch<void>("/api/consumers/me", { method: "DELETE" });
}