// lib/chat-detail-links.ts
// ✅ 신규(요청 — "채팅 리스트·상세 링크·리브 추천") — 리브가 답변 안에 Markdown 링크
//   (예: [주말 장보기](/saved/11))로 리스트·구매내역 상세를 안내할 때, 그 경로가 이
//   앱이 실제로 지원하는 상세 화면인지 검사합니다. 양의 정수 ID를 가진 /saved/{id},
//   /mypage/orders/{id}, /mypage/receipts/{id}만 허용 — 외부 URL, 스크립트(javascript:),
//   경로 변조(../), 쿼리스트링·해시가 붙은 경로는 전부 링크로 안 만들고 그냥 텍스트로 둡니다.
export function chatDetailHref(value: string): string | null {
  return /^\/(?:saved|mypage\/orders|mypage\/receipts)\/[1-9]\d*$/.test(value) ? value : null;
}
