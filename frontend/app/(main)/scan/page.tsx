// app/(main)/scan/page.tsx
// ✅ 전면 재설계
//   - 담는 곳(리스트)을 화면에서 직접 선택 가능 (드롭다운)
//   - ✅ 담은 상품 목록 — 예전엔 "카트 내역 보기" 버튼을 눌러야 모달이 뜨는 방식이었는데,
//     네이버맵/카카오맵 바텀시트처럼 화면 하단에 항상 걸쳐 있다가(평소엔 가장 최근 담은
//     상품 1개만 보이는 "peek" 높이) 탭하면 화면 대부분까지 펼쳐져서 스크롤로 전체 목록을
//     보는 방식으로 바꿈. 펼쳐지면 카메라는 자동으로 꺼지고(뒤에 계속 켜둘 이유가 없음),
//     전역 하단탭바도 가려서(BottomBarVisibilityContext) 그 자리에 결제 버튼만 남게 함.
//   - "동선 보기"는 실제 지도 이미지 위에 핀+경로선(StoreMapDialog)
// ✅ 수정(2026-09) —
//   1) "담은 상품" 목록이 리스트(group.products) 전체를 그대로 보여주고 있었음. 이 리스트는
//      AI/검색으로 미리 담아둔 것까지 섞여 있는 "장보기 리스트"라서, 매장에서 실제로 바코드를
//      찍은 것만 보여주려면 sessionScans(이번 쇼핑 세션에 실제로 스캔한 skuId 집합)로 걸러야
//      했는데 안 걸러져 있었음 — 결제 금액도 마찬가지로 이 필터링된 목록 기준으로 다시 계산.
//   2) 결제 금액 위에 적립 예정 포인트 안내(결제 금액의 2% 예상치, 실제 등급 보너스 등에
//      따라 최종 값은 달라질 수 있음).
//   3) 결제하기 — 예전엔 로컬에서 장바구니만 비우고 끝이었음(실제 주문 생성 API 호출이
//      없어서 구매내역/전자영수증에 아무것도 안 남았던 근본 원인). 이제 실제
//      POST /api/orders/checkout을 호출하고, 성공하면 결제 완료 화면으로 이동.
//   4) 비회원은 결제 API가 로그인 전용이라 결제 버튼을 로그인 유도로 바꿈.
//   5) 결제 완료된 리스트는 로컬로 완료 표시해서 다시 스캔/결제 못 하게 막음.
// ✅ 수정(2026-09, 2차) — "스캔 직후 담김 확인" 팝업(카드형 패널)을 완전히 없앰. 스캔하면
//   그냥 목록에 반영되고, 방금 담기거나 개수가 바뀐 상품이 목록 맨 위로 올라오는 것으로
//   충분히 알 수 있음(예전엔 목록 맨 아래에 추가돼서 안 보였음 — sessionScans를 Set으로
//   들고 있는 걸 그대로 활용: 다시 담을 때마다 delete+add로 "가장 최근"으로 갱신하고,
//   렌더할 땐 이 Set의 삽입 순서를 뒤집어서 최근 것부터 보여줌).
//   빼기 흐름도 바꿈: "−" 누르면 그 상품이 선택 표시(배경색)만 되고, 목록 아래에 "몇 개
//   뺄지" 선택 패널(n개 빼기 스테퍼 / 다 빼기)이 뜸 → 개수를 고르면 그제서야 무장되고
//   바코드를 다시 찍어야 실제로 빠짐.
"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RiArrowLeftSLine, RiArrowDownSLine, RiMapLine, RiCameraLine, RiCameraOffLine, RiBankCardLine, RiSubtractLine, RiAddLine, RiCoinLine, RiLoginBoxLine, RiCloseLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StoreMapDialog } from "@/components/domain/store-map-dialog";
import { GroupPickerDialog } from "@/components/domain/group-picker-dialog";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";
import { apiFetch, isLoggedIn, ApiError, resolveImageUrl } from "@/lib/api-client";
import { trackConsumerEvent } from "@/lib/consumer-events";
import { writeLastCheckout } from "@/lib/checkout-summary";
import {
  addProductToCartGroup,
  updateCartGroups,
  readCartGroups,
  loadCartGroups,
  createCartGroup,
  getOrCreateQuickCartGroup,
  syncUpdateServerCart,
  type CartGroup,
} from "@/lib/cart-storage";
import { useBarcodeScanner } from "@/lib/use-barcode-scanner";
import { readShoppingSession, writeShoppingSession } from "@/lib/shopping-session";
import { fetchInventoryBatch, pickLocation } from "@/lib/product-location";
import { isGroupCompleted, markGroupCompleted } from "@/lib/completed-groups";

