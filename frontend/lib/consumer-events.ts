// lib/consumer-events.ts
// ✅ 이번에 실제 수집 엔드포인트(ConsumerEventController: POST /api/events)를 확인했습니다.
//   지난번까지 가정했던 계약과 다른 점이 세 가지 있어서 전면 수정했습니다.
//
// 1. 이벤트 타입이 6종입니다: SCAN_ADD, SCAN_REMOVE, SEARCH, VIEW, LIST_EDIT, PURCHASE
//    — 예전에 쓰던 CART_ADD / CART_REMOVE / CHECKOUT은 백엔드에 없는 값입니다.
//    CART_ADD·CART_REMOVE는 LIST_EDIT(payload.action으로 구분)에, CHECKOUT은 PURCHASE에 맞춰
//    호출부(search/cart 페이지)를 같이 고쳤습니다.
// 2. occurred_at을 서버가 받지 않습니다 — ConsumerEventService가 Instant.now()로 직접
//    찍습니다. 그래서 "네트워크 끊겨도 원래 발생 시각을 보존한다"는 예전 설계 의도는
//    이 백엔드 기준으로는 의미가 없어졌습니다. 재전송 큐 자체는 여전히 유용해서 남겨뒀지만,
//    시각 보존 목적이 아니라 "실패한 이벤트를 나중에라도 보낸다" 정도로 이해하시면 됩니다.
// 3. 요청 바디가 camelCase입니다 (eventType/sessionId/skuId/locationId/payload) —
//    스네이크케이스가 아닙니다. session_id는 lib/session.ts의 실제 발급 세션을 사용합니다.
"use client";

import { apiFetch } from "./api-client";
import { getOrCreateSessionId } from "./session";

export type ConsumerEventType = "SCAN_ADD" | "SCAN_REMOVE" | "SEARCH" | "VIEW" | "LIST_EDIT" | "PURCHASE";

export interface ConsumerEventInput {
  event_type: ConsumerEventType;
  sku_id?: number;
  location_id?: string;
  payload?: Record<string, unknown>;
}

interface QueuedEvent {
  eventType: ConsumerEventType;
  sessionId: string;
  skuId?: number;
  locationId?: string;
  payload?: string;
}

const QUEUE_KEY = "storeflow_consumer_event_queue";
const ENDPOINT = "/api/events";

function readQueue(): QueuedEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedEvent[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function send(event: QueuedEvent): Promise<boolean> {
  try {
    await apiFetch(ENDPOINT, { method: "POST", body: JSON.stringify(event) });
    return true;
  } catch {
    return false;
  }
}

export async function trackConsumerEvent(input: ConsumerEventInput) {
  const sessionId = await getOrCreateSessionId();

  const event: QueuedEvent = {
    eventType: input.event_type,
    sessionId,
    skuId: input.sku_id,
    locationId: input.location_id,
    payload: input.payload ? JSON.stringify(input.payload) : undefined,
  };

  const ok = await send(event);
  if (!ok) {
    writeQueue([...readQueue(), event]);
  }
}

/** 온라인 복귀·앱 진입 시 큐에 쌓인 이벤트를 재전송 */
export async function flushConsumerEventQueue() {
  const queue = readQueue();
  if (queue.length === 0) return;

  const remaining: QueuedEvent[] = [];
  for (const event of queue) {
    const ok = await send(event);
    if (!ok) remaining.push(event);
  }
  writeQueue(remaining);
}
