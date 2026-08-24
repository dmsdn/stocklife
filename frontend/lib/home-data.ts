export type HomeProduct = {
  id: number;
  name: string;
  category: string;
  price: number;
  image: string;
};

export type RecommendedProduct = HomeProduct & {
  reason: string;
  badge: string;
};

export type DiscoveredProduct = {
  id: number;
  name: string;
  category: string;
  price: number;
  originalPrice: number;
  discount: string;
  reason: string;
};

export const recommendedProducts: RecommendedProduct[] = [
  {
    id: 1,
    name: "서울우유 1L",
    category: "유제품",
    price: 2490,
    image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400",
    reason: "지난 구매 후 23일이 지났어요.",
    badge: "다시 살 때",
  },
  {
    id: 2,
    name: "동원 참치 150g",
    category: "가공식품",
    price: 3280,
    image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400",
    reason: "이번 주 식단에 필요한 재료예요.",
    badge: "식단 추천",
  },
  {
    id: 3,
    name: "CJ 햇반 210g × 6",
    category: "즉석식품",
    price: 7980,
    image: "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?w=400",
    reason: "최근 장보기에서 함께 구매했어요.",
    badge: "함께 구매",
  },
  {
    id: 4,
    name: "크리넥스 3겹 화장지",
    category: "생활용품",
    price: 12900,
    image: "https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=400",
    reason: "최근 구매 주기가 가까워졌어요.",
    badge: "구매 시기",
  },
  {
    id: 5,
    name: "오뚜기 진라면 5입",
    category: "라면",
    price: 3980,
    image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400",
    reason: "평소 자주 구매하는 상품이에요.",
    badge: "취향 추천",
  },
  {
    id: 6,
    name: "계란 30구",
    category: "신선식품",
    price: 8990,
    image: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400",
    reason: "이번 주 식재료로 활용하기 좋아요.",
    badge: "식재료",
  },
  {
    id: 7,
    name: "섬유유연제 2L",
    category: "생활용품",
    price: 9800,
    image: "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=400",
    reason: "지난 구매일을 기준으로 추천했어요.",
    badge: "재구매",
  },
  {
    id: 8,
    name: "생수 2L × 6",
    category: "음료",
    price: 5980,
    image: "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400",
    reason: "최근 소비량을 기준으로 추천했어요.",
    badge: "생활필수",
  },
];

export const discoveredProducts: DiscoveredProduct[] = [
  {
    id: 1,
    name: "오뚜기 진라면 순한맛",
    category: "라면",
    price: 3980,
    originalPrice: 4800,
    discount: "17%",
    reason: "평소보다 820원 저렴해요.",
  },
  {
    id: 2,
    name: "크리넥스 3겹 화장지",
    category: "생활용품",
    price: 12900,
    originalPrice: 16900,
    discount: "24%",
    reason: "최근 구매한 상품과 같은 브랜드예요.",
  },
];

export const popularProducts: HomeProduct[] = [
  {
    id: 1,
    name: "신라면 5입",
    category: "라면",
    price: 4980,
    image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400",
  },
  {
    id: 2,
    name: "동원 참치",
    category: "가공식품",
    price: 3280,
    image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400",
  },
  {
    id: 3,
    name: "계란 30구",
    category: "신선식품",
    price: 8990,
    image: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400",
  },
];

export const suggestedPrompts = [
  "이번주 장보기 계획 세워줘",
  "추천 상품 중에 뭐부터 사야해?",
  "이번주 식비를 아끼고 싶어",
];

export function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}