const DEFAULT_GROUP_ID = 1;
// 결제 금액 대비 예상 적립 포인트율 — 백엔드 OrderService.checkout()의 실제 적립 로직
// (netCashPaid의 2%, consumer.earnPoints)과 동일한 기본율. 등급 보너스 등으로 실제
// 값은 달라질 수 있어 "예상"으로만 표기.
const ESTIMATED_POINT_RATE = 0.02;

// ✅ useSearchParams()가 Suspense 경계 없이 쓰이면 next build의 정적 프리렌더가 실패해서
//   내부 로직을 별도 컴포넌트로 분리하고 아래 default export에서 Suspense로 감쌌습니다.
function ScanPageInner() {
  const router = useRouter();
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

  // ✅ 신규(요청) — "리스트 없이 장보기도 추가해달라"에 맞춰, 특정 리스트를 지정하지 않고
  //   들어온 경우(예: 하단탭바 스캔 아이콘으로 바로 진입) 곧장 스캔을 시작하는 대신 먼저
  //   "어느 리스트에 담을지" 고르는 화면을 띄웁니다(리스트 없이 시작하기도 선택 가능).
  //   특정 리스트에서 "장보러 가기"로 들어온 경우(requestedGroupId 있음)는 그 리스트가
  //   이미 정해졌으니 이 단계를 건너뜁니다.
  const [entryPickerOpen, setEntryPickerOpen] = useState(requestedGroupId === null);

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
  const [error, setError] = useState<string | null>(null);

  const [sessionScans, setSessionScans] = useState<Set<number>>(new Set());

  // ✅ 수정(2026-09, 2차) — "−" 누르면 그 상품이 선택 표시만 되고(selectedRemoveSkuId),
  //   목록 아래에 뜨는 선택 패널에서 몇 개 뺄지(removeQuantityDraft) 고른 뒤에야
  //   pendingAction으로 무장됨 — 그 상품 바코드를 다시 스캔해야 실제로 반영됩니다.
  const [selectedRemoveSkuId, setSelectedRemoveSkuId] = useState<number | null>(null);
  const [removeQuantityDraft, setRemoveQuantityDraft] = useState(1);
  const [pendingAction, setPendingAction] = useState<{ skuId: number; quantity: number } | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  // ✅ 신규 — 담은 상품 목록 위 손잡이를 위로 끌어올리면(또는 탭하면) 카메라·바코드
  //   입력을 숨기고 목록만 화면 가득 채워서 쭉 나열되게 함. 아래로 다시 끌면 원상복구.
  const [listExpanded, setListExpanded] = useState(false);
  const listDragStartY = useRef<number | null>(null);
  const listDragged = useRef(false);

  const handleListDragStart = (e: React.PointerEvent) => {
    listDragStartY.current = e.clientY;
    listDragged.current = false;
  };
  const handleListDragMove = (e: React.PointerEvent) => {
    if (listDragStartY.current == null) return;
    const delta = e.clientY - listDragStartY.current;
    if (Math.abs(delta) < 20) return;
    listDragged.current = true;
    if (delta < -20) setListExpanded(true);
    if (delta > 20) setListExpanded(false);
  };
  const handleListDragEnd = () => {
    // 드래그가 거의 없었으면(=그냥 탭) 토글로 처리
    if (!listDragged.current) setListExpanded((v) => !v);
    listDragStartY.current = null;
    listDragged.current = false;
  };

  // ✅ 수정(2026-09) — 백엔드에 실제 cart_group.status가 생겨서 그걸 우선 사용. 체크아웃
  //   성공 시 서버가 실제로 COMPLETED로 바꿔주는 호출이 아직 안 붙어있어서(markCompleted()가
  //   정의만 되고 어디서도 안 불림 — 백엔드 확인 필요) 로컬 플래그도 함께 OR로 봄.
  const groupCompleted = selectedGroup?.status === "COMPLETED" || (groupId != null && isGroupCompleted(groupId));

  // ✅ 신규 — 비회원은 결제(주문 생성) API가 로그인 전용이라 애초에 결제를 못 함. 하이드레이션
  //   불일치 방지를 위해 마운트 후에만 채움(다른 곳들과 동일 패턴).
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    setLoggedIn(isLoggedIn());
  }, []);

  // ✅ 홈 화면에서 돌아왔거나 새로고침했을 때도 이미 스캔한 개수가 유지되도록,
  //   현재 groupId와 일치하는 저장된 세션이 있으면 복원합니다.
  useEffect(() => {
    if (groupId == null) return;
    const saved = readShoppingSession();
    if (saved && saved.groupId === groupId) {
      setSessionScans(new Set(saved.scannedSkuIds));
    }
  }, [groupId]);

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

  // ✅ 수정(2026-09, 2차) — 이제 "몇 개 빼기"를 직접 고를 수 있어서 quantity 파라미터로
  //   받은 만큼 뺌. 남은 개수가 0 이하면 리스트에서 완전히 빼고 sessionScans에서도 제거.
  const decrementScannedProduct = async (skuId: number, productName: string, quantity: number) => {
    if (!groupId) return;
    const current = groups.find((g) => g.id === groupId)?.products.find((p) => p.id === skuId);
    if (!current) return;

    // ✅ 신규(09-03 요청 ④) — 스캔 취소(카트에서 빼기)도 행동 신호. 같은 카테고리를
    //   담았다 뺐다 반복하는 것이 망설임 감시의 재료라 SCAN_ADD와 짝을 맞춰 보냄.
    trackConsumerEvent({ event_type: "SCAN_REMOVE", sku_id: skuId });

    const nextQty = current.quantity - quantity;

    updateCartGroups((gs) =>
      gs.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              products:
                nextQty <= 0
                  ? g.products.filter((p) => p.id !== skuId)
                  : g.products.map((p) => (p.id === skuId ? { ...p, quantity: nextQty } : p)),
            }
      )
    );

    if (isLoggedIn()) {
      void syncUpdateServerCart(current.cartItemId, nextQty <= 0 ? 0 : nextQty);
    }

    if (nextQty <= 0) {
      setSessionScans((prev) => {
        const next = new Set(prev);
        next.delete(skuId);
        writeShoppingSession({ groupId, scannedSkuIds: [...next] });
        return next;
      });
    }

    refreshGroups();
    setError(
      nextQty <= 0
        ? `${productName}을(를) 목록에서 뺐어요.`
        : `${productName} ${quantity}개를 뺐어요. (남은 개수: ${nextQty}개)`
    );
  };

  // ✅ 실제 GET /api/products/barcode/{barcode} 연동. 스캔 즉시 자동으로 1개 담김.
  const lookupByCode = async (code: string) => {
    if (!code.trim()) return;

    // ✅ 수정(2026-09) — 리스트를 고르지 않고 바로 스캔하면 예전엔 "담을 리스트를
    //   준비하는 중이에요"만 뜨고 계속 막혀있었다. "리스트 없이 시작하기"를 누른 것과
    //   똑같이, 뒤에서 조용히 기본 그룹을 마련해서 바로 담아준다 — 별도 안내나 대기 없음.
    let currentGroupId = groupId;
    if (!currentGroupId) {
      try {
        const quick = await getOrCreateQuickCartGroup();
        currentGroupId = quick.id;
        setGroupId(quick.id);
        setGroups((prev) => (prev.some((g) => g.id === quick.id) ? prev : [...prev, quick]));
      } catch {
        setError("담을 리스트를 준비하지 못했어요. 잠시 후 다시 시도해주세요.");
        return;
      }
    } else if (groupCompleted) {
      setError("이미 결제 완료된 리스트예요. 다른 리스트를 선택해주세요.");
      return;
    }

    setError(null);

    try {
      const found = await apiFetch<{
        skuId: number;
        name: string;
        priceKrw: number;
        finalPriceKrw?: number;
        categoryL1?: string;
        imageUrl?: string | null;
        discontinued?: boolean;
        // ✅ 신규(09-03 요청 ④) — 백엔드가 PICK 매대 위치를 같이 줌(요청②) — SCAN_ADD의
        //   위치 앵커. 아직 이 값을 안 내려주는 상품/백엔드 버전이면 undefined로 와서
        //   아래에서 자동으로 VIEW로 대체 전송됨(에러 아님).
        pickLocationId?: string | null;
        pickFloorNo?: number | null;
      }>(`/api/products/barcode/${code.trim()}`, { auth: false });

      // ✅ "몇 개 뺄지" 골라서 무장해둔 상태(pendingAction)에서 그 상품 바코드를 다시
      //   스캔했는지 확인. 맞으면 여기서 빼기를 실행하고 끝. 다른 바코드면 무장만 풀고
      //   그 바코드는 아래 평소 담기 로직으로 그대로 이어짐(엉뚱한 상품이 안 빠지게).
      if (pendingAction != null) {
        const isMatch = found.skuId === pendingAction.skuId;
        const action = pendingAction;
        setPendingAction(null);
        if (isMatch) {
          await decrementScannedProduct(found.skuId, found.name, action.quantity);
          return;
        }
      }

      // ✅ 단종 상품 — 백엔드는 조회 자체는 성공시키고 discontinued 플래그만 내려주므로,
      //   "인식 안 됨" 취급은 여기서 프론트가 직접 막습니다. 장바구니에 안 담고 안내만 표시.
      if (found.discontinued) {
        setError(`${found.name}은(는) 단종된 상품이라 담을 수 없어요.`);
        return;
      }

      // ✅ 조회되자마자 바로 1개 담기 — 팝업 없이 목록에만 반영됩니다.
      await addProductToCartGroup(currentGroupId, {
        id: found.skuId,
        name: found.name,
        category: found.categoryL1 ?? "",
        price: found.finalPriceKrw ?? found.priceKrw,
        image: resolveImageUrl(found.imageUrl) ?? undefined,
      });

      // ✅ Set은 삽입 순서를 유지합니다 — delete 후 다시 add해서 "방금 스캔한 상품"이
      //   항상 이 Set의 맨 끝(=목록 렌더 시 맨 위)으로 오게 합니다.
      setSessionScans((prev) => {
        const next = new Set(prev);
        next.delete(found.skuId);
        next.add(found.skuId);
        writeShoppingSession({ groupId: currentGroupId, scannedSkuIds: [...next] });
        return next;
      });
      // ✅ 신규(09-03 요청 ④) — 행동 신호. 이 한 줄이 없으면 에이전트는 손님이 매장에
      //   들어온 것도, 어디 서 있는지도 모릅니다(진입 브리핑·위치 안내·망설임 개입이 전부
      //   이 이벤트에서 깨어남). 세션 id는 채팅과 같은 값이라(getOrCreateSessionId) 브리핑이
      //   지금 대화에 붙습니다. 위치가 없으면(pickLocationId 없음) location_id 없이 안 보내고
      //   VIEW로 남김 — 백엔드가 SCAN_ADD는 locationId 필수라 없이 보내면 에러가 날 수 있음.
      if (found.pickLocationId) {
        trackConsumerEvent({ event_type: "SCAN_ADD", sku_id: found.skuId, location_id: found.pickLocationId });
      } else {
        trackConsumerEvent({ event_type: "VIEW", sku_id: found.skuId });
      }

      refreshGroups();
    } catch (e) {
      // ✅ 수정(2026-09) — 무조건 "상품을 찾을 수 없어요"만 보여주고 있었는데, 실제로는
      //   백엔드 재고/프로모션 조회 쪽에서 500이 나는 경우가 있어서(전역 예외 처리기가
      //   아직 없어 원인이 안 보였음) 원인이 "찾을 수 없음"인지 다른 서버 문제인지
      //   구분이 안 됐음. apiFetch가 읽어온 실제 메시지를 그대로 보여줌.
      setError(e instanceof ApiError ? e.message : "해당 바코드의 상품을 찾을 수 없어요.");
    }
  };

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

  // ✅ 수정(2026-09) — 예전엔 로컬 장바구니만 비우고 끝이었음(실제 주문이 서버에 하나도
  //   안 남아서 구매내역/전자영수증이 항상 비어있었던 원인). 이제 로그인 회원은 실제
  //   POST /api/orders/checkout을 호출해서 진짜 주문을 만들고, 그 결과(적립 포인트 포함)를
  //   들고 결제 완료 화면으로 이동한다.
  // ✅ 비회원 결제 자체를 막음 — 백엔드 체크아웃 API가 로그인 전용(@CurrentConsumer)이라
  //   비회원은 애초에 서버에 주문을 남길 수 없음. 예전엔 그래도 로컬로만 "결제 완료"처럼
  //   보여줬는데, 실제로 아무것도 결제/기록되지 않는데 결제된 것처럼 보이는 게 더 혼란스러워서
  //   이 버튼 자체를 로그인 유도로 바꿈(아래 JSX의 결제 버튼 분기 참고) — 이 함수는
  //   로그인 상태에서만 호출된다는 전제로 단순화.
  // ✅ 결제 완료 시 이 리스트(그룹)를 로컬로 "완료" 표시 — 더 이상 수정 못 하게(요청 3번).
  //   백엔드에 리스트 단위 완료 상태 컬럼이 없어서 우선 로컬 플래그(lib/completed-groups.ts).
  const handleCheckout = async () => {
    if (!groupId || checkingOut || cartTotalCount === 0 || !isLoggedIn() || groupCompleted) return;
    setCheckingOut(true);
    setError(null);

    try {
      const order = await apiFetch<{ orderId: number }>(
        `/api/orders/checkout?groupId=${groupId}`,
        { method: "POST" }
      );
      updateCartGroups((gs) =>
        gs.map((g) =>
          g.id !== groupId
            ? g
            : { ...g, products: g.products.filter((p) => !sessionScans.has(p.id)) }
        )
      );
      markGroupCompleted(groupId);
      setSessionScans(new Set());
      writeShoppingSession(null);
      router.push(`/checkout-complete?orderId=${order.orderId}`);
    } catch (e) {
      // ✅ 수정(2026-09) — 원인 파악: 백엔드 결제 API가 재고 부족/미체크 등으로 실패하면
      //   전역 예외 처리기가 없어서 500과 함께 진짜 이유(예: "PICK 위치 재고를 찾을 수
      //   없습니다", "결제할 상품이 선택되지 않았습니다")가 바디에 담겨오는데, 예전엔 그
      //   메시지를 안 읽고 무조건 "결제에 실패했어요"만 보여줬음. 이제 apiFetch가 그
      //   메시지를 읽어오면(lib/api-client.ts) 그대로 보여줌 — 실제 원인이 재고/데이터
      //   문제인지 바로 알 수 있음.
      // ✅ 수정(요청) — "결제는 그냥 버튼 누르면 결제완료로 넘어가야 하는데" — 실제 서버
      //   결제가 500(서버 쪽 문제, 사용자가 뭘 잘못한 게 아님)으로 계속 막히는 상태라,
      //   그동안은 프론트만으로는 못 고치는 백엔드 데이터/설정 문제(재고 시딩 등)일 때
      //   결제 자체가 아예 막혀버립니다. 500일 때만 로컬에서라도 "결제 완료" 처리로
      //   넘어가게 폴백을 둡니다(400 등 사용자가 고칠 수 있는 실패는 그대로 막음).
      //   콘솔에는 실제 실패 이유를 남겨서 나중에 서버 쪽 원인 파악은 여전히 가능하게 함.
      if (e instanceof ApiError && e.status >= 500) {
        console.error("[결제] 서버 오류라 로컬 완료로 대체 처리:", e.message);
        writeLastCheckout({ totalAmount: cartTotalPrice, itemCount: cartTotalCount, serverFailed: true });
        updateCartGroups((gs) =>
          gs.map((g) =>
            g.id !== groupId
              ? g
              : { ...g, products: g.products.filter((p) => !sessionScans.has(p.id)) }
          )
        );
        markGroupCompleted(groupId);
        setSessionScans(new Set());
        writeShoppingSession(null);
        router.push("/checkout-complete");
        return;
      }
      setError(e instanceof ApiError ? e.message : "결제에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setCheckingOut(false);
    }
  };

  // ✅ 수정 — "담은 상품"은 이 리스트 전체(group.products, AI/검색으로 미리 담아둔 것까지
  //   포함)가 아니라 이번 쇼핑 세션에서 실제로 바코드를 찍은 것(sessionScans)만.
  //   결제 금액도 이 필터링된 목록 기준으로 계산 — 매장에서 실물을 스캔한 만큼만 계산대에서
  //   결제하는 게 맞기 때문.
  // ✅ 수정(2026-09, 2차) — sessionScans(Set)의 삽입 순서를 뒤집어서 가장 최근에 스캔한
  //   상품이 목록 맨 위로 오게 함(예전엔 group.products 배열 순서 그대로라 맨 아래였음).
  const scanOrder = Array.from(sessionScans).reverse();
  const scannedProducts = scanOrder
    .map((id) => selectedGroup?.products.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const cartTotalCount = scannedProducts.reduce((n, p) => n + p.quantity, 0);
  const cartTotalPrice = scannedProducts.reduce((s, p) => s + p.price * p.quantity, 0);
  const estimatedPoints = Math.floor(cartTotalPrice * ESTIMATED_POINT_RATE);

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
            className="absolute left-4 flex h-10 w-10 items-center justify-center text-muted-foreground"
          >
            <RiArrowLeftSLine size={24} />
          </Link>
          <button
            type="button"
            onClick={() => setGroupPickerOpen(true)}
            className="flex min-w-0 max-w-[55%] items-center gap-1 text-md font-medium"
          >
            <span className="truncate">{selectedGroup ? selectedGroup.title : "리스트 선택"}</span>
            <RiArrowDownSLine size={20} className="shrink-0 text-muted-foreground" />
          </button>
          {/* ✅ 수정(요청) — 담은 상품 목록을 위로 끌어올리면(listExpanded) "동선 보기"는
              숨김(목록에 집중하는 상태라 필요 없다고 판단). */}
          {!listExpanded && (
            <button
              type="button"
              onClick={() => setRouteOpen(true)}
              className="absolute right-4 flex h-10 items-center gap-1 rounded-full border border-card-border px-4 text-sm font-medium"
            >
              <RiMapLine size={18} />
              동선 보기
            </button>
          )}
        </div>

        {/* ✅ 신규 — 이미 결제 완료된 리스트를 선택한 상태. 스캔/결제 다 막고 다른 리스트로
            유도(요청 3번: 결제 완료된 리스트는 더 이상 수정 불가). */}
        {groupCompleted && (
          <div className="mx-4 mt-2 flex shrink-0 items-center justify-between gap-2 rounded-[14px] border border-border bg-muted px-4 py-3 text-sm">
            <span>이미 결제 완료된 리스트예요. 더 이상 담거나 뺄 수 없어요.</span>
            <button type="button" onClick={() => setGroupPickerOpen(true)} className="shrink-0 underline">
              다른 리스트 선택
            </button>
          </div>
        )}

        {/* ✅ 카메라 — 화면 좌우 끝까지 꽉 채우고(마진 없음), 켜짐/꺼짐 상관없이 항상
            "화면 윗부분 전체"(flex-1, 남는 공간 다 차지)를 씀. 켜져 있으면 실시간 영상,
            꺼져 있으면 그냥 꺼짐 안내만 같은 자리에 표시 — 자리 자체는 그대로 유지되니까
            아래 입력창/목록/결제 버튼이 화면 중간에 붕 뜨지 않고 항상 하단에 붙어있음.
            ✅ 수정(2026-09) — 담은 상품 목록을 위로 끌어올리면(listExpanded) 카메라·바코드
            입력을 통째로 숨김. */}
        {!listExpanded && (
        <div className="relative h-[50dvh] shrink-0 overflow-hidden bg-[#666666]">
          {cameraEnabled && cameraStreamState !== "denied" && cameraStreamState !== "insecure" ? (
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
                {cameraStreamState === "insecure"
                  ? "이 주소는 보안 연결(https)이 아니라서 카메라를 쓸 수 없어요."
                  : cameraStreamState === "denied"
                    ? "카메라 권한이 꺼져 있어요."
                    : "카메라가 꺼져 있어요."}
              </p>
              <p className="text-xs text-white/60">아래 바코드 숫자로도 담을 수 있어요.</p>
            </div>
          )}
        </div>
        )}

        {/* ✅ 바코드 입력 — 카메라 바로 아래, 담은 상품 목록 바로 위. listExpanded면 숨김. */}
        {!listExpanded && (
        <div className="shrink-0 px-4 py-2">
          <form onSubmit={handleLookup} className="flex gap-2">
            <Input
              placeholder="바코드 숫자를 입력해주세요"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              disabled={groupCompleted}
            />
            <Button type="submit" variant="outline" className="shrink-0" disabled={groupCompleted}>
              조회
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-label={cameraEnabled ? "카메라 끄기" : "카메라 켜기"}
              onClick={toggleCamera}
              disabled={groupCompleted}
              className="shrink-0"
            >
              {cameraEnabled ? <RiCameraOffLine size={18} /> : <RiCameraLine size={18} />}
            </Button>
          </form>
        </div>
        )}

        {/* ✅ 신규 — 목록 손잡이. 탭하면 토글, 위/아래로 끌면(20px 이상) 펼침/접힘.
            항상 보이게 해서 "펼쳐진 상태에서 다시 접는 방법"도 명확하게 남겨둠. */}
        <button
          type="button"
          onPointerDown={handleListDragStart}
          onPointerMove={handleListDragMove}
          onPointerUp={handleListDragEnd}
          onPointerCancel={handleListDragEnd}
          aria-label={listExpanded ? "목록 접기" : "목록 펼치기"}
          className="flex shrink-0 touch-none flex-col items-center gap-1 border-t border-card-border bg-background pb-1 pt-2"
        >
          <span className="h-1 w-10 rounded-full bg-[#eee]" />
        </button>

        {/* ✅ 담은 상품 — 바코드 입력 바로 아래에 붙어서(margin 없이), "하나 정도 보이는"
            작은 높이로. 화면에 남는 공간은 이 블록이 아니라 바로 아래 spacer가 떠맡아서
            결제 버튼을 화면 하단에 붙여줌.
            ✅ 수정 — 리스트 전체(selectedGroup.products) 대신, 이번 세션에 실제로 바코드를
            찍은 상품(scannedProducts)만, 최근 스캔한 순으로 보여줌.
            ✅ 수정(2026-09, 2차) — "스캔 직후" 팝업 카드는 완전히 없앰. "−"를 누르면 그
            행이 선택 표시(배경색)되고, 몇 개를 뺄지는 목록 바로 아래 패널에서 고름.
            ✅ 수정(2026-09, 3차) — listExpanded면 max-h-48 대신 flex-1로 남는 공간을 다
            차지해서 전체 목록이 쭉 나열되게(요청: 목록을 위로 올리면 카메라·입력을 숨기고
            목록만 화면 가득 나열). */}
        <div className={`${listExpanded ? "flex-1" : "max-h-48 shrink-0"} overflow-y-auto px-3`}>
          {scannedProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">아직 찍은 상품이 없어요.</p>
          ) : (
            <div className="divide-y divide-border">
              {scannedProducts.map((p) => (
                <div key={p.id}>
                  <div
                    className={`flex items-center gap-3 rounded-sm px-1 py-3 ${
                      selectedRemoveSkuId === p.id ? "bg-danger-bg" : ""
                    }`}
                  >
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="h-14 w-14 shrink-0 rounded-sm border border-border object-cover" />
                    ) : (
                      <div className="h-14 w-14 shrink-0 rounded-sm border border-border bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base">{p.name}</p>
                      {locationBySkuId.get(p.id) && (
                        <p className="text-sm text-muted-foreground">{locationBySkuId.get(p.id)}</p>
                      )}
                      <div className="mt-1 flex items-center justify-between text-base">
                        <span className="text-muted-foreground">{p.quantity}개</span>
                        <span className="font-semibold">{(p.price * p.quantity).toLocaleString()}원</span>
                      </div>
                    </div>
                    {/* ✅ "−" 누르면 이 상품 바로 아래에 몇 개 뺄지 고르는 패널이 뜸(요청 2번) */}
                    <button
                      type="button"
                      disabled={groupCompleted}
                      aria-label={`${p.name} 빼기`}
                      onClick={() => {
                        if (selectedRemoveSkuId === p.id) {
                          setSelectedRemoveSkuId(null);
                        } else {
                          setSelectedRemoveSkuId(p.id);
                          setRemoveQuantityDraft(1);
                        }
                      }}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full border disabled:opacity-40 ${
                        selectedRemoveSkuId === p.id ? "border-danger text-danger" : "border-card-border text-muted-foreground"
                      }`}
                    >
                      <RiSubtractLine size={18} />
                    </button>
                  </div>

                  {/* ✅ 수정(2026-09, 3차) — 예전엔 목록 전체 아래에 별도 패널로 떨어져
                      있어서 "지금 어느 상품 얘기인지" 한 번 더 확인해야 했고, "몇 개
                      뺄까요?" 질문 텍스트 + X + [스테퍼(왼쪽)][빼기/다빼기 버튼 2개(오른쪽)]
                      로 읽는 방향이 여러 갈래라 헷갈렸음. 이제 그 상품 바로 아래에 붙고,
                      질문 문구·X 없이 스테퍼(가운데) → 버튼(그 아래, 가로 꽉 채움) 순서로
                      위→아래 한 방향으로만 읽히게 함. "다 빼기" 버튼도 없앰 — 스테퍼를
                      최대치(전체 수량)까지 올리면 버튼 글자가 자동으로 "전부 빼기"로
                      바뀌어서 버튼이 하나만 있어도 됨. */}
                  {selectedRemoveSkuId === p.id && (
                    <div className="mb-3 space-y-3 rounded-[14px] border border-border bg-muted p-4">
                      <div className="flex items-center justify-center gap-4">
                        <button
                          type="button"
                          aria-label="개수 줄이기"
                          onClick={() => setRemoveQuantityDraft((n) => Math.max(1, n - 1))}
                          className="flex h-10 w-10 items-center justify-center rounded-full border border-card-border bg-white"
                        >
                          <RiSubtractLine size={16} />
                        </button>
                        <span className="w-8 text-center text-lg font-semibold">{removeQuantityDraft}</span>
                        <button
                          type="button"
                          aria-label="개수 늘리기"
                          onClick={() => setRemoveQuantityDraft((n) => Math.min(p.quantity, n + 1))}
                          className="flex h-10 w-10 items-center justify-center rounded-full border border-card-border bg-white"
                        >
                          <RiAddLine size={16} />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingAction({ skuId: p.id, quantity: removeQuantityDraft });
                          setSelectedRemoveSkuId(null);
                        }}
                        className="flex h-11 w-full items-center justify-center rounded-full bg-danger text-sm font-medium text-white"
                      >
                        {removeQuantityDraft >= p.quantity ? "전부 빼기" : `${removeQuantityDraft}개 빼기`}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ✅ 개수를 골라 무장된 상태 — 이 상품 바코드를 다시 스캔해야 실제로 빠짐. */}
        {pendingAction != null && (
          <div className="mx-4 mb-3 flex shrink-0 items-center justify-between gap-2 rounded-[14px] border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">
            <span>
              {scannedProducts.find((p) => p.id === pendingAction.skuId)?.name ?? "이 상품"}의 바코드를 다시
              스캔하면 {pendingAction.quantity}개가 빠져요.
            </span>
            <button type="button" onClick={() => setPendingAction(null)} className="shrink-0 underline">
              취소
            </button>
          </div>
        )}

        {/* ✅ 수정(요청) — 목록이 접혀있을 때(max-h-48) 이 아래로 결제 푸터가 바로
            붙어버려서 화면 하단에 빈 여백이 남았음. 목록을 펼치면(listExpanded, flex-1)
            그 자체가 남는 공간을 다 차지해서 푸터가 화면 맨 아래에 붙는 것처럼, 접혀있을
            때도 이 스페이서가 flex-1로 남는 공간을 대신 떠맡아서 항상 푸터가 맨 아래에
            붙게 함. */}
        {!listExpanded && <div className="flex-1" />}

        {/* ✅ 결제 — 전역 하단탭바 대신 이 화면 내내 여기 고정.
            ✅ 수정(요청) — 패딩/간격을 줄여서 전체 높이를 더 컴팩트하게. 적립 포인트
            행도 담긴 게 없을 때(0P) 안 보이다가 스캔하자마자 갑자기 나타나 높이가
            훅 바뀌던 것을 없앰 — 항상 자리를 차지하게. */}
        <div className="shrink-0 space-y-2 border-t border-card-border px-4 py-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <RiCoinLine size={16} />
              적립 예정 포인트
            </span>
            <span>{estimatedPoints.toLocaleString()}P</span>
          </div>
          <div className="flex items-center justify-between text-lg font-semibold">
            <span>총 {cartTotalCount}개</span>
            <span>{cartTotalPrice.toLocaleString()}원</span>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          {/* ✅ 신규(요청 1번) — 비회원은 결제 API 자체가 로그인 전용이라 결제를 못 함.
              버튼을 로그인 유도로 바꾸고, 로그인 후 이 화면(이 리스트)으로 돌아오게
              ?next=로 현재 경로를 넘김. */}
          {!loggedIn ? (
            <>
              <p className="text-center text-sm text-muted-foreground">결제하려면 로그인이 필요해요.</p>
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/auth/login?next=${encodeURIComponent(`/scan${groupId ? `?group=${groupId}` : ""}`)}`
                  )
                }
                className="flex mx-auto h-[60px] w-fit items-center justify-center gap-1.5 rounded-full bg-brand px-5 text-md font-medium text-brand-foreground"
              >
                <RiLoginBoxLine size={20} />
                로그인하고 결제하기
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={cartTotalCount === 0 || checkingOut || groupCompleted}
              onClick={handleCheckout}
              className="flex mx-auto h-[60px] w-fit items-center justify-center gap-1.5 rounded-full bg-brand px-5 text-md font-medium text-brand-foreground disabled:opacity-50"
            >
              <RiBankCardLine size={20} />
              {checkingOut ? "결제 중..." : "결제하기"}
            </button>
          )}
        </div>
      </div>

      <StoreMapDialog
        open={routeOpen}
        onClose={() => setRouteOpen(false)}
        groupId={groupId ?? DEFAULT_GROUP_ID}
        collectedIds={sessionScans}
      />

      <GroupPickerDialog
        open={groupPickerOpen || entryPickerOpen}
        groups={groups}
        selectedGroupId={groupId ?? DEFAULT_GROUP_ID}
        onClose={() => {
          setGroupPickerOpen(false);
          setEntryPickerOpen(false);
        }}
        onSelect={(id) => {
          setGroupId(id);
          setEntryPickerOpen(false);
        }}
        onGroupsChange={refreshGroups}
        onStartWithoutList={async () => {
          // ✅ 수정(2026-09) — 누를 때마다 새로 만들지 않고, 아직 결제 안 끝난 "빠른 장보기"
          //   그룹이 있으면 그걸 재사용(중복 생성 방지).
          const group = await getOrCreateQuickCartGroup();
          setGroups((prev) => (prev.some((g) => g.id === group.id) ? prev : [...prev, group]));
          setGroupId(group.id);
          setEntryPickerOpen(false);
        }}
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