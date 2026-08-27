// lib/notices.ts
// ⚠ 백엔드에 공지사항 API가 아직 없습니다. 생기면 fetchNotices()가 자동으로 실제 데이터를
//   씁니다. 마이페이지 미리보기 등 동기적으로 접근하는 곳을 위해 폴백 목업도 남겨뒀습니다.
"use client";

import { apiFetch } from "./api-client";

export interface Notice {
  id: string;
  title: string;
  date: string;
  body: string;
}

export const MOCK_NOTICES: Notice[] = [
  { id: "1", title: "정기 점검 안내", date: "2026.08.09", body: "8월 12일(수) 새벽 2시~4시 서비스 정기 점검이 진행됩니다. 점검 시간 동안 앱 이용이 일시적으로 제한될 수 있어요." },
  { id: "2", title: "여름 휴무일 안내", date: "2026.07.30", body: "광복절(8월 15일)은 매장 휴무일입니다. 온라인 리스트 저장과 AI 채팅은 정상 이용 가능해요." },
  { id: "3", title: "동선 안내 기능 업데이트", date: "2026.07.20", body: "매장 내 실시간 동선 안내 기능이 새롭게 추가됐습니다. 저장한 리스트에서 '동선 보기'를 눌러보세요." },
];

export async function fetchNotices(): Promise<Notice[]> {
  try {
    const list = await apiFetch<Notice[]>("/api/notices");
    return list.length > 0 ? list : MOCK_NOTICES;
  } catch {
    return MOCK_NOTICES;
  }
}

export async function fetchNotice(id: string): Promise<Notice | null> {
  try {
    return await apiFetch<Notice>(`/api/notices/${id}`);
  } catch {
    return MOCK_NOTICES.find((n) => n.id === id) ?? null;
  }
}
