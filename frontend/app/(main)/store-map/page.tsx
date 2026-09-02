// app/(main)/store-map/page.tsx
// ✅ 홈 화면 "매장 지도" 카드에서 연결되는 매장 둘러보기 페이지. 특정 리스트의
//   동선(StoreMapDialog)과는 별개로, 그냥 매장을 층별로 둘러보다가 아무 매대나 눌러서
//   그 안에 어떤 상품이 있는지 보는 용도. 지도/매대 클릭/상품 조회 로직은 전부 이미 있던
//   components/domain/store-map.tsx + lib/location-products.ts 그대로 재사용.
// ✅ 실제 DB 연동 완료 — 백엔드 매대 데이터(GET /api/map/floors/{floorNo}의 locations)가
//   채워져서, 프론트 전용 목업 구역(lib/browse-map-zones.ts, 점선 테두리 박스 + 목업 카탈로그)은
//   더 이상 필요 없어져 제거했습니다. 이제 지도 위 매대 칸을 누르면 항상 실제
//   GET /api/locations/{locationId}/products 결과만 보여줍니다.
// ✅ 다이얼로그 제목도 목업 zone.label 대신, 눌린 매대의 실제 zoneId를 GET /api/map/floors/{floorNo}
//   응답에서 사람이 읽는 이름으로 바꿔주는 getZoneName()을 사용합니다.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RiArrowLeftSLine } from "@remixicon/react";
import { StoreMap } from "@/components/domain/store-map";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FLOOR_MAPS, getFloorLocations, getZoneName } from "@/lib/map-config";
import { fetchProductsAtLocation, type LocationProduct } from "@/lib/location-products";
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

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [locationProducts, setLocationProducts] = useState<LocationProduct[] | null>(null);
  const [locationError, setLocationError] = useState(false);

  const handleLocationClick = (locationId: string) => {
    setSelectedLocationId(locationId);
    setLocationProducts(null);
    setLocationError(false);
    fetchProductsAtLocation(locationId)
      .then(setLocationProducts)
      .catch(() => setLocationError(true));
  };

  const closeDialog = () => setSelectedLocationId(null);

  // ✅ 다이얼로그 제목용 — 눌린 매대(locationId)의 실제 zoneId를 찾아 사람이 읽을 이름으로 변환
  const selectedLocation = selectedLocationId
    ? getFloorLocations(floorNo).find((loc) => loc.locationId === selectedLocationId)
    : undefined;
  const selectedZoneName = selectedLocation ? getZoneName(floorNo, selectedLocation.zoneId) : null;

  return (
    <div className="mx-auto w-full max-w-lg pb-8 md:max-w-2xl">
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
        onLocationClick={handleLocationClick}
        onFloorChange={setFloorNo}
        onLivClick={() => openAiChat()}
      />

      <p className="px-4 pt-2 text-xs text-muted-foreground">
        지도 위 칸을 누르면 그 매대에 실제로 진열된 상품을 볼 수 있어요.
      </p>

      {/* 매대를 눌렀을 때 그 안의 상품 목록 (실제 DB) */}
      <Dialog open={selectedLocationId !== null} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedZoneName ?? "매대 상품 목록"}</DialogTitle>
          </DialogHeader>

          {locationError ? (
            <p className="py-6 text-center text-sm text-muted-foreground">상품 목록을 불러오지 못했어요.</p>
          ) : locationProducts === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">불러오는 중...</p>
          ) : locationProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">이 매대엔 등록된 상품이 없어요.</p>
          ) : (
            <ul className="divide-y divide-border">
              {locationProducts.map((p) => (
                <li key={p.skuId} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">재고 {p.stock}개</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">{p.price.toLocaleString()}원</p>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
