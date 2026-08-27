// lib/client-id.ts

// 비회원 채팅 소유권 구분용 X-Chat-Client-Id 헤더 값.
// ChatService.normalizeAnonymousId 기준 64자 이하 문자열이면 되므로
// UUID를 사용할 수 있는 환경에서는 UUID를 사용하고,
// 그렇지 않은 환경에서는 fallback ID를 생성한다.

"use client";

const CLIENT_ID_KEY = "storeflow_chat_client_id";

function createClientId(): string {
  // HTTPS / localhost 등에서 지원되는 경우 UUID 사용
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  // HTTP + IP 접속 등 randomUUID를 지원하지 않는 환경용 fallback
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function getClientId(): string {
  if (typeof window === "undefined") return "";

  let id = window.localStorage.getItem(CLIENT_ID_KEY);

  if (!id) {
    id = createClientId();
    window.localStorage.setItem(CLIENT_ID_KEY, id);
  }

  return id;
}