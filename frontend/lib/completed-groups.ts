// lib/completed-groups.ts
// ⚠ 백엔드 cart_group 테이블에 "결제 완료" 상태를 나타내는 컬럼이 없습니다(CartGroup
//   엔티티엔 title/description/shoppingDate뿐). 그래서 결제 완료 후 그 리스트를 읽기전용으로
//   바꾸는 기준을 지금은 이 로컬 플래그로 판단합니다 — 다른 기기/브라우저에서 결제했다면
//   이 기기에서는 여전히 수정 가능한 것처럼 보일 수 있습니다.
//   백엔드에 cart_group.status(ACTIVE/COMPLETED) 같은 컬럼과, 조회 API(CartGroupResponse)에
//   그 값을 내려주는 게 생기면 이 파일 대신 그 값을 쓰면 됩니다 — backend-request.md 참고.
"use client";

const KEY = "storeflow_completed_groups";

function readAll(): Record<number, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<number, string>) : {};
  } catch {
    return {};
  }
}

export function markGroupCompleted(groupId: number) {
  if (typeof window === "undefined") return;
  const all = readAll();
  all[groupId] = new Date().toISOString();
  window.localStorage.setItem(KEY, JSON.stringify(all));
}

export function isGroupCompleted(groupId: number): boolean {
  return Boolean(readAll()[groupId]);
}
