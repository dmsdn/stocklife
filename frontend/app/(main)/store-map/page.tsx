// app/(main)/store-map/page.tsx
// ✅ 홈 화면 "매장 지도" 카드에서 연결되는 매장 둘러보기 페이지. 특정 리스트의
//   동선(StoreMapDialog)과는 별개로, 그냥 매장을 색깔별 구역으로 둘러보는 용도.
// ✅ 수정(2026-09) — 매대 칸 하나하나에 격자 박스를 그려서 누르게 하던 방식(개별
//   locationId 클릭 + 별도 모달로 상품 목록)을 없앴습니다. 실제 매장 이미지 위에 작은
//   박스가 잔뜩 겹쳐 보여서 지저분했고("이상한 박스"), 매대 시드 데이터가 없으면 아예
//   안 눌리기도 했습니다. 이제 색칠된 구역(zone) 전체를 누르면 그 구역이 어떤
//   카테고리인지만 지도 위에 핀처럼 뜹니다(StoreMap 내부에서 처리, 외부 모달 없음).
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RiArrowLeftSLine } from "@remixicon/react";
import { StoreMap, type MapPin } from "@/components/domain/store-map";
import { FLOOR_MAPS } from "@/lib/map-config";
import { fetchInventoryBatch, pickLocation } from "@/lib/product-location";
import { loadCartGroups, readCartGroups } from "@/lib/cart-storage";
import { useOpenAiChat } from "@/lib/use-open-ai-chat";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";

export default function StoreMapPage() {
  const [floorNo, setFloorNo] = useState(FLOOR_MAPS[0]?.floorNo ?? 1);
  const openAiChat = useOpenAiChat();

  // ✅ "실제 제품 좌표로 모아보기": 내가 담아둔(전체 리스트) 상품들을 실제 재고 위치(x,y)로
  //   지도 위에 핀으로 표시. 특정 리스트 동선(StoreMapDialog)과 달리 여기는 "둘러보기"라
  //   경로는 안 그리고 핀만 표시한다(로그인 회원 전용 리스트라 비회원은 항상 빈 배열).
  const [pinsByFloor, setPinsByFloor] = useState<Map<number, MapPin[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // ✅ loadCartGroups()는 로그인 회원이면 서버에서 최신 목록을 받아옴(saved/[groupId]와
      //   동일 패턴). 실패하면 로컬 캐시(readCartGroups)로 폴백.
      const groups = await loadCartGroups().catch(() => readCartGroups());
      const products = groups.flatMap((g) => g.products);
      const uniqueProducts = Array.from(new Map(products.map((p) => [p.id, p])).values());
      if (uniqueProducts.length === 0) return;

      const inventoryMap = await fetchInventoryBatch(uniqueProducts.map((p) => p.id));
      if (cancelled) return;

      const next = new Map<number, MapPin[]>();
      for (const product of uniqueProducts) {
        const loc = pickLocation(inventoryMap.get(product.id));
        if (!loc) continue; // 배치 조회에 위치가 없는 상품(품절 등)은 지도에 안 띄움
        const pin: MapPin = {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          x: loc.x,
          y: loc.y,
        };
        next.set(loc.floorNo, [...(next.get(loc.floorNo) ?? []), pin]);
      }
      setPinsByFloor(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const floorPins = pinsByFloor.get(floorNo) ?? [];
  // routeOrder는 실제 동선이 아니라 핀 번호 매기기 용도(방문 순서 계산 없이 담은 순서 그대로)
  const floorRouteOrder = useMemo(() => floorPins.map((p) => p.id), [floorPins]);

  // ✅ 매장 지도 화면은 항상 하단탭바 없이 꽉 차게
  const { setHidden: setBottomBarHidden } = useBottomBarVisibility();
  useEffect(() => {
    setBottomBarHidden(true);
    return () => setBottomBarHidden(false);
  }, [setBottomBarHidden]);

  return (
    // ✅ 이 화면은 하단탭바를 항상 숨기는데, 지도 자체 높이도 고정 70vh(다른 화면과 공용)
    //   대신 이 화면 전용으로 뷰포트 끝까지 채우도록 늘림.
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-lg flex-col md:max-w-2xl">
      <div className="flex items-center gap-2 px-4 py-3">
        <Link href="/" aria-label="뒤로가기" className="flex h-8 w-8 items-center justify-center text-muted-foreground">
          <RiArrowLeftSLine size={22} />
        </Link>
        <h1 className="text-lg font-semibold">매장 지도</h1>
      </div>

      <StoreMap
        floorNo={floorNo}
        pins={floorPins}
        routeOrder={floorRouteOrder}
        showZones
        onFloorChange={setFloorNo}
        onLivClick={() => openAiChat()}
        heightClassName="h-[calc(100dvh-8rem)]"
      />

      <p className="px-4 pt-2 text-xs text-muted-foreground">
        색칠된 구역을 누르면 어떤 카테고리인지 볼 수 있어요.
        {floorPins.length > 0 && " 담아둔 상품은 실제 위치에 핀으로 표시돼요."}
      </p>
    </div>
  );
}
