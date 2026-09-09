// src/state/currentConsumer.ts

const DEFAULT_CONSUMER_ID = 0; // 비로그인. 권한은 서버가 JWT로 검증한다.

const STORAGE_KEY = "storeflow-simulation-consumer";

interface CurrentConsumer {
    consumerId: number;
    name: string | null;
    phoneNumber: string | null;
}

type ConsumerListener = (consumerId: number) => void;

const listeners = new Set<ConsumerListener>();

function loadStoredConsumer(): CurrentConsumer {
    if (typeof window === "undefined") {
        return {
            consumerId: DEFAULT_CONSUMER_ID,
            name: null,
            phoneNumber: null,
        };
    }

    try {
        const raw = localStorage.getItem(STORAGE_KEY);

        if (!raw) {
            return {
                consumerId: DEFAULT_CONSUMER_ID,
                name: null,
                phoneNumber: null,
            };
        }

        const parsed = JSON.parse(raw);

        if (typeof parsed.consumerId !== "number") {
            throw new Error("invalid consumerId");
        }

        return {
            consumerId: parsed.consumerId,
            name: parsed.name ?? null,
            phoneNumber: parsed.phoneNumber ?? null,
        };
    } catch (error) {
        console.warn(
            "[currentConsumer] 저장된 사용자 정보 복원 실패:",
            error
        );

        return {
            consumerId: DEFAULT_CONSUMER_ID,
            name: null,
            phoneNumber: null,
        };
    }
}

let currentConsumer: CurrentConsumer = loadStoredConsumer();

function saveCurrentConsumer(): void {
    if (typeof window === "undefined") return;

    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(currentConsumer)
        );
    } catch (error) {
        console.warn(
            "[currentConsumer] 사용자 정보 저장 실패:",
            error
        );
    }
}

export function getCurrentConsumerId(): number {
    return currentConsumer.consumerId;
}

export function getCurrentConsumerName(): string | null {
    return currentConsumer.name;
}

export function getCurrentConsumerPhone(): string | null {
    return currentConsumer.phoneNumber;
}

export function setCurrentConsumer(
    consumerId: number,
    name: string | null = null,
    phoneNumber: string | null = null
): void {
    currentConsumer = {
        consumerId,
        name,
        phoneNumber,
    };

    // 새로고침해도 유지
    saveCurrentConsumer();

    console.log(
        "[currentConsumer] 로그인 사용자 변경:",
        currentConsumer
    );

    listeners.forEach((listener) => {
        listener(consumerId);
    });
}

export function resetCurrentConsumerToDefault(): void {
    currentConsumer = {
        consumerId: DEFAULT_CONSUMER_ID,
        name: null,
        phoneNumber: null,
    };

    if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
    }

    console.log("[currentConsumer] 기본 사용자로 복귀");

    listeners.forEach((listener) => {
        listener(DEFAULT_CONSUMER_ID);
    });
}

export function subscribeCurrentConsumer(
    listener: ConsumerListener
): () => void {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}