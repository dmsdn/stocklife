"use client";

// ✅ 신규 — 스캔 화면의 담은 상품 시트를 화면 대부분까지 펼쳤을 때, 전역 하단탭바(다른
//   컴포넌트인 BottomTabBar, AppShell이 모든 페이지에 렌더링함)를 그 화면 자기 상태만으로는
//   가릴 수 없어서 만든 공용 컨텍스트. AiPanelContext와 같은 패턴 — Provider는 AppShell에,
//   BottomTabBar는 이 값을 읽어서 숨김 여부만 결정, 실제로 숨기고 싶은 화면(scan 등)은
//   hide()/show()만 호출.
// ✅ 수정(2026-09) — noReserve 추가. AppShell의 <main>은 하단탭바가 안 보이는 화면이
//   아닌 이상 항상 pb-16(탭바 높이만큼)을 예약해두는데, 이 padding은 main 소유라 그
//   영역 배경색이 페이지 배경과 다를 수 있음(예: 홈 화면처럼 페이지 배경이 흰색이 아닌
//   경우). Footer가 있는 페이지는 Footer 스스로 같은 만큼의 하단 여백을 자기 배경색으로
//   이미 확보하므로, 그런 페이지는 noReserve(true)로 main의 중복 padding을 꺼서 이중으로
//   여백이 잡히는 걸 막는다(탭바는 계속 보임 — hidden과 다르게 이건 padding 예약만 끔).
import { createContext, useContext, useState } from "react";

interface BottomBarVisibilityState {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  noReserve: boolean;
  setNoReserve: (noReserve: boolean) => void;
}

const BottomBarVisibilityContext = createContext<BottomBarVisibilityState | null>(null);

export function BottomBarVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const [noReserve, setNoReserve] = useState(false);
  return (
    <BottomBarVisibilityContext.Provider value={{ hidden, setHidden, noReserve, setNoReserve }}>
      {children}
    </BottomBarVisibilityContext.Provider>
  );
}

export function useBottomBarVisibility() {
  const ctx = useContext(BottomBarVisibilityContext);
  if (!ctx) throw new Error("useBottomBarVisibility는 BottomBarVisibilityProvider 안에서만 사용 가능합니다");
  return ctx;
}
