// 시뮬레이션 캐릭터의 "장바구니에 담기" 액션을 실제 DB(cart_group/cart_item)에 반영하기 위한 연동.
// 예전엔 로그인 플로우가 없어서 고정된 캐릭터(consumer_id=1, 회원000001)로만 동작했는데,
// 이제 오른쪽 frontend(iframe)에서 로그인하면 그 계정으로 전환된다 — currentConsumer.ts 참고.
// 백엔드의 /internal/cart는 서버 간 호출 전용(X-Internal-Service-Key 필요)이라 브라우저가
// 키를 직접 들고 있으면 안 된다 — 그래서 vite dev 서버 프록시(vite.config.ts)가 헤더를
// 대신 붙여주고, 프론트 코드는 그냥 /internal/cart를 상대경로로 호출한다.

import { getCurrentConsumerId } from '../state/currentConsumer';

/** @deprecated 로그인 전 기본값 확인용으로만 남겨둠. 실제 요청엔 getCurrentConsumerId()를 쓴다. */
export const SIMULATION_CONSUMER_ID = 1; // phone 01099998888, 회원000001

interface InternalCartAddPayload {
    consumerId: number;
    skuId: number;
    quantity: number;
    groupId?: number;
}

/**
 * 캐릭터가 상품을 집어서 장바구니에 담을 때 호출 — 실제 cart_item 테이블에 행이 생긴다.
 * groupId를 넘기면 그 리스트(cart_group)에 담기고, 생략하면 예전처럼 "기본 장바구니"에 담긴다.
 */
export async function addItemToDbCart(skuId: number, quantity: number = 1, groupId?: number | null): Promise<void> {
    const consumerId = getCurrentConsumerId();
    console.log('[DB장바구니] 요청 시도:', skuId, quantity, 'consumerId=', consumerId, 'groupId=', groupId); // 호출 자체가 되는지 확인용 로그

    const payload: InternalCartAddPayload = {
        consumerId,
        skuId,
        quantity,
        ...(groupId ? { groupId } : {}),
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

// 백엔드 GET /internal/cart/groups 응답 형태 (CartGroupResponse 그대로, items는 생략).
export interface CartGroupItem {
    cartItemId: number;
    skuId: number;
    quantity: number;
    checked: boolean;
}

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


/** 상단 헤더의 "담을 리스트 선택" 드롭다운을 채우기 위해 이 계정의 리스트 목록을 가져온다. */
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

    return data.map((g) => ({
        cartGroupId: g.cartGroupId,
        title: g.title,
        itemCount: g.itemCount,
        items: g.items ?? [],
    }));
}

// 백엔드 GET /internal/cart/session 응답 형태 (SessionCartResponse/SessionCartItemResponse 그대로).
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
 * 상단 장바구니 배지가 새로고침 때마다 0개로 보이던 문제 — 지금까지 `cart` state는
 * addItemToDbCart로 DB에 저장은 했지만, 화면에는 한 번도 다시 읽어오지 않고
 * React 로컬 state에만 의존했다. 이 함수로 DB(cart_group/cart_item)에서 실제 값을 읽어온다.
 *
 * DB 쪽엔 매대 좌표(locationId) 개념이 없어서(카메라/AI로 담긴 것까지 다 섞여있음)
 * locationId는 빈 문자열로 채운다 — "이 상품이 어디 매대에 있었는지" 길찾기용으로만 쓰이므로
 * DB에서 막 불러온 항목은 그 기능(찾아가기)은 못 쓰고 수량/합계 표시 용도로만 쓴다.
 */
export async function fetchCartFromDb(consumerId: number): Promise<
    { skuId: number; name: string; price: number; qty: number; locationId: string }[]
> {
    const res = await fetch(`/internal/cart/session?consumerId=${consumerId}`);

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`GET /internal/cart/session 실패 (${res.status}) ${text}`);
    }

    const data: SessionCartResponseDto = await res.json();

    return data.items.map((item) => ({
        skuId: item.skuId,
        name: item.productName,
        price: item.priceKrw,
        qty: item.quantity,
        locationId: '',
    }));
}