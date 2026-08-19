// lib/client-id.ts
// 비회원 채팅 소유권 구분용 X-Chat-Client-Id 헤더 값.
// ChatService.normalizeAnonymousId 기준 64자 이하 문자열이면 되므로 UUID를 그대로 씀.
"use client";

const CLIENT_ID_KEY = "storeflow_chat_client_id";

export function getClientId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}
