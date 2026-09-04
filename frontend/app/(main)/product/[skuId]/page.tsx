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
import { apiFetch } from "@/lib/api-client";
import { getAlternatives, compareProducts, type AlternativeProduct, type PopularityItem } from "@/lib/ai-proxy";
import { addRecentView } from "@/lib/recent-views";
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

interface InventoryItem {
  locationId: string;
  zoneId: string;
  floorNo: number;
  x: number;
  y: number;
  qty: number;
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
        setProduct(p);
        addRecentView({ skuId: p.skuId, name: p.name, price: p.finalPriceKrw, imageUrl: p.imageUrl });
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));

    apiFetch<InventoryItem[]>(`/api/products/${productId}/inventory`, { auth: false })
      .then(setInventory)
      .catch(() => setInventory([]));

    getAlternatives(productId).then((alts) => {
      setAlternatives(alts);
      const compareIds = [productId, ...alts.map((a) => a.skuId)].slice(0, 5);
      compareProducts(compareIds).then(setPopularity);
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
                ? `${inventory[0].floorNo}층 ${inventory[0].zoneId} 구역 · 매대 ${inventory[0].locationId} · 재고 ${inventory[0].qty}개`
                : "매장 위치 정보 없음"}
            </button>

            {alternatives.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">비슷한 상품</p>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {alternatives.slice(0, 6).map((a) => {
                    const pop = popularity.find((p) => p.skuId === a.skuId);
                    return (
                      <span key={a.skuId} className="shrink-0 rounded-sm border border-border px-3 py-2 text-xs">
                        {a.name ?? a.productName ?? `상품 ${a.skuId}`}
                        {pop && <span className="ml-1 text-muted-foreground">· 구매자 {pop.purchaserCount}명</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ✅ 수정(요청) — "저장하기" 버튼, 다른 화면들과 같은 h-60 텍스트 폭 맞춤 원형
              알약으로 화면 하단 고정. */}
          <StickyBottomBar>
            <Button
              className="flex mx-auto h-[60px] w-fit px-5 rounded-full shadow-[0_-2px_20px_rgba(0,0,0,0.1)]"
              disabled={product.discontinued}
              onClick={() => setSavePickerOpen(true)}
            >
              저장하기
            </Button>
          </StickyBottomBar>
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
