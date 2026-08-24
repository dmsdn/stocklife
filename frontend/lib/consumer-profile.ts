// lib/consumer-profile.ts
// ⚠ 백엔드에 GET/PATCH /api/consumers/me가 아직 없습니다. Consumer 엔티티엔 name/gender/
//   birthDate/householdSize 필드가 이미 있어서(회원가입 때 저장됨), 조회·수정 엔드포인트만
//   추가되면 아래 함수들이 바로 동작합니다 — 지금은 호출하면 실패해서 화면에 "불러올 수
//   없어요"로 뜹니다.
"use client";

import { apiFetch } from "./api-client";

export interface ConsumerProfile {
  name: string;
  phoneNumber: string;
  gender: string | null;
  birthDate: string | null;
  householdSize: number | null;
}

export async function fetchMyProfile(): Promise<ConsumerProfile | null> {
  try {
    return await apiFetch<ConsumerProfile>("/api/consumers/me");
  } catch {
    return null;
  }
}

export async function updateMyProfile(patch: Partial<ConsumerProfile>): Promise<boolean> {
  try {
    await apiFetch("/api/consumers/me", { method: "PATCH", body: JSON.stringify(patch) });
    return true;
  } catch {
    return false;
  }
}
