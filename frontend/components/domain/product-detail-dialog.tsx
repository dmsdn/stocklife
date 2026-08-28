// components/domain/product-detail-dialog.tsx
// ✅ 실제 GET /api/products/{skuId} 연동.
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
import { SaveToListDialog } from "./save-to-list-dialog";
import { addProductToCartGroup } from "@/lib/cart-storage";
import { apiFetch } from "@/lib/api-client";
import { getAlternatives, compareProducts, type AlternativeProduct, type PopularityItem } from "@/lib/ai-proxy";
import { addRecentView } from "@/lib/recent-views";

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

export function ProductDetailDialog({ productId, onClose }: { productId: number | null; onClose: () => void }) {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [alternatives, setAlternatives] = useState<AlternativeProduct[]>([]);
  const [popularity, setPopularity] = useState<PopularityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savePickerOpen, setSavePickerOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

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

    // ✅ 실제 재고/매대위치 연동 (GET /api/products/{skuId}/inventory)
    apiFetch<InventoryItem[]>(`/api/products/${productId}/inventory`, { auth: false })
      .then(setInventory)
      .catch(() => setInventory([]));

    // ✅ 실제 AI 대체상품 연동 (GET /api/ai/products/{skuId}/alternatives)
    getAlternatives(productId).then((alts) => {
      setAlternatives(alts);
      // ✅ 이 상품 + 대체상품들의 실제 인기도 비교 (GET /api/purchases/compare)
      const compareIds = [productId, ...alts.map((a) => a.skuId)].slice(0, 5);
      compareProducts(compareIds).then(setPopularity);
    });
  }, [productId]);

  if (!productId) return null;

  return (
    <>
      <Dialog open={!!productId} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto p-0">
          {loading && <p className="p-8 text-center text-sm text-muted-foreground">불러오는 중...</p>}
          {!loading && !product && <p className="p-8 text-center text-sm text-muted-foreground">상품을 찾을 수 없어요.</p>}

          {!loading && product && (
            <>
              {/* ✅ 실제 이미지(imageUrl) 연결. 주소가 없거나 로드 실패하면 회색 박스로 대체 */}
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
                    <p className="text-xs text-muted-foreground line-through">{product.priceKrw.toLocaleString()}원</p>
                  )}
                  <p className="text-xl font-bold">{product.finalPriceKrw.toLocaleString()}원</p>
                  {product.discontinued && <p className="mt-1 text-xs text-danger">단종된 상품이에요</p>}
                </div>

                <div className="flex items-center gap-1.5 rounded-sm bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <MapPin size={14} />
                  {inventory[0]
                    ? `${inventory[0].floorNo}층 ${inventory[0].zoneId} 구역 · 재고 ${inventory[0].qty}개`
                    : "매장 위치 정보 없음"}
                </div>

                <Button className="w-full" disabled={product.discontinued} onClick={() => setSavePickerOpen(true)}>
                  저장하기
                </Button>

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
            </>
          )}
        </DialogContent>
      </Dialog>

      <SaveToListDialog
        open={savePickerOpen}
        onClose={() => setSavePickerOpen(false)}
        onSelect={(groupIds) => {
          if (!product) return;
          groupIds.forEach((groupId) => {
            addProductToCartGroup(groupId, {
              id: product.skuId,
              name: product.name,
              category: product.categoryL1,
              price: product.finalPriceKrw,
            });
          });
        }}
      />
    </>
  );
}
