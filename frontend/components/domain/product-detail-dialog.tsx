// components/domain/product-detail-dialog.tsx
// 홈/검색/AI챗 등 어디서든 상품을 누르면 여는 상세 모달. 실제 백엔드 ProductDetailResponse
// 필드(brand/specRaw/discount/imageUrl/discontinued)와 이름을 맞춘 목업 데이터를 씁니다.
"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
import { getMockProductById, getFinalPrice } from "@/lib/mock-products";
import { SaveToListDialog } from "./save-to-list-dialog";
import { addProductToCartGroup } from "@/lib/cart-storage";
import { useState } from "react";

interface ProductDetailDialogProps {
  productId: number | null;
  onClose: () => void;
}

export function ProductDetailDialog({ productId, onClose }: ProductDetailDialogProps) {
  const [savePickerOpen, setSavePickerOpen] = useState(false);
  const product = productId ? getMockProductById(productId) : undefined;

  if (!productId) return null;

  const finalPrice = product ? getFinalPrice(product) : 0;

  return (
    <>
      <Dialog open={!!productId} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto p-0">
          {!product ? (
            <p className="p-8 text-center text-sm text-muted-foreground">상품을 찾을 수 없어요.</p>
          ) : (
            <>
              {/* TODO: 실제 상품 이미지(product.imageUrl) 있으면 img로 교체 */}
              <div className="aspect-square w-full bg-muted" />

              <div className="space-y-4 p-5">
                <div>
                  <p className="text-xs text-muted-foreground">{product.brand} · {product.category}</p>
                  <p className="mt-1 text-lg font-semibold">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.specRaw}</p>
                </div>

                <div>
                  {product.discountPercent > 0 && (
                    <p className="text-xs text-muted-foreground line-through">{product.price.toLocaleString()}원</p>
                  )}
                  <p className="flex items-baseline gap-1.5">
                    {product.discountPercent > 0 && (
                      <span className="text-base font-semibold text-danger">{product.discountPercent}%</span>
                    )}
                    <span className="text-xl font-bold">{finalPrice.toLocaleString()}원</span>
                  </p>
                  {!product.inStock && <p className="mt-1 text-xs text-danger">현재 품절이에요</p>}
                  {product.discontinued && <p className="mt-1 text-xs text-danger">단종된 상품이에요</p>}
                </div>

                <div className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <MapPin size={14} />
                  {product.location.floorNo}층 매장 위치 정보
                </div>

                <Button
                  className="w-full"
                  disabled={!product.inStock || product.discontinued}
                  onClick={() => setSavePickerOpen(true)}
                >
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
            id: product.id,
            name: product.name,
            category: product.category,
            price: finalPrice,
          });
        }}
      />
    </>
  );
}
