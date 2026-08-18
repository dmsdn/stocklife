"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackConsumerEvent } from "@/lib/consumer-events";

export default function ScanPage() {
  const [quantity, setQuantity] = useState(1);

  // TODO: 백엔드 연동 전 목업 데이터 — 실제로는 스캔된 바코드로 상품 조회 (sku_id/location_id는 DB스키마 초안 기준)
  const product = {
    skuId: 101042,
    barcode: "8801234000017",
    locationId: "A-01-R03-B2-L1",
    name: "상품 이름",
    originalPrice: 29999,
    discountPercent: 80,
    finalPrice: 10000,
    unitPrice: 999,
  };

  const handleAddToCart = () => {
    // TODO: 실제 장바구니 담기 API 연동
    trackConsumerEvent({
      event_type: "SCAN_ADD",
      sku_id: product.skuId,
      barcode: product.barcode,
      location_id: product.locationId,
    });
  };

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col md:max-w-sm">
      <div className="flex items-center gap-3 p-4">
        <Link href="/">
          <ChevronLeft size={20} />
        </Link>
        <p className="text-base">상품 담기</p>
      </div>

      {/* TODO: 실제 카메라 프리뷰 자리 — 지금은 뷰파인더 프레임만 표시 */}
      <div className="relative flex-1">
        <span className="absolute left-8 top-8 h-10 w-10 border-l-2 border-t-2 border-foreground" />
        <span className="absolute right-8 top-8 h-10 w-10 border-r-2 border-t-2 border-foreground" />
        <span className="absolute bottom-8 left-8 h-10 w-10 border-b-2 border-l-2 border-foreground" />
        <span className="absolute bottom-8 right-8 h-10 w-10 border-b-2 border-r-2 border-foreground" />
      </div>

      <div className="space-y-3 rounded-t-2xl bg-muted p-4">
        <div className="flex gap-3">
          {/* TODO: 스캔된 상품 이미지 자리 */}
          <div className="h-16 w-16 shrink-0 rounded-md border border-border bg-card" />
          <div className="flex-1">
            <p className="text-sm">{product.name}</p>
            <p className="text-xs text-muted-foreground line-through">
              최대 할인 {product.originalPrice.toLocaleString()}원
            </p>
            <p className="text-sm">
              <span className="mr-1 font-medium">{product.discountPercent}%</span>
              <span className="font-semibold">{product.finalPrice.toLocaleString()}원</span>
              <span className="ml-1 text-xs text-muted-foreground">
                (개당 {product.unitPrice.toLocaleString()}원)
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border"
            >
              -
            </button>
            <span className="w-6 text-center text-sm">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border"
            >
              +
            </button>
          </div>
          <Button className="flex-1" onClick={handleAddToCart}>
            카트에 담기
          </Button>
        </div>
      </div>
    </div>
  );
}
