// lib/category-colors.ts
// ✅ 수정(2026-09) — "색상 기준이 이상하다"는 지적의 실제 원인: 카테고리 이름 문자열을
//   해시해서 hue를 뽑다 보니(hash % 360), 예를 들어 "정육"과 "수산"처럼 전혀 다른
//   카테고리인데 해시값이 우연히 가까우면(예: 118과 124) 그래프에서 색이 거의 구분이
//   안 됐습니다. 그리고 카테고리가 3~4개뿐인 화면에서도 360도 전체에서 무작위로 뽑다
//   보니 다닥다닥 붙어있을 수 있었음.
//   지금 화면에 "실제로 나온 카테고리 목록"을 넘겨주면, 그 개수만큼 360도를 균등하게
//   나눠서 배정합니다(0개면 0도, 1개면 0도, 2개면 0/180도, 4개면 0/90/180/270도 ...) —
//   같은 화면 안에서는 항상 최대한 멀리 떨어진 색상이 나오게. 카테고리 "이름"이 같으면
//   화면이 달라도(정렬 순서가 같다면) 같은 위치에 오도록 이름 오름차순으로 정렬해서
//   인덱스를 매깁니다 — 그래야 "저번에 본 그 카테고리 색"이라는 감이 어느 정도 유지됨.
function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** 화면에 실제로 나온 카테고리 전체 목록을 받아서, 이름 -> hue 매핑을 한 번에 만듭니다.
 *  이 매핑을 getCategoryColor()의 두 번째 인자(palette)로 넘기면 균등 분산된 색이 나오고,
 *  안 넘기면(단독 사용 시) 예전처럼 해시 기반 hue로 대체됩니다. */
export function buildCategoryPalette(categories: string[]): Map<string, number> {
  const unique = Array.from(new Set(categories)).sort((a, b) => a.localeCompare(b, "ko"));
  const map = new Map<string, number>();
  unique.forEach((name, i) => {
    // ✅ 골든 앵글(137.5도)만큼씩 돌려서, 카테고리가 나중에 추가/삭제돼도 기존 카테고리들의
    //   색이 서로 너무 가까워지지 않게(균등분할 360/n은 개수가 바뀌면 전체가 다시 계산돼서
    //   색이 흔들리는데, 골든 앵글은 순서만 유지되면 안정적).
    map.set(name, Math.round((i * 137.508) % 360));
  });
  return map;
}

/** 대분류 이름 -> hue(0~359). palette를 넘기면 buildCategoryPalette() 결과에서 찾고,
 *  없으면(팔레트 자체가 없거나 그 안에 없는 이름) 해시 기반으로 대체. */
export function getCategoryHue(categoryL1: string, palette?: Map<string, number>): number {
  if (palette?.has(categoryL1)) return palette.get(categoryL1)!;
  return hashString(categoryL1) % 360;
}

export function getCategoryColor(categoryL1: string, lightness = 45, palette?: Map<string, number>): string {
  return `hsl(${getCategoryHue(categoryL1, palette)}, 55%, ${lightness}%)`;
}
