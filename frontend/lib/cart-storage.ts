"use client";

import { apiFetch, ApiError, getAccessToken, isLoggedIn, resolveImageUrl } from "./api-client";
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
//   지정한 skuId들을 fromGroup에서 toGroup으로 수량 그대로 옮긴다. 옮긴 뒤엔 원래
//   리스트에서 해당 상품을 완전히 제거한다.
// ✅ 버그 수정(요청 — "상품 목록이 안 옮겨짐", 콘솔에 POST .../items 409 Conflict) —
//   원인: addProductToCartGroup(POST)을 product.quantity만큼 반복 호출하고 있었는데,
//   서버는 POST를 "그 그룹에 그 skuId를 처음 생성"할 때만 쓰고 이미 있으면 409를
//   돌려줌(수량을 늘리는 건 PATCH의 역할). 그래서 수량이 2개 이상인 상품을 옮기면
//   두 번째 반복부터 항상 409가 나서 실패했고, 옮기려는 상품이 대상 리스트에 이미
//   있던 경우엔 첫 시도부터 409가 났다. 이제 대상 리스트에 이미 그 skuId가 있으면
//   PATCH로 수량만 더하고, 없으면 POST 1번으로 만든 뒤(수량 1) 필요하면 그 항목을
//   PATCH로 실제 옮길 수량까지 올린다 — POST를 여러 번 반복하지 않는다.
// ✅ 버그 수정(요청 — "그래도 PATCH .../cart/342에서 409") 및 재수정(요청 — "이미
//   담았다는 건 그만큼 재고가 있다는 거잖아. 스캔으로 이미 내가 들고 있는 물건인데
//   재고 부족으로 깎이면 안 되지") — 처음엔 응답 바디의 "현재 남은 수량은 N개"를
//   읽어 그 수량만큼만 옮기도록 캡을 씌웠는데, 이건 틀린 처리였다. 옮기려는 상품은
//   이미 스캔해서 실제로 손에 들고 있는(=원래 리스트에 이미 담겨 재고가 이미
//   차감/확보된) 것들이라, 재진열대 재고 기준으로 다시 깎이면 사용자가 실제로 들고
//   있는 개수보다 적게 반영되는 오류가 생긴다(수량을 몰래 잃어버리는 셈). 이건
//   프론트에서 "적당히 맞춰서" 해결할 문제가 아니라, 백엔드가 같은 사용자의 그룹→
//   그룹 이동(순수 재분류, 순재고 변화 없음)까지 신규 재고 소비처럼 검증하고 있는
//   게 원인으로 보인다 — 백엔드 쪽 확인이 필요하다(memory: 백엔드 코드는 직접
//   수정하지 않음). 프론트가 할 수 있는 최선은: 이 특정 에러가 나면 수량을 임의로
//   깎아서 재시도하지 않고, 그 상품은 통째로 건너뛰어 원래 리스트에 그대로 남기고
//   (=사용자가 들고 있는 개수를 잃지 않음) 어떤 상품이 왜 안 옮겨졌는지만 warnings로
//   알려준다. 실제로 옮기려면 백엔드가 이 재고 검증을 동일 사용자의 그룹 간 이동에는
//   적용하지 않도록 고쳐야 한다.
const STOCK_LIMIT_RE = /남은 수량은\s*(\d+)\s*개/;

async function patchQuantityOrSkip(
  cartItemId: number,
  desiredQuantity: number
): Promise<{ applied: boolean }> {
  try {
    await syncUpdateServerCart(cartItemId, desiredQuantity);
    return { applied: true };
  } catch (e) {
    const isStockLimit = e instanceof ApiError && e.status === 409 && STOCK_LIMIT_RE.test(e.message);
    if (!isStockLimit) throw e;
    return { applied: false };
  }
}

export async function moveProductsBetweenGroups(
  fromGroupId: number,
  toGroupId: number,
  skuIds: number[]
): Promise<{ groups: CartGroup[]; warnings: { name: string }[]; movedSkuIds: number[] }> {
  const fromGroup = readCartGroups().find((g) => g.id === fromGroupId);
  const toMove = (fromGroup?.products ?? []).filter((p) => skuIds.includes(p.id));
  const warnings: { name: string }[] = [];
  const movedSkuIds = new Set<number>();

  for (const product of toMove) {
    // eslint-disable-next-line no-await-in-loop
    const currentGroups = isLoggedIn() ? await loadCartGroups() : readCartGroups();
    const existing = currentGroups.find((g) => g.id === toGroupId)?.products.find((p) => p.id === product.id);
    let applied = true;

    if (existing) {
      if (isLoggedIn() && existing.cartItemId != null) {
        // eslint-disable-next-line no-await-in-loop
        const result = await patchQuantityOrSkip(existing.cartItemId, existing.quantity + product.quantity);
        applied = result.applied;
      } else {
        updateCartGroups((groups) =>
          groups.map((g) =>
            g.id !== toGroupId
              ? g
              : { ...g, products: g.products.map((p) => (p.id === product.id ? { ...p, quantity: p.quantity + product.quantity } : p)) }
          )
        );
      }
    } else {
      // eslint-disable-next-line no-await-in-loop
      const groupsAfterCreate = await addProductToCartGroup(toGroupId, {
        id: product.id,
        name: product.name,
        category: product.category,
        price: product.price,
        image: product.image,
      });
      if (product.quantity > 1) {
        const created = groupsAfterCreate.find((g) => g.id === toGroupId)?.products.find((p) => p.id === product.id);
        if (isLoggedIn() && created?.cartItemId != null) {
          // eslint-disable-next-line no-await-in-loop
          const result = await patchQuantityOrSkip(created.cartItemId, product.quantity);
          if (!result.applied) {
            // 신규 대상 항목을 취소하고 원래 리스트의 전체 수량을 보존한다.
            await syncRemoveFromServerCart(created.cartItemId);
            applied = false;
          }
        } else if (!isLoggedIn()) {
          updateCartGroups((groups) =>
            groups.map((g) =>
              g.id !== toGroupId
                ? g
                : { ...g, products: g.products.map((p) => (p.id === product.id ? { ...p, quantity: product.quantity } : p)) }
            )
          );
        }
      }
    }

    if (!applied) {
      warnings.push({ name: product.name });
      continue;
    }
    movedSkuIds.add(product.id);
    if (isLoggedIn()) {
      // eslint-disable-next-line no-await-in-loop
      await syncRemoveFromServerCart(product.cartItemId);
    }
  }

  const groups = updateCartGroups((groups) =>
    groups.map((g) =>
      g.id !== fromGroupId ? g : { ...g, products: g.products.filter((p) => !movedSkuIds.has(p.id)) }
    )
  );
  return { groups: isLoggedIn() ? await loadCartGroups() : groups, warnings, movedSkuIds: [...movedSkuIds] };
}
