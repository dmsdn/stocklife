// app/(main)/saved/[groupId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Map as MapIcon, PlayCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/domain/quantity-stepper";
import { StoreMapDialog } from "@/components/domain/store-map-dialog";
import { readCartGroups, updateCartGroups, type CartGroup } from "@/lib/cart-storage";

export default function SavedGroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = Number(params.groupId);

  const [group, setGroup] = useState<CartGroup | null>(null);
  const [routeOpen, setRouteOpen] = useState(false);

  useEffect(() => {
    setGroup(readCartGroups().find((g) => g.id === groupId) ?? null);
  }, [groupId]);

  const handleQuantityChange = (productId: number, quantity: number) => {
    const next = updateCartGroups((gs) =>
      gs.map((g) =>
        g.id !== groupId ? g : { ...g, products: g.products.map((p) => (p.id === productId ? { ...p, quantity } : p)) }
      )
    );
    setGroup(next.find((g) => g.id === groupId) ?? null);
  };

  const handleToggleChecked = (productId: number) => {
    const next = updateCartGroups((gs) =>
      gs.map((g) =>
        g.id !== groupId
          ? g
          : { ...g, products: g.products.map((p) => (p.id === productId ? { ...p, checked: !p.checked } : p)) }
      )
    );
    setGroup(next.find((g) => g.id === groupId) ?? null);
  };

  const handleRemove = (productId: number) => {
    const next = updateCartGroups((gs) =>
      gs.map((g) => (g.id !== groupId ? g : { ...g, products: g.products.filter((p) => p.id !== productId) }))
    );
    setGroup(next.find((g) => g.id === groupId) ?? null);
  };

  if (!group) {
    return (
      <div className="mx-auto max-w-md p-4">
        <p className="py-10 text-center text-sm text-muted-foreground">리스트를 찾을 수 없어요.</p>
      </div>
    );
  }

  const total = group.products.reduce((sum, p) => sum + p.price * p.quantity, 0);

  return (
    <div className="mx-auto max-w-md p-4 pb-24 md:max-w-2xl md:p-8">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/saved">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <p className="text-base font-medium">{group.title}</p>
          <p className="text-xs text-muted-foreground">{group.products.length}개 · {total.toLocaleString()}원</p>
        </div>
      </div>

      <div className="divide-y divide-border">
        {group.products.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            아직 담긴 상품이 없어요. 검색이나 "장보기 시작"에서 담아보세요.
          </p>
        )}
        {group.products.map((product) => (
          <div key={product.id} className="flex items-center gap-3 py-3">
            <input
              type="checkbox"
              checked={product.checked}
              onChange={() => handleToggleChecked(product.id)}
              className="h-4 w-4 rounded border-border"
            />
            <div className="h-14 w-14 shrink-0 rounded-md border border-border bg-muted" />
            <div className="flex-1">
              <p className="text-sm">{product.name}</p>
              <p className="text-xs text-muted-foreground">{product.price.toLocaleString()}원</p>
              <div className="mt-1">
                <QuantityStepper quantity={product.quantity} onChange={(q) => handleQuantityChange(product.id, q)} size="sm" />
              </div>
            </div>
            <button type="button" aria-label="삭제" onClick={() => handleRemove(product.id)} className="text-muted-foreground">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" className="flex items-center gap-1.5" onClick={() => setRouteOpen(true)}>
          <MapIcon size={16} />
          동선 보기
        </Button>
        <Button className="flex items-center gap-1.5" onClick={() => router.push(`/scan?group=${groupId}`)}>
          <PlayCircle size={16} />
          장보기 시작
        </Button>
      </div>

      <StoreMapDialog open={routeOpen} onClose={() => setRouteOpen(false)} groupId={groupId} collectedIds={new Set()} />
    </div>
  );
}
