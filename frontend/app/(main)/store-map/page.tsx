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

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RiArrowLeftSLine } from "@remixicon/react";
import { StoreMap, type MapPin } from "@/components/domain/store-map";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FLOOR_MAPS, getFloorLocations, getZoneName } from "@/lib/map-config";
import { fetchProductsAtLocation, type LocationProduct } from "@/lib/location-products";
import { fetchInventoryBatch, pickLocation } from "@/lib/product-location";
import { loadCartGroups, readCartGroups } from "@/lib/cart-storage";
import { useOpenAiChat } from "@/lib/use-open-ai-chat";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";

export default function StoreMapPage() {
  const [floorNo, setFloorNo] = useState(FLOOR_MAPS[0]?.floorNo ?? 1);
  const openAiChat = useOpenAiChat();

  // ✅ 신규 — "실제 제품 좌표로 모아보기": 내가 담아둔(전체 리스트) 상품들을 실제
  //   재고 위치(x,y)로 지도 위에 핀으로 표시. 예전엔 이 페이지가 pins={[]}로 고정돼
  //   있어서 지도에 핀이 아예 안 뜨는 상태였다 — 매대 클릭 기능만 있고 "내 상품 모아보기"는
  //   연결이 안 돼 있었던 것. 특정 리스트 동선(StoreMapDialog)과 달리 여기는 "둘러보기"라
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

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [locationProducts, setLocationProducts] = useState<LocationProduct[] | null>(null);
  const [locationError, setLocationError] = useState(false);
  // ✅ 신규 — 개별 매대(locationId) 대신 구역 전체를 눌렀을 때(onZoneClick). 이 구역엔
  //   특정 locationId가 없어서 상품 목록 API를 부를 수 없고, 구역 이름만 보여줌.
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

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
    // ✅ 수정(2026-09) — 이 화면은 하단탭바를 항상 숨기는데(setBottomBarHidden(true)),
    //   그와 별개로 이 래퍼가 자체적으로 pb-8을 주고 있어서 지도 아래에 안 쓰는 여백이
    //   남아있었다. 그 여백을 없애고, 지도 자체 높이도 고정 70vh(다른 화면과 공용)
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
        onLocationClick={handleLocationClick}
        onZoneClick={setSelectedZoneId}
        onFloorChange={setFloorNo}
        onLivClick={() => openAiChat()}
        heightClassName="h-[calc(100dvh-8rem)]"
      />

      <p className="px-4 pt-2 text-xs text-muted-foreground">
        지도 위 칸을 누르면 그 매대에 실제로 진열된 상품을 볼 수 있어요.
        {floorPins.length > 0 && " 담아둔 상품은 실제 위치에 핀으로 표시돼요."}
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

      {/* ✅ 신규 — 구역 전체를 눌렀을 때(개별 매대 좌표 시드가 없어도 항상 반응함).
          이 구역엔 특정 locationId가 없어서 상품 목록은 못 불러오고 구역 이름만 보여줌. */}
      <Dialog open={selectedZoneId !== null} onOpenChange={(v) => !v && setSelectedZoneId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedZoneId ? (getZoneName(floorNo, selectedZoneId) ?? "구역 정보") : ""}</DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">이 구역에 진열된 상품을 둘러보세요.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
