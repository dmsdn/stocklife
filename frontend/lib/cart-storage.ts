// lib/cart-storage.ts
// ✅ 로컬 저장이 기본이지만, 이제 실제 서버 장바구니(POST /api/cart)에도 같이 저장합니다
//   (fire-and-forget — 서버 저장 실패해도 화면엔 영향 없음).
"use client";

import { apiFetch, getAccessToken } from "./api-client";
import { getClientId } from "./client-id";

function cartHeaders(): Record<string, string> {
  return getAccessToken() ? {} : { "X-Session-Id": getClientId() };
}

function syncAddToServerCart(skuId: number) {
  apiFetch("/api/cart", {
    method: "POST",
    headers: cartHeaders(),
    body: JSON.stringify({ skuId, quantity: 1 }),
  }).catch(() => {});
}

/** ✅ 실제 서버 장바구니 수량 변경(PATCH). cartItemId는 서버 응답 기준이 아니라 로컬
 *  skuId를 그대로 씁니다 — 서버-로컬 id가 정확히 매핑되어 있지 않아 최선의 동기화입니다. */
export function syncUpdateServerCart(skuId: number, quantity: number) {
  apiFetch(`/api/cart/${skuId}`, {
    method: "PATCH",
    headers: cartHeaders(),
    body: JSON.stringify({ quantity }),
  }).catch(() => {});
}

/** ✅ 실제 서버 장바구니 삭제(DELETE) */
export function syncRemoveFromServerCart(skuId: number) {
  apiFetch(`/api/cart/${skuId}`, {
    method: "DELETE",
    headers: cartHeaders(),
  }).catch(() => {});
}

export interface CartProduct {
  id: number;
  name: string;
  category: string;
  price: number;
  quantity: number;
  checked: boolean;
  image?: string;
}

export interface CartGroup {
  id: number;
  title: string;
  description: string;
  createdAt: string;
  store: string;
  products: CartProduct[];
}

const CART_STORAGE_KEY = "storeflow_cart_groups";

const INITIAL_CART_GROUPS: CartGroup[] = [
  {
    id: 1,
    title: "이번 주 장보기",
    description: "일주일 식재료",
    createdAt: "오늘",
    store: "스토어플로우 마트",
    products: [
      { id: 90001, name: "서울우유 1L", category: "유제품", price: 2490, quantity: 1, checked: true },
      { id: 90003, name: "계란 30구", category: "신선식품", price: 8990, quantity: 1, checked: true },
      { id: 90007, name: "동원 참치 150g", category: "가공식품", price: 3280, quantity: 2, checked: true },
    ],
  },
  {
    id: 2,
    title: "생활용품",
    description: "집에 필요한 생활용품",
    createdAt: "어제",
    store: "스토어플로우 마트",
    products: [
      { id: 90010, name: "크리넥스 3겹 화장지 30롤", category: "생활용품", price: 12900, quantity: 1, checked: true },
      { id: 90011, name: "섬유유연제 2L", category: "생활용품", price: 9800, quantity: 1, checked: true },
    ],
  },
  {
    id: 3,
    title: "주말 장보기",
    description: "이번 주말에 필요한 상품",
    createdAt: "8월 15일",
    store: "스토어플로우 마트",
    products: [
      { id: 90006, name: "삼겹살 1kg", category: "신선식품", price: 16900, quantity: 2, checked: true },
      { id: 90014, name: "냉동 만두 1.5kg", category: "냉동식품", price: 8900, quantity: 1, checked: false },
    ],
  },
];

function canUseStorage() {
  return typeof window !== "undefined";
}

export function readCartGroups(): CartGroup[] {
  if (!canUseStorage()) {
    return INITIAL_CART_GROUPS;
  }
  try {
    const stored = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!stored) {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(INITIAL_CART_GROUPS));
      return INITIAL_CART_GROUPS;
    }
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : INITIAL_CART_GROUPS;
  } catch {
    return INITIAL_CART_GROUPS;
  }
}

export function writeCartGroups(groups: CartGroup[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(groups));
}

export function addProductToCartGroup(
  groupId: number,
  product: { id: number; name: string; category?: string; price: number; image?: string }
) {
  const groups = readCartGroups();
  const nextGroups = groups.map((group) => {
    if (group.id !== groupId) return group;
    const existing = group.products.find((item) => item.id === product.id);
    if (existing) {
      return {
        ...group,
        products: group.products.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        ),
      };
    }
    return {
      ...group,
      products: [
        ...group.products,
        {
          id: product.id,
          name: product.name,
          category: product.category ?? "상품",
          price: product.price,
          quantity: 1,
          checked: true,
          image: product.image,
        },
      ],
    };
  });
  writeCartGroups(nextGroups);
  syncAddToServerCart(product.id);
  return nextGroups;
}

export function createCartGroup(title: string) {
  const groups = readCartGroups();
  const nextId = groups.length > 0 ? Math.max(...groups.map((g) => g.id)) + 1 : 1;
  const newGroup: CartGroup = {
    id: nextId,
    title,
    description: "새 장보기 목록",
    createdAt: "방금",
    store: "스토어플로우 마트",
    products: [],
  };
  const nextGroups = [...groups, newGroup];
  writeCartGroups(nextGroups);
  return newGroup;
}

/** ✅ 리스트(그룹) 통째로 삭제 — 안에 담긴 상품들도 서버 장바구니에서 같이 제거 */
export function deleteCartGroup(groupId: number) {
  const groups = readCartGroups();
  const target = groups.find((g) => g.id === groupId);
  target?.products.forEach((p) => syncRemoveFromServerCart(p.id));
  const nextGroups = groups.filter((g) => g.id !== groupId);
  writeCartGroups(nextGroups);
  return nextGroups;
}

export function updateCartGroups(updater: (groups: CartGroup[]) => CartGroup[]) {
  const groups = readCartGroups();
  const nextGroups = updater(groups);
  writeCartGroups(nextGroups);
  return nextGroups;
}
