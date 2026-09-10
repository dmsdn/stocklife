"use client";

import { apiFetch, getAccessToken, isLoggedIn, resolveImageUrl } from "./api-client";
import { notifySimulationCartChanged } from "./simulation-bridge";

export interface CartProduct {
  id: number; // skuId
  cartItemId?: number; // 로그인 회원 DB cart_item PK
  name: string;
  category: string;
  price: number;
  quantity: number;
  checked: boolean;
  /** ✅ 신규(요청 — "리스트=F, 실제 스캔=T") — 백엔드가 scanned_at을 노출하면 채워짐.
   *  null/undefined면 아직 스캔 안 한 계획 상태. 비회원은 서버 저장이 없어 항상 null. */
  scannedAt?: string | null;
  image?: string;
}

export interface CartGroup {
  id: number; // 비회원: local id / 회원: cart_group_id
  title: string;
  description: string;
  createdAt: string;
  /** ✅ 장 볼 날짜(선택) — 백엔드 CartGroup.shoppingDate. "yyyy-MM-dd" 또는 없으면 null. */
  shoppingDate: string | null;
  /** ✅ 마지막 수정 시각 — 리스트 박스에 표시용. 백엔드가 있으면 그 값, 게스트는 클라이언트 시각으로 근사. */
  updatedAt: string | null;
  store: string;
  products: CartProduct[];
  /** ✅ 신규 — 백엔드 CartGroup.status(ACTIVE|COMPLETED). 결제 완료된 리스트는 서버가
   *  COMPLETED로 잠급니다(수정 API 자체가 거부됨). 게스트(로컬)는 이 개념이 없어 항상 undefined. */
  status?: "ACTIVE" | "COMPLETED";
}

interface ServerCartItem {
  cartItemId: number;
  skuId: number;
  quantity: number;
  checked: boolean;
  /** ✅ 신규 — 백엔드 CartItemResponse.scannedAt (ISO 문자열, 없으면 null) */
  scannedAt?: string | null;
}

interface ServerCartGroup {
  cartGroupId: number;
  title: string;
  description: string | null;
  createdAt: string | null;
  shoppingDate: string | null;
  updatedAt: string | null;
  items: ServerCartItem[];
  status?: "ACTIVE" | "COMPLETED";
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
const MIGRATION_ATTEMPTED_KEY = "storeflow_cart_migration_attempted";

// ⚠ 수정(2026-09) — 예전엔 여기 "이번 주 장보기"/"생활용품"/"주말 장보기" 데모 리스트 3개를
//   두고, localStorage가 비어있으면(=첫 방문) 자동으로 심어뒀습니다. 그런데 이 함수가 홈
//   화면 등 거의 모든 화면에서 호출되다 보니, 비회원으로 앱을 열기만 해도 조용히 심어졌고,
//   나중에 로그인하면 그 데모 리스트 3개가 /api/cart/migrate로 그대로 회원 DB에 실제
//   CartGroup으로 승계돼버렸습니다 — "직접 추가하지 않은 리스트가 계속 생긴다"의 원인.
//   이제 비회원은 아무것도 안 만든 상태(빈 배열)로 시작합니다.
function canUseStorage() { return typeof window !== "undefined"; }

// ⚠ 위 버그가 고쳐지기 전에 이미 브라우저에 심어진 적 있는 사용자 대비 — 상품이 하나도
// 없는 빈 리스트는 사용자가 직접 만든 게 아닐 가능성이 높아 승계 대상에서 제외한다.
// (사용자가 정말로 빈 리스트를 만들었다가 로그인하는 극히 드문 경우는 다시 만들면 됨)
function stripUntouchedGroups(groups: CartGroup[]): CartGroup[] {
  return groups.filter((g) => g.products.length > 0);
}

function readGuestGroups(): CartGroup[] {
  if (!canUseStorage()) return [];
  try {
    const stored = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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

/** ✅ 버그 수정(요청 — "리스트는 회원마다 본인 것만 보이는 게 맞는지 확인해") — 로그인 중
 *  readCartGroups()가 동기 폴백으로 쓰는 이 세션 캐시가, 로그아웃할 때 지워지지 않고
 *  있었습니다. 같은 브라우저 탭에서 A가 로그아웃하고 B가 로그인하면(탭을 안 닫은 채로),
 *  네트워크가 느리거나 loadCartGroups()가 실패해서 readCartGroups() 폴백을 타는 순간
 *  A의 리스트 캐시가 그대로 B 화면에 잠깐 보일 수 있는 구조였습니다 — logout()에서
 *  이 함수를 불러서 지워야 합니다.*/
export function clearMemberCartCache() {
  if (canUseStorage()) window.sessionStorage.removeItem(MEMBER_CACHE_KEY);
}

/** 동기 UI 코드용. 회원 데이터의 영구 원본은 DB이고, 여기 값은 sessionStorage UI 캐시일 뿐이다. */
export function readCartGroups(): CartGroup[] {
  return isLoggedIn() ? readMemberCache() : readGuestGroups();
}

export function writeCartGroups(groups: CartGroup[]) {
  if (!canUseStorage()) return;
  if (isLoggedIn()) writeMemberCache(groups);
  else { window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(groups)); notifySimulationCartChanged(); }
}

async function hydrateServerGroups(serverGroups: ServerCartGroup[]): Promise<CartGroup[]> {
  const skuIds = [...new Set(serverGroups.flatMap((g) => g.items.map((i) => i.skuId)))];
  // ⚠ 수정(2026-09) — skuId마다 GET /api/products/{skuId}를 따로 호출(N+1)하던 걸,
  //   이미 있던 배치 조회 API(GET /api/products/by-skus)로 교체. 리스트에 상품이
  //   20개면 예전엔 요청이 20번 나갔는데 이제 1번이면 됨 — "DB가 느리게 불러와지는" 것처럼
  //   보이던 주요 원인 중 하나(product-location.ts의 재고 배치 조회와 동일한 패턴).
  const details =
    skuIds.length > 0
      ? await apiFetch<ProductDetail[]>(`/api/products/by-skus?skuIds=${skuIds.join(",")}`, { auth: false }).catch(
          () => [] as ProductDetail[]
        )
      : [];
  const productMap = new Map<number, ProductDetail>();
  details.forEach((p) => p && productMap.set(p.skuId, p));

  return serverGroups.map((g) => ({
    id: g.cartGroupId,
    title: g.title,
    description: g.description ?? "",
    createdAt: g.createdAt ? new Date(g.createdAt).toLocaleDateString("ko-KR") : "",
    shoppingDate: g.shoppingDate ?? null,
    updatedAt: g.updatedAt ?? null,
    store: "스토어플로우 마트",
    status: g.status,
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
        scannedAt: i.scannedAt ?? null,
        image: resolveImageUrl(p?.imageUrl) ?? undefined,
      };
    }),
  }));
}

