// 시뮬레이션 캐릭터의 "장바구니에 담기" 액션을 실제 DB(cart_group/cart_item)에 반영하기 위한 연동.
// 오른쪽 frontend(iframe)에서 로그인하면 해당 consumer_id 계정으로 전환된다 — currentConsumer.ts 참고.
// /internal/cart는 X-Internal-Service-Key가 필요한 내부 API라 브라우저가 키를 직접 들고 있지 않고,
// vite dev 서버 프록시(vite.config.ts)가 헤더를 대신 붙여주는 구조를 전제로 한다.

import { getCurrentConsumerId } from '../state/currentConsumer';

/** @deprecated 로그인 전 기본값 확인용. 실제 요청은 getCurrentConsumerId()를 사용한다. */
export const SIMULATION_CONSUMER_ID = 1;

interface InternalCartAddPayload {
    consumerId: number;
    skuId: number;
    quantity: number;
    groupId?: number;
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
        consumerId,
        skuId,
        quantity,
        ...(groupId != null ? { groupId } : {}),
    };

    const res = await fetch('/internal/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`POST /internal/cart 실패 (${res.status}) ${text}`);
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
}

interface CartGroupDto {
    cartGroupId: number;
    title: string;
    itemCount: number;
    items?: CartGroupItem[];
}

/**
 * 현재 계정의 저장 리스트와 각 리스트의 cart_item을 가져온다.
 * CartGroupModal에서 "이번 주 장보기" 등을 눌렀을 때 해당 리스트 상품을 표시할 때 사용한다.
 */
export async function fetchCartGroups(
    consumerId: number
): Promise<CartGroupOption[]> {
    const res = await fetch(
        `/internal/cart/groups?consumerId=${consumerId}`
    );

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
            `GET /internal/cart/groups 실패 (${res.status}) ${text}`
        );
    }

    const data: CartGroupDto[] = await res.json();

    return data.map((group) => ({
        cartGroupId: group.cartGroupId,
        title: group.title,
        itemCount: group.itemCount,
        items: group.items ?? [],
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
export async function fetchCartFromDb(consumerId: number): Promise<
    { skuId: number; name: string; price: number; stock: number; qty: number; locationId: string }[]
> {
    const res = await fetch(
        `/internal/cart/session?consumerId=${consumerId}`
    );

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
            `GET /internal/cart/session 실패 (${res.status}) ${text}`
        );
    }

    const data: SessionCartResponseDto = await res.json();

    return data.items.map((item) => ({
        skuId: item.skuId,
        name: item.productName,
        price: item.priceKrw,
        stock: item.quantity,
        qty: item.quantity,
        // DB cart_item에는 시뮬레이션의 매대 locationId가 없으므로 빈 문자열.
        locationId: '',
    }));
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
    consumerId: number
): Promise<CheckoutCart> {
    const res = await fetch(
        `/internal/cart/session?consumerId=${consumerId}`
    );

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
            `GET /internal/cart/session 실패 (${res.status}) ${text}`
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
