// lib/promo-mock.ts
// ✅ 신규(요청 2번) — 매장지도에 행사상품 위치를 태그 핀으로 표시하고, 누르면 할인
//   내역을 보여주는 기능의 목업 데이터입니다.
// ⚠ 좌표는 진짜 "행사 위치" 데이터가 아니라, 이미 실측해둔 lib/map-config.ts의
//   ZONE_REGIONS(구역 사각형)의 중심점을 그대로 가져다 쓴 것입니다 — 어차피 그 구역
//   안쪽이라 매대 위에서 크게 벗어나지 않고, 실측 좌표라 최소한 통로/매대 밖으로 튀지는
//   않습니다. 실제 서비스에서 쓰려면:
//   1) 진짜 행사 상품 목록과 그게 진열된 실제 매대 위치(locationId 또는 x,y)가 필요하고,
//   2) 이상적으로는 백엔드에 "지금 행사 중인 상품" API가 생겨서 여기 대신 그걸 불러오는
//      게 맞습니다(지금은 그런 API가 없어서 화면 확인용 목업으로 대체).
//   좌표만 바꾸고 싶으면 x/y 값만 고치면 됩니다(같은 그리드 좌표계 — 95×75, 백엔드
//   map_layout.py의 FLOOR_W/FLOOR_H와 동일. public/maps/MAP_GUIDE.md,
//   rack-coord-tool.html 참고).
import type { PromoPin } from "@/components/domain/store-map";

export const MOCK_PROMO_PINS: PromoPin[] = [
  {
    id: 9001,
    floorNo: 1,
    x: 18.8,
    y: 48.05, // F1-A 구역 중심
    title: "신선식품 특가",
    discountLabel: "최대 40% 할인",
    validUntil: "9월 14일",
  },
  {
    id: 9002,
    floorNo: 1,
    x: 50.47,
    y: 54.38, // F1-B 구역 중심
    title: "정육 1+1",
    discountLabel: "삼겹살 1+1",
    validUntil: "9월 10일",
  },
  {
    id: 9003,
    floorNo: 2,
    x: 23.35,
    y: 49.69, // F2-B 구역 중심
    title: "생활용품 특가전",
    discountLabel: "최대 30% 할인",
    validUntil: "9월 20일",
  },
  {
    id: 9004,
    floorNo: 3,
    x: 35.23,
    y: 49.69, // F3-B 구역 중심
    title: "가전 시즌오프",
    discountLabel: "최대 15% 할인",
    validUntil: "9월 30일",
  },
];
