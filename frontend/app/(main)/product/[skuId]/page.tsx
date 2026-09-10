// app/(main)/product/[skuId]/page.tsx
// ✅ 수정(요청) — 예전엔 상품 상세가 모달(ProductDetailDialog)이었는데, 페이지로 바꿨습니다.
//   뒤로가기/새로고침/링크 공유가 자연스러워지고, "저장하기" 버튼도 다른 화면들처럼
//   화면 하단 h-60(텍스트 폭 맞춤) 고정 버튼으로 통일했습니다.
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RiArrowLeftSLine, RiMapPinLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { StickyBottomBar } from "@/components/domain/sticky-bottom-bar";
import { SaveToListDialog } from "@/components/domain/save-to-list-dialog";
import { LocationMapDialog } from "@/components/domain/location-map-dialog";
import { addProductToCartGroup } from "@/lib/cart-storage";
import { apiFetch, resolveImageUrl } from "@/lib/api-client";
import { getAlternatives, compareProducts, type AlternativeProduct, type PopularityItem } from "@/lib/ai-proxy";
import { addRecentView } from "@/lib/recent-views";
import { formatLocationLabel, pickLocation, type InventoryItem } from "@/lib/product-location";
import { trackConsumerEvent } from "@/lib/consumer-events";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";

