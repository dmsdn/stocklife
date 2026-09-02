// 시뮬레이션 캐릭터가 지금 "누구"로 동작 중인지 보관하는 최소 상태.
// React 트리 밖(예: cart.ts 같은 순수 함수)에서도 값을 읽어야 해서 컨텍스트 대신
// 모듈 전역 변수 + 구독자 리스트로 간단히 구현한다.
//
// 기본값은 기존 하드코딩 계정(consumerId=1, 01099998888) — frontend에서 로그인하기 전까지는
// 지금까지와 동일하게 동작한다(하위 호환).
const DEFAULT_CONSUMER_ID = 1; // phone 01099998888, 회원000001

let currentConsumerId: number = DEFAULT_CONSUMER_ID;
let currentConsumerName: string | null = null;
let currentConsumerPhone: string | null = null;

type Listener = (consumerId: number, name: string | null, phoneNumber: string | null) => void;
const listeners = new Set<Listener>();

export function getCurrentConsumerId(): number {
    return currentConsumerId;
}

export function getCurrentConsumerName(): string | null {
    return currentConsumerName;
}

export function getCurrentConsumerPhone(): string | null {
    return currentConsumerPhone;
}

export function setCurrentConsumer(consumerId: number, name: string | null, phoneNumber: string | null = null): void {
    currentConsumerId = consumerId;
    currentConsumerName = name;
    currentConsumerPhone = phoneNumber;
    listeners.forEach((listener) => listener(currentConsumerId, currentConsumerName, currentConsumerPhone));
}

/** frontend에서 로그아웃했을 때 — 기본 캐릭터(고정 계정, 01099998888)로 되돌린다. */
export function resetCurrentConsumerToDefault(): void {
    setCurrentConsumer(DEFAULT_CONSUMER_ID, null, null);
}

/** UI(App.tsx 등)에서 현재 로그인 캐릭터가 바뀔 때마다 화면을 갱신하고 싶을 때 구독. */
export function subscribeCurrentConsumer(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}