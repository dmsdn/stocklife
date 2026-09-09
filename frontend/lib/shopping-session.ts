"use client";

export type RouteAnchor = {skuId: number} | {locationId: string} | {floorNo: number; x: number; y: number};
export interface ShoppingSession {
  groupId: number;
  scannedSkuIds: number[];
  anchor?: RouteAnchor;
  detourLocationId?: string;
  paid?: boolean;
  orderId?: number;
}
const KEY = "storeflow_shopping_session";
export const SHOPPING_CHANGED = "storeflow-shopping-changed";

/** 수집이 0개여도 화장실 위치/퇴장 안내는 유지한다. 오래된 세션은 스캔 매대를 앵커로 승격한다. */
export function readShoppingSession(): ShoppingSession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null");
    if (!value || !Number.isInteger(value.groupId) || !Array.isArray(value.scannedSkuIds)) return null;
    const ids: number[] = value.scannedSkuIds.filter((x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x > 0);
    return {...value, scannedSkuIds: [...new Set(ids)], anchor: value.anchor ?? (ids.length ? {skuId: ids[ids.length-1]} : undefined)};
  } catch { return null; }
}

/** 같은 탭의 스캔 화면·동선 모달에 변경을 알린다. storage 이벤트는 같은 탭에 오지 않는다. */
export function writeShoppingSession(session: ShoppingSession | null) {
  if (typeof window === "undefined") return;
  if (session) window.sessionStorage.setItem(KEY, JSON.stringify(session));
  else window.sessionStorage.removeItem(KEY);
  window.dispatchEvent(new Event(SHOPPING_CHANGED));
}

export function sessionFor(groupId: number): ShoppingSession {
  const current = readShoppingSession();
  return current?.groupId === groupId ? current : {groupId, scannedSkuIds: []};
}

// ✅ 신규 — "스캔화면에 들어갈 때마다 장바구니(리스트)를 다시 골라야 한다"는 문제 수정용.
//   스캔 화면에서 리스트를 한 번 고르면(entryPicker 선택, "리스트 없이 시작하기", 리스트
//   전환 등) 그 선택을 여기 저장해뒀다가, 다음에 /scan(리스트 지정 없이)으로 들어올 때
//   이 값을 먼저 확인해서 있으면 곧장 그 리스트로 스캔을 이어가고, 결제가 끝나면(또는
//   완료된 리스트로 확인되면) 지워서 그 다음엔 다시 고르게 합니다.
//   localStorage를 씀 — sessionStorage(탭 종료 시 사라짐)와 달리 장보는 도중 앱을 껐다
//   켜도(탭을 새로 열어도) "결제 전까지 고정"이 유지돼야 하기 때문입니다.
const ACTIVE_SCAN_GROUP_KEY = "storeflow_active_scan_group";

function canUseStorage() {
  return typeof window !== "undefined";
}

export function readActiveScanGroupId(): number | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_SCAN_GROUP_KEY);
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

export function writeActiveScanGroupId(groupId: number | null) {
  if (!canUseStorage()) return;
  if (groupId == null) {
    window.localStorage.removeItem(ACTIVE_SCAN_GROUP_KEY);
  } else {
    window.localStorage.setItem(ACTIVE_SCAN_GROUP_KEY, String(groupId));
  }
}
