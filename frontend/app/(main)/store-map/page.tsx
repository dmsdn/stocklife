// app/(main)/store-map/page.tsx
// ✅ 홈 화면 "매장 지도" 카드에서 연결되는 매장 둘러보기 페이지. 특정 리스트의
//   동선(StoreMapDialog)과는 별개로, 그냥 매장을 색깔별 구역으로 둘러보는 용도.
// ✅ 수정(2026-09) — 매대 칸 하나하나에 격자 박스를 그려서 누르게 하던 방식(개별
//   locationId 클릭 + 별도 모달로 상품 목록)을 없앴습니다. 실제 매장 이미지 위에 작은
//   박스가 잔뜩 겹쳐 보여서 지저분했고("이상한 박스"), 매대 시드 데이터가 없으면 아예
//   안 눌리기도 했습니다. 이제 색칠된 구역(zone) 전체를 누르면 그 구역이 어떤
//   카테고리인지만 지도 위에 핀처럼 뜹니다(StoreMap 내부에서 처리, 외부 모달 없음).
// ✅ 수정(요청 — "매장 지도에 핀 박히는거 다 빼기") — 예전엔 내가 담은 상품들을 실제
//   재고 위치로 지도 위에 핀으로 모아 보여주는 기능이 있었는데, 그 핀(과 그걸 불러오는
//   fetchInventoryBatch/loadCartGroups 로직) 자체를 없앴습니다. 이제 이 화면은 순수하게
//   구역(zone)만 둘러보는 용도입니다.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RiArrowLeftSLine } from "@remixicon/react";
import { StoreMap } from "@/components/domain/store-map";
import { FLOOR_MAPS } from "@/lib/map-config";
import { useOpenAiChat } from "@/lib/use-open-ai-chat";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";

export default function StoreMapPage() {
  const [floorNo, setFloorNo] = useState(FLOOR_MAPS[0]?.floorNo ?? 1);
  const openAiChat = useOpenAiChat();

  // ✅ 매장 지도 화면은 항상 하단탭바 없이 꽉 차게
  const { setHidden: setBottomBarHidden } = useBottomBarVisibility();
  useEffect(() => {
    setBottomBarHidden(true);
    return () => setBottomBarHidden(false);
  }, [setBottomBarHidden]);

  return (
    // ✅ 이 화면은 하단탭바를 항상 숨기는데, 지도 자체 높이도 고정 70vh(다른 화면과 공용)
    //   대신 이 화면 전용으로 뷰포트 끝까지 채우도록 늘림.
    <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-lg flex-col overflow-hidden md:max-w-2xl">
      <div className="flex items-center gap-2 px-4 py-3">
        <Link href="/" aria-label="뒤로가기" className="flex h-8 w-8 items-center justify-center text-muted-foreground">
          <RiArrowLeftSLine size={22} />
        </Link>
        <h1 className="text-lg font-semibold">매장 지도</h1>
      </div>

      <StoreMap
        floorNo={floorNo}
        pins={[]}
        routeOrder={[]}
        showZones
        onFloorChange={setFloorNo}
        onLivClick={() => openAiChat()}
        heightClassName="h-[calc(100dvh-8rem)]"
        hideHelpText
      />
    </div>
  );
}
