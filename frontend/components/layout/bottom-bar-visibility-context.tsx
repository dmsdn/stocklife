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
// ✅ 수정(2026-09, 2차) — "스캔 화면에서 하단바가 나옴/리스트 드래그 안 됨/리브 버튼 안
//   눌림" 원인을 여기서 찾았습니다. 예전엔 hidden이 단순 boolean 하나라서, 이걸 부르는
//   여러 컴포넌트가 서로 덮어썼습니다 — scan 페이지는 항상 setHidden(true)를 부르는데,
//   같은 화면에 항상 마운트돼 있는 StoreMapDialog(동선 보기, open=false로 시작)와
//   전역으로 항상 마운트된 AiMobileSheet(isOpen=false로 시작)가 각자 자기 마운트 시점에
//   setHidden(false)를 불러서, scan 페이지가 켠 직후 곧바로(또는 렌더 순서에 따라 그 뒤)
//   다시 꺼버리고 있었습니다 — "숨겨야 한다는 컴포넌트가 여럿인데 boolean 하나로 관리"가
//   근본 원인. 하단바가 예상과 달리 다시 나타나면서 스캔 화면 하단(목록 손잡이, 리브
//   버튼 자리)과 겹쳐 터치를 가로챈 게 나머지 두 증상의 원인이었습니다.
//   내부를 "숨기길 원하는 컴포넌트들의 id 집합"으로 바꿔서(하나라도 있으면 숨김) 서로
//   안 덮어쓰게 했습니다 — 바깥에서 쓰는 useBottomBarVisibility()의 반환값 모양
//   (hidden/setHidden/noReserve/setNoReserve)은 그대로라 이걸 쓰는 다른 파일들은 전혀
//   안 고쳐도 됩니다(호출하는 컴포넌트마다 React useId()로 자기만의 고유 id를 자동으로
//   붙여서 이 Set에 넣고 빼는 것뿐).
import { createContext, useCallback, useContext, useId, useMemo, useState } from "react";

interface BottomBarVisibilityContextValue {
  hiddenIds: Set<string>;
  setHiddenFor: (id: string, hidden: boolean) => void;
  noReserveIds: Set<string>;
  setNoReserveFor: (id: string, noReserve: boolean) => void;
}

const BottomBarVisibilityContext = createContext<BottomBarVisibilityContextValue | null>(null);

function toggleIdInSet(prev: Set<string>, id: string, on: boolean): Set<string> {
  const has = prev.has(id);
  if (on === has) return prev; // 변화 없으면 같은 참조 그대로 반환(불필요한 리렌더 방지)
  const next = new Set(prev);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

export function BottomBarVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [noReserveIds, setNoReserveIds] = useState<Set<string>>(new Set());

  const setHiddenFor = useCallback((id: string, hidden: boolean) => {
    setHiddenIds((prev) => toggleIdInSet(prev, id, hidden));
  }, []);
  const setNoReserveFor = useCallback((id: string, noReserve: boolean) => {
    setNoReserveIds((prev) => toggleIdInSet(prev, id, noReserve));
  }, []);

  // ⚠ 방금 여기서 진짜 버그가 났었습니다 — 고쳐서 남겨둡니다: 이 value 객체를 그냥
  //   JSX 안에서 리터럴로 `{{ hiddenIds, setHiddenFor, ... }}`처럼 넘기면, Provider가
  //   리렌더될 때마다(원인 불문하고) 매번 "새 객체"가 만들어집니다. 그러면 아래
  //   useBottomBarVisibility()의 setHidden/setNoReserve가 이 객체를 의존성으로 삼고
  //   있어서 매번 "새 함수"가 되고, 그걸 의존성 배열에 넣어 useEffect를 쓰던 페이지들
  //   (예: 홈 화면의 setNoReserve(true)/return () => setNoReserve(false))이 렌더될 때마다
  //   effect가 정리→재실행을 반복 — 그 재실행이 다시 상태를 바꾸고, 그게 다시 리렌더를
  //   부르는 무한 루프("Maximum update depth exceeded")였습니다. 실제로 이것 때문에
  //   스캔·홈·마이페이지 등 이 컨텍스트를 쓰는 거의 모든 화면이 렌더링에 발이 묶여서
  //   버튼 클릭도 페이지 이동도 안 먹혔던 것입니다(제가 만든 버그였습니다).
  //   useMemo로 이 값 객체 자체를 안정된 참조로 고정해서(안의 상태가 실제로 안 바뀌면
  //   같은 객체를 계속 재사용), 아래 훅의 setHidden/setNoReserve도 더 이상 매 렌더마다
  //   새로 안 만들어지게 했습니다.
  const value = useMemo(
    () => ({ hiddenIds, setHiddenFor, noReserveIds, setNoReserveFor }),
    [hiddenIds, setHiddenFor, noReserveIds, setNoReserveFor]
  );

  return (
    <BottomBarVisibilityContext.Provider value={value}>
      {children}
    </BottomBarVisibilityContext.Provider>
  );
}

export function useBottomBarVisibility() {
  const ctx = useContext(BottomBarVisibilityContext);
  if (!ctx) throw new Error("useBottomBarVisibility는 BottomBarVisibilityProvider 안에서만 사용 가능합니다");
  // ✅ 이 훅을 부르는 컴포넌트 인스턴스마다 고정된(리렌더돼도 안 바뀌는) 고유 id.
  //   같은 컴포넌트라도 여러 군데서 동시에 이 훅을 쓰면 각자 자기 id로 따로 등록/해제되니
  //   서로 안 겹침.
  const id = useId();
  // ✅ ctx 전체가 아니라 실제로 쓰는 setHiddenFor/setNoReserveFor 함수 자체를 의존성으로
  //   씀(둘 다 Provider 쪽에서 useCallback([])로 고정된 안정적인 참조라, 이제 ctx 객체가
  //   바뀌어도 이 두 함수 참조 자체는 안 바뀌는 한 여기 setHidden/setNoReserve도 안정적).
  const setHidden = useCallback((hidden: boolean) => ctx.setHiddenFor(id, hidden), [ctx.setHiddenFor, id]);
  const setNoReserve = useCallback((noReserve: boolean) => ctx.setNoReserveFor(id, noReserve), [ctx.setNoReserveFor, id]);

  return {
    hidden: ctx.hiddenIds.size > 0,
    setHidden,
    noReserve: ctx.noReserveIds.size > 0,
    setNoReserve,
  };
}
