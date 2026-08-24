// lib/mock-orders.ts
// ⚠ 전자영수증 목업 데이터. 백엔드 GET /api/orders가 비어있거나(시드데이터 없음) 실패하면
//   (백엔드 미기동 등) 전자영수증 화면을 바로 확인할 수 있도록 실제 Order 응답 형태
//   (orderId/totalAmount/status/items)에 맞춰 만들었습니다.
//   orderedAt/paymentMethod는 영수증에만 쓰는 표시용 필드라 백엔드 스펙엔 없을 수 있어
//   optional로 다룹니다 — 실제 API가 내려주면 그 값이 우선합니다.
export interface MockOrderItem {
  skuId: number;
  productName: string;
  priceKrw: number;
  quantity: number;
}

export interface MockOrder {
  orderId: number;
  totalAmount: number;
  status: string;
  items: MockOrderItem[];
  orderedAt: string;
  paymentMethod: string;
}

export const MOCK_ORDERS: MockOrder[] = [
  {
    orderId: 1001,
    status: "DELIVERED",
    orderedAt: "2026-08-18T11:24:00",
    paymentMethod: "신한카드(간편결제)",
    items: [
      { skuId: 90001, productName: "서울우유 1L", priceKrw: 2490, quantity: 2 },
      { skuId: 90003, productName: "계란 30구", priceKrw: 8990, quantity: 1 },
      { skuId: 90010, productName: "크리넥스 3겹 화장지 30롤", priceKrw: 10320, quantity: 1 },
    ],
    totalAmount: 2490 * 2 + 8990 + 10320,
  },
  {
    orderId: 1002,
    status: "PAID",
    orderedAt: "2026-08-14T19:03:00",
    paymentMethod: "KB국민카드",
    items: [
      { skuId: 90007, productName: "동원 참치 150g", priceKrw: 3280, quantity: 3 },
      { skuId: 90009, productName: "라면 5입 세트", priceKrw: 4480, quantity: 2 },
      { skuId: 90021, productName: "커피믹스 100T", priceKrw: 8900, quantity: 1 },
    ],
    totalAmount: 3280 * 3 + 4480 * 2 + 8900,
  },
  {
    orderId: 1003,
    status: "SHIPPED",
    orderedAt: "2026-08-09T09:41:00",
    paymentMethod: "카카오페이",
    items: [
      { skuId: 90014, productName: "냉동 만두 1.5kg", priceKrw: 8900, quantity: 1 },
      { skuId: 90015, productName: "냉동 피자 2입", priceKrw: 7900, quantity: 1 },
      { skuId: 90016, productName: "아이스크림 모음팩", priceKrw: 12900, quantity: 1 },
      { skuId: 90022, productName: "쓰레기봉투 50L 20매", priceKrw: 5900, quantity: 1 },
    ],
    totalAmount: 8900 + 7900 + 12900 + 5900,
  },
];
