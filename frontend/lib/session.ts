// lib/session.ts
// DB스키마_초안.md §0.4, §2.2 / ChatSession 엔티티 주석: session_id는 원래 백엔드가 발급해야 함
// (비회원 포함).
//
// ⚠ 그런데 지금 받은 백엔드 코드 전체를 봐도 session_id를 발급해주는 API가 없습니다
//   (쿠키로 내려주는 로직도, 별도 발급 엔드포인트도 없음). 그런데 /api/chat의 sessionId는
//   @NotBlank라 빈 값으로 보내면 무조건 실패합니다.
//   → 백엔드에 발급 엔드포인트가 생기기 전까지, 임시로 프론트에서 UUID를 만들어
//     로컬에 저장해두는 걸로 막아뒀습니다. 이건 원래 정책(프론트가 생성하지 않는다)에는
//     어긋나는 임시 조치입니다 — 발급 엔드포인트 생기면 이 파일의 폴백 부분만 지우면 됩니다.
export function getSessionId(): string | null {
  if (typeof window === "undefined") return null;

  const cookieMatch = document.cookie.match(/(?:^|; )session_id=([^;]+)/);
  if (cookieMatch) return decodeURIComponent(cookieMatch[1]);

  // TODO: 백엔드 발급 엔드포인트 생기면 아래 폴백 전부 삭제
  const FALLBACK_KEY = "storeflow_fallback_session_id";
  let fallback = window.localStorage.getItem(FALLBACK_KEY);
  if (!fallback) {
    fallback = crypto.randomUUID();
    window.localStorage.setItem(FALLBACK_KEY, fallback);
  }
  return fallback;
}
