// lib/chat-search.ts
// ✅ 실제 GET /api/chat/search?keyword= 연동. 백엔드는 메시지 "내용"만 검색합니다
//   (세션 제목/연결된 리스트 이름은 이 API 범위 밖 — 그건 이미 받아온 세션 목록에서
//   클라이언트가 직접 필터링).
import { apiFetch, getAccessToken } from "./api-client";
import { getClientId } from "./client-id";

export interface ChatSearchMessage {
  messageId: number;
  sender: string;
  content: string;
  createdAt: string;
}

export interface ChatSearchResult {
  sessionId: string;
  title: string | null;
  groupId: number | null;
  matches: ChatSearchMessage[]; // 최신순, 최대 5개
}

function chatHeaders(): Record<string, string> {
  return getAccessToken() ? {} : { "X-Chat-Client-Id": getClientId() };
}

export async function searchChatMessages(keyword: string): Promise<ChatSearchResult[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];
  try {
    return await apiFetch<ChatSearchResult[]>(
      `/api/chat/search?keyword=${encodeURIComponent(trimmed)}`,
      { headers: chatHeaders() }
    );
  } catch {
    return [];
  }
}

/** 검색어가 들어있는 부분만 <mark>로 감싸기 (VSCode 찾기처럼 하이라이트) */
export function highlightMatch(text: string, keyword: string): { before: string; match: string; after: string } | null {
  if (!keyword.trim()) return null;
  const idx = text.toLowerCase().indexOf(keyword.trim().toLowerCase());
  if (idx === -1) return null;
  return {
    before: text.slice(0, idx),
    match: text.slice(idx, idx + keyword.trim().length),
    after: text.slice(idx + keyword.trim().length),
  };
}
