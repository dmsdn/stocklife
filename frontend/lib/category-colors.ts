// lib/category-colors.ts
// ✅ 지난 논의 — 대분류마다 고유 hue를 배정하고, 필요하면 중분류는 같은 hue의 명도만
//   다르게 써서 "색으로는 대분류가, 명도로는 중분류가 구분되는" 체계로 가기로 했습니다.
//   categoryL1이 자유 문자열이라 정해진 목록이 없어서, 문자열을 해시해서 항상 같은
//   카테고리는 항상 같은 hue가 나오게 만들었습니다(새 카테고리가 생겨도 코드 수정 불필요).
function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** 대분류 이름 -> 고유 hue(0~359). 채도/명도는 고정해서 톤을 통일. */
export function getCategoryHue(categoryL1: string): number {
  return hashString(categoryL1) % 360;
}

export function getCategoryColor(categoryL1: string, lightness = 45): string {
  return `hsl(${getCategoryHue(categoryL1)}, 55%, ${lightness}%)`;
}
