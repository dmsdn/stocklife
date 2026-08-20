// lib/mock-products.ts
// ⚠ 목업 카탈로그. 실제 백엔드 ProductDetailResponse 필드(brand/specRaw/discount/imageUrl/
//   discontinued)와 이름을 맞춰서 확장했습니다 — 나중에 실제 API로 바꿀 때 필드명 그대로
//   재사용 가능하도록.
export interface MockProduct {
  id: number;
  barcode: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  discountPercent: number; // 0이면 할인 없음
  unit: string;
  specRaw: string;
  inStock: boolean;
  discontinued: boolean;
  imageUrl: string | null;
  location: { floorNo: number; x: number; y: number };
}

function withDefaults(p: Omit<MockProduct, "discountPercent" | "specRaw" | "discontinued" | "imageUrl" | "brand"> & Partial<Pick<MockProduct, "discountPercent" | "specRaw" | "discontinued" | "imageUrl" | "brand">>): MockProduct {
  return {
    brand: "스토어플로우",
    discountPercent: 0,
    specRaw: p.unit,
    discontinued: false,
    imageUrl: null,
    ...p,
  };
}

export const MOCK_PRODUCTS: MockProduct[] = [
  withDefaults({ id: 90001, barcode: "8801234000017", name: "서울우유 1L", brand: "서울우유", category: "유제품", price: 2490, unit: "1L", inStock: true, location: { floorNo: 1, x: 4, y: 3 } }),
  withDefaults({ id: 90002, barcode: "8801234000024", name: "매일우유 저지방 900ml", brand: "매일유업", category: "유제품", price: 2190, unit: "900ml", inStock: true, location: { floorNo: 1, x: 5, y: 3 } }),
  withDefaults({ id: 90003, barcode: "8801234000031", name: "계란 30구", category: "신선식품", price: 8990, unit: "30입", specRaw: "특란 30구", inStock: true, location: { floorNo: 1, x: 2, y: 6 } }),
  withDefaults({ id: 90004, barcode: "8801234000048", name: "무항생제 닭가슴살 1kg", category: "신선식품", price: 11900, discountPercent: 15, unit: "1kg", inStock: true, location: { floorNo: 1, x: 3, y: 7 } }),
  withDefaults({ id: 90005, barcode: "8801234000055", name: "제주 감귤 3kg", category: "신선식품", price: 15900, unit: "3kg", inStock: false, discontinued: false, location: { floorNo: 1, x: 2, y: 8 } }),
  withDefaults({ id: 90006, barcode: "8801234000062", name: "삼겹살 1kg", category: "신선식품", price: 16900, discountPercent: 10, unit: "1kg", inStock: true, location: { floorNo: 1, x: 4, y: 7 } }),
  withDefaults({ id: 90007, barcode: "8801234000079", name: "동원 참치 150g", brand: "동원", category: "가공식품", price: 3280, unit: "150g", specRaw: "150g × 1캔", inStock: true, location: { floorNo: 1, x: 10, y: 4 } }),
  withDefaults({ id: 90008, barcode: "8801234000086", name: "즉석밥 24입", brand: "CJ", category: "가공식품", price: 13900, unit: "24입", specRaw: "210g × 24개", inStock: true, location: { floorNo: 1, x: 11, y: 4 } }),
  withDefaults({ id: 90009, barcode: "8801234000093", name: "라면 5입 세트", category: "가공식품", price: 4480, unit: "5입", inStock: true, location: { floorNo: 1, x: 10, y: 5 } }),
  withDefaults({ id: 90010, barcode: "8801234000109", name: "크리넥스 3겹 화장지 30롤", brand: "유한킴벌리", category: "생활용품", price: 12900, discountPercent: 20, unit: "30롤", inStock: true, location: { floorNo: 1, x: 18, y: 3 } }),
  withDefaults({ id: 90011, barcode: "8801234000116", name: "섬유유연제 2L", category: "생활용품", price: 9800, unit: "2L", inStock: true, location: { floorNo: 1, x: 19, y: 3 } }),
  withDefaults({ id: 90012, barcode: "8801234000123", name: "주방세제 1.2L", category: "생활용품", price: 4900, unit: "1.2L", inStock: true, location: { floorNo: 1, x: 19, y: 4 } }),
  withDefaults({ id: 90013, barcode: "8801234000130", name: "물티슈 100매 10팩", category: "생활용품", price: 15900, unit: "10팩", inStock: false, location: { floorNo: 1, x: 18, y: 4 } }),
  withDefaults({ id: 90014, barcode: "8801234000147", name: "냉동 만두 1.5kg", category: "냉동식품", price: 8900, unit: "1.5kg", inStock: true, location: { floorNo: 1, x: 14, y: 12 } }),
  withDefaults({ id: 90015, barcode: "8801234000154", name: "냉동 피자 2입", category: "냉동식품", price: 7900, unit: "2입", inStock: true, location: { floorNo: 1, x: 15, y: 12 } }),
  withDefaults({ id: 90016, barcode: "8801234000161", name: "아이스크림 모음팩", category: "냉동식품", price: 12900, unit: "12입", inStock: true, location: { floorNo: 1, x: 15, y: 13 } }),
  withDefaults({ id: 90017, barcode: "8801234000178", name: "그릭요거트 4입", category: "유제품", price: 6900, unit: "4입", inStock: true, location: { floorNo: 1, x: 5, y: 4 } }),
  withDefaults({ id: 90018, barcode: "8801234000185", name: "체다치즈 슬라이스", category: "유제품", price: 5900, unit: "20매", inStock: true, location: { floorNo: 1, x: 4, y: 4 } }),
  withDefaults({ id: 90019, barcode: "8801234000192", name: "바나나 1송이", category: "신선식품", price: 3900, unit: "1송이", inStock: true, location: { floorNo: 1, x: 2, y: 5 } }),
  withDefaults({ id: 90020, barcode: "8801234000208", name: "샐러드 믹스", category: "신선식품", price: 4900, unit: "200g", inStock: true, location: { floorNo: 1, x: 3, y: 5 } }),
  withDefaults({ id: 90021, barcode: "8801234000215", name: "커피믹스 100T", category: "가공식품", price: 8900, unit: "100T", inStock: true, location: { floorNo: 1, x: 11, y: 5 } }),
  withDefaults({ id: 90022, barcode: "8801234000222", name: "쓰레기봉투 50L 20매", category: "생활용품", price: 5900, unit: "20매", inStock: true, location: { floorNo: 1, x: 20, y: 4 } }),
];

