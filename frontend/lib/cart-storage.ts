// lib/cart-storage.ts
// ⚠ 저장(saved) 화면 전용 로컬 목업 스토리지. 실제 백엔드 장바구니(GET /api/cart)와는
//   별개입니다 — 지금은 검색·스캔·저장 화면이 전부 이 스토리지 하나를 공유합니다.
"use client";

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

export function updateCartGroups(updater: (groups: CartGroup[]) => CartGroup[]) {
  const groups = readCartGroups();
  const nextGroups = updater(groups);
  writeCartGroups(nextGroups);
  return nextGroups;
}
