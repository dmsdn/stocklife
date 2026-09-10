import { apiFetch, getAccessToken, isLoggedIn, resolveImageUrl } from "./api-client";
import { MOCK_PRODUCTS, getFinalPrice, type MockProduct } from "./mock-products";

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
  image: string;
};

interface BackendProduct {
  skuId: number;
  name: string;
  categoryL1: string;
  priceKrw: number;
  finalPriceKrw: number;
  onPromo: boolean;
  imageUrl: string | null;
}

// ⚠ "지난 구매 후 23일 지났어요" 같은 개인화 사유는 백엔드에 추천 API가 따로 없어서
//   만들어낼 수 없습니다. reason/badge는 실제 데이터(카테고리 등) 기반의 일반적인 문구로
//   대체했습니다 — 진짜 개인화하려면 백엔드에 추천 엔드포인트가 필요합니다.
//
// ✅ 실제 API가 비어있거나 실패하면(백엔드 미기동, 시드데이터 없음 등) lib/mock-products.ts
//   목업으로 자동 대체됩니다. mock-products.ts는 실제 ProductDetailResponse 필드명
//   (brand/specRaw/discontinued/imageUrl)에 맞춰져 있는 카탈로그라 형태가 실제 DB와 같습니다.

function mockToRecommended(p: MockProduct): RecommendedProduct {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    price: getFinalPrice(p),
    image: resolveImageUrl(p.imageUrl) ?? "",
    reason: `${p.category} 카테고리 인기 상품이에요.`,
    badge: p.discountPercent > 0 ? "할인 중" : "추천",
  };
}

function mockToDiscovered(p: MockProduct): DiscoveredProduct {
  const finalPrice = getFinalPrice(p);
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    price: finalPrice,
    originalPrice: p.price,
    discount: `${p.discountPercent}%`,
    reason: `정가보다 ${(p.price - finalPrice).toLocaleString()}원 저렴해요.`,
    image: resolveImageUrl(p.imageUrl) ?? "",
  };
}

// ✅ 수정(요청 — "채팅 리스트·상세 링크·리브 추천") — 예전엔 그냥 인기 상품 검색
//   결과에 "OO 카테고리 인기 상품이에요"라는 일반 문구를 붙인 거였고, 실패하면 가짜
//   목업 상품으로 조용히 바뀌었습니다(사용자는 그게 진짜 추천인지 목업인지 구분 불가).
//   이제 실제 Agent 추천 API(predict_repurchase/match_preferences 기반)를 쓰고,
//   비로그인·실패 시엔 목업으로 대체하지 않고 그 상태를 그대로 알려주는 message를 줍니다.
export interface LivRecommendationResult {
  items: RecommendedProduct[];
  message: string;
  status: "ready" | "login_required" | "unavailable";
}

export async function fetchLivRecommendations(): Promise<LivRecommendationResult> {
  const owner = getAccessToken();
  if (!owner) {
    return { items: [], status: "login_required", message: "로그인하면 구매 이력을 참고해 추천해 드려요." };
  }
  try {
    const result = await apiFetch<{
      items: { skuId: number; name: string; priceKrw: number; imageUrl?: string | null; categoryL1?: string; reason: string; badge: string }[];
      message: string;
      status: string;
    }>("/api/ai/recommendations?limit=8");
    // ✅ 응답이 오는 동안 계정이 바뀌었으면(로그아웃 후 다른 계정 로그인 등) 그 사이
    //   응답은 이전 계정 것이므로 버림 — 새 계정 화면에 이전 계정 추천이 잠깐이라도
    //   보이지 않게.
    if (owner !== getAccessToken()) throw new Error("로그인 상태가 변경되었습니다.");
    return {
      ...result,
      status: (result.status as LivRecommendationResult["status"]) ?? "ready",
      items: result.items.map((p) => ({
        id: p.skuId,
        name: p.name,
        category: p.categoryL1 ?? "",
        price: p.priceKrw,
        image: resolveImageUrl(p.imageUrl ?? null) ?? "",
        reason: p.reason,
        badge: p.badge,
      })),
    };
  } catch {
    return { items: [], status: "unavailable", message: "지금 추천을 불러오지 못했어요. 잠시 후 다시 확인해 주세요." };
  }
}

/** ✅ 예전 이름을 그대로 쓰던 다른 화면들을 위한 얇은 호환 래퍼. */
export async function fetchRecommendedProducts(): Promise<RecommendedProduct[]> {
  return (await fetchLivRecommendations()).items;
}

