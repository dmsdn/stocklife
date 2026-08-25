"use client";

import { apiFetch, isLoggedIn } from "./api-client";

export interface CartProduct {
  id: number; // skuId
  cartItemId?: number; // 로그인 회원 DB cart_item PK
  name: string;
  category: string;
  price: number;
  quantity: number;
  checked: boolean;
  image?: string;
}

export interface CartGroup {
  id: number; // 비회원: local id / 회원: cart_group_id
  title: string;
  description: string;
  createdAt: string;
  store: string;
  products: CartProduct[];
}

interface ServerCartItem {
  cartItemId: number;
  skuId: number;
  quantity: number;
  checked: boolean;
}

interface ServerCartGroup {
  cartGroupId: number;
  title: string;
  description: string | null;
  createdAt: string | null;
  items: ServerCartItem[];
}

interface ProductDetail {
  skuId: number;
  name: string;
  priceKrw: number;
  imageUrl?: string | null;
  categoryL1?: string | null;
}

const CART_STORAGE_KEY = "storeflow_cart_groups";
const MEMBER_CACHE_KEY = "storeflow_member_cart_cache";

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

function canUseStorage() { return typeof window !== "undefined"; }

function readGuestGroups(): CartGroup[] {
  if (!canUseStorage()) return INITIAL_CART_GROUPS;
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

function readMemberCache(): CartGroup[] {
  if (!canUseStorage()) return [];
  try {
    const value = window.sessionStorage.getItem(MEMBER_CACHE_KEY);
    return value ? JSON.parse(value) : [];
  } catch { return []; }
}

function writeMemberCache(groups: CartGroup[]) {
  if (canUseStorage()) window.sessionStorage.setItem(MEMBER_CACHE_KEY, JSON.stringify(groups));
}

/** 동기 UI 코드용. 회원 데이터의 영구 원본은 DB이고, 여기 값은 sessionStorage UI 캐시일 뿐이다. */
export function readCartGroups(): CartGroup[] {
  return isLoggedIn() ? readMemberCache() : readGuestGroups();
}

export function writeCartGroups(groups: CartGroup[]) {
  if (!canUseStorage()) return;
  if (isLoggedIn()) writeMemberCache(groups);
  else window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(groups));
}

async function hydrateServerGroups(serverGroups: ServerCartGroup[]): Promise<CartGroup[]> {
  const skuIds = [...new Set(serverGroups.flatMap((g) => g.items.map((i) => i.skuId)))];
  const details = await Promise.all(
    skuIds.map((skuId) => apiFetch<ProductDetail>(`/api/products/${skuId}`, { auth: false }).catch(() => null))
  );
  const productMap = new Map<number, ProductDetail>();
  details.forEach((p) => p && productMap.set(p.skuId, p));

  return serverGroups.map((g) => ({
    id: g.cartGroupId,
    title: g.title,
    description: g.description ?? "",
    createdAt: g.createdAt ? new Date(g.createdAt).toLocaleDateString("ko-KR") : "",
    store: "스토어플로우 마트",
    products: g.items.map((i) => {
      const p = productMap.get(i.skuId);
      return {
        id: i.skuId,
        cartItemId: i.cartItemId,
        name: p?.name ?? `상품 ${i.skuId}`,
        category: p?.categoryL1 ?? "상품",
        price: p?.priceKrw ?? 0,
        quantity: i.quantity,
        checked: i.checked,
        image: p?.imageUrl ?? undefined,
      };
    }),
  }));
}

/** 로그인 회원은 항상 DB를 다시 읽어오고, 비회원은 localStorage를 읽는다. */
export async function loadCartGroups(): Promise<CartGroup[]> {
  if (!isLoggedIn()) return readGuestGroups();

  // 로그인은 성공했지만 네트워크 문제로 직전 승계가 실패했을 수 있다.
  // localStorage가 남아 있으면 DB 조회 전에 승계를 한 번 더 시도한다.
  if (canUseStorage()) {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (raw) {
      try {
        const guestGroups = JSON.parse(raw);
        if (Array.isArray(guestGroups) && guestGroups.length > 0) {
          await apiFetch("/api/cart/migrate", { method: "POST", body: JSON.stringify({ groups: guestGroups }) });
        }
        window.localStorage.removeItem(CART_STORAGE_KEY);
      } catch {
        // 승계 실패 시 절대 삭제하지 않는다. 다음 load/login에서 다시 시도한다.
      }
    }
  }

  const serverGroups = await apiFetch<ServerCartGroup[]>("/api/cart/groups");
  const groups = await hydrateServerGroups(serverGroups);
  writeMemberCache(groups);
  return groups;
}

