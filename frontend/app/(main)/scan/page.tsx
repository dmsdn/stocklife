// app/(main)/scan/page.tsx
// ✅ 전면 재설계
//   - 담는 곳(리스트)을 화면에서 직접 선택 가능 (드롭다운)
//   - ✅ 담은 상품 목록 — 예전엔 "카트 내역 보기" 버튼을 눌러야 모달이 뜨는 방식이었는데,
//     네이버맵/카카오맵 바텀시트처럼 화면 하단에 항상 걸쳐 있다가(평소엔 가장 최근 담은
//     상품 1개만 보이는 "peek" 높이) 탭하면 화면 대부분까지 펼쳐져서 스크롤로 전체 목록을
//     보는 방식으로 바꿈. 펼쳐지면 카메라는 자동으로 꺼지고(뒤에 계속 켜둘 이유가 없음),
//     전역 하단탭바도 가려서(BottomBarVisibilityContext) 그 자리에 결제 버튼만 남게 함.
//   - 수량/삭제는 바코드로만: 이미 담긴 상품을 다시 스캔하면 "+1개 더 담을까요?" 상태가 되고,
//     "담기"(커밋) 또는 "카트에서 빼기"(그 상품 전체 삭제) 중 선택
//   - "동선 보기"는 실제 지도 이미지 위에 핀+경로선(StoreMapDialog)
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RiArrowLeftSLine, RiArrowDownSLine, RiMapLine, RiCheckLine, RiCloseLine, RiCameraLine, RiCameraOffLine, RiBankCardLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StoreMapDialog } from "@/components/domain/store-map-dialog";
import { GroupPickerDialog } from "@/components/domain/group-picker-dialog";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";
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
import { readShoppingSession, writeShoppingSession } from "@/lib/shopping-session";
import { QuantityStepper } from "@/components/domain/quantity-stepper";
import { fetchInventoryBatch, pickLocation } from "@/lib/product-location";

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
  // ✅ 홈 Hero Card의 "동선 보러가기" CTA에서 /scan?group=1&route=1로 들어오면
  //   스캔 화면에 진입하자마자 동선 다이얼로그를 바로 띄웁니다.
  const autoOpenRoute = searchParams.get("route") === "1";

  // ✅ readCartGroups()는 로그인 상태여도 sessionStorage 캐시만 읽는 동기 함수라, /saved를
  //   먼저 안 들르고 바로 /scan에 들어오면 캐시가 비어있어서 groupId=1(하드코딩 기본값)이
  //   실제 서버에 없는 리스트를 가리키는 문제가 있었습니다. 실제 서버 조회(loadCartGroups)로
  //   바꾸고, 리스트가 아예 없으면 자동으로 하나 만들어서 그리로 담습니다.
  // ⚠ 초기값을 useState(() => readCartGroups())로 바로 읽으면, 서버(window 없음)는 빈 배열을
  //   그리는데 클라이언트 첫 렌더(hydration 시점)는 이미 캐시된 값을 그려서 hydration
  //   mismatch가 났습니다. 항상 []로 시작하고, 마운트 후 useEffect에서만 캐시를 채웁니다.
  const [groups, setGroups] = useState<CartGroup[]>([]);
  const [groupId, setGroupId] = useState<number | null>(requestedGroupId);
  const selectedGroup = groups.find((g) => g.id === groupId);

  // ✅ 신규 — 담은 상품 목록에도 매대 번호("444 >") 같이 보여주기(리스트 상세/카트랑 동일 패턴)
  const [locationBySkuId, setLocationBySkuId] = useState<Map<number, string>>(new Map());
  useEffect(() => {
    const ids = selectedGroup?.products.map((p) => p.id) ?? [];
    if (ids.length === 0) return;
    fetchInventoryBatch(ids)
      .then((map) => {
        const next = new Map<number, string>();
        map.forEach((items, skuId) => {
          const loc = pickLocation(items);
          if (loc) next.set(skuId, loc.locationId);
        });
        setLocationBySkuId(next);
      })
      .catch(() => setLocationBySkuId(new Map()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup?.products.map((p) => p.id).join(",")]);

  useEffect(() => {
    setGroups(readCartGroups());
  }, []);

  useEffect(() => {
    loadCartGroups()
      .then(async (loaded) => {
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
      })
      // ✅ 서버 요청이 실패해도(백엔드 500 등) 화면이 "리스트 선택"에 멈춰있지 않게,
      //   다른 화면들과 동일하게 로컬 캐시로 폴백합니다.
      .catch(() => {
        const cached = readCartGroups();
        setGroups(cached);
        if (cached.length > 0) {
          setGroupId((current) => (current && cached.some((g) => g.id === current) ? current : cached[0].id));
        }
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<ScannedProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sessionScans, setSessionScans] = useState<Set<number>>(new Set());

  // ✅ 홈 화면에서 돌아왔거나 새로고침했을 때도 이미 스캔한 개수가 유지되도록,
  //   현재 groupId와 일치하는 저장된 세션이 있으면 복원합니다.
  useEffect(() => {
    if (groupId == null) return;
    const saved = readShoppingSession();
    if (saved && saved.groupId === groupId) {
      setSessionScans(new Set(saved.scannedSkuIds));
    }
  }, [groupId]);
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [routeOpen, setRouteOpen] = useState(false);

  // ✅ 상품 목록이 이제 화면 대부분을 항상 차지하는 기본 레이아웃이라, 이 페이지에서는
  //   전역 하단탭바를 계속 숨기고 그 자리에 이 페이지 자체의 결제 버튼을 둡니다.
  const { setHidden: setBottomBarHidden } = useBottomBarVisibility();
  useEffect(() => {
    setBottomBarHidden(true);
    return () => setBottomBarHidden(false);
  }, [setBottomBarHidden]);

  useEffect(() => {
    if (autoOpenRoute && groupId != null) setRouteOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenRoute, groupId]);
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
        discontinued?: boolean;
      }>(`/api/products/barcode/${code.trim()}`, { auth: false });

      // ✅ 단종 상품 — 백엔드는 조회 자체는 성공시키고 discontinued 플래그만 내려주므로,
      //   "인식 안 됨" 취급은 여기서 프론트가 직접 막습니다. 장바구니에 안 담고 안내만 표시.
      if (found.discontinued) {
        setProduct(null);
        setError(`${found.name}은(는) 단종된 상품이라 담을 수 없어요.`);
        return;
      }

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

      setSessionScans((prev) => {
        const next = new Set(prev).add(scanned.skuId);
        writeShoppingSession({ groupId, scannedSkuIds: [...next] });
        return next;
      });
      refreshGroups();

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
    stop,
  } = useBarcodeScanner((code) => {
    setBarcode(code);
    lookupByCode(code);
  });

  // ✅ 신규 — 카메라를 앱 안에서 사용자가 직접 켜고 끌 수 있게. 권한은 있어도
  //   "지금은 카메라 화면 안 보고 싶다"는 경우를 위한 수동 토글입니다.
  const [cameraEnabled, setCameraEnabled] = useState(false);

  const toggleCamera = () => {
    if (cameraEnabled) {
      stop();
      setCameraEnabled(false);
    } else {
      setCameraEnabled(true);
    }
  };

  // ✅ 버그 수정 — 예전엔 setCameraEnabled(true) 바로 다음 줄에서 start()를 불렀는데,
  //   <video>가 {cameraEnabled && ...} 조건부라 그 시점엔 아직 리렌더 전이라 videoRef.current가
  //   null이었습니다(useBarcodeScanner.start()는 그러면 그냥 조용히 return). 그래서 카메라를
  //   켜도 permission이 "idle"에 멈춰서 "카메라를 여는 중..."만 계속 떴던 것 — cameraEnabled가
  //   true가 된 "뒤"(비디오 엘리먼트가 실제로 DOM에 붙은 뒤)에 start()가 실행되도록 useEffect로.
  useEffect(() => {
    if (cameraEnabled) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraEnabled]);

  // ✅ 카메라는 이제 기본값이 꺼짐 — 사용자가 카메라 버튼을 눌러야(toggleCamera) 켜짐.
  //   페이지를 벗어나면 useBarcodeScanner 내부 cleanup에서 스트림이 정리됩니다.

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

  // ✅ ScanCartDialog가 하던 "결제하기"를 이 화면 안으로 그대로 옮김 — 담긴 상품 전부
  //   비우고 세션 스캔 기록도 초기화.
  const handleCheckout = () => {
    if (!groupId) return;
    updateCartGroups((gs) => gs.map((g) => (g.id === groupId ? { ...g, products: [] } : g)));
    refreshGroups();
    setSessionScans(new Set());
    writeShoppingSession(null);
  };

  const cartTotalCount = selectedGroup?.products.reduce((n, p) => n + p.quantity, 0) ?? 0;
  const cartTotalPrice = selectedGroup?.products.reduce((s, p) => s + p.price * p.quantity, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-background md:static md:h-[calc(100dvh-4rem)]">
      <div className="relative mx-auto flex h-full w-full flex-col overflow-hidden md:max-w-4xl">
        {/* ✅ 참고 이미지(Frame 127) 헤더 — 뒤로가기 + 가운데 "{리스트 이름} ⌄" 드롭다운.
            리스트 선택은 그대로 GroupPickerDialog를 열되, 트리거 버튼만 이 자리로 합침.
            "동선 보기"는 항상 우측 상단에 고정. */}
        <div className="relative flex shrink-0 items-center justify-center px-4 py-3">
          <Link
            href="/"
            aria-label="뒤로가기"
            className="absolute left-4 flex h-8 w-8 items-center justify-center text-muted-foreground"
          >
            <RiArrowLeftSLine size={22} />
          </Link>
          <button
            type="button"
            onClick={() => setGroupPickerOpen(true)}
            className="flex min-w-0 max-w-[55%] items-center gap-1 text-sm font-medium"
          >
            <span className="truncate">{selectedGroup ? selectedGroup.title : "리스트 선택"}</span>
            <RiArrowDownSLine size={18} className="shrink-0 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => setRouteOpen(true)}
            className="absolute right-4 flex h-8 items-center gap-1 rounded-full border border-[#F4F4F4] px-3 text-xs font-medium"
          >
            <RiMapLine size={16} />
            동선 보기
          </button>
        </div>

        {/* ✅ 카메라 — 화면 좌우 끝까지 꽉 채우고(마진 없음), 켜짐/꺼짐 상관없이 항상
            "화면 윗부분 전체"(flex-1, 남는 공간 다 차지)를 씀. 켜져 있으면 실시간 영상,
            꺼져 있으면 그냥 꺼짐 안내만 같은 자리에 표시 — 자리 자체는 그대로 유지되니까
            아래 입력창/목록/결제 버튼이 화면 중간에 붕 뜨지 않고 항상 하단에 붙어있음. */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-[#666666]">
          {cameraEnabled && cameraStreamState !== "denied" ? (
            <>
              {cameraStreamState !== "granted" && (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-sm text-white">카메라를 여는 중...</p>
                </div>
              )}

              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-cover"
                muted
                playsInline
              />

              {/* ✅ 표시선(가로 80% · 세로 30%, 중앙) 안쪽은 그대로 선명하게 보이고,
                  바깥쪽만 4개의 흐림 밴드(위/아래/좌/우)로 덮어서 흐리게 처리합니다. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[35%] backdrop-blur-sm" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[35%] backdrop-blur-sm" />
              <div className="pointer-events-none absolute left-0 top-[35%] h-[30%] w-[10%] backdrop-blur-sm" />
              <div className="pointer-events-none absolute right-0 top-[35%] h-[30%] w-[10%] backdrop-blur-sm" />

              <span className="absolute left-[10%] top-[35%] h-8 w-8 border-l-2 border-t-2 border-white" />
              <span className="absolute right-[10%] top-[35%] h-8 w-8 border-r-2 border-t-2 border-white" />
              <span className="absolute bottom-[35%] left-[10%] h-8 w-8 border-b-2 border-l-2 border-white" />
              <span className="absolute bottom-[35%] right-[10%] h-8 w-8 border-b-2 border-r-2 border-white" />

              {error && (
                <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-sm text-danger">
                  {error}
                </p>
              )}

              {cameraStreamState === "granted" && !supported && (
                <p className="absolute inset-x-4 bottom-2 text-center text-xs text-white/80">
                  이 브라우저는 자동 바코드 인식을 지원하지 않아요. 숫자를 직접 입력해주세요.
                </p>
              )}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
              <p className="text-sm text-white">
                {cameraStreamState === "denied" ? "카메라 권한이 꺼져 있어요." : "카메라가 꺼져 있어요."}
              </p>
              <p className="text-xs text-white/60">아래 바코드 숫자로도 담을 수 있어요.</p>
            </div>
          )}
        </div>

        {/* ✅ 바코드 입력 — 카메라 바로 아래, 담은 상품 목록 바로 위. */}
        <div className="shrink-0 px-4 py-2">
          <form onSubmit={handleLookup} className="flex gap-2">
            <Input
              placeholder="바코드 숫자를 입력해주세요"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
            />
            <Button type="submit" variant="outline" className="shrink-0">
              조회
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-label={cameraEnabled ? "카메라 끄기" : "카메라 켜기"}
              onClick={toggleCamera}
              className="shrink-0"
            >
              {cameraEnabled ? <RiCameraOffLine size={18} /> : <RiCameraLine size={18} />}
            </Button>
          </form>
        </div>

        {/* 스캔 직후 담김 확인 + 수량 조절 패널 */}
        {product && (
          <div className="mx-4 mb-2 shrink-0 space-y-3 rounded-lg border border-[#F4F4F4] p-4">
            <div className="flex gap-3">
              {product.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.image} alt="" className="h-16 w-16 shrink-0 rounded-sm border border-border object-cover" />
              ) : (
                <div className="h-16 w-16 shrink-0 rounded-sm border border-border bg-muted" />
              )}

              <div className="flex-1">
                <p className="text-sm">{product.name}</p>
                <p className="text-sm font-semibold">
                  {product.price.toLocaleString()}원
                </p>
                <p className="flex items-center gap-1 text-xs text-success">
                  <RiCheckLine size={24} />
                  담았어요
                </p>
              </div>

              <button
                type="button"
                aria-label="닫기"
                onClick={closeAddedPanel}
                className="flex h-6 w-6 shrink-0 items-center justify-center self-start text-muted-foreground"
              >
                <RiCloseLine size={24} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                className="flex items-center gap-1.5"
                onClick={handleRemoveEntirely}
              >
                <RiCloseLine size={24} />
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

        {/* ✅ 담은 상품 — 바코드 입력 바로 아래에 붙어서(margin 없이), "하나 정도 보이는"
            작은 높이로. 화면에 남는 공간은 이 블록이 아니라 바로 아래 spacer가 떠맡아서
            결제 버튼을 화면 하단에 붙여줌. */}
        <div className="max-h-28 shrink-0 overflow-y-auto border-t border-[#F4F4F4] px-4">
          {!selectedGroup || selectedGroup.products.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">아직 담은 상품이 없어요.</p>
          ) : (
            <div className="divide-y divide-border">
              {selectedGroup.products.map((p) => (
                <div key={p.id} className="flex gap-3 py-2">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="h-12 w-12 shrink-0 rounded-sm border border-border object-cover" />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded-sm border border-border bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{p.name}</p>
                    {locationBySkuId.get(p.id) && (
                      <p className="text-xs text-muted-foreground">{locationBySkuId.get(p.id)}</p>
                    )}
                    <div className="mt-0.5 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{p.quantity}개</span>
                      <span className="font-semibold">{(p.price * p.quantity).toLocaleString()}원</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ✅ 결제 — 전역 하단탭바 대신 이 화면 내내 여기 고정 */}
        <div className="shrink-0 space-y-3 border-t border-[#F4F4F4] p-4">
          <div className="flex items-center justify-between text-base font-semibold">
            <span>총 {cartTotalCount}개</span>
            <span>{cartTotalPrice.toLocaleString()}원</span>
          </div>
          <button
            type="button"
            disabled={cartTotalCount === 0}
            onClick={handleCheckout}
            className="flex h-[60px] w-full items-center justify-center gap-1.5 rounded-full bg-brand text-base font-medium text-brand-foreground disabled:opacity-50"
          >
            <RiBankCardLine size={20} />
            결제하기
          </button>
        </div>
      </div>

      <StoreMapDialog
        open={routeOpen}
        onClose={() => setRouteOpen(false)}
        groupId={groupId ?? DEFAULT_GROUP_ID}
        collectedIds={sessionScans}
      />

      <GroupPickerDialog
        open={groupPickerOpen}
        groups={groups}
        selectedGroupId={groupId ?? DEFAULT_GROUP_ID}
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