/** 홈 "AI DISCOVERED" — 실제 할인 중(onPromo)인 상품, 없으면 목업 중 할인 상품 */
export async function fetchDiscoveredProducts(): Promise<DiscoveredProduct[]> {
  try {
    const products = await apiFetch<BackendProduct[]>("/api/products/search?onPromo=true", { auth: false });
    if (products.length === 0) throw new Error("empty");
    return products.slice(0, 6).map((p) => ({
      id: p.skuId,
      name: p.name,
      category: p.categoryL1,
      price: p.finalPriceKrw,
      originalPrice: p.priceKrw,
      discount:
        p.priceKrw > 0 ? `${Math.round(((p.priceKrw - p.finalPriceKrw) / p.priceKrw) * 100)}%` : "0%",
      reason: `정가보다 ${(p.priceKrw - p.finalPriceKrw).toLocaleString()}원 저렴해요.`,
      image: resolveImageUrl(p.imageUrl) ?? "",
    }));
  } catch {
    return MOCK_PRODUCTS.filter((p) => p.discountPercent > 0).slice(0, 6).map(mockToDiscovered);
  }
}

/** "뭐사지 · 자주 사요" — 실제 GET /api/orders/frequent(skuId/구매횟수만 줌)를
 *  GET /api/products/{skuId}(가격/이미지)와 조합해 완전한 상품 카드로 만듦.
 *  두 실제 엔드포인트를 합치는 것일 뿐, 가격/이미지를 새로 지어내지 않음. */
export async function fetchFrequentProducts(): Promise<HomeProduct[]> {
  if (!isLoggedIn()) return [];
  try {
    const frequent = await apiFetch<{ skuId: number; productName: string; purchaseCount: number }[]>(
      "/api/orders/frequent"
    );
    if (frequent.length === 0) throw new Error("empty");

    const top = frequent.slice(0, 8);
    const details = await Promise.all(
      top.map((f) =>
        apiFetch<BackendProduct>(`/api/products/${f.skuId}`, { auth: false }).catch(() => null)
      )
    );

    return top
      .map((f, i) => {
        const d = details[i];
        if (!d) return null;
        return {
          id: f.skuId,
          name: d.name,
          category: d.categoryL1,
          price: d.finalPriceKrw,
          image: resolveImageUrl(d.imageUrl) ?? "",
        };
      })
      .filter((p): p is HomeProduct => p !== null);
  } catch {
    return [];
  }
}


export async function fetchPopularProducts(): Promise<HomeProduct[]> {
  try {
    const products = await apiFetch<BackendProduct[]>("/api/products/search", { auth: false });
    if (products.length === 0) throw new Error("empty");
    return products.slice(0, 8).map((p) => ({
      id: p.skuId,
      name: p.name,
      category: p.categoryL1,
      price: p.finalPriceKrw,
      image: resolveImageUrl(p.imageUrl) ?? "",
    }));
  } catch {
    return MOCK_PRODUCTS.slice(0, 8).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: getFinalPrice(p),
      image: resolveImageUrl(p.imageUrl) ?? "",
    }));
  }
}

export interface RecentOrderSummary {
  orderId: number;
  totalAmount: number;
  status: string;
  itemCount: number;
}

interface BackendOrder {
  orderId: number;
  totalAmount: number;
  status: string;
  items: unknown[];
}

/** 홈 "마이 쇼핑" — 로그인한 회원의 실제 최근 주문(GET /api/orders).
 *  로그인 전이면(개인정보라 아예 조회 자체를 안 함) null, 조회했는데 주문이 없어도 null. */
export async function fetchRecentOrder(): Promise<RecentOrderSummary | null> {
  if (!isLoggedIn()) return null;
  try {
    const orders = await apiFetch<BackendOrder[]>("/api/orders");
    if (orders.length === 0) return null;
    const [latest] = orders;
    return {
      orderId: latest.orderId,
      totalAmount: latest.totalAmount,
      status: latest.status,
      itemCount: latest.items.length,
    };
  } catch {
    return null;
  }
}

/** 홈 "마이 쇼핑" — 실제 찜 목록 개수(GET /api/wishlist). 비로그인/실패면 null(=로그인 유도),
 *  로그인했는데 0개면 0(=진짜 없음)으로 구분해서 반환. */
export async function fetchWishlistCount(): Promise<number | null> {
  if (!isLoggedIn()) return null;
  try {
    const items = await apiFetch<unknown[]>("/api/wishlist");
    return items.length;
  } catch {
    return null;
  }
}

export const suggestedPrompts = [
  "이번주 장보기 계획 세워줘",
  "추천 상품 중에 뭐부터 사야해?",
  "이번주 식비를 아끼고 싶어",
];

export function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}
