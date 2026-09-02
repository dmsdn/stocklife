// lib/format-time.ts
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;

  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

/** "yyyy-MM-dd" -> "9월 9일" (장 볼 날짜 표시용) */
export function formatShoppingDate(yyyyMMdd: string): string {
  const date = new Date(`${yyyyMMdd}T00:00:00`);
  if (Number.isNaN(date.getTime())) return yyyyMMdd;
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}
