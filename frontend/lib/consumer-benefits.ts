// lib/consumer-benefits.ts
// ⚠ 아래 3개 다 백엔드 API가 아직 없습니다. 엔드포인트만 생기면 바로 동작하도록
//   합리적인 형태로 미리 만들어뒀습니다 — 실제 스펙 나오면 URL/필드명만 맞추면 됩니다.
"use client";

import { apiFetch } from "./api-client";

export interface PointBalance {
  balance: number;
  earnedThisMonth: number;
  usedThisMonth: number;
}
export interface PointHistoryItem {
  id: number;
  title: string;
  amount: number; // 양수=적립, 음수=사용
  createdAt: string;
}
export async function fetchPointBalance(): Promise<PointBalance | null> {
  try {
    return await apiFetch<PointBalance>("/api/consumers/points");
  } catch {
    return null;
  }
}
export async function fetchPointHistory(): Promise<PointHistoryItem[]> {
  try {
    return await apiFetch<PointHistoryItem[]>("/api/consumers/points/history");
  } catch {
    return [];
  }
}

export interface Coupon {
  id: number;
  title: string;
  description: string;
  expiresAt: string;
  used: boolean;
}
export async function fetchCoupons(): Promise<Coupon[]> {
  try {
    return await apiFetch<Coupon[]>("/api/consumers/coupons");
  } catch {
    return [];
  }
}

export interface MyGrade {
  grade: "BASIC" | "BRONZE" | "SILVER" | "GOLD";
  monthlySpendAmount: number;
}
export async function fetchMyGrade(): Promise<MyGrade | null> {
  try {
    return await apiFetch<MyGrade>("/api/consumers/grade");
  } catch {
    return null;
  }
}
