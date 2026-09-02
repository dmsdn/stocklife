// lib/shopping-session.ts
// ✅ 홈 화면 Hero Card의 "장보는 중" 상태(SHOPPING) 판단용.
//
// ⚠ 데이터 출처 메모: 백엔드/기존 상태 어디에도 "지금 장보는 중"이라는 개념이 영속적으로
//   저장돼 있지 않았습니다. scan/page.tsx의 sessionScans(Set<number>)가 정확히 이 개념을
//   담고 있었지만 컴포넌트 로컬 state라 스캔 화면을 벗어나면(=홈으로 돌아오면) 사라졌습니다.
//   새 백엔드 엔드포인트를 임의로 만들지 않고, 이 프로젝트가 이미 비회원 장바구니/회원 캐시에
//   쓰고 있는 것과 같은 sessionStorage 패턴을 그대로 재사용해 scan 페이지 ↔ 홈 화면 사이에서만
//   공유합니다. 브라우저 세션(탭 종료)이 끝나면 자연히 사라지는 것도 "장보기 세션"이라는
//   개념과 잘 맞습니다.
//
// 세션 종료는 이미 존재하던 신호(ScanCartDialog 결제 완료 → onCheckedOut)에 맞춰 자연스럽게
// 초기화됩니다 — 별도의 "쇼핑 종료" 개념을 새로 만들지 않았습니다.
"use client";

const SHOPPING_SESSION_KEY = "storeflow_shopping_session";

export interface ShoppingSession {
  groupId: number;
  scannedSkuIds: number[];
}

function canUseStorage() {
  return typeof window !== "undefined";
}

export function readShoppingSession(): ShoppingSession | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(SHOPPING_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.groupId === "number" &&
      Array.isArray(parsed.scannedSkuIds) &&
      parsed.scannedSkuIds.length > 0
    ) {
      return parsed as ShoppingSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeShoppingSession(session: ShoppingSession | null) {
  if (!canUseStorage()) return;
  if (!session || session.scannedSkuIds.length === 0) {
    window.sessionStorage.removeItem(SHOPPING_SESSION_KEY);
  } else {
    window.sessionStorage.setItem(SHOPPING_SESSION_KEY, JSON.stringify(session));
  }
}
