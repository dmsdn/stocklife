// lib/consumer-events.ts
// ML_근거.md §2 / DB스키마_초안.md §2.2 계약:
// - SCAN_ADD / CART_ADD / CART_REMOVE / CHECKOUT / SEARCH 를 발생 즉시 개별 전송 (배치 금지)
// - occurred_at은 이벤트 생성 시점에 밀리초까지 고정 캡처 (전송 지연·재시도와 분리)
// - 네트워크 실패 시 로컬 큐에 원래 occurred_at 그대로 보존, 온라인 복귀 시 순서대로 재전송
//
// ⚠ 백엔드 소스 전체를 확인했는데 이 이벤트를 받는 컨트롤러가 없습니다 (consumer_events
//   관련 파일 자체가 없음). 그래서 지금은 계속 실패 → 로컬 큐에 쌓이기만 하고 서버로는
//   전송이 안 됩니다. 큐 적재/재전송 로직 자체는 정상 동작하니, 백엔드에 수집 엔드포인트가
//   생기면 아래 ENDPOINT 값만 바꾸면 바로 붙습니다.
"use client";

import { getSessionId } from "./session";

export type ConsumerEventType = "SCAN_ADD" | "CART_ADD" | "CART_REMOVE" | "CHECKOUT" | "SEARCH";

export interface ConsumerEventInput {
  event_type: ConsumerEventType;
  sku_id?: number;
  barcode?: string;
  location_id?: string;
  meta?: Record<string, unknown>;
}

interface QueuedEvent extends ConsumerEventInput {
  event_id: string;
  occurred_at: string;
  session_id: string | null;
}

const QUEUE_KEY = "storeflow_consumer_event_queue";
// TODO: 백엔드에 수집 엔드포인트 생기면 이 경로로 교체 (현재는 존재하지 않음 — 확인 완료)
const ENDPOINT = "/api/consumer-events";

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
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function trackConsumerEvent(input: ConsumerEventInput) {
  // occurred_at은 전송 성공 여부와 무관하게 지금 이 순간(호출 시점)으로 고정한다.
  const event: QueuedEvent = {
    ...input,
    event_id: crypto.randomUUID(),
    occurred_at: new Date().toISOString(),
    session_id: getSessionId(),
  };

  const ok = await send(event);
  if (!ok) {
    writeQueue([...readQueue(), event]);
  }
}

/** 온라인 복귀·앱 진입 시 큐에 쌓인 이벤트를 원래 occurred_at 그대로 재전송 */
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
