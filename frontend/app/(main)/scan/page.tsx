"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ShoppingCart, Map as MapIcon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RouteDialog } from "@/components/domain/route-dialog";
import { QuantityStepper } from "@/components/domain/quantity-stepper";
import { findMockProductByBarcode, type MockProduct } from "@/lib/mock-products";
import { addProductToCartGroup, readCartGroups } from "@/lib/cart-storage";
import type { RouteStop } from "@/lib/navigation";

const DEFAULT_GROUP_ID = 1;

interface ScannedEntry {
  id: number;
  name: string;
  quantity: number;
}

export default function ScanPage() {
  const searchParams = useSearchParams();
  const groupId = Number(searchParams.get("group") ?? DEFAULT_GROUP_ID);
  const groupTitle = readCartGroups().find((g) => g.id === groupId)?.title ?? "기본 리스트";

  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<MockProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const [sessionScans, setSessionScans] = useState<ScannedEntry[]>([]);

  const [routeOpen, setRouteOpen] = useState(false);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) return;
    setError(null);
    setAdded(false);
    setQuantity(1);

    const found = findMockProductByBarcode(barcode.trim());
    if (!found) {
      setProduct(null);
      setError("해당 바코드의 상품을 찾을 수 없어요.");
      return;
    }
    setProduct(found);
  };

  const handleAddToCart = () => {
    if (!product) return;

    for (let i = 0; i < quantity; i++) {
      addProductToCartGroup(groupId, {
        id: product.id,
        name: product.name,
        category: product.category,
        price: product.price,
      });
    }

    setSessionScans((prev) => {
      const existing = prev.find((p) => p.id === product.id);
      if (existing) {
        return prev.map((p) => (p.id === product.id ? { ...p, quantity: p.quantity + quantity } : p));
      }
      return [...prev, { id: product.id, name: product.name, quantity }];
    });

    setAdded(true);
    setBarcode("");
  };

  const handleOpenRoute = () => {
    const group = readCartGroups().find((g) => g.id === groupId);
    const stops: RouteStop[] = (group?.products ?? [])
      .filter((p) => p.checked)
      .map((p) => ({ skuId: p.id, label: p.name }));
    setRouteStops(stops);
    setRouteOpen(true);
  };

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-hidden md:max-w-sm">
        <div className="flex shrink-0 items-center gap-3 p-4">
          <Link href="/saved">
            <ChevronLeft size={20} />
          </Link>
          <div>
            <p className="text-base">상품 담기</p>
            <p className="text-xs text-muted-foreground">담는 곳: {groupTitle}</p>
          </div>
        </div>

        <form onSubmit={handleLookup} className="flex shrink-0 gap-2 px-4 pb-2">
          <Input
            placeholder="바코드 숫자를 입력해주세요"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            autoFocus
          />
          <Button type="submit" variant="outline">
            조회
          </Button>
        </form>

        <div className="relative min-h-0 flex-1 shrink">
          <span className="absolute left-8 top-8 h-10 w-10 border-l-2 border-t-2 border-foreground" />
          <span className="absolute right-8 top-8 h-10 w-10 border-r-2 border-t-2 border-foreground" />
          <span className="absolute bottom-8 left-8 h-10 w-10 border-b-2 border-l-2 border-foreground" />
          <span className="absolute bottom-8 right-8 h-10 w-10 border-b-2 border-r-2 border-foreground" />
          {error && (
            <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-sm text-danger">{error}</p>
          )}
          {!product && !error && (
            <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-sm text-muted-foreground">
              바코드를 스캔하거나 숫자를 입력해주세요
            </p>
          )}
        </div>

        {product && (
          <div className="shrink-0 space-y-3 border-t border-border p-4">
            <div className="flex gap-3">
              <div className="h-16 w-16 shrink-0 rounded-md border border-border bg-muted" />
              <div className="flex-1">
                <p className="text-sm">{product.name}</p>
                <p className="text-sm font-semibold">{product.price.toLocaleString()}원</p>
                <p className="text-xs text-muted-foreground">{product.category} · {product.unit}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <QuantityStepper quantity={quantity} onChange={setQuantity} size="lg" />
              <Button className="flex-1" onClick={handleAddToCart}>
                {added ? (
                  <span className="flex items-center justify-center gap-1">
                    <Check size={16} /> 담았어요
                  </span>
                ) : (
                  "카트에 담기"
                )}
              </Button>
            </div>
          </div>
        )}

        {sessionScans.length > 0 && (
          <div className="max-h-28 shrink-0 overflow-y-auto border-t border-border px-4 py-2">
            {sessionScans.map((s) => (
              <div key={s.id} className="flex justify-between py-1 text-xs text-muted-foreground">
                <span>{s.name}</span>
                <span>{s.quantity}개</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border p-4">
          <Link href="/saved">
            <Button variant="outline" className="flex w-full items-center gap-1.5">
              <ShoppingCart size={16} />
              카트 내역 보기
            </Button>
          </Link>
          <Button variant="outline" className="flex w-full items-center gap-1.5" onClick={handleOpenRoute}>
            <MapIcon size={16} />
            동선 보기
          </Button>
        </div>
      </div>

      <RouteDialog open={routeOpen} onClose={() => setRouteOpen(false)} stops={routeStops} />
    </div>
  );
}
