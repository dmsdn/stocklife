// 쇼핑목록(9~11번 요청): 상품 검색으로 담기 → 순서 변경 → 순서대로 네비게이션.
// 회원 전용 DB 장바구니(cart_group/cart_item, 백엔드에 이미 있음)와는 별개다 — 이 게임엔
// 로그인 플로우가 없어서, "장보기 계획" 성격의 쇼핑목록은 우선 localStorage에 저장해두고
// 상품 검색/위치 조회만 실제 백엔드 API를 그대로 쓴다. 로그인 붙이면 그때 cart_group에
// 얹는 식으로 넓히면 된다(12번 "백엔드 API 적극 활용" 다음 단계).

const STORAGE_KEY = 'storeflow_shopping_list';

export interface ShoppingListItem {
  skuId: number;
  name: string;
  price: number;
  floorNo: number;
  x: number;
  y: number;
  locationId: string;
  zoneId: string;
}

export interface ProductSearchResult {
  skuId: number;
  name: string;
  price: number;
  categoryL1: string;
  categoryL2: string;
}

export function loadShoppingList(): ShoppingListItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ShoppingListItem[]) : [];
  } catch {
    return [];
  }
}

export function saveShoppingList(items: ShoppingListItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // 저장 실패(용량 초과 등)해도 화면 상태는 그대로 유지 — 다음 새로고침 전까지는 정상 동작.
  }
}

interface ProductSearchDto {
  skuId: number;
  name: string;
  priceKrw: number;
  categoryL1: string;
  categoryL2: string;
  discontinued: boolean;
}

export async function searchProducts(keyword: string): Promise<ProductSearchResult[]> {
  if (!keyword.trim()) return [];
  const res = await fetch(`/api/products/search?keyword=${encodeURIComponent(keyword)}`);
  if (!res.ok) throw new Error(`GET /api/products/search 실패 (${res.status})`);
  const items: ProductSearchDto[] = await res.json();
  return items
    .filter((it) => !it.discontinued)
    .slice(0, 20)
    .map((it) => ({
      skuId: it.skuId,
      name: it.name,
      price: it.priceKrw,
      categoryL1: it.categoryL1,
      categoryL2: it.categoryL2,
    }));
}

interface InventoryItemDto {
  skuId: number;
  locationId: string;
  zoneId: string;
  tierRole: 'PICK' | 'BULK';
  floorNo: number;
  x: number;
  y: number;
  qty: number;
}

/** 상품이 실제로 진열된(고객이 집을 수 있는 PICK 우선) 매대 위치를 찾는다. */
export async function resolveProductLocation(skuId: number): Promise<InventoryItemDto | null> {
  const res = await fetch(`/api/products/${skuId}/inventory`);
  if (!res.ok) return null;
  const rows: InventoryItemDto[] = await res.json();
  if (rows.length === 0) return null;
  return rows.find((r) => r.tierRole === 'PICK') ?? rows[0];
}