/** 로그인 성공 직후 호출. DB 저장이 성공한 경우에만 비회원 localStorage를 삭제한다. */
export async function migrateGuestCartToAccount(): Promise<CartGroup[]> {
  if (!canUseStorage() || !isLoggedIn()) return [];
  const raw = window.localStorage.getItem(CART_STORAGE_KEY);
  const guestGroups: CartGroup[] = raw ? JSON.parse(raw) : [];

  if (guestGroups.length > 0) {
    await apiFetch("/api/cart/migrate", {
      method: "POST",
      body: JSON.stringify({ groups: guestGroups }),
    });
    window.localStorage.removeItem(CART_STORAGE_KEY);
  }

  window.sessionStorage.removeItem(MEMBER_CACHE_KEY);
  return loadCartGroups();
}

export async function addProductToCartGroup(
  groupId: number,
  product: { id: number; name: string; category?: string; price: number; image?: string }
): Promise<CartGroup[]> {
  if (!isLoggedIn()) {
    const groups = readGuestGroups();
    const next = groups.map((group) => {
      if (group.id !== groupId) return group;
      const existing = group.products.find((item) => item.id === product.id);
      if (existing) {
        return { ...group, products: group.products.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) };
      }
      return { ...group, products: [...group.products, { id: product.id, name: product.name, category: product.category ?? "상품", price: product.price, quantity: 1, checked: true, image: product.image }] };
    });
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  await apiFetch(`/api/cart/groups/${groupId}/items`, {
    method: "POST",
    body: JSON.stringify({ skuId: product.id, quantity: 1 }),
  });
  return loadCartGroups();
}

export async function createCartGroup(title: string): Promise<CartGroup> {
  if (!isLoggedIn()) {
    const groups = readGuestGroups();
    const nextId = groups.length > 0 ? Math.max(...groups.map((g) => g.id)) + 1 : 1;
    const group: CartGroup = { id: nextId, title, description: "새 장보기 목록", createdAt: "방금", store: "스토어플로우 마트", products: [] };
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([...groups, group]));
    return group;
  }

  const created = await apiFetch<ServerCartGroup>("/api/cart/groups", {
    method: "POST",
    body: JSON.stringify({ title, description: "새 장보기 목록" }),
  });
  await loadCartGroups();
  return { id: created.cartGroupId, title: created.title, description: created.description ?? "", createdAt: "방금", store: "스토어플로우 마트", products: [] };
}

export async function deleteCartGroup(groupId: number): Promise<CartGroup[]> {
  if (!isLoggedIn()) {
    const next = readGuestGroups().filter((g) => g.id !== groupId);
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
    return next;
  }
  await apiFetch(`/api/cart/groups/${groupId}`, { method: "DELETE" });
  return loadCartGroups();
}

/** 화면 즉시 반영용. 회원일 때는 sessionStorage 캐시만 수정하며 DB 반영은 아래 sync 함수가 담당한다. */
export function updateCartGroups(updater: (groups: CartGroup[]) => CartGroup[]): CartGroup[] {
  const next = updater(readCartGroups());
  writeCartGroups(next);
  return next;
}

export async function syncUpdateServerCart(cartItemId: number | undefined, quantity?: number, checked?: boolean) {
  if (!isLoggedIn() || cartItemId == null) return;
  await apiFetch(`/api/cart/${cartItemId}`, {
    method: "PATCH",
    body: JSON.stringify({ ...(quantity != null ? { quantity } : {}), ...(checked != null ? { checked } : {}) }),
  });
}

export async function syncRemoveFromServerCart(cartItemId: number | undefined) {
  if (!isLoggedIn() || cartItemId == null) return;
  await apiFetch(`/api/cart/${cartItemId}`, { method: "DELETE" });
}