export function getFinalPrice(p: MockProduct): number {
  return Math.round(p.price * (1 - p.discountPercent / 100));
}

export function searchMockProducts(params: {
  keyword?: string;
  categories?: string[];
  onlyInStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
}): MockProduct[] {
  const keyword = params.keyword?.trim().toLowerCase() ?? "";
  return MOCK_PRODUCTS.filter((p) => {
    const matchesKeyword =
      !keyword || p.name.toLowerCase().includes(keyword) || p.category.toLowerCase().includes(keyword);
    const matchesCategory = !params.categories?.length || params.categories.includes(p.category);
    const matchesStock = !params.onlyInStock || p.inStock;
    const matchesMinPrice = params.minPrice === undefined || p.price >= params.minPrice;
    const matchesMaxPrice = params.maxPrice === undefined || p.price <= params.maxPrice;
    return matchesKeyword && matchesCategory && matchesStock && matchesMinPrice && matchesMaxPrice;
  });
}

export function findMockProductByBarcode(barcode: string): MockProduct | undefined {
  return MOCK_PRODUCTS.find((p) => p.barcode === barcode);
}

export function getMockProductById(id: number): MockProduct | undefined {
  return MOCK_PRODUCTS.find((p) => p.id === id);
}

export const MOCK_CATEGORIES = [...new Set(MOCK_PRODUCTS.map((p) => p.category))];
