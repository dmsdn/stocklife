// app/(main)/scan/page.tsx
// ✅ 전면 재설계
//   - 담는 곳(리스트)을 화면에서 직접 선택 가능 (드롭다운)
//   - "카트 내역 보기"는 저장(saved) 화면이 아니라, 지금 스캔해서 담긴 상품만 보여주는
//     결제용 화면(ScanCartDialog)
//   - 수량/삭제는 바코드로만: 이미 담긴 상품을 다시 스캔하면 "+1개 더 담을까요?" 상태가 되고,
//     "담기"(커밋) 또는 "카트에서 빼기"(그 상품 전체 삭제) 중 선택
//   - "동선 보기"는 실제 지도 이미지 위에 핀+경로선(StoreMapDialog)
//   - h-dvh 대신 공용 하단탭바 높이(4rem)를 뺀 높이로 고쳐서 버튼이 화면 밖으로 안 밀려남
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ShoppingCart, Map as MapIcon, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScanCartDialog } from "@/components/domain/scan-cart-dialog";
import { StoreMapDialog } from "@/components/domain/store-map-dialog";
import { findMockProductByBarcode, type MockProduct } from "@/lib/mock-products";
import { addProductToCartGroup, updateCartGroups, readCartGroups } from "@/lib/cart-storage";

const DEFAULT_GROUP_ID = 1;

export default function ScanPage() {
  const searchParams = useSearchParams();
  const initialGroupId = Number(searchParams.get("group") ?? DEFAULT_GROUP_ID);

  const [groups, setGroups] = useState(() => readCartGroups());
  const [groupId, setGroupId] = useState(initialGroupId);
  const selectedGroup = groups.find((g) => g.id === groupId);

  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<MockProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<number | null>(null); // 방금 담긴 상품 id (아이콘 잠깐 표시용)

  const [sessionScans, setSessionScans] = useState<Set<number>>(new Set());

  const [cartOpen, setCartOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);

  const refreshGroups = () => setGroups(readCartGroups());

  const existingQty = useMemo(() => {
    if (!product || !selectedGroup) return 0;
    return selectedGroup.products.find((p) => p.id === product.id)?.quantity ?? 0;
  }, [product, selectedGroup]);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) return;
    setError(null);
    setJustAdded(null);

    const found = findMockProductByBarcode(barcode.trim());
    if (!found) {
      setProduct(null);
      setError("해당 바코드의 상품을 찾을 수 없어요.");
      return;
    }
    setProduct(found);
  };

  const handleConfirmAdd = () => {
    if (!product) return;
    addProductToCartGroup(groupId, {
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
    });
    setSessionScans((prev) => new Set(prev).add(product.id));
    refreshGroups();
    setJustAdded(product.id);
    setBarcode("");
    setProduct(null);
  };

  const handleRemoveEntirely = () => {
    if (!product) return;
    updateCartGroups((gs) =>
      gs.map((g) => (g.id !== groupId ? g : { ...g, products: g.products.filter((p) => p.id !== product.id) }))
    );
    setSessionScans((prev) => {
      const next = new Set(prev);
      next.delete(product.id);
      return next;
    });
    refreshGroups();
    setBarcode("");
    setProduct(null);
  };

  return (
    // 공용 하단탭바(h-16=4rem)를 뺀 높이로 고정 — 이전엔 h-dvh를 그대로 써서 버튼이 탭바 밑으로 밀려나던 문제 수정
    <div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-hidden md:max-w-sm">
        <div className="flex shrink-0 items-center gap-3 p-4">
          <Link href="/saved">
            <ChevronLeft size={20} />
          </Link>
          <p className="text-base">상품 담기</p>
        </div>

        {/* 담는 곳(리스트) 직접 선택 */}
        <div className="shrink-0 px-4 pb-2">
          <label className="mb-1 block text-xs text-muted-foreground">담는 곳</label>
          <select
            value={groupId}
            onChange={(e) => setGroupId(Number(e.target.value))}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title} ({g.products.length}개)
              </option>
            ))}
          </select>
        </div>

        <form onSubmit={handleLookup} className="flex shrink-0 gap-2 px-4 pb-2">
          <Input
            placeholder="바코드 숫자를 입력해주세요"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
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
          {justAdded && (
            <p className="absolute inset-x-4 top-1/2 flex -translate-y-1/2 items-center justify-center gap-1 text-sm text-success">
              <Check size={16} /> 담았어요
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
                <p className="text-xs text-muted-foreground">
                  {existingQty > 0
                    ? `현재 ${existingQty}개 담겨있어요 → 담으면 ${existingQty + 1}개`
                    : "아직 안 담겨있어요 → 담으면 1개"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {existingQty > 0 && (
                <Button variant="outline" className="flex flex-1 items-center gap-1.5" onClick={handleRemoveEntirely}>
                  <X size={16} />
                  카트에서 빼기
                </Button>
              )}
              <Button className="flex-1" onClick={handleConfirmAdd}>
                담기
              </Button>
            </div>
          </div>
        )}

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border p-4">
          <Button variant="outline" className="flex w-full items-center gap-1.5" onClick={() => setCartOpen(true)}>
            <ShoppingCart size={16} />
            카트 내역 보기
          </Button>
          <Button variant="outline" className="flex w-full items-center gap-1.5" onClick={() => setRouteOpen(true)}>
            <MapIcon size={16} />
            동선 보기
          </Button>
        </div>
      </div>

      <ScanCartDialog
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        groupId={groupId}
        onCheckedOut={() => {
          refreshGroups();
          setSessionScans(new Set());
        }}
      />
      <StoreMapDialog
        open={routeOpen}
        onClose={() => setRouteOpen(false)}
        groupId={groupId}
        collectedIds={sessionScans}
      />
    </div>
  );
}
