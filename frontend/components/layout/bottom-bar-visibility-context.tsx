"use client";

// ✅ 신규 — 스캔 화면의 담은 상품 시트를 화면 대부분까지 펼쳤을 때, 전역 하단탭바(다른
//   컴포넌트인 BottomTabBar, AppShell이 모든 페이지에 렌더링함)를 그 화면 자기 상태만으로는
//   가릴 수 없어서 만든 공용 컨텍스트. AiPanelContext와 같은 패턴 — Provider는 AppShell에,
//   BottomTabBar는 이 값을 읽어서 숨김 여부만 결정, 실제로 숨기고 싶은 화면(scan 등)은
//   hide()/show()만 호출.
import { createContext, useContext, useState } from "react";

interface BottomBarVisibilityState {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
}

const BottomBarVisibilityContext = createContext<BottomBarVisibilityState | null>(null);

export function BottomBarVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  return (
    <BottomBarVisibilityContext.Provider value={{ hidden, setHidden }}>
      {children}
    </BottomBarVisibilityContext.Provider>
  );
}

export function useBottomBarVisibility() {
  const ctx = useContext(BottomBarVisibilityContext);
  if (!ctx) throw new Error("useBottomBarVisibility는 BottomBarVisibilityProvider 안에서만 사용 가능합니다");
  return ctx;
}
