// lib/list-groups.ts
// ⚠ 목업 보완 레이어입니다. 백엔드 장바구니(GET /api/cart)는 평평한 목록이라 "리스트(그룹)"
//   개념이 없습니다. 실제 담긴 상품·수량·체크 여부는 전부 백엔드가 정답이고, 이 파일은 그 위에
//   "이 skuId는 어느 리스트에 속하는지"만 로컬에 태그로 얹어두는 역할만 합니다.
//   백엔드에 리스트 그룹 개념이 생기면 이 파일은 통째로 지우고 서버 값으로 교체하면 됩니다.
"use client";

export interface ListGroup {
  id: string;
  title: string;
}

const GROUPS_KEY = "storeflow_list_groups";
const ASSIGNMENT_KEY = "storeflow_list_group_assignment"; // { [skuId]: groupId }

const DEFAULT_GROUP: ListGroup = { id: "default", title: "담은 상품" };

function canUseStorage() {
  return typeof window !== "undefined";
}

export function readGroups(): ListGroup[] {
  if (!canUseStorage()) return [DEFAULT_GROUP];
  try {
    const stored = window.localStorage.getItem(GROUPS_KEY);
    const groups: ListGroup[] = stored ? JSON.parse(stored) : [];
    return groups.some((g) => g.id === DEFAULT_GROUP.id) ? groups : [DEFAULT_GROUP, ...groups];
  } catch {
    return [DEFAULT_GROUP];
  }
}

export function writeGroups(groups: ListGroup[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

export function createGroup(title: string): ListGroup {
  const groups = readGroups();
  const group: ListGroup = { id: crypto.randomUUID(), title };
  writeGroups([...groups, group]);
  return group;
}

export function readAssignment(): Record<number, string> {
  if (!canUseStorage()) return {};
  try {
    return JSON.parse(window.localStorage.getItem(ASSIGNMENT_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function assignSkuToGroup(skuId: number, groupId: string) {
  const assignment = readAssignment();
  assignment[skuId] = groupId;
  window.localStorage.setItem(ASSIGNMENT_KEY, JSON.stringify(assignment));
}

export function groupIdForSku(skuId: number): string {
  return readAssignment()[skuId] ?? DEFAULT_GROUP.id;
}
