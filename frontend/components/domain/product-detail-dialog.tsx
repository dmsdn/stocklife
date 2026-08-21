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

export function ProductDetailDialog({ productId, onClose }: { productId: number | null; onClose: () => void }) {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [savePickerOpen, setSavePickerOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    setImageError(false);
    apiFetch<ProductDetail>(`/api/products/${productId}`, { auth: false })
      .then(setProduct)
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
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

                <div className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <MapPin size={14} />
                  매장 위치 정보
                </div>

                <Button className="w-full" disabled={product.discontinued} onClick={() => setSavePickerOpen(true)}>
                  저장하기
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <SaveToListDialog
        open={savePickerOpen}
        onClose={() => setSavePickerOpen(false)}
        onSelect={(groupId) => {
          if (!product) return;
          addProductToCartGroup(groupId, {
            id: product.skuId,
            name: product.name,
            category: product.categoryL1,
            price: product.finalPriceKrw,
          });
        }}
      />
    </>
  );
}