/** 로그인 회원은 항상 DB를 다시 읽어오고, 비회원은 localStorage를 읽는다. */
export async function loadCartGroups(): Promise<CartGroup[]> {
  if (!isLoggedIn()) {
    const owner = getAccessToken();
    const ids = [...new Set(readGuestGroups().flatMap(g => g.products.map(p => p.id)))];
    const details = ids.length
      ? await apiFetch<ProductDetail[]>(`/api/products/by-skus?skuIds=${ids.join(",")}`, { auth: false }).catch(() => [])
      : [];
    if (getAccessToken() !== owner) throw new Error("로그인 상태가 변경되었습니다.");
    const byId = new Map(details.map(p => [p.skuId, p]));
    // 이미지 조회 도중 바뀐 수량·삭제·추가를 과거 목록으로 덮지 않는다.
    const groups = readGuestGroups().map(g => ({ ...g, products: g.products.map(p => ({
      ...p, image: resolveImageUrl(byId.get(p.id)?.imageUrl ?? p.image) ?? undefined,
    })) }));
    writeCartGroups(groups);
    return groups;
  }
  const requestToken = getAccessToken();

  const serverGroups = await apiFetch<ServerCartGroup[]>("/api/cart/groups");
  const groups = await hydrateServerGroups(serverGroups);
  if (getAccessToken() !== requestToken) {
    throw new Error("로그인 상태가 변경되었습니다. 리스트를 다시 불러와 주세요.");
  }
  writeMemberCache(groups);
  return groups;
}

