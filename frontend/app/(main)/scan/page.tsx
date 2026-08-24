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

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronDown, ShoppingCart, Map as MapIcon, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScanCartDialog } from "@/components/domain/scan-cart-dialog";
import { StoreMapDialog } from "@/components/domain/store-map-dialog";
import { GroupPickerDialog } from "@/components/domain/group-picker-dialog";
import { apiFetch } from "@/lib/api-client";
import { addProductToCartGroup, updateCartGroups, readCartGroups } from "@/lib/cart-storage";
import { useBarcodeScanner } from "@/lib/use-barcode-scanner";
import { usePermissionStatus } from "@/lib/use-permission-status";
import { PermissionRequestDialog } from "@/components/domain/permission-request-dialog";

const DEFAULT_GROUP_ID = 1;

interface ScannedProduct {
  skuId: number;
  name: string;
  price: number;
  category: string;
  image?: string;
}

// ✅ useSearchParams()가 Suspense 경계 없이 쓰이면 next build의 정적 프리렌더가 실패해서
//   내부 로직을 별도 컴포넌트로 분리하고 아래 default export에서 Suspense로 감쌌습니다.
function ScanPageInner() {
  const searchParams = useSearchParams();
  const initialGroupId = Number(searchParams.get("group") ?? DEFAULT_GROUP_ID);

  const [groups, setGroups] = useState(() => readCartGroups());
  const [groupId, setGroupId] = useState(initialGroupId);
  const selectedGroup = groups.find((g) => g.id === groupId);

  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<ScannedProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<number | null>(null); // 방금 담긴 상품 id (아이콘 잠깐 표시용)

  const [sessionScans, setSessionScans] = useState<Set<number>>(new Set());

  const [cartOpen, setCartOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);

  const refreshGroups = () => setGroups(readCartGroups());

  const existingQty = useMemo(() => {
    if (!product || !selectedGroup) return 0;
    return selectedGroup.products.find((p) => p.id === product.skuId)?.quantity ?? 0;
  }, [product, selectedGroup]);

  // ✅ 실제 GET /api/products/barcode/{barcode} 연동
  const lookupByCode = async (code: string) => {
    if (!code.trim()) return;
    setError(null);
    setJustAdded(null);

    try {
      const found = await apiFetch<{
        skuId: number;
        name: string;
        priceKrw: number;
        finalPriceKrw?: number;
        categoryL1?: string;
        imageUrl?: string | null;
      }>(`/api/products/barcode/${code.trim()}`, { auth: false });
      setProduct({
        skuId: found.skuId,
        name: found.name,
        price: found.finalPriceKrw ?? found.priceKrw,
        category: found.categoryL1 ?? "",
        image: found.imageUrl ?? undefined,
      });
    } catch {
      setProduct(null);
      setError("해당 바코드의 상품을 찾을 수 없어요.");
    }
  };

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    lookupByCode(barcode);
  };

  // ✅ 카메라로 실제 바코드 스캔 — 이미 허용돼있으면 바로 켜지고, 아직 안 물어봤으면
  //   브라우저 기본 팝업 전에 설명 모달을 먼저 보여줍니다.
  const { videoRef, permission: cameraStreamState, supported, start } = useBarcodeScanner((code) => {
    setBarcode(code);
    lookupByCode(code);
  });
  const cameraPermission = usePermissionStatus("camera");
  const [showCameraModal, setShowCameraModal] = useState(false);

  useEffect(() => {
    if (cameraPermission === "granted") {
      start();
    } else if (cameraPermission === "prompt") {
      setShowCameraModal(true);
    } else if (cameraPermission === "unsupported") {
      start(); // Permissions API 미지원 브라우저는 그냥 바로 시도(브라우저 기본 팝업이 뜸)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraPermission]);

  const handleConfirmAdd = () => {
    if (!product) return;
    addProductToCartGroup(groupId, {
      id: product.skuId,
      name: product.name,
      category: product.category,
      price: product.price,
      image: product.image,
    });
    setSessionScans((prev) => new Set(prev).add(product.skuId));
    refreshGroups();
    setJustAdded(product.skuId);
    setBarcode("");
    setProduct(null);
  };

  const handleRemoveEntirely = () => {
    if (!product) return;
    updateCartGroups((gs) =>
      gs.map((g) => (g.id !== groupId ? g : { ...g, products: g.products.filter((p) => p.id !== product.skuId) }))
    );
    setSessionScans((prev) => {
      const next = new Set(prev);
      next.delete(product.skuId);
      return next;
    });
    refreshGroups();
    setBarcode("");
    setProduct(null);
  };

  return (
    // 공용 하단탭바(h-16=4rem)를 뺀 높이로 고정 — 이전엔 h-dvh를 그대로 써서 버튼이 탭바 밑으로 밀려나던 문제 수정
    <div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden">
      <div className="mx-auto flex h-full w-full flex-col overflow-hidden md:max-w-4xl">
        <div className="flex shrink-0 items-center gap-3 p-4">
          <p className="text-base">상품 담기</p>
        </div>

        {/* 담는 곳(리스트) 직접 선택 */}
        <div className="shrink-0 px-4 pb-2">
          <button
            type="button"
            onClick={() => setGroupPickerOpen(true)}
            className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2.5 text-left text-sm"
          >
            <span className="min-w-0 truncate">
              {selectedGroup ? `${selectedGroup.title} (${selectedGroup.products.length}개)` : "리스트 선택"}
            </span>
            <ChevronDown size={16} className="shrink-0 text-muted-foreground" />
          </button>
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

        <div className="relative min-h-0 flex-1 shrink overflow-hidden bg-black">
          {cameraStreamState !== "granted" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-white">
                {cameraStreamState === "denied"
                  ? "카메라 권한이 거부됐어요. 브라우저 설정에서 허용해주세요."
                  : "카메라를 여는 중..."}
              </p>
            </div>
          )}
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline />

          {cameraStreamState === "granted" && !supported && (
            <p className="absolute inset-x-4 bottom-4 text-center text-xs text-white/80">
              이 브라우저는 자동 바코드 인식을 지원하지 않아요. 숫자를 직접 입력해주세요.
            </p>
          )}

          <span className="absolute left-8 top-8 h-10 w-10 border-l-2 border-t-2 border-white" />
          <span className="absolute right-8 top-8 h-10 w-10 border-r-2 border-t-2 border-white" />
          <span className="absolute bottom-8 left-8 h-10 w-10 border-b-2 border-l-2 border-white" />
          <span className="absolute bottom-8 right-8 h-10 w-10 border-b-2 border-r-2 border-white" />
          {error && (
            <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-sm text-danger">{error}</p>
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
            카트 내역 보기{selectedGroup && ` (${selectedGroup.products.length}개)`}
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
      <GroupPickerDialog
        open={groupPickerOpen}
        groups={groups}
        selectedGroupId={groupId}
        onClose={() => setGroupPickerOpen(false)}
        onSelect={setGroupId}
        onGroupsChange={refreshGroups}
      />
      <PermissionRequestDialog
        open={showCameraModal}
        kind="camera"
        onConfirm={() => {
          setShowCameraModal(false);
          start();
        }}
        onClose={() => setShowCameraModal(false)}
      />
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="h-dvh" />}>
      <ScanPageInner />
    </Suspense>
  );
}