interface ProductDetail {
  skuId: number;
  name: string;
  brand: string;
  categoryL1: string;
  priceKrw: number;
  onPromo: boolean;
  finalPriceKrw: number;
  specRaw: string;
  imageUrl: string | null;
  discontinued: boolean;
}

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const productId = Number(params.skuId);

  // ✅ 신규(요청) — 상품 상세 화면엔 하단탭바가 아예 안 보여야 함(스캔/매장지도와
  //   같은 패턴). "저장하기" 버튼이 화면 하단에 고정돼 있어서 하단탭바까지 같이 있으면
  //   겹쳐 보임.
  const { setHidden: setBottomBarHidden } = useBottomBarVisibility();
  useEffect(() => {
    setBottomBarHidden(true);
    return () => setBottomBarHidden(false);
  }, [setBottomBarHidden]);

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [alternatives, setAlternatives] = useState<AlternativeProduct[]>([]);
  // ✅ 신규 — 연관 상품 이미지 보강용 배치 조회 결과.
  const [altDetails, setAltDetails] = useState<Map<number, ProductDetail>>(new Map());
  const [popularity, setPopularity] = useState<PopularityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savePickerOpen, setSavePickerOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [locationMapOpen, setLocationMapOpen] = useState(false);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    setImageError(false);
    apiFetch<ProductDetail>(`/api/products/${productId}`, { auth: false })
      .then((p) => {
        const resolved = { ...p, imageUrl: resolveImageUrl(p.imageUrl) ?? null };
        setProduct(resolved);
        addRecentView({ skuId: resolved.skuId, name: resolved.name, price: resolved.finalPriceKrw, imageUrl: resolved.imageUrl });
        // ✅ 신규(09-03 요청 ⑤) — 상세를 열어 본 것이 VIEW. 같은 카테고리 상품을 번갈아
        //   여는 것이 망설임 감시자(진입 브리핑·재고 전환과 같은 방식으로 백엔드가 반응)의
        //   재료인데, 전에는 어디서도 VIEW를 안 보내고 있었음.
        trackConsumerEvent({ event_type: "VIEW", sku_id: resolved.skuId });
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));

    apiFetch<InventoryItem[]>(`/api/products/${productId}/inventory`, { auth: false })
      .then((items) => {
        // ✅ 수정(요청 3번) — pickLocation()을 거치면 백엔드 좌표 대신 직접 찍어둔
        //   좌표(lib/location-pins.ts)가 있을 때 그걸 우선 적용해줌(없으면 기존과 동일).
        const picked = pickLocation(items);
        setInventory(picked ? [picked] : []);
      })
      .catch(() => setInventory([]));

    getAlternatives(productId).then((alts) => {
      setAlternatives(alts);
      const compareIds = [productId, ...alts.map((a) => a.skuId)].slice(0, 5);
      compareProducts(compareIds).then(setPopularity);

      // ✅ 버그 수정(요청 — "연관 상품 사진 안뜸") — Agent의 /api/ai/products/{id}/alternatives
      //   응답은 방어적으로 파싱해야 할 만큼 형태가 들쭉날쭉해서(AlternativeProduct 타입
      //   주석 참고), imageUrl이 아예 안 오는 경우가 있음. 그래서 실제 상품 상세 배치
      //   조회(기존에 이미 쓰던 GET /api/products/by-skus)로 이미지·이름·가격을 다시
      //   채워서, Agent 응답에 없어도 실제 상품 이미지가 뜨게 함.
      if (alts.length > 0) {
        apiFetch<ProductDetail[]>(`/api/products/by-skus?skuIds=${alts.map((a) => a.skuId).join(",")}`, { auth: false })
          .then((details) => setAltDetails(new Map(details.map((d) => [d.skuId, d]))))
          .catch(() => setAltDetails(new Map()));
      }
    });
  }, [productId]);

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-[140px] sm:max-w-xl md:max-w-2xl">
      <div className="flex h-14 items-center px-4">
        <button type="button" onClick={() => router.back()} aria-label="뒤로가기" className="flex h-8 w-8 items-center justify-center text-muted-foreground">
          <RiArrowLeftSLine size={24} />
        </button>
      </div>

      {loading && <p className="p-8 text-center text-sm text-muted-foreground">불러오는 중...</p>}
      {!loading && !product && <p className="p-8 text-center text-sm text-muted-foreground">상품을 찾을 수 없어요.</p>}

      {!loading && product && (
        <>
          {product.imageUrl && !imageError ? (
            // eslint-disable-next-line @next/next/no-img-element -- 외부/미확정 도메인이라 next/image 대신 일반 img 사용
            <img
              src={product.imageUrl}
              alt={product.name}
              className="aspect-square w-full bg-muted object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center bg-muted text-xs text-muted-foreground">
              이미지 없음
            </div>
          )}

          <div className="space-y-4 p-5">
            <div>
              <p className="text-xs text-muted-foreground">{product.brand} · {product.categoryL1}</p>
              <p className="mt-1 text-lg font-semibold">{product.name}</p>
              <p className="text-xs text-muted-foreground">{product.specRaw}</p>
            </div>

            <div>
              {product.onPromo && (
                <p className={`text-xs line-through ${product.discontinued ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                  {product.priceKrw.toLocaleString()}원
                </p>
              )}
              <p className={`text-xl font-bold ${product.discontinued ? "text-muted-foreground/50" : ""}`}>
                {product.finalPriceKrw.toLocaleString()}원
              </p>
              {product.discontinued && <p className="mt-1 text-xs text-danger">단종된 상품이에요</p>}
            </div>

            <button
              type="button"
              onClick={() => inventory[0] && setLocationMapOpen(true)}
              disabled={!inventory[0]}
              className="flex items-center gap-1.5 rounded-sm bg-muted px-3 py-2 text-left text-xs text-muted-foreground disabled:cursor-default"
            >
              <RiMapPinLine size={24} className="shrink-0" />
              {inventory[0]
                ? formatLocationLabel(inventory[0].locationId)
                : "매장 위치 정보 없음"}
            </button>

            {alternatives.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">비슷한 상품</p>
                {/* ✅ 수정(요청 — "비슷한 상품은 이름만 있는데 이미지 필요") — 이름만 있던
                    작은 알약 대신 이미지+이름 카드로. 가로 스크롤 막대는 전역 스크롤바
                    숨김(globals.css)으로 이미 안 보이지만, 남겨둔 scrollbar-hide는
                    호환용으로 그대로 둠. */}
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {alternatives.slice(0, 6).map((a) => {
                    const pop = popularity.find((p) => p.skuId === a.skuId);
                    const detail = altDetails.get(a.skuId);
                    const img = resolveImageUrl(detail?.imageUrl ?? a.imageUrl ?? null);
                    return (
                      <button
                        key={a.skuId}
                        type="button"
                        onClick={() => router.push(`/product/${a.skuId}`)}
                        className="flex w-24 shrink-0 flex-col items-start gap-1.5 rounded-sm border border-border p-2 text-left"
                      >
                        <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded-sm bg-muted">
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">이미지 없음</span>
                          )}
                        </div>
                        <p className="line-clamp-2 text-xs">{detail?.name ?? a.name ?? a.productName ?? `상품 ${a.skuId}`}</p>
                        {pop && <span className="text-[10px] text-muted-foreground">구매자 {pop.purchaserCount}명</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ✅ 수정(요청) — "저장하기" 버튼, 다른 화면들과 같은 h-60 텍스트 폭 맞춤 원형
              알약으로 화면 하단 고정.
              ✅ 수정(요청 — "매대위치 모달 위로 버튼이 보인다") — 이 바(StickyBottomBar,
              기본 z-[110])가 위치 모달(LocationMapDialog, 기본 Dialog z-105)보다
              z-index가 높아서, 매대 위치를 눌러 모달을 열어도 이 버튼이 어두운 배경
              위로 그대로 떠 보였음 — 모달이 열려있는 동안(locationMapOpen)은 숨김. */}
          {!locationMapOpen && (
            <StickyBottomBar>
              <Button
                className="flex mx-auto h-[60px] w-fit px-5 rounded-full shadow-[0_-2px_20px_rgba(0,0,0,0.1)]"
                disabled={product.discontinued}
                onClick={() => setSavePickerOpen(true)}
              >
                저장하기
              </Button>
            </StickyBottomBar>
          )}
        </>
      )}

      <SaveToListDialog
        open={savePickerOpen}
        onClose={() => setSavePickerOpen(false)}
        onSelect={(groupIds) => {
          if (!product) return;
          Promise.all(
            groupIds.map((groupId) =>
              addProductToCartGroup(groupId, {
                id: product.skuId,
                name: product.name,
                category: product.categoryL1,
                price: product.finalPriceKrw,
              })
            )
          ).catch(() => {
            console.error("리스트에 담기 실패");
            alert("리스트에 담지 못했어요. 다시 시도해주세요.");
          });
        }}
      />

      {inventory[0] && (
        <LocationMapDialog
          open={locationMapOpen}
          onClose={() => setLocationMapOpen(false)}
          floorNo={inventory[0].floorNo}
          x={inventory[0].x}
          y={inventory[0].y}
          productName={product?.name ?? ""}
          price={product?.finalPriceKrw ?? 0}
        />
      )}
    </div>
  );
}
