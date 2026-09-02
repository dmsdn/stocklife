// lib/browse-map-zones.ts
// ✅ 신규 — 백엔드 GET /api/map/floors/{floorNo}의 locations가 아직 비어있어서(DB에 매대
//   좌표가 없음, 그리고 그 값을 지금 바꿀 수 없는 상황) 매대를 눌러도 아무 반응이 없던 문제.
//   이미 있던 lib/mock-products.ts(실제 백엔드 붙기 전 쓰던 목업 카탈로그, 카테고리별로
//   24×16 격자 위 좌표가 이미 찍혀있음)를 그대로 재사용해서, "매장 둘러보기"(/store-map)
//   화면에서만 프론트 단독으로 매대 구역을 사각형으로 그리고 누르면 그 안의 목업 상품을
//   보여주게 함 — 백엔드 데이터가 생기면 이 파일은 안 써도 되게 분리해뒀습니다.
// ⚠ 각 구역의 사각형 범위(x0~x1, y0~y1)는 mock-products.ts에 이미 찍힌 좌표들을 감싸는
//   대략적인 박스입니다. 실제 이미지의 매대 칸 경계랑 정확히 픽셀 단위로 맞아떨어지는 건
//   아니라서(그러려면 결국 백엔드처럼 정밀 좌표 작업이 필요), "이 근처를 누르면 이 카테고리
//   상품들이 나온다" 정도의 근사치입니다.
import { MOCK_PRODUCTS, type MockProduct } from "./mock-products";

export interface BrowseMapZone {
  zoneId: string;
  label: string;
  floorNo: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const BROWSE_MAP_ZONES: BrowseMapZone[] = [
  { zoneId: "zone-dairy", label: "유제품", floorNo: 1, x0: 3, y0: 2, x1: 6, y1: 5 },
  { zoneId: "zone-fresh", label: "신선식품", floorNo: 1, x0: 1, y0: 4, x1: 5, y1: 9 },
  { zoneId: "zone-processed", label: "가공식품", floorNo: 1, x0: 9, y0: 3, x1: 12, y1: 6 },
  { zoneId: "zone-household", label: "생활용품", floorNo: 1, x0: 17, y0: 2, x1: 21, y1: 5 },
  { zoneId: "zone-frozen", label: "냉동식품", floorNo: 1, x0: 13, y0: 11, x1: 16, y1: 14 },
];

export function getBrowseMapZones(floorNo: number): BrowseMapZone[] {
  return BROWSE_MAP_ZONES.filter((z) => z.floorNo === floorNo);
}

export function getProductsInZone(zoneId: string): MockProduct[] {
  const zone = BROWSE_MAP_ZONES.find((z) => z.zoneId === zoneId);
  if (!zone) return [];
  return MOCK_PRODUCTS.filter(
    (p) =>
      p.location.floorNo === zone.floorNo &&
      p.location.x >= zone.x0 &&
      p.location.x <= zone.x1 &&
      p.location.y >= zone.y0 &&
      p.location.y <= zone.y1
  );
}
