// Member cart API: identity is derived by the backend from the JWT.
import { getCurrentConsumerId } from '../state/currentConsumer';
import { memberFetch, getMemberToken } from './memberAuth';
import {guestOptions, guestItems} from './guestCart';

/** @deprecated 로그인 전 기본값 확인용. 실제 요청은 getCurrentConsumerId()를 사용한다. */
export const SIMULATION_CONSUMER_ID = 0;

interface InternalCartAddPayload {
    skuId: number;
    quantity: number;
}

/**
 * 캐릭터가 상품을 집어서 장바구니에 담을 때 호출.
 * groupId가 있으면 해당 저장 리스트에, 없으면 기본 장바구니에 담긴다.
 */
export async function addItemToDbCart(
    skuId: number,
    quantity: number = 1,
    groupId?: number | null
): Promise<void> {
    const consumerId = getCurrentConsumerId();

    console.log(
        '[DB장바구니] 요청 시도:',
        skuId,
        quantity,
        'consumerId=',
        consumerId,
        'groupId=',
        groupId
    );

    const payload: InternalCartAddPayload = {
        skuId,
        quantity,
    };

    const endpoint = groupId != null
        ? `/api/cart/groups/${groupId}/items`
        : '/api/cart';
    const res = await memberFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`POST /api/cart 실패 (${res.status}) ${text}`);
    }

    console.log('[DB장바구니] 성공:', skuId);
}

// -----------------------------------------------------------------------------
// 저장 리스트(cart_group)
// -----------------------------------------------------------------------------

/** 백엔드 CartItemResponse 형태. */
export interface CartGroupItem {
    cartItemId: number;
    skuId: number;
    quantity: number;
    checked: boolean;
}

/** 백엔드 CartGroupResponse 중 시뮬레이션에서 사용하는 값. */
export interface CartGroupOption {
    cartGroupId: number;
    title: string;
    itemCount: number;
    items: CartGroupItem[];
    status: 'ACTIVE' | 'COMPLETED';
}

interface CartGroupDto {
    cartGroupId: number;
    title: string;
    itemCount: number;
    items?: CartGroupItem[];
    status: 'ACTIVE' | 'COMPLETED';
}

/**
 * 현재 계정의 저장 리스트와 각 리스트의 cart_item을 가져온다.
 * CartGroupModal에서 "이번 주 장보기" 등을 눌렀을 때 해당 리스트 상품을 표시할 때 사용한다.
 */
export async function fetchCartGroups(
    _consumerId: number
): Promise<CartGroupOption[]> {
    if (!getMemberToken()) return guestOptions();
    const res = await memberFetch(
        '/api/cart/groups'
    );

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
            `GET /api/cart/groups 실패 (${res.status}) ${text}`
        );
    }

    const data: CartGroupDto[] = await res.json();

    return data.map((group) => ({
        cartGroupId: group.cartGroupId,
        title: group.title,
        itemCount: group.itemCount,
        items: group.items ?? [],
        status: group.status,
    }));
}

// -----------------------------------------------------------------------------
// 현재 DB 장바구니 세션
// -----------------------------------------------------------------------------

interface SessionCartItemDto {
    cartItemId: number;
    skuId: number;
    productName: string;
    priceKrw: number;
    quantity: number;
    checked: boolean;
    subtotal: number;
}

interface SessionCartResponseDto {
    items: SessionCartItemDto[];
    totalAmount: number;
}

/**
 * 시뮬레이션 상단 장바구니 수량 표시 등에 사용하는 DB 장바구니 전체 목록.
 * 이 함수는 checked 여부와 상관없이 /internal/cart/session의 모든 item을 반환한다.
 */
export async function fetchCartFromDb(_consumerId: number): Promise<
    { cartItemId: number; skuId: number; name: string; price: number; stock: number; qty: number; locationId: string }[]
> {
    if (!getMemberToken()) return guestItems();
    const res = await memberFetch(
        '/api/cart/session'
    );

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
            `GET /api/cart/session 실패 (${res.status}) ${text}`
        );
    }

    const data: SessionCartResponseDto = await res.json();

    return data.items.map((item) => ({
        cartItemId: item.cartItemId,
        skuId: item.skuId,
        name: item.productName,
        price: item.priceKrw,
        stock: item.quantity,
        qty: item.quantity,
        // DB cart_item에는 시뮬레이션의 매대 locationId가 없으므로 빈 문자열.
        locationId: '',
    }));
}

/**
 * 매대 팝업의 "빼기" 버튼용.
 *
 * 담긴 수량이 2개 이상이면 수량만 1개 줄이고(PATCH), 1개면 항목 자체를 지운다(DELETE).
 * PATCH는 quantity에 @Min(1)이 걸려 있어 0으로는 못 줄이기 때문에 여기서 갈라줘야 한다.
 */
export async function removeOneFromDbCart(
    cartItemId: number,
    currentQty: number,
): Promise<void> {
    if (currentQty <= 1) {
        const res = await memberFetch(`/api/cart/${cartItemId}`, { method: 'DELETE' });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`DELETE /api/cart/${cartItemId} 실패 (${res.status}) ${text}`);
        }
        return;
    }

    const res = await memberFetch(`/api/cart/${cartItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: currentQty - 1 }),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`PATCH /api/cart/${cartItemId} 실패 (${res.status}) ${text}`);
    }
}

// -----------------------------------------------------------------------------
// 실제 결제 대상(is_checked = true) 표시용
// -----------------------------------------------------------------------------

export interface CheckoutCartItem {
    cartItemId: number;
    skuId: number;
    name: string;
    price: number;
    qty: number;
    checked: boolean;
    subtotal: number;
}

export interface CheckoutCart {
    items: CheckoutCartItem[];
    totalAmount: number;
}

/**
 * DB의 현재 장바구니 세션을 상세 형태로 반환한다.
 *
 * 주의: 여기서는 전체 items를 반환한다.
 * CheckoutTargetModal에서 item.checked === true만 필터링해서 보여준다.
 * 즉 화면의 "결제 대상" 목록은 cart_item.is_checked = true와 정확히 대응한다.
 */
export async function fetchCheckoutCart(
    _consumerId: number
): Promise<CheckoutCart> {
    const res = await memberFetch(
        '/api/cart/session'
    );

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
            `GET /api/cart/session 실패 (${res.status}) ${text}`
        );
    }

    const data: SessionCartResponseDto = await res.json();

    return {
        totalAmount: data.totalAmount ?? 0,
        items: (data.items ?? []).map((item) => ({
            cartItemId: item.cartItemId,
            skuId: item.skuId,
            name: item.productName,
            price: item.priceKrw,
            qty: item.quantity,
            checked: item.checked,
            subtotal: item.subtotal,
        })),
    };
}