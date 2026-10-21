// app/(main)/scan/page.tsx
// ✅ 전면 재설계
//   - 담는 곳(리스트)을 화면에서 직접 선택 가능 (드롭다운)
//   - ✅ 담은 상품 목록 — 예전엔 "카트 내역 보기" 버튼을 눌러야 모달이 뜨는 방식이었는데,
//     네이버맵/카카오맵 바텀시트처럼 화면 하단에 항상 걸쳐 있다가(평소엔 가장 최근 담은
//     상품 1개만 보이는 "peek" 높이) 탭하면 화면 대부분까지 펼쳐져서 스크롤로 전체 목록을
//     보는 방식으로 바꿈. 펼쳐지면 카메라는 자동으로 꺼지고(뒤에 계속 켜둘 이유가 없음),
//     전역 하단탭바도 가려서(BottomBarVisibilityContext) 그 자리에 결제 버튼만 남게 함.
//   - "동선 보기"는 카메라 영역 자체가 지도로 바뀌는 방식(별도 모달 없음, 아래
//     viewMode 참고)으로 실제 지도 이미지 위에 핀+경로선을 한 번에 표시
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
import { RiArrowLeftSLine, RiArrowDownSLine, RiRoadMapLine, RiCameraLine, RiCameraOffLine, RiBankCardLine, RiSubtractLine, RiAddLine, RiCoinLine, RiLoginBoxLine, RiCloseLine, RiMapPin2Fill, RiCalendarCheckLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StoreMap, type MapPin } from "@/components/domain/store-map";
import { getOptimizedRoute, type OptimizedRouteResult, type PathPoint } from "@/lib/navigation";
import { buildRequestKey, readRouteProgress, saveRouteProgress, planFacilityDetour, rebaseRouteFrom } from "@/lib/shopping-route-progress";
import { GroupPickerDialog } from "@/components/domain/group-picker-dialog";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";
import { apiFetch, isLoggedIn, ApiError, resolveImageUrl } from "@/lib/api-client";
import { trackConsumerEvent } from "@/lib/consumer-events";
import { writeCheckoutDraft } from "@/lib/checkout-draft";
import {
  addProductToCartGroup,
  updateCartGroups,
  readCartGroups,
  loadCartGroups,
  createCartGroup,
  getOrCreateQuickCartGroup,
  syncUpdateServerCart,
  moveProductsBetweenGroups,
  type CartGroup,
} from "@/lib/cart-storage";
import { useBarcodeScanner } from "@/lib/use-barcode-scanner";
import {
  readShoppingSession,
  writeShoppingSession,
  sessionFor,
  SHOPPING_CHANGED,
  readActiveScanGroupId,
  writeActiveScanGroupId,
  type RouteAnchor,
} from "@/lib/shopping-session";
import { fetchInventoryBatch, pickLocation, formatLocationLabel } from "@/lib/product-location";
import { isGroupCompleted, markGroupCompleted } from "@/lib/completed-groups";
import { useOpenAiChat } from "@/lib/use-open-ai-chat";

const DEFAULT_GROUP_ID = 1;
// 결제 금액 대비 예상 적립 포인트율 — 백엔드 OrderService.checkout()의 실제 적립 로직
// (netCashPaid의 2%, consumer.earnPoints)과 동일한 기본율. 등급 보너스 등으로 실제
// 값은 달라질 수 있어 "예상"으로만 표기.
const ESTIMATED_POINT_RATE = 0.02;

