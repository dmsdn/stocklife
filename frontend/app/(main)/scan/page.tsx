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

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ShoppingCart, Map as MapIcon, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScanCartDialog } from "@/components/domain/scan-cart-dialog";
import { StoreMapDialog } from "@/components/domain/store-map-dialog";
import { GroupPickerDialog } from "@/components/domain/group-picker-dialog";
import { apiFetch, isLoggedIn } from "@/lib/api-client";
import {
  addProductToCartGroup,
  updateCartGroups,
  readCartGroups,
  loadCartGroups,
  createCartGroup,
  syncUpdateServerCart,
  type CartGroup,
} from "@/lib/cart-storage";
import { useBarcodeScanner } from "@/lib/use-barcode-scanner";
import { QuantityStepper } from "@/components/domain/quantity-stepper";

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
  const requestedGroupId = searchParams.get("group")
    ? Number(searchParams.get("group"))
    : null;

  // ✅ readCartGroups()는 로그인 상태여도 sessionStorage 캐시만 읽는 동기 함수라, /saved를
  //   먼저 안 들르고 바로 /scan에 들어오면 캐시가 비어있어서 groupId=1(하드코딩 기본값)이
  //   실제 서버에 없는 리스트를 가리키는 문제가 있었습니다. 실제 서버 조회(loadCartGroups)로
  //   바꾸고, 리스트가 아예 없으면 자동으로 하나 만들어서 그리로 담습니다.
  const [groups, setGroups] = useState<CartGroup[]>(() => readCartGroups());
  const [groupId, setGroupId] = useState<number | null>(requestedGroupId);
  const selectedGroup = groups.find((g) => g.id === groupId);

  useEffect(() => {
    loadCartGroups().then(async (loaded) => {
      let finalGroups = loaded;

      if (finalGroups.length === 0) {
        const created = await createCartGroup("장보기 리스트");
        finalGroups = [created];
      }

      setGroups(finalGroups);

      setGroupId((current) => {
        if (current && finalGroups.some((g) => g.id === current)) return current;
        return finalGroups[0].id;
      });
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<ScannedProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<number | null>(null);

  const [sessionScans, setSessionScans] = useState<Set<number>>(new Set());
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cartOpen, setCartOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);

  const refreshGroups = () => setGroups(readCartGroups());

  const existingQty = useMemo(() => {
    if (!product || !selectedGroup) return 0;
    return (
      selectedGroup.products.find((p) => p.id === product.skuId)?.quantity ?? 0
    );
  }, [product, selectedGroup]);

  // 담긴 직후 뜨는 패널을 닫는다 (자동 타이머 / X버튼 공용).
  const closeAddedPanel = () => {
    if (autoCloseTimer.current) {
      clearTimeout(autoCloseTimer.current);
      autoCloseTimer.current = null;
    }

    setProduct(null);
    setJustAdded(null);
  };

  // ✅ 실제 GET /api/products/barcode/{barcode} 연동.
  //   예전엔 조회만 하고 "담기" 버튼을 한 번 더 눌러야 했는데, 스캔 즉시 자동으로
  //   1개 담기고, 이후엔 +/- 스테퍼로 개수만 조절하는 방식으로 바꿨습니다.
  const lookupByCode = async (code: string) => {
    if (!code.trim()) return;

    if (!groupId) {
      setError("담을 리스트를 준비하는 중이에요. 잠시 후 다시 스캔해주세요.");
      return;
    }

    setError(null);
    setJustAdded(null);

    if (autoCloseTimer.current) {
      clearTimeout(autoCloseTimer.current);
      autoCloseTimer.current = null;
    }

    try {
      const found = await apiFetch<{
        skuId: number;
        name: string;
        priceKrw: number;
        finalPriceKrw?: number;
        categoryL1?: string;
        imageUrl?: string | null;
      }>(`/api/products/barcode/${code.trim()}`, { auth: false });

      const scanned = {
        skuId: found.skuId,
        name: found.name,
        price: found.finalPriceKrw ?? found.priceKrw,
        category: found.categoryL1 ?? "",
        image: found.imageUrl ?? undefined,
      };

      setProduct(scanned);

      // ✅ 조회되자마자 바로 1개 담기
      await addProductToCartGroup(groupId, {
        id: scanned.skuId,
        name: scanned.name,
        category: scanned.category,
        price: scanned.price,
        image: scanned.image,
      });

      setSessionScans((prev) => new Set(prev).add(scanned.skuId));
      refreshGroups();
      setJustAdded(scanned.skuId);

      // ✅ 담긴 직후 패널은 5초 뒤 자동으로 닫힘
      autoCloseTimer.current = setTimeout(() => {
        closeAddedPanel();
      }, 5000);
    } catch {
      setProduct(null);
      setError("해당 바코드의 상품을 찾을 수 없어요.");
    }
  };

  // 언마운트 시 남아있는 타이머 정리
  useEffect(() => {
    return () => {
      if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
    };
  }, []);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    lookupByCode(barcode);
  };

  // ✅ Scan 화면 진입 시 바로 카메라 시작.
  // 브라우저가 아직 카메라 권한을 요청하지 않았다면
  // 여기서 브라우저 기본 권한 팝업이 표시됩니다.
  const {
    videoRef,
    permission: cameraStreamState,
    supported,
    start,
  } = useBarcodeScanner((code) => {
    setBarcode(code);
    lookupByCode(code);
  });

  useEffect(() => {
    start();

    // Scan 페이지를 벗어나면 useBarcodeScanner 내부의 cleanup에서
    // 카메라 스트림이 종료됩니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRemoveEntirely = () => {
    if (!product) return;

    updateCartGroups((gs) =>
      gs.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              products: g.products.filter((p) => p.id !== product.skuId),
            }
      )
    );

    setSessionScans((prev) => {
      const next = new Set(prev);
      next.delete(product.skuId);
      return next;
    });

    refreshGroups();
    setBarcode("");
    closeAddedPanel();
  };

  // ✅ 스캔 직후 뜨는 +/- 스테퍼용. 0으로 내리면 리스트에서 완전히 뺍니다.
  const handleQuantityChange = (nextQty: number) => {
    if (!product) return;

    if (nextQty <= 0) {
      handleRemoveEntirely();
      return;
    }

    updateCartGroups((gs) =>
      gs.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              products: g.products.map((p) =>
                p.id === product.skuId
                  ? { ...p, quantity: nextQty }
                  : p
              ),
            }
      )
    );

    if (isLoggedIn()) {
      const cartItemId = groups
        .find((g) => g.id === groupId)
        ?.products.find((p) => p.id === product.skuId)?.cartItemId;

      void syncUpdateServerCart(cartItemId, nextQty);
    }

    refreshGroups();

    // 수량을 만지고 있는 동안은 패널이 갑자기 사라지지 않도록 자동 닫힘 타이머를 재시작.
    if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);

    autoCloseTimer.current = setTimeout(() => {
      closeAddedPanel();
    }, 5000);
  };

  return (
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
            className="flex w-full items-center justify-between rounded-sm border border-border px-3 py-2.5 text-left text-sm"
          >
            <span className="min-w-0 truncate">
              {selectedGroup
                ? `${selectedGroup.title} (${selectedGroup.products.length}개)`
                : "리스트 선택"}
            </span>
            <ChevronDown
              size={16}
              className="shrink-0 text-muted-foreground"
            />
          </button>
        </div>

        <form
          onSubmit={handleLookup}
          className="flex shrink-0 gap-2 px-4 pb-2"
        >
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

          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            muted
            playsInline
          />

          {cameraStreamState === "granted" && !supported && (
            <p className="absolute inset-x-4 bottom-4 text-center text-xs text-white/80">
              이 브라우저는 자동 바코드 인식을 지원하지 않아요. 숫자를 직접
              입력해주세요.
            </p>
          )}

          <span className="absolute left-8 top-8 h-10 w-10 border-l-2 border-t-2 border-white" />
          <span className="absolute right-8 top-8 h-10 w-10 border-r-2 border-t-2 border-white" />
          <span className="absolute bottom-8 left-8 h-10 w-10 border-b-2 border-l-2 border-white" />
          <span className="absolute bottom-8 right-8 h-10 w-10 border-b-2 border-r-2 border-white" />

          {error && (
            <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-sm text-danger">
              {error}
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
              <div className="h-16 w-16 shrink-0 rounded-sm border border-border bg-muted" />

              <div className="flex-1">
                <p className="text-sm">{product.name}</p>
                <p className="text-sm font-semibold">
                  {product.price.toLocaleString()}원
                </p>
                <p className="flex items-center gap-1 text-xs text-success">
                  <Check size={12} />
                  담았어요
                </p>
              </div>

              <button
                type="button"
                aria-label="닫기"
                onClick={closeAddedPanel}
                className="flex h-6 w-6 shrink-0 items-center justify-center self-start text-muted-foreground"
              >
                <X size={16} />
              </button>
            </div>

            {/* 스캔 시점에 이미 1개 담긴 상태 */}
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                className="flex items-center gap-1.5"
                onClick={handleRemoveEntirely}
              >
                <X size={16} />
                카트에서 빼기
              </Button>

              <QuantityStepper
                quantity={existingQty}
                onChange={handleQuantityChange}
                min={0}
              />
            </div>
          </div>
        )}

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border p-4">
          <Button
            variant="outline"
            className="flex w-full items-center gap-1.5"
            onClick={() => setCartOpen(true)}
          >
            <ShoppingCart size={16} />
            카트 내역 보기
            {selectedGroup && ` (${selectedGroup.products.length}개)`}
          </Button>

          <Button
            variant="outline"
            className="flex w-full items-center gap-1.5"
            onClick={() => setRouteOpen(true)}
          >
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