/** 로그인 성공 직후 호출. DB 저장이 성공한 경우에만 비회원 localStorage를 삭제한다. */
export async function migrateGuestCartToAccount(): Promise<CartGroup[]> {
  if (!canUseStorage() || !isLoggedIn()) return [];

  // login()에서 매 로그인마다 이 키를 초기화한 뒤 여기로 들어온다.
  // migrate 요청을 먼저 attempted 처리해 loadCartGroups()가 중복 요청하지 않게 한다.
  window.sessionStorage.setItem(MIGRATION_ATTEMPTED_KEY, "1");

  const migrationOwner = getAccessToken();
  const raw = window.localStorage.getItem(CART_STORAGE_KEY);
  const parsedRaw = raw ? JSON.parse(raw) : [];
  const guestGroups: CartGroup[] = stripUntouchedGroups(Array.isArray(parsedRaw) ? parsedRaw : []);

  if (guestGroups.length > 0) {
    await apiFetch("/api/cart/migrate", {
      method: "POST",
      body: JSON.stringify({ groups: guestGroups }),
    });
    if (getAccessToken() !== migrationOwner) throw new Error("로그인 상태가 변경되었습니다.");
    // DB 승계가 성공했을 때만 비회원 장바구니를 삭제한다.
    window.localStorage.removeItem(CART_STORAGE_KEY);
  }

  window.sessionStorage.removeItem(MEMBER_CACHE_KEY);
  return loadCartGroups();
}

/** 새 로그인 시 승계를 다시 한 번 시도할 수 있도록 세션 플래그를 초기화한다. */
export function resetCartMigrationAttempt(): void {
  if (!canUseStorage()) return;
  window.sessionStorage.removeItem(MIGRATION_ATTEMPTED_KEY);
}

// ✅ 수정(요청 — "리스트에 담을 때는 F, 실제 바코드 찍으면 T") — scanned 옵션 추가.
//   백엔드 요청사항(docs/scanned-at-redesign-backend-request.md)이 반영되면 바로 동작
//   하도록 미리 연결해둠 — 아직 백엔드에 이 필드가 없으면 그냥 무시되니 지금 당장은
//   무해합니다(검색/계획 추가는 scanned 생략 = 기존과 동일하게 F).
export async function addProductToCartGroup(
  groupId: number,
  product: { id: number; name: string; category?: string; price: number; image?: string },
  scanned?: boolean
): Promise<CartGroup[]> {
  if (!isLoggedIn()) {
    const groups = readGuestGroups();
    const next = groups.map((group) => {
      if (group.id !== groupId) return group;
      const existing = group.products.find((item) => item.id === product.id);
      if (existing) {
        return { ...group, products: group.products.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) };
      }
      return { ...group, products: [...group.products, { id: product.id, name: product.name, category: product.category ?? "상품", price: product.price, quantity: 1, checked: true, image: resolveImageUrl(product.image) }] };
    });
    writeCartGroups(next);
    return next;
  }

  await apiFetch(`/api/cart/groups/${groupId}/items`, {
    method: "POST",
    body: JSON.stringify({ skuId: product.id, quantity: 1, ...(scanned != null ? { scanned } : {}) }),
  });
  notifySimulationCartChanged();
  return loadCartGroups();
}

const QUICK_CART_TITLE = "빠른 장보기";

// ✅ 신규 — "리스트 없이 시작하기"를 누를 때마다 새 그룹을 만들면, 예전 게스트 데모 리스트
//   버그와 똑같은 문제(직접 안 만든 리스트가 계속 쌓임)가 생긴다. 이미 만들어둔(아직 결제 안
//   끝난) "빠른 장보기" 그룹이 있으면 그걸 재사용하고, 없을 때만 하나 만든다. 리스트를
//   선택하지 않고 바로 스캔하려는 경우에도 이 함수로 뒤에서 조용히 그룹을 마련한다.
export async function getOrCreateQuickCartGroup(): Promise<CartGroup> {
  const groups = await loadCartGroups();
  const existing = groups.find((g) => g.title === QUICK_CART_TITLE && g.status !== "COMPLETED");
  if (existing) return existing;
  return createCartGroup(QUICK_CART_TITLE);
}

export async function createCartGroup(title: string, shoppingDate?: string | null): Promise<CartGroup> {
  if (!isLoggedIn()) {
    const groups = readGuestGroups();
    const nextId = groups.length > 0 ? Math.max(...groups.map((g) => g.id)) + 1 : 1;
    const now = new Date().toISOString();
    const group: CartGroup = {
      id: nextId,
      title,
      description: "새 장보기 목록",
      createdAt: "방금",
      shoppingDate: shoppingDate ?? null,
      updatedAt: now,
      store: "스토어플로우 마트",
      products: [],
    };
    writeCartGroups([...groups, group]);
    return group;
  }

  const created = await apiFetch<ServerCartGroup>("/api/cart/groups", {
    method: "POST",
    body: JSON.stringify({ title, description: "새 장보기 목록", shoppingDate: shoppingDate ?? null }),
  });
  await loadCartGroups();
  notifySimulationCartChanged();
  return {
    id: created.cartGroupId,
    title: created.title,
    description: created.description ?? "",
    createdAt: "방금",
    shoppingDate: created.shoppingDate ?? null,
    updatedAt: created.updatedAt ?? null,
    store: "스토어플로우 마트",
    products: [],
  };
}