// ✅ useSearchParams()가 Suspense 경계 없이 쓰이면 next build의 정적 프리렌더가 실패해서
//   내부 로직을 별도 컴포넌트로 분리하고 아래 default export에서 Suspense로 감쌌습니다.
function ScanPageInner() {
  const router = useRouter();
  const openAiChat = useOpenAiChat();
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
  const scanLock = useRef(false);

  // ✅ 신규(요청) — "리스트 없이 장보기도 추가해달라"에 맞춰, 특정 리스트를 지정하지 않고
  //   들어온 경우(예: 하단탭바 스캔 아이콘으로 바로 진입) 곧장 스캔을 시작하는 대신 먼저
  //   "어느 리스트에 담을지" 고르는 화면을 띄웁니다(리스트 없이 시작하기도 선택 가능).
  //   특정 리스트에서 "장보러 가기"로 들어온 경우(requestedGroupId 있음)는 그 리스트가
  //   이미 정해졌으니 이 단계를 건너뜁니다.
  // ✅ 버그 수정(2026-09) — 예전엔 초기값을 requestedGroupId===null로 잡아서, 이전에
  //   골라둔 리스트(readActiveScanGroupId)가 있어도 일단 true로 "뜬 다음" 아래 마운트
  //   useEffect에서야 false로 닫았습니다. 이 "열렸다가 같은 틱에 바로 닫히는" 패턴이
  //   모달 열기/닫기 트랜지션과 겹치면서, 논리적으로는(React state상) 닫혀 있어도
  //   화면엔 그대로 남아 X·리스트 재선택·바깥 클릭 어떤 것도 안 먹히는 상태가 됐습니다
  //   (실제로 열린 적 없는 모달을 닫으려니 반응이 없었던 것). 이제 무조건 false로
  //   시작하고, 마운트 useEffect가 "정말 골라야 할 때"(저장된 리스트가 없거나 이미
  //   완료된 경우)에만 true로 켭니다 — 저장된 선택이 있으면 아예 한 프레임도 뜨지 않음.
  const [entryPickerOpen, setEntryPickerOpen] = useState(false);

  // ✅ 신규 — 담은 상품 목록에도 매대 번호("444 >") 같이 보여주기(리스트 상세/카트랑 동일 패턴)
  // ✅ 수정(요청 — "동선 지도에도 방금 찍은 매대 위에 현위치 핀") — 텍스트 라벨만 뽑던 걸,
  //   지도에 핀을 찍는 데 필요한 좌표(x/y/floorNo)까지 같이 저장해서, 이미 찍은 상품도
  //   지도 위에 표시할 수 있게 함(coordsBySkuId).
  const [locationBySkuId, setLocationBySkuId] = useState<Map<number, string>>(new Map());
  const [coordsBySkuId, setCoordsBySkuId] = useState<Map<number, { x: number; y: number; floorNo: number }>>(new Map());
  useEffect(() => {
    const ids = selectedGroup?.products.map((p) => p.id) ?? [];
    if (ids.length === 0) return;
    fetchInventoryBatch(ids)
      .then((map) => {
        const next = new Map<number, string>();
        const nextCoords = new Map<number, { x: number; y: number; floorNo: number }>();
        map.forEach((items, skuId) => {
          const loc = pickLocation(items);
          if (loc) {
            next.set(skuId, formatLocationLabel(loc.locationId));
            nextCoords.set(skuId, { x: loc.x, y: loc.y, floorNo: loc.floorNo });
          }
        });
        setLocationBySkuId(next);
        setCoordsBySkuId(nextCoords);
      })
      .catch(() => {
        setLocationBySkuId(new Map());
        setCoordsBySkuId(new Map());
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup?.products.map((p) => p.id).join(",")]);

  useEffect(() => {
    setGroups(readCartGroups());
  }, []);

  // ✅ 신규(요청 4번) — "스캔화면 들어갈 때마다 리스트를 다시 고른다" 문제 수정. 특정
  //   리스트 지정 없이(requestedGroupId===null) 들어왔을 때, 예전엔 무조건 리스트 선택
  //   화면(entryPicker)부터 띄웠습니다. 이제 이전에 골라둔 리스트(readActiveScanGroupId)가
  //   있고 아직 결제 전(완료 안 됨)이면 그 리스트를 그대로 이어서 쓰고, 선택 화면은 건너뜁니다.
  //   결제가 끝나면(handleCheckout) 이 저장값을 지워서 다음엔 다시 고르게 됩니다.
  // ✅ 버그 수정(2026-09) — 저장된 리스트가 있을 때는 entryPickerOpen을 아예 true로
  //   만들지 않습니다(위 useState 쪽 설명 참고). 정말 골라야 하는 경우(저장된 값이
  //   없거나, 저장돼 있어도 이미 결제 완료된 리스트인 경우)에만 여기서 true로 켭니다.
  useEffect(() => {
    if (requestedGroupId != null) {
      // 특정 리스트를 지정해서 들어온 경우(예: 리스트 상세의 "장보러 가기")도 그 선택을
      // 고정값으로 저장 — 이후 리스트 없이 /scan에 재진입해도 이 리스트로 이어집니다.
      writeActiveScanGroupId(requestedGroupId);
      return;
    }
    const persisted = readActiveScanGroupId();
    if (persisted != null && !isGroupCompleted(persisted)) {
      setGroupId(persisted);
    } else {
      setEntryPickerOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // ✅ 수정(요청 — "리스트=F, 실제 스캔=T") — 로그인 회원은 서버(scannedAt)가 진짜
  //   출처가 되도록, 세션스토리지뿐 아니라 서버에서 불러온 값도 합쳐서 복원합니다.
  //   백엔드가 아직 scannedAt을 안 내려주면(docs/scanned-at-redesign-backend-request.md
  //   반영 전) 이 부분은 그냥 빈 배열이라 기존처럼 세션스토리지만 씀 — 백엔드 배포되면
  //   코드 변경 없이 자동으로 새로고침해도 유지되게 바뀝니다.
  useEffect(() => {
    if (groupId == null) return;
    const update = () => {
      const saved = readShoppingSession();
      const localScans = saved?.groupId===groupId ? saved.scannedSkuIds : [];
      loadCartGroups().then((loaded) => {
        setGroups(loaded);
        // ✅ 버그 수정(요청 — "현위치 핀이 엉뚱한 데 그대로 있다") — 원인은 여기였습니다.
        //   serverScanned를 products 배열 순서(실제 스캔 순서와 무관한, 리스트 저장 순서) 그대로
        //   썼고, 게다가 merge 순서가 [localScans, ...serverScanned]라서 serverScanned가 하나라도
        //   있으면 Set의 "마지막 원소"(=checkedMapPins/checkedListProducts가 현위치로 찍는 기준)가
        //   항상 serverScanned 쪽 마지막 항목이 됐습니다 — 방금 로컬에서 막 찍은 상품이 있어도
        //   그게 "가장 마지막"으로 인정 안 되고, 리스트 순서상 우연히 끝에 있던 예전 스캔 상품이
        //   계속 현위치로 잡혀서 정작 방금 찍은 상품은 평범한 회색 체크 핀으로 보였던 것.
        //   serverScanned는 scannedAt(실제 스캔 시각) 기준으로 정렬해서 진짜 순서를 맞추고,
        //   로컬 스캔(방금 이 세션에서 찍은 것 = 가장 최신)은 항상 맨 뒤에 오도록 순서를 바꿨습니다.
        const groupProducts = loaded.find(g=>g.id===groupId)?.products ?? [];
        const serverScanned = groupProducts
          .filter((p): p is typeof p & { scannedAt: string } => p.scannedAt != null)
          .sort((a, b) => new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime())
          .map((p) => p.id);
        const merged = [...serverScanned.filter((id) => !localScans.includes(id)), ...localScans];
        setSessionScans(new Set(merged));
      }).catch(()=>{
        setSessionScans(new Set(localScans));
      });
    };
    update();
    window.addEventListener(SHOPPING_CHANGED, update);
    return ()=>window.removeEventListener(SHOPPING_CHANGED, update);
  }, [groupId]);

  // ✅ 수정(요청 — "오른쪽 위 동선보기 페이지를 없애고, 카메라 버튼 누르면 카메라로
  //   바뀌고 지도 아이콘 누르면 지도로") — 별도 모달(StoreMapDialog) 대신, 카메라
  //   영역 자체가 카메라/지도 두 상태를 오가는 하나의 뷰가 됨.
  const [viewMode, setViewMode] = useState<"camera" | "map">("camera");
  const [route, setRoute] = useState<OptimizedRouteResult | null>(null);
  const [mapFloor, setMapFloor] = useState(1);
  // ✅ 신규(요청) — 바코드 찍는 거 아래 "현재 위치만 확인" 체크. 켜져 있으면 스캔해도
  //   장바구니에 안 담기고(수량 그대로), 그 상품 위치를 현재 위치로만 갱신함.
  const [locateOnly, setLocateOnly] = useState(false);
  // ✅ 신규(요청) — "계획 추가" 버튼. 누르면 리스트에 없는 상품 검색해서 계획에 추가하거나,
  //   화장실 등 시설을 먼저 들르도록 하는 모달이 뜸(예전 ShoppingRouteActions 내용 그대로).
  const [planOpen, setPlanOpen] = useState(false);
  const [planQuery, setPlanQuery] = useState("");
  const [planResults, setPlanResults] = useState<{ skuId: number; name: string; categoryL1?: string; finalPriceKrw?: number; priceKrw: number; imageUrl?: string; discontinued?: boolean }[]>([]);
  const [planFacility, setPlanFacility] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [planMessage, setPlanMessage] = useState("");

  // ✅ 신규 — 남은(아직 안 스캔한) 상품 기준으로 최적 동선을 계산해둠. 지도 보기로
  //   전환할 때뿐 아니라, 목록을 동선 순서로 정렬하는 데도 씀.
  // ✅ 수정(버그 인계 — "동선이 처음으로 돌아감") — 매번 무조건 새로 최적화하지 않고,
  //   requestKey(리스트+남은 상품+현재 위치+경유 시설+결제여부)가 지난번과 같으면
  //   저장해둔 진행 상태를 그대로 재사용합니다. "먼저 들르기"·"현재 위치만 확인"은
  //   각자 자기 핸들러에서 순서를 유지한 채로 진행 상태를 직접 갱신하고 여기 저장하므로,
  //   이 effect가 다시 돌아도(같은 key) 전체 재최적화를 또 부르지 않습니다. 실제 스캔이나
  //   상품 추가/삭제로 남은 상품 집합 자체가 바뀌면 key가 달라져서 정상적으로 재계산됩니다.
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId || !selectedGroup) { setRoute(null); return; }
    let active = true;
    const remainingIds = selectedGroup.products.filter((p) => !sessionScans.has(p.id)).map((p) => p.id);
    const session = sessionFor(groupId);
    const key = buildRequestKey({ groupId, skuIds: remainingIds, anchor: session.anchor, detourLocationId: session.detourLocationId, paid: session.paid });

    const cached = readRouteProgress(groupId);
    if (cached && cached.requestKey === key) {
      setRoute(cached.route);
      setMapFloor(cached.route.start.floorNo);
      setRouteError(null);
      return;
    }

    if (remainingIds.length === 0) {
      // ✅ 담긴 상품이 없거나 전부 스캔 완료 — API를 부를 필요가 없고, 부르면 오히려
      //   "빈 목록" 에러가 날 수 있어서 여기서 명확한 안내로 갈음.
      setRoute(null);
      setRouteError("담긴 상품이 없거나 전부 스캔했어요.");
      return;
    }

    setRouteError(null);
    getOptimizedRoute(remainingIds, { anchor: session.anchor, detourLocationId: session.detourLocationId, paid: session.paid })
      .then((r) => {
        if (!active) return;
        setRoute(r);
        setMapFloor(r.start.floorNo);
        saveRouteProgress({ groupId, requestKey: key, route: r });
      })
      .catch((e) => {
        if (!active) return;
        setRoute(null);
        // ✅ 수정(요청 — "동선이 하나도 안 보이잖아") — 예전엔 실패하면 그냥 setRoute(null)만
        //   하고 조용히 넘어가서, 지도로 전환해도 "계산하고 있어요..."가 원인도 모른 채
        //   계속 떠 있었음. 실제 실패 이유(백엔드 에러 메시지 등)를 화면에 보여줌.
        setRouteError(e instanceof Error ? e.message : "동선을 계산하지 못했어요.");
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, selectedGroup?.products.map(p=>p.id).join(","), sessionScans]);

  // ✅ 상품 목록이 이제 화면 대부분을 항상 차지하는 기본 레이아웃이라, 이 페이지에서는
  //   전역 하단탭바를 계속 숨기고 그 자리에 이 페이지 자체의 결제 버튼을 둡니다.
  const { setHidden: setBottomBarHidden } = useBottomBarVisibility();
  useEffect(() => {
    setBottomBarHidden(true);
    return () => setBottomBarHidden(false);
  }, [setBottomBarHidden]);

  useEffect(() => {
    if (autoOpenRoute && groupId != null) setViewMode("map");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenRoute, groupId]);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);

  // ✅ 신규(요청 5번) — 이미 바코드를 찍은 상품이 있는 상태에서 다른 리스트로 옮기려 하면,
  //   바로 옮기지 않고 "가져갈지/버리고 새로 찍을지" 먼저 물어봅니다. 여기 담긴 값은
  //   확인을 기다리는 중인 "옮겨갈 리스트 id".
  const [pendingGroupSwitch, setPendingGroupSwitch] = useState<number | null>(null);
  const [movingScans, setMovingScans] = useState(false);

  const refreshGroups = () => setGroups(readCartGroups());

  // ✅ 리스트 선택(처음 고르기/전환) 공통 처리. 이미 찍은 상품이 있는 채로 다른 리스트로
  //   바꾸려는 경우엔 곧장 바꾸지 않고 확인 모달(pendingGroupSwitch)을 띄웁니다.
  const handleSelectGroup = (id: number) => {
    if (id === groupId) {
      setEntryPickerOpen(false);
      return;
    }
    if (groupId != null && sessionScans.size > 0) {
      setPendingGroupSwitch(id);
      return;
    }
    setGroupId(id);
    setEntryPickerOpen(false);
    writeActiveScanGroupId(id);
  };

  // ✅ "가져가기" — 지금까지 찍은 상품을 새 리스트로 실제로 옮기고(서버/로컬 카트 반영),
  //   그 리스트로 전환. sessionScans(=몇 개를 찍었는지)는 그대로 유지해서 목록이 안 끊김.
  const handleMoveScannedItems = async () => {
    if (pendingGroupSwitch == null || groupId == null) return;
    const targetId = pendingGroupSwitch;
    const skuIds = Array.from(sessionScans);
    setMovingScans(true);
    try {
      const { warnings } = await moveProductsBetweenGroups(groupId, targetId, skuIds);
      refreshGroups();
      setGroupId(targetId);
      setEntryPickerOpen(false);
      writeActiveScanGroupId(targetId);
      writeShoppingSession({ groupId: targetId, scannedSkuIds: skuIds });
      // ✅ 버그 수정(요청 — "진열대 재고보다 많이 옮기려다 PATCH 409로 조용히 실패") —
      //   재고 부족으로 일부만 옮겨졌거나 아예 못 옮긴 상품이 있으면, 콘솔 에러로만
      //   남기지 않고 화면에 구체적으로 알려준다.
      if (warnings.length > 0) {
        setError(
          `${warnings.map((w) => w.name).join(", ")} — 재고 확인 문제로 못 옮겼어요. 원래 리스트에 그대로 있어요.`
        );
      }
    } catch {
      setError("상품을 옮기지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setMovingScans(false);
      setPendingGroupSwitch(null);
    }
  };

  // ✅ "버리고 새로 찍기" — 찍은 상품은 원래 리스트에 그대로 두고(삭제하지 않음), 새
  //   리스트에선 빈 상태로 다시 시작.
  const handleDiscardAndSwitch = () => {
    if (pendingGroupSwitch == null) return;
    const targetId = pendingGroupSwitch;
    setSessionScans(new Set());
    writeShoppingSession(null);
    setGroupId(targetId);
    setEntryPickerOpen(false);
    writeActiveScanGroupId(targetId);
    setPendingGroupSwitch(null);
  };

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
        writeShoppingSession({ ...sessionFor(groupId), groupId, scannedSkuIds: [...next] });
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

    // ✅ 수정(요청 — "자동으로 만들지 않게") — 예전엔 리스트를 고르지 않고 바로 스캔하면
    //   뒤에서 조용히 "빠른 장보기" 리스트를 만들어서 바로 담아줬는데, 이러면 사용자가
    //   원하지도 않은 리스트가 계속 쌓입니다. 이제 리스트가 안 골라진 상태로 스캔하면
    //   담지 않고, 리스트 선택 화면을 띄워서 직접 고르거나(또는 "리스트 없이 시작하기"를
    //   명시적으로 눌러서) 스스로 정하게 합니다.
    let currentGroupId = groupId;
    if (!currentGroupId) {
      setError("먼저 담을 리스트를 선택해주세요.");
      setGroupPickerOpen(true);
      return;
    } else if (groupCompleted) {
      setError("이미 결제 완료된 리스트예요. 다른 리스트를 선택해주세요.");
      return;
    }

    if (scanLock.current) return;
    scanLock.current = true;
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

      // ✅ 신규(요청 — "현재 위치만 확인") — 켜져 있으면 담지 않고(수량 그대로) 이
      //   상품 위치를 현재 위치로만 갱신. ShoppingRouteActions의 locateOnly와 같은 개념.
      // ✅ 수정(버그 인계 — "동선이 처음으로 돌아감") — 위치만 바뀐 거라 남은 상품
      //   방문 순서(route.orderedSkuIds)는 그대로 두고 걷는 길만 다시 계산합니다
      //   (rebaseRouteFrom). 아직 계산해둔 route가 없으면(첫 진입 등) 그냥 세션만
      //   갱신해서 평소처럼 전체 최적화 effect가 계산하게 둡니다.
      if (locateOnly) {
        const saved = sessionFor(currentGroupId);
        const newAnchor: RouteAnchor = { skuId: found.skuId };
        if (route) {
          try {
            const invMap = await fetchInventoryBatch([found.skuId]);
            const loc = pickLocation(invMap.get(found.skuId));
            if (loc) {
              const remainingIds = (selectedGroup?.products ?? []).filter((p) => !sessionScans.has(p.id)).map((p) => p.id);
              const nextRoute = await rebaseRouteFrom(route, { floorNo: loc.floorNo, x: loc.x, y: loc.y }, remainingIds);
              const key = buildRequestKey({ groupId: currentGroupId, skuIds: remainingIds, anchor: newAnchor, detourLocationId: saved.detourLocationId, paid: saved.paid });
              saveRouteProgress({ groupId: currentGroupId, requestKey: key, route: nextRoute });
              setRoute(nextRoute);
              setMapFloor(nextRoute.start.floorNo);
            }
          } catch {
            // 실패해도 아래에서 세션은 갱신되니, 다음 effect 실행 때 전체 최적화로 복구됨
          }
        }
        writeShoppingSession({ ...saved, anchor: newAnchor }, { preserveRoute: true });
        trackConsumerEvent({ event_type: "VIEW", sku_id: found.skuId });
        setViewMode("map");
        return;
      }

      // ✅ 수정(요청 — "백엔드 수정된거 확인하고 프론트 마저 수정") — 백엔드가
      //   addItemToGroup()에서 scanned:true면 새 상품/이미 계획된(F) 상품/이미 스캔한(T)
      //   상품을 전부 알아서 구분해서 처리하도록 바뀌었습니다(새 상품·F 상품 첫 스캔은
      //   수량 1로, 이미 T인 걸 또 스캔하면 +1). 그래서 프론트가 먼저 "있는지, 이미
      //   스캔했는지" 나눠서 add/PATCH를 골라 부르던 로직이 더 이상 필요 없어졌습니다 —
      //   항상 이 add API 하나만 scanned:true로 부르면 됩니다. 판단을 프론트·백엔드
      //   양쪽에서 각자 하면 둘이 어긋날 수 있다는 게 백엔드 쪽 이유이기도 합니다.
      await addProductToCartGroup(currentGroupId, {
        id: found.skuId,
        name: found.name,
        category: found.categoryL1 ?? "",
        price: found.finalPriceKrw ?? found.priceKrw,
        image: resolveImageUrl(found.imageUrl) ?? undefined,
      }, true);

      // ✅ Set은 삽입 순서를 유지합니다 — delete 후 다시 add해서 "방금 스캔한 상품"이
      //   항상 이 Set의 맨 끝(=목록 렌더 시 맨 위)으로 오게 합니다.
      const saved = sessionFor(currentGroupId);
      const next = [...saved.scannedSkuIds.filter(id=>id!==found.skuId),found.skuId];
      writeShoppingSession({...saved,scannedSkuIds:next,
        anchor:found.pickLocationId?{skuId:found.skuId}:saved.anchor});
      setSessionScans(new Set(next));

      if (found.pickLocationId) {
        trackConsumerEvent({ event_type: "SCAN_ADD", sku_id: found.skuId, location_id: found.pickLocationId });
      } else {
        trackConsumerEvent({ event_type: "VIEW", sku_id: found.skuId });
      }

      // 시뮬레이션(부모 창)에 "이 상품을 방금 찍었다"고 알린다.
      // 시뮬레이션이 이 상품 매대를 출발점으로 잡아 길찾기를 다시 계산한다.
      if (typeof window !== "undefined" && window.parent !== window) {
        const parentOrigin = document.referrer ? new URL(document.referrer).origin : window.location.origin;
        window.parent.postMessage(
          { source: "storeflow-frontend", type: "SCANNED_PRODUCT", skuId: found.skuId, name: found.name },
          parentOrigin
        );
      }

      refreshGroups();
    } catch (e) {
      // ✅ 수정(2026-09) — 무조건 "상품을 찾을 수 없어요"만 보여주고 있었는데, 실제로는
      //   백엔드 재고/프로모션 조회 쪽에서 500이 나는 경우가 있어서(전역 예외 처리기가
      //   아직 없어 원인이 안 보였음) 원인이 "찾을 수 없음"인지 다른 서버 문제인지
      //   구분이 안 됐음. apiFetch가 읽어온 실제 메시지를 그대로 보여줌.
      setError(e instanceof ApiError ? e.message : "해당 바코드의 상품을 찾을 수 없어요.");
    } finally {
      scanLock.current = false;
    }
  };

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    lookupByCode(barcode);
  };

  // ✅ 신규(요청 — "계획 추가 버튼") — 예전 ShoppingRouteActions의 검색·추가·먼저 들르기
  //   로직을 그대로 가져옴. 리스트에 없는 상품을 찾아 계획에만 추가(실물 수집 아님)하거나,
  //   화장실 등 시설을 먼저 들르도록 동선을 바꿈.
  const planSearch = async () => {
    if (!planQuery.trim()) return;
    setPlanBusy(true); setPlanMessage("");
    try {
      setPlanResults((await apiFetch<typeof planResults>(`/api/products/search?keyword=${encodeURIComponent(planQuery.trim())}`, { auth: false })).slice(0, 8));
    } catch { setPlanMessage("상품 검색을 불러오지 못했어요."); }
    finally { setPlanBusy(false); }
  };
  const planAdd = async (p: (typeof planResults)[number]) => {
    if (!groupId) return;
    setPlanBusy(true);
    try {
      const group = (await loadCartGroups()).find((g) => g.id === groupId);
      if (!group) throw new Error("리스트를 찾을 수 없어요.");
      if (!group.products.some((x) => x.id === p.skuId)) {
        await addProductToCartGroup(groupId, { id: p.skuId, name: p.name, category: p.categoryL1 ?? "", price: p.finalPriceKrw ?? p.priceKrw, image: resolveImageUrl(p.imageUrl) ?? undefined });
      }
      writeShoppingSession(sessionFor(groupId)); // 현재 위치는 안 바꾸고 동선만 다시 계산되게
      setPlanResults([]); setPlanQuery("");
      setPlanMessage(`${p.name}을 구매 계획에 반영했어요. 매대에서 스캔하면 수집 완료돼요.`);
      refreshGroups();
    } catch (e) { setPlanMessage(e instanceof Error ? e.message : "추가하지 못했어요."); }
    finally { setPlanBusy(false); }
  };
  // ✅ 수정(버그 인계 — "동선이 처음으로 돌아감") — 예전엔 detourLocationId만 세션에
  //   써두고 전체 재최적화(getOptimizedRoute)에 맡겼는데, 그러면 이미 정해둔 나머지
  //   상품 순서가 매번 새로 섞였습니다. 이제 지금 route가 이미 알고 있는 순서를 유지한
  //   채로, 그 앞에 시설만 끼워 넣어서 걷는 길만 다시 계산(planFacilityDetour)하고,
  //   그 결과를 진행 상태로 직접 저장해둡니다 — writeShoppingSession의 기본 동작(진행
  //   상태 초기화)을 막으려고 preserveRoute:true를 씀. 계산이 끝나기 전에 모달을 닫거나
  //   상황이 바뀌면 오래된 응답이 지금 상태를 덮지 않도록 groupId/시설 값을 다시 확인합니다.
  const planVisitFacility = async () => {
    if (!groupId || !planFacility || !route) return;
    const facility = planFacility;
    setPlanBusy(true);
    try {
      const remainingIds = (selectedGroup?.products ?? []).filter((p) => !sessionScans.has(p.id)).map((p) => p.id);
      const nextRoute = await planFacilityDetour(route, facility, remainingIds);
      // ✅ 계산 중 다른 시설로 바뀌었거나 리스트가 바뀌었으면 이 오래된 결과는 버림.
      if (groupId == null || planFacility !== facility) return;
      const session = sessionFor(groupId);
      const key = buildRequestKey({ groupId, skuIds: remainingIds, anchor: session.anchor, detourLocationId: facility, paid: session.paid });
      saveRouteProgress({ groupId, requestKey: key, route: nextRoute });
      writeShoppingSession({ ...session, detourLocationId: facility }, { preserveRoute: true });
      setRoute(nextRoute);
      setMapFloor(nextRoute.start.floorNo);
      setViewMode("map");
      setPlanMessage("그 시설까지 먼저 안내할게요. 이후 상품 순서는 그대로예요.");
      setPlanFacility("");
    } catch {
      setPlanMessage("경로를 다시 계산하지 못했어요.");
    } finally {
      setPlanBusy(false);
    }
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
  // ✅ 수정(요청 — "버튼 2개인 느낌") — 예전엔 이 상태를 별도 카메라 버튼(toggleCamera)이
  //   껐다 켰다 했는데, 이제 지도⇄카메라 전환 버튼(viewMode)이 직접 관리합니다.
  const [cameraEnabled, setCameraEnabled] = useState(false);

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
  const handleCheckout = () => {
    if (!groupId || checkingOut || cartTotalCount === 0 || !isLoggedIn() || groupCompleted) return;
    writeCheckoutDraft({
      groupId,
      scannedSkuIds: Array.from(sessionScans),
      createdAt: new Date().toISOString(),
    });
    router.push(`/checkout?group=${groupId}`);
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

  // ✅ 신규 — 지도 보기에서 "모든 동선을 한 번에" 보여주기 위해, journeySteps 전체를
  //   이어붙임(예전엔 한 단계씩만 보여주고 이전/다음으로 넘겼는데 이제 그게 없음).
  const routeMapPath: (PathPoint & { floorNo: number })[] =
    route?.journeySteps.flatMap((s) => s.path) ?? [];

  // ✅ 버그 수정(요청 — "동선이 이상한 방향으로 그려짐") — 원인: routeMapPath를 그냥
  //   floorNo만으로 filter해서 StoreMap에 하나의 선(precomputedPath)으로 넘기고 있었습니다.
  //   그런데 예를 들어 1층→에스컬레이터→2층→다시 1층(반품/화장실 등)처럼 같은 층을 두 번
  //   지나가는 동선이면, filter는 "중간에 다른 층을 거쳐서 끊겼다"는 사실을 무시하고 1층
  //   포인트만 순서대로 쭉 이어붙여 버립니다 — 그러면 서로 이어져 있지 않은 두 지점이 매장을
  //   가로지르는 직선으로 연결돼서(실제로 안 걸어간 방향으로) 동선이 이상해 보였습니다.
  //   아래 currentMapSegments/mutedMapSegments가 층이 바뀌는 지점마다 구간을 끊어서
  //   배열의 배열로 만들고, StoreMap엔 pathSegments/mutedPathSegments로 넘겨서 끊어진
  //   구간끼리는 선으로 안 이어지게 합니다.
  // ✅ 버그 수정(요청 — "스캔 동선에서 이미 찍은 상품에 순번 배지(예: '2')랑 체크 배지가
  //   같이 겹쳐서 뜸") — 원인: route(남은 상품 기준으로 계산)가 방금 스캔을 아직
  //   반영하기 전(재계산 잠깐 지연되는 사이)엔, 방금 찍은 skuId가 routeMapPins(순번
  //   배지)에도 남아있고 checkedMapPins(체크 배지)에도 동시에 들어가서 같은 자리에
  //   두 배지가 겹쳐 보였음. sessionScans에 이미 있는 skuId는 routeMapPins에서
  //   확실히 빼서, 그 사이에도 체크 배지 하나만 보이게 함.
  const routeMapPins: (MapPin & { floorNo: number })[] =
    route?.journeySteps
      .filter((s) => s.kind === "PRODUCT" && s.path.length > 0 && !(s.skuId != null && sessionScans.has(s.skuId)))
      .map((s, i) => {
        const last = s.path[s.path.length - 1];
        const product = selectedGroup?.products.find((p) => p.id === s.skuId);
        return { id: s.skuId ?? i, name: s.label, price: product?.price ?? 0, x: last.x, y: last.y, floorNo: last.floorNo, image: product?.image };
      }) ?? [];

  // ✅ 신규(요청 — "동선 지도에도 방금 찍은 매대 위에 현위치 핀") — 이미 찍은 상품도
  //   좌표(coordsBySkuId)가 있으면 지도 핀으로 같이 그림(collected: true → 체크 배지).
  //   그 중 가장 마지막으로 찍은 것만 isCurrentLocation: true로 표시해서, 지도에서
  //   체크 배지 대신 흰 원+그림자+주황 핀 아이콘으로 특별하게 보이게 함.
  const checkedMapPins: (MapPin & { floorNo: number })[] = Array.from(sessionScans)
    .map((skuId, i, arr) => {
      const coord = coordsBySkuId.get(skuId);
      const product = selectedGroup?.products.find((p) => p.id === skuId);
      if (!coord || !product) return null;
      return {
        id: skuId,
        name: product.name,
        price: product.price,
        x: coord.x,
        y: coord.y,
        floorNo: coord.floorNo,
        image: product.image,
        collected: true,
        isCurrentLocation: i === arr.length - 1,
      };
    })
    .filter((p): p is MapPin & { floorNo: number } => !!p);
  const currentLocationPin = checkedMapPins.find((p) => p.isCurrentLocation);

  // ✅ 버그 수정(요청 — "얘가 현위치 핀을 못 잡고 있는거 아니야?") — 맞았다. anchorIdx를
  //   좌표 완전 일치(===)로 찾고 있었는데, currentLocationPin의 좌표는 coordsBySkuId(상품
  //   재고 위치 API)에서 온 값이고 routeMapPath의 좌표는 경로 계산(A* 등) 엔진이 만든
  //   경유점 좌표라, 같은 매대를 가리켜도 소수점 단위로 미세하게 다를 수 있다. 그래서
  //   완전 일치 비교는 항상 실패(-1)해서 매번 "못 찾음 → 전체 경로(입구부터) 사용"으로
  //   빠졌던 것. 완전 일치 대신, 같은 층에서 가장 가까운 점을 찾도록 바꿈.
  const anchorIdx = (() => {
    if (!currentLocationPin) return -1;
    let bestIdx = -1;
    let bestDist = Infinity;
    routeMapPath.forEach((p, i) => {
      if (p.floorNo !== currentLocationPin.floorNo) return;
      const dist = Math.hypot(p.x - currentLocationPin.x, p.y - currentLocationPin.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    });
    return bestIdx;
  })();
  const routeMapPathFromAnchor = anchorIdx >= 0 ? routeMapPath.slice(anchorIdx) : routeMapPath;

  // ✅ 신규(요청 — "현재 경로로 잡히는 길만 메인 주황색으로, 다른 부분은 연하게") — 스캔
  //   화면(실제 매장에서 다음에 갈 곳)에 적용. 다음 목적지 핀(routeMapPins[0])의 좌표를
  //   전체 경로(routeMapPathFromAnchor)에서 찾아, 거기까지(포함)는 진하게(currentMapSegments),
  //   그 다음 상품들로 이어지는 나머지는 옅게(mutedMapSegments) 나눈다. journeySteps
  //   내부 구조를 추측하지 않고 이미 화면에 맞게 뜨는 핀 좌표를 기준으로 삼아서 안전하다.
  const firstMapPin = routeMapPins[0];
  const firstMapPinIdx = firstMapPin
    ? routeMapPathFromAnchor.findIndex((p) => p.x === firstMapPin.x && p.y === firstMapPin.y && p.floorNo === firstMapPin.floorNo)
    : -1;
  const mapSplitAt = firstMapPinIdx >= 0 ? firstMapPinIdx + 1 : routeMapPathFromAnchor.length;
  const splitPathByFloor = (path: (PathPoint & { floorNo: number })[]): PathPoint[][] => {
    const segments: PathPoint[][] = [];
    let current: PathPoint[] = [];
    for (const p of path) {
      if (p.floorNo === mapFloor) {
        current.push(p);
      } else if (current.length) {
        segments.push(current);
        current = [];
      }
    }
    if (current.length) segments.push(current);
    return segments;
  };
  const currentMapSegments: PathPoint[][] = splitPathByFloor(routeMapPathFromAnchor.slice(0, mapSplitAt));
  const mutedMapSegments: PathPoint[][] = splitPathByFloor(routeMapPathFromAnchor.slice(mapSplitAt));

  // ✅ 버그 수정(요청 — "이 화면에는 체크 아이콘이 있을건데 확인해서 없애야해") — 이미
  //   찍은 상품 전부를 체크 배지 핀으로 그리고 있었는데(마지막 한 개만 현위치 스타일),
  //   이 지도는 "다음에 어디로 가야 하는지"를 보여주는 화면이라 지나온 상품들의 체크
  //   배지는 불필요한 잡음이었다. 가장 마지막으로 찍은 것(현위치 표시용) 하나만 남기고
  //   나머지 체크 배지는 지도에서 뺀다.

  // 현위치 핀(있으면 1개) + 앞으로 찍을 핀을 합쳐서 지도에 같이 그림. routeOrder는 "앞으로
  // 찍을" 핀들의 id만 담아서, 현위치 핀은 routeOrder에 안 잡혀도 isCurrentLocation
  // 스타일이 따로 있어 문제없다.
  const allMapPins: (MapPin & { floorNo: number })[] = [...(currentLocationPin ? [currentLocationPin] : []), ...routeMapPins];

  // ✅ 수정(요청 — "이동경로 한 줄 / 목록 한 줄이 번갈아 나오게, 찍은 건 위로 모으고
  //   이동경로는 빠지고, 마지막으로 찍은 매대에 현위치 핀") — 예전엔 "이동 경로" 요약을
  //   목록 위에 박스 하나로 뭉쳐서 보여주고, 그 아래엔 전체 상품을 동선 순서로 쭉
  //   나열(담은 건 진하게·안 담은 건 흐리게)만 했습니다. 이제
  //     [찍은 상품들(찍은 순서대로, 이동경로 없이 연달아)]
  //     → [이동경로 한 줄] → [안 찍은 상품 1] → [이동경로 한 줄] → [안 찍은 상품 2] → ...
  //   순서로 번갈아 보여줍니다. 찍은 상품 구간은 이미 지나온 길이라 이동경로를 안 보여주고,
  //   그 다음(=아직 안 찍은 첫 상품 앞) 이동경로에만 "(현위치)"를 붙여서 지금 여기서부터
  //   출발한다는 걸 표시합니다.
  // ✅ route(동선 계산)는 애초에 "아직 안 찍은 상품"(remainingIds, 위쪽 useEffect 참고)만
  //   대상으로 돌기 때문에, route.journeySteps는 이미 찍은 상품을 포함하지 않습니다 — 그래서
  //   여기서 이동경로를 다시 걸러낼 필요 없이, PRODUCT 단계 사이사이에 낀 WALK/ESCALATOR 등의
  //   라벨을 모아서 그 상품 앞에 붙는 "이동경로" 한 줄로 만들면 됩니다.
  const checkedSkuIds = Array.from(sessionScans); // Set 삽입 순서 = 실제로 찍은(=걸어온) 순서
  const checkedListProducts = checkedSkuIds
    .map((id) => selectedGroup?.products.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const remainingSegments: { routeText: string; product: NonNullable<typeof selectedGroup>["products"][number] }[] = [];
  if (route) {
    let pendingLabels: string[] = [];
    for (const step of route.journeySteps) {
      if (step.kind === "PRODUCT") {
        const product = selectedGroup?.products.find((pp) => pp.id === step.skuId);
        if (product && !sessionScans.has(product.id)) {
          remainingSegments.push({
            routeText: pendingLabels.length > 0 ? pendingLabels.join(" → ") : step.label,
            product,
          });
        }
        pendingLabels = [];
      } else {
        // ✅ 수정(요청 — "~로 가는 길"이 너무 길어져서 접미사 없이 label을 그대로 보여줌) —
        //   WALK/ESCALATOR/FACILITY 등 종류와 무관하게 백엔드가 준 label을 그대로(가공 없이)
        //   보여줍니다.
        pendingLabels.push(step.label);
      }
    }
  }
  // 동선 계산에서 제외된(excluded) 상품 등 — 위 segment로 못 묶인 미수집 상품은 이동경로
  // 없이 맨 뒤에 그대로 붙임(예전 "동선에 없는 건 맨 뒤로" 동작 유지).
  const segmentedIds = new Set(remainingSegments.map((s) => s.product.id));
  const strandedProducts = (selectedGroup?.products ?? []).filter(
    (p) => !sessionScans.has(p.id) && !segmentedIds.has(p.id)
  );

  type ListBlock =
    | { kind: "product"; product: NonNullable<typeof selectedGroup>["products"][number]; collected: boolean; isCurrentLocation: boolean }
    | { kind: "route"; text: string; showCurrentLocation: boolean };

  const listBlocks: ListBlock[] = [
    ...checkedListProducts.map((p, i) => ({
      kind: "product" as const,
      product: p,
      collected: true,
      isCurrentLocation: i === checkedListProducts.length - 1,
    })),
    ...remainingSegments.flatMap((seg, i) => [
      { kind: "route" as const, text: seg.routeText, showCurrentLocation: i === 0 },
      { kind: "product" as const, product: seg.product, collected: false, isCurrentLocation: false },
    ]),
    ...strandedProducts.map((p) => ({
      kind: "product" as const,
      product: p,
      collected: false,
      isCurrentLocation: false,
    })),
  ];

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
          {/* ✅ 수정(요청 — "오른쪽 위 동선보기 페이지를 없애고") — 별도 버튼/페이지
              삭제. 아래 카메라·지도 영역 안의 토글 아이콘으로 대체됨. */}
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

        {/* ✅ 수정(요청 — "카메라 버튼 누르면 카메라로, 지도 아이콘 누르면 지도로") —
            이 영역이 카메라와 지도, 두 상태를 오가는 하나의 뷰가 됨. 자리 자체는 그대로
            유지(카메라 켜짐/꺼짐이든 지도든 항상 이 높이). */}
        {/* ✅ 버그 수정(요청 — "스캔 화면에 스캔한 개수, 금액, 결제 버튼 안 보임") — 카메라가
            화면 절반(50dvh)을 고정으로 차지한 채로, 바코드 입력·이동경로 요약·상품
            목록이 전부 shrink-0라 안 줄어들다 보니, 화면이 작은 기기에서는 맨 아래
            결제 영역이 뷰포트 밖으로 밀려서(바깥 컨테이너가 overflow-hidden이라
            스크롤도 안 됨) 안 보였습니다. 카메라 높이를 줄여서 아래쪽에 확실히
            공간을 확보했습니다. */}
        {!listExpanded && (
        <div className="relative h-[38dvh] shrink-0 overflow-hidden bg-[#666666]">
          {/* ✅ 신규 — 우상단 토글 아이콘. 카메라 보는 중엔 지도 아이콘, 지도 보는 중엔
              카메라 아이콘이 떠서 서로 넘어갈 수 있음. */}
          {/* ✅ 수정(요청 — "번갈아 쓸 수 있게, 동선이 하나도 안 보이잖아") — 아이콘만
              있던 버튼에 글자를 같이 넣어서 뭘 하는 버튼인지 더 잘 보이게 함. */}
          <button
            type="button"
            onClick={() => {
              // ✅ 수정(요청 — "굳이 버튼이 2개 있는 기분") — 지도⇄카메라 전환 버튼이
              //   실제 카메라 On/Off까지 같이 제어하도록 합침. 카메라로 전환하면 바로
              //   스트림이 켜지고, 지도로 전환하면 꺼집니다 — 더 이상 별도의 카메라
              //   버튼이 입력창 옆에 안 필요합니다.
              setViewMode((v) => {
                const next = v === "camera" ? "map" : "camera";
                if (next === "camera") {
                  setCameraEnabled(true);
                } else {
                  stop();
                  setCameraEnabled(false);
                }
                return next;
              });
            }}
            aria-label={viewMode === "camera" ? "지도 보기" : "카메라 보기"}
            className="absolute right-3 top-3 z-20 flex h-10 items-center gap-1.5 rounded-full bg-black/60 px-3 text-sm text-white backdrop-blur"
          >
            {viewMode === "camera" ? <RiRoadMapLine size={18} /> : <RiCameraLine size={18} />}
            {viewMode === "camera" ? "동선 보기" : "카메라"}
          </button>

          {viewMode === "map" ? (
            route ? (
              <StoreMap
                floorNo={mapFloor}
                pins={allMapPins.filter((p) => p.floorNo === mapFloor)}
                routeOrder={routeMapPins.map((p) => p.id)}
                pathSegments={currentMapSegments}
                mutedPathSegments={mutedMapSegments}
                onFloorChange={setMapFloor}
                heightClassName="h-full"
                hideHelpText
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-sm text-white">{routeError ?? "동선을 계산하고 있어요..."}</p>
              </div>
            )
          ) : (
          cameraEnabled && cameraStreamState !== "denied" && cameraStreamState !== "insecure" ? (
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
          )
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
            {/* ✅ 수정(요청 — "현위치 체크되어 있을 때는 담기 버튼 > 조회 버튼으로") —
                체크 안 됐을 때는 실제로 담기니까 "담기", 체크됐을 때는 안 담고 위치만
                보는 거니까 "조회"로 라벨이 바뀝니다. */}
            <Button type="submit" variant="outline" className="shrink-0" disabled={groupCompleted}>
              {locateOnly ? "조회" : "담기"}
            </Button>
          </form>

          {/* ✅ 수정(요청 — "현위치는 버튼 말고 아래에 체크박스로 다시. 스타일은 다른
              체크박스랑 통일") — 버튼 대신 공용 Checkbox 컴포넌트로 되돌림. 체크되어
              있으면: 스캔해도 안 담기고, 그 상품 위치를 지도에 표시하면서 동선보기
              화면(지도)으로 넘어감. */}
          <div className="mt-2 flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={locateOnly} onChange={() => setLocateOnly((v) => !v)} />
              현재 위치만 확인 (담지 않음)
            </label>
            {/* ✅ "계획 추가" 버튼은 리스트에 없는 상품 추가·시설 먼저 들르기를 모아둔
                모달을 엽니다. */}
            <button
              type="button"
              onClick={() => setPlanOpen(true)}
              disabled={groupCompleted}
              className="flex shrink-0 items-center gap-1 rounded-full border border-card-border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              <RiCalendarCheckLine size={14} />
              계획 추가
            </button>
          </div>
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
        {/* ✅ 수정(요청 — "이동경로 한 줄 / 목록 한 줄이 번갈아 나오게") — 예전엔 여기에
            전체 이동경로를 하나로 뭉쳐서 보여주는 요약 박스가 따로 있었는데, 이제 그
            내용은 목록 안(listBlocks)에서 상품 사이사이에 끼는 "이동경로" 카드로
            들어가 있어서 이 별도 박스는 없앰. */}

        <div className={`${listExpanded ? "flex-1" : "max-h-48 shrink-0"} overflow-y-auto px-3`}>
          {listBlocks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">리스트에 담긴 상품이 없어요.</p>
          ) : (
            <div>
              {listBlocks.map((block, blockIdx) => {
                if (block.kind === "route") {
                  return (
                    <div
                      key={`route-${blockIdx}`}
                      className="my-2 rounded-[14px] border border-card-border bg-muted px-3 py-2"
                    >
                      {/* ✅ 수정(요청 — "위치 아이콘은 배경 다 빼고, 메인 주황색으로 이동경로
                          텍스트 왼쪽에") — 예전엔 상품 썸네일 위에 원형 배경(bg-brand)을
                          깐 배지로 붙어 있었는데, 그건 없애고 "이동경로" 라벨 바로 왼쪽에
                          배경 없는 주황 아이콘만 인라인으로 둠. 지금 서 있는 자리를 나타내는
                          카드(showCurrentLocation)에만 표시. */}
                      <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        {block.showCurrentLocation && <RiMapPin2Fill size={14} className="text-brand" />}
                        이동경로
                      </p>
                      <p className="text-sm leading-relaxed">
                        {block.showCurrentLocation ? `(현위치) → ${block.text}` : `→ ${block.text}`}
                      </p>
                    </div>
                  );
                }

                const p = block.product;
                const collected = block.collected;
                // ✅ 찍은 상품끼리는(이동경로 없이 바로 연달아 나오니까) 구분선을 보여주고,
                //   바로 위가 이동경로 카드였던 경우엔(이미 카드 자체로 구분되니) 생략.
                const prevIsProduct = blockIdx > 0 && listBlocks[blockIdx - 1].kind === "product";
                return (
                <div key={p.id} className={`${collected ? "" : "opacity-40"} ${prevIsProduct ? "border-t border-border" : ""}`}>
                  <div
                    className={`flex items-center gap-3 rounded-sm px-1 py-3 ${
                      selectedRemoveSkuId === p.id ? "bg-danger-bg" : ""
                    }`}
                  >
                    {/* ✅ 수정(요청 — "이동경로 위에 있는 위치 아이콘은... 이동경로 텍스트
                        왼쪽에 넣고") — 상품 썸네일 위에 얹었던 현위치 핀 배지는 없앰(엉뚱한
                        자리에 떠 보이는 문제). 현위치 표시는 이제 위 "이동경로" 카드
                        라벨 옆 아이콘과, 지도 위 전용 핀(StoreMap의 isCurrentLocation)
                        두 곳에서만 함. */}
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
                        <span className="text-muted-foreground">{collected ? `${p.quantity}개` : "아직 안 담음"}</span>
                        {collected && <span className="font-semibold">{(p.price * p.quantity).toLocaleString()}원</span>}
                      </div>
                    </div>
                    {/* ✅ "−" 누르면 이 상품 바로 아래에 몇 개 뺄지 고르는 패널이 뜸(요청 2번).
                        아직 안 담은 상품은 뺄 게 없으니 버튼 자체를 안 보여줌. */}
                    {collected && (
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
                    )}
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
                );
              })}
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
          {/* ✅ 수정(요청 — "리스트 상세 페이지처럼 결제하기 버튼 길게 만들고, 오른쪽에
              리브 버튼") — 기존엔 w-fit mx-auto로 가운데 작게 떠 있던 버튼을
              saved/[groupId]/page.tsx의 동선/리브 버튼 줄과 같은 구조(flex-1 긴
              버튼 + 60px 원형 리브 버튼)로 맞춤. */}
          {!loggedIn ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/auth/login?next=${encodeURIComponent(`/scan${groupId ? `?group=${groupId}` : ""}`)}`
                  )
                }
                className="flex h-[60px] flex-1 items-center justify-center gap-1.5 rounded-full bg-brand text-md font-medium text-brand-foreground"
              >
                <RiLoginBoxLine size={20} />
                로그인하고 결제하기
              </button>
              <button
                type="button"
                onClick={() => openAiChat(selectedGroup ? `"${selectedGroup.title}" 리스트 관련해서 물어볼게` : undefined, groupId ?? undefined)}
                aria-label="리브에게 물어보기"
                className="flex h-[60px] w-[60px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border border-border bg-white/20 text-xs backdrop-blur-2xl"
              >
                <img src="/icons/liv-line.svg" alt="" aria-hidden="true" className="h-[22px] w-[22px] shrink-0" />
                리브
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={cartTotalCount === 0 || checkingOut || groupCompleted}
                onClick={handleCheckout}
                className="flex h-[60px] flex-1 items-center justify-center gap-1.5 rounded-full bg-brand text-md font-medium text-brand-foreground disabled:opacity-50"
              >
                <RiBankCardLine size={20} />
                {checkingOut ? "결제 중..." : "결제하기"}
              </button>
              <button
                type="button"
                onClick={() => openAiChat(selectedGroup ? `"${selectedGroup.title}" 리스트 관련해서 물어볼게` : undefined, groupId ?? undefined)}
                aria-label="리브에게 물어보기"
                className="flex h-[60px] w-[60px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border border-border bg-white/20 text-xs backdrop-blur-2xl"
              >
                <img src="/icons/liv-line.svg" alt="" aria-hidden="true" className="h-[22px] w-[22px] shrink-0" />
                리브
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ✅ 신규(요청 — "계획 추가 버튼") — 리스트에 없는 상품 검색해서 추가 + 시설 먼저
          들르기. 예전 ShoppingRouteActions 내용을 그대로 옮김. */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>계획 추가</DialogTitle>
          </DialogHeader>

          <div>
            <p className="mb-2 text-sm font-medium">리스트에 없는 상품 찾기</p>
            <div className="flex gap-2">
              <Input
                placeholder="상품 이름 검색"
                value={planQuery}
                onChange={(e) => setPlanQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") planSearch(); }}
              />
              <Button type="button" variant="outline" disabled={planBusy} onClick={planSearch} className="shrink-0">
                검색
              </Button>
            </div>
            {planResults.map((p) => (
              <div key={p.skuId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">{p.name}</span>
                <button
                  type="button"
                  disabled={planBusy || p.discontinued}
                  onClick={() => planAdd(p)}
                  className="shrink-0 rounded border border-card-border px-2 py-1 text-xs disabled:opacity-40"
                >
                  구매 계획에 추가
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t pt-4">
            <p className="mb-2 text-sm font-medium">먼저 들르기</p>
            <div className="flex gap-2">
              <select
                aria-label="들를 시설"
                value={planFacility}
                onChange={(e) => setPlanFacility(e.target.value)}
                className="min-w-0 flex-1 rounded border border-card-border p-2 text-sm"
              >
                <option value="">화장실·휴식 공간 선택</option>
                {route?.facilities.map((f) => (
                  <option key={f.locationId} value={f.locationId}>{f.label}</option>
                ))}
              </select>
              <Button type="button" variant="outline" disabled={!planFacility || planBusy} onClick={planVisitFacility} className="shrink-0">
                먼저 들르기
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">시설까지 먼저 안내한 뒤 장보기를 이어가요.</p>
          </div>

          {planMessage && <p role="status" className="mt-3 text-sm">{planMessage}</p>}
        </DialogContent>
      </Dialog>

      <GroupPickerDialog
        open={groupPickerOpen || entryPickerOpen}
        // ✅ 신규(요청) — 결제 완료된 리스트는 더 이상 담을 수 없으니 선택지에서 숨김
        groups={groups.filter((g) => g.status !== "COMPLETED" && !isGroupCompleted(g.id))}
        selectedGroupId={groupId ?? DEFAULT_GROUP_ID}
        onClose={() => {
          setGroupPickerOpen(false);
          setEntryPickerOpen(false);
        }}
        onSelect={handleSelectGroup}
        onGroupsChange={refreshGroups}
        onStartWithoutList={async () => {
          // ✅ 수정(2026-09) — 누를 때마다 새로 만들지 않고, 아직 결제 안 끝난 "빠른 장보기"
          //   그룹이 있으면 그걸 재사용(중복 생성 방지).
          const group = await getOrCreateQuickCartGroup();
          setGroups((prev) => (prev.some((g) => g.id === group.id) ? prev : [...prev, group]));
          if (groupId != null && sessionScans.size > 0 && group.id !== groupId) {
            setPendingGroupSwitch(group.id);
            setEntryPickerOpen(false);
            return;
          }
          setGroupId(group.id);
          setEntryPickerOpen(false);
          writeActiveScanGroupId(group.id);
        }}
      />

      {/* ✅ 신규(요청 5번) — 이미 찍은 상품이 있는 채로 다른 리스트로 옮기려 할 때,
          그 상품들을 새 리스트로 가져갈지 그냥 두고 새로 찍을지 선택하는 모달. */}
      <Dialog open={pendingGroupSwitch != null} onOpenChange={(v) => !v && setPendingGroupSwitch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>다른 리스트로 옮길까요?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            지금까지 찍은 상품 {scannedProducts.length}종을 새 리스트로 가져갈지, 여기 그대로 두고
            새 리스트에서 새로 찍을지 골라주세요.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={movingScans}
              onClick={handleMoveScannedItems}
              className="flex h-11 w-full items-center justify-center rounded-full bg-brand text-sm font-medium text-brand-foreground disabled:opacity-50"
            >
              {movingScans ? "옮기는 중..." : "가져가기"}
            </button>
            <button
              type="button"
              disabled={movingScans}
              onClick={handleDiscardAndSwitch}
              className="flex h-11 w-full items-center justify-center rounded-full border border-card-border text-sm font-medium disabled:opacity-50"
            >
              버리고 새로 찍기
            </button>
            <button
              type="button"
              disabled={movingScans}
              onClick={() => setPendingGroupSwitch(null)}
              className="mt-1 text-center text-sm text-muted-foreground underline disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </DialogContent>
      </Dialog>
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
