// 시뮬레이션 캐릭터의 "장바구니에 담기" 액션을 실제 DB(cart_group/cart_item)에 반영하기 위한 연동.
// 시뮬레이션엔 로그인 플로우가 없어서 고정된 캐릭터(consumer_id=1, 회원000001)로 동작한다.
// 백엔드의 /internal/cart는 서버 간 호출 전용(X-Internal-Service-Key 필요)이라 브라우저가
// 키를 직접 들고 있으면 안 된다 — 그래서 vite dev 서버 프록시(vite.config.ts)가 헤더를
// 대신 붙여주고, 프론트 코드는 그냥 /internal/cart를 상대경로로 호출한다.

export const SIMULATION_CONSUMER_ID = 1; // phone 01099998888, 회원000001

interface InternalCartAddPayload {
    consumerId: number;
    skuId: number;
    quantity: number;
}

/** 캐릭터가 상품을 집어서 장바구니에 담을 때 호출 — 실제 cart_item 테이블에 행이 생긴다. */
export async function addItemToDbCart(skuId: number, quantity: number = 1): Promise<void> {
    console.log('[DB장바구니] 요청 시도:', skuId, quantity); // 호출 자체가 되는지 확인용 로그

    const payload: InternalCartAddPayload = {
        consumerId: SIMULATION_CONSUMER_ID,
        skuId,
        quantity,
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