// ✅ 신규 — PATCH /api/cart/groups/{groupId}(백엔드에 이미 있던 API, 제목/설명/장 볼 날짜
//   수정 지원)로 리스트 생성 후에도 날짜를 나중에 추가·수정할 수 있게 함.
export async function updateCartGroupInfo(
  groupId: number,
  patch: { title?: string; shoppingDate?: string | null }
): Promise<CartGroup[]> {
  if (!isLoggedIn()) {
    return updateCartGroups((groups) =>
      groups.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              ...(patch.title !== undefined ? { title: patch.title } : {}),
              ...(patch.shoppingDate !== undefined ? { shoppingDate: patch.shoppingDate } : {}),
            }
      )
    );
  }

  await apiFetch(`/api/cart/groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  notifySimulationCartChanged();
  return loadCartGroups();
}

export async function deleteCartGroup(groupId: number): Promise<CartGroup[]> {
  if (!isLoggedIn()) {
    const next = readGuestGroups().filter((g) => g.id !== groupId);
    writeCartGroups(next);
    return next;
  }
  await apiFetch(`/api/cart/groups/${groupId}`, { method: "DELETE" });
  notifySimulationCartChanged();
  return loadCartGroups();
}

/** 화면 즉시 반영용. 회원일 때는 sessionStorage 캐시만 수정하며 DB 반영은 아래 sync 함수가 담당한다. */
export function updateCartGroups(updater: (groups: CartGroup[]) => CartGroup[]): CartGroup[] {
  const next = updater(readCartGroups());
  writeCartGroups(next);
  return next;
}

// ✅ 수정(요청 — "T가 된 뒤에 담은 개수에 따라 결제") — scanned 파라미터 추가. 수량과는
//   완전히 독립적으로 scanned_at만 갱신(백엔드 요청사항 문서 참고). 이미 리스트에 있던
//   상품을 매장에서 스캔했을 때, 수량은 안 건드리고 이걸로만 F→T 전환.
export async function syncUpdateServerCart(cartItemId: number | undefined, quantity?: number, checked?: boolean, scanned?: boolean) {
  if (!isLoggedIn() || cartItemId == null) return;
  await apiFetch(`/api/cart/${cartItemId}`, {
    method: "PATCH",
    body: JSON.stringify({ ...(quantity != null ? { quantity } : {}), ...(checked != null ? { checked } : {}), ...(scanned != null ? { scanned } : {}) }),
  });
  notifySimulationCartChanged();
}

export async function syncRemoveFromServerCart(cartItemId: number | undefined) {
  if (!isLoggedIn() || cartItemId == null) return;
  await apiFetch(`/api/cart/${cartItemId}`, { method: "DELETE" });
  notifySimulationCartChanged();
}

// ✅ 신규 — 스캔 화면에서 다른 리스트로 옮길 때 "이미 찍은 상품을 가져갈지" 선택한 경우용.
//   지정한 skuId들을 fromGroup에서 toGroup으로 수량 그대로 옮긴다(있는 만큼 addProductToCartGroup을
//   반복 호출 — 이 함수가 항상 수량 1씩 늘리는 방식이라 그대로 재사용). 옮긴 뒤엔 원래
//   리스트에서 해당 상품을 완전히 제거한다.
export async function moveProductsBetweenGroups(
  fromGroupId: number,
  toGroupId: number,
  skuIds: number[]
): Promise<CartGroup[]> {
  const fromGroup = readCartGroups().find((g) => g.id === fromGroupId);
  const toMove = (fromGroup?.products ?? []).filter((p) => skuIds.includes(p.id));

  for (const product of toMove) {
    for (let i = 0; i < product.quantity; i++) {
      // eslint-disable-next-line no-await-in-loop
      await addProductToCartGroup(toGroupId, {
        id: product.id,
        name: product.name,
        category: product.category,
        price: product.price,
        image: product.image,
      });
    }
    if (isLoggedIn()) {
      // eslint-disable-next-line no-await-in-loop
      await syncRemoveFromServerCart(product.cartItemId);
    }
  }

  return updateCartGroups((groups) =>
    groups.map((g) =>
      g.id !== fromGroupId ? g : { ...g, products: g.products.filter((p) => !skuIds.includes(p.id)) }
    )
  );
}
