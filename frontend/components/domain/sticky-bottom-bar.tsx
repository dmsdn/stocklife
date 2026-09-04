// components/domain/sticky-bottom-bar.tsx
// ✅ 신규 — 이용약관부터 가입 완료까지, "다음/가입하기" 버튼이 화면 하단에 항상 고정되게.
//   예전엔 각 페이지가 mt-auto(flex 정렬)로 컨테이너 맨 아래에 배치했는데, 이건 문서
//   흐름 안에 있는 "맨 아래"일 뿐 진짜 고정이 아니라서, 모바일 키보드가 올라오면
//   화면 밖으로 밀려나 버튼이 안 보였음(요청: "키보드를 누르면 키보드 위에 고정").
//   그림자(#000000 10%, blur 20)는 이 래퍼가 아니라 실제 버튼 요소에 직접 줍니다 —
//   버튼만 하단탭바처럼 둥둥 뜨게, 배경이 있는 고정 패널처럼 안 보이게.
// ✅ 수정(2026-09, 2차) — "입력란에 포커스가 가서 키보드가 올라오면 버튼이 안 보임" 원인:
//   position:fixed는 브라우저의 "레이아웃 뷰포트"(키보드가 떠도 안 줄어드는, 페이지 전체
//   기준) 하단에 고정되는 거라, 모바일 브라우저(특히 안드로이드 크롬)에서 키보드가
//   올라오면 "실제 눈에 보이는 화면"(비주얼 뷰포트)만 줄어들고 레이아웃 뷰포트는 그대로라
//   이 버튼이 키보드 뒤에 가려집니다. 즉 fixed만으로는 못 고치는 문제였고, 실제로 지금
//   화면에 보이는 영역이 얼마인지 알려주는 VisualViewport API로 키보드가 가린 높이를
//   직접 재서 그만큼 버튼을 위로 밀어올려야 합니다.
"use client";

import { useEffect, useState } from "react";

export function StickyBottomBar({ children }: { children: React.ReactNode }) {
  // ✅ 키보드가 가린 높이(px). 키보드가 없으면 0 — 평소엔 아무 영향 없음.
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return; // 아주 오래된 브라우저 대비 — 없으면 그냥 기존 동작(0) 그대로

    const update = () => {
      // 레이아웃 뷰포트(window.innerHeight, 키보드가 떠도 안 바뀜) 대비 비주얼 뷰포트가
      // 얼마나 줄었고 얼마나 아래로 스크롤됐는지 = 키보드(등)가 화면 아래쪽을 가린 높이.
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardInset(Math.max(0, Math.round(covered)));
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return (
    // ✅ 수정(2026-09) — 예전엔 이 바 전체에 배경색(surface-subtle)+그림자를 줘서, 버튼
    //   보다 넓은 "고정된 박스/패널"처럼 보였음(요청: "박스로 고정되어있는것처럼 보임").
    //   하단탭바처럼 버튼 자체만 둥둥 뜨게: 이 바깥 래퍼는 위치만 고정하고 배경·그림자
    //   없음(뒤 콘텐츠가 그대로 비쳐 보임) — 그림자는 실제 버튼 쪽에서 줍니다.
    <div
      className="fixed inset-x-0 bottom-0 left-1/2 z-30 w-full max-w-sm -translate-x-1/2 px-5 pt-4 transition-transform duration-150 md:max-w-md"
      style={{
        paddingBottom: "calc(42px + env(safe-area-inset-bottom))",
        transform: keyboardInset > 0 ? `translateY(-${keyboardInset}px)` : undefined,
      }}
    >
      {children}
    </div>
  );
}
