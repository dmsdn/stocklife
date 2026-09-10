import { getMemberToken } from './api/memberAuth';
import { useCallback, useEffect, useRef, useState } from 'react';
import GameCanvas, { type GameCanvasHandle } from './game/GameCanvas';
import FloorDropdown from './components/FloorDropdown';
import SidePanel from './components/SidePanel';
import FrontendPanel, { type FrontendPanelHandle } from './components/FrontendPanel';
import TransferChoiceModal from './components/TransferChoiceModal';
import ElevatorFloorModal from './components/ElevatorFloorModal';
import ProductPopup from './components/ProductPopup';
import CartGroupModal from './components/CartGroupModal';
import CheckoutTargetModal from './components/CheckoutTargetModal';

import {
    fetchFloorData,
    confirmRestock,
} from './api/locations';

import {
    fetchProductsAtLocation,
    adjustStock,
} from './api/products';

import {
    addItemToDbCart,
    fetchCartFromDb,
    fetchCartGroups,
    type CartGroupOption,
} from './api/cart';

import {
    setCurrentConsumer,
    resetCurrentConsumerToDefault,
    getCurrentConsumerName,
    getCurrentConsumerPhone,
    getCurrentConsumerId,
    subscribeCurrentConsumer,
} from './state/currentConsumer';

import {
    loadShoppingList,
    saveShoppingList,
    resolveProductLocation,
    type ProductSearchResult,
    type ShoppingListItem,
} from './api/shoppingList';

import { runTrip, type TransferMethod } from './game/trip';
import { escalatorRoute, floorLabel } from './game/floorGraph';

import {
    fetchCartRoute,
    pathPointsOnFloor,
    type CartRoute,
} from './api/route';


/**
 * 방문 순서를 "지금 위치에서 가장 가까운 곳부터" 정한다(최근접 이웃).
 *
 * 층을 옮기는 건 같은 층에서 몇 칸 더 걷는 것과 비교가 안 되게 비싸므로, 다른 층 후보에는
 * 큰 고정 벌점을 준다 — 그래야 "한 층을 다 돌고 다음 층으로" 순서가 나온다. 벌점이 없으면
 * 층을 오르내리며 왔다 갔다 하는 순서가 나온다.
 *
 * 최적해는 아니다(그건 TSP다). 매대 수가 十 단위인 장보기에서는 이걸로 충분하고, 무엇보다
 * 사람이 납득할 수 있는 순서가 나온다.
 */
const FLOOR_CHANGE_PENALTY = 1000;

function orderStopsNearestFirst<T extends { floorNo: number; x: number; y: number }>(
    pool: T[],
    start: { floor: number; x: number; y: number },
): T[] {
    const remaining = [...pool];
    const ordered: T[] = [];
    let cursor = { floor: start.floor, x: start.x, y: start.y };

    while (remaining.length > 0) {
        let bestIdx = 0;
        let bestDist = Infinity;

        remaining.forEach((v, i) => {
            const penalty = v.floorNo === cursor.floor ? 0 : FLOOR_CHANGE_PENALTY;
            const dist = penalty + Math.abs(v.x - cursor.x) + Math.abs(v.y - cursor.y);
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
            }
        });

        const [picked] = remaining.splice(bestIdx, 1);
        ordered.push(picked);
        cursor = { floor: picked.floorNo, x: picked.x, y: picked.y };
    }

    return ordered;
}

import type {
    FloorData,
    LocationInfo,
    FacilityInfo,
    GridPoint,
    ProductInfo,
    CartItem,
} from './game/types';


interface TransferPrompt {
    targetFloor: number;
    targetCell: GridPoint;
}


export default function App() {
    const canvasRef = useRef<GameCanvasHandle>(null);

    const [playerFloor, setPlayerFloor] = useState(1);
    const [playerCell, setPlayerCell] =
        useState<GridPoint | null>(null);

    const [viewFloor, setViewFloor] = useState(1);
    const [viewFloorData, setViewFloorData] =
        useState<FloorData | null>(null);

    const [selectedLocation, setSelectedLocation] =
        useState<LocationInfo | null>(null);

    const [transferPrompt, setTransferPrompt] =
        useState<TransferPrompt | null>(null);

    const [elevatorPrompt, setElevatorPrompt] =
        useState(false);

    const [statusMessage, setStatusMessage] =
        useState<string>('');

    const [busy, setBusy] =
        useState(false);

    const [showFrontend, setShowFrontend] =
        useState(true);

    const [frontendWidth, setFrontendWidth] =
        useState(640);

    const [loggedInName, setLoggedInName] =
        useState<string | null>(
            getCurrentConsumerName()
        );

    const [loggedInPhone, setLoggedInPhone] =
        useState<string | null>(
            getCurrentConsumerPhone()
        );

    // 09-08 상품 위치 핀. 오른쪽 웹 화면에서 가격 밑 위치를 누르면 그 매대에 핀이 꽂힌다.
    // pinnedProduct 는 "지금 어느 상품을 가리키고 있는지", pinConfirmOpen 은 핀을 눌러서
    // "여기로 갈까요?" 확인 창이 떠 있는 상태인지를 나타낸다.
    const [pinnedProduct, setPinnedProduct] = useState<{
        skuId: number; name: string; floorNo: number; x: number; y: number;
    } | null>(null);
    // 아래 postMessage 리스너는 이 파일에서 showProductPin 보다 위에 선언돼 있어서 직접
    // 부를 수 없다(선언 전 사용). 리스너를 통째로 옮기면 diff가 커지므로 ref 로 연결한다.
    const showProductPinRef = useRef<
        ((info: { skuId: number; name: string; floorNo: number; x: number; y: number }) => Promise<void>) | null
    >(null);

    const draggingRef = useRef(false);


    // ============================================================
    // 캐릭터 이름표
    // ============================================================

    // 09-09: 표기는 상단바와 한 낱말로 통일한다 — 머리 위도 상단바도 '비로그인'.
    // 배포용 회원 JWT 전환(api/memberAuth.ts) 이후로 비로그인은 "기본 계정 0001"이
    // 아니라 신원 없음이다. 그래서 '기본 캐릭터' 같은 말은 쓰지 않는다.
    useEffect(() => {
        const label =
            loggedInPhone
                ? loggedInPhone.slice(-4)
                : '비로그인';

        canvasRef.current?.setPlayerLabel(label);
    });


    // ============================================================
    // 상단 상태
    // ============================================================

    const [cart, setCart] =
        useState<CartItem[]>([]);

    const [cartGroupOpen, setCartGroupOpen] =
        useState(false);

    /**
     * 백엔드가 계산한 전체 동선.
     */
    const [activeRoute, setActiveRoute] =
        useState<CartRoute | null>(null);

    const [
        routeLoadingGroupId,
        setRouteLoadingGroupId,
    ] = useState<number | null>(null);

    const [
        checkoutTargetOpen,
        setCheckoutTargetOpen,
    ] = useState(false);

    const [cartGroups, setCartGroups] =
        useState<CartGroupOption[]>([]);

    const [
        selectedGroupId,
        setSelectedGroupId,
    ] = useState<number | null>(null);


    /**
     * 현재 열려 있는 매대 상품 팝업.
     */
    const [productPopup, setProductPopup] =
        useState<{
            baseLabel: string;
            groups: {
                location: LocationInfo;
                level: number;
                products: ProductInfo[];
            }[];
        } | null>(null);


    // ============================================================
    // Frontend iframe
    // ============================================================

    const frontendPanelRef =
        useRef<FrontendPanelHandle>(null);


    // ============================================================
    // DB 장바구니 다시 읽기
    // ============================================================

    const reloadCartFromDb =
        useCallback(
            (consumerId?: number) => {

                const id =
                    consumerId ??
                    getCurrentConsumerId();

                const token = getMemberToken();
                if (!token) { setCart([]); return; }
                fetchCartFromDb(id)
                    .then((items) => {
                        if (getMemberToken() !== token) return;

                        setCart((prev) =>
                            items.map((item) => {

                                /**
                                 * DB cart_item에는 locationId가 없으므로
                                 * 현재 시뮬레이션이 알고 있던 위치가 있으면 유지한다.
                                 */
                                const known =
                                    prev.find(
                                        (p) =>
                                            p.skuId ===
                                            item.skuId &&
                                            p.locationId
                                    );

                                return known
                                    ? {
                                        ...item,
                                        locationId:
                                        known.locationId,
                                    }
                                    : item;
                            })
                        );
                    })
                    .catch((err) =>
                        console.error(
                            '[DB장바구니] 조회 실패:',
                            err
                        )
                    );
            },
            []
        );


    const reloadCartGroups =
        useCallback(
            (consumerId?: number) => {

                const id =
                    consumerId ??
                    getCurrentConsumerId();

                const token = getMemberToken();
                if (!token) { setCartGroups([]); return; }
                fetchCartGroups(id)
                    .then((groups) => {
                        if (getMemberToken() === token) setCartGroups(groups);
                    })
                    .catch((err) =>
                        console.error(
                            '[DB장바구니] 리스트 목록 조회 실패:',
                            err
                        )
                    );
            },
            []
        );


    const cartReloadTimerRef =
        useRef<number | null>(null);


    const requestCartReload =
        useCallback(() => {

            if (
                cartReloadTimerRef.current != null
            ) {
                window.clearTimeout(
                    cartReloadTimerRef.current
                );
            }

            cartReloadTimerRef.current =
                window.setTimeout(() => {

                    cartReloadTimerRef.current =
                        null;

                    reloadCartFromDb();
                    reloadCartGroups();

                }, 300);

        }, [
            reloadCartFromDb,
            reloadCartGroups,
        ]);


    useEffect(() => {
        let observedToken = getMemberToken();
        const reloadIdentity = () => {
            observedToken = getMemberToken();
            setCart([]); setCartGroups([]); setSelectedGroupId(null);
            setCartGroupOpen(false); setCheckoutTargetOpen(false);
            setActiveRoute(null); canvasRef.current?.clearRoute();
            if (!observedToken) {
                setLoggedInName(null); setLoggedInPhone(null);
                return;
            }
            reloadCartFromDb(); reloadCartGroups();
        };
        reloadIdentity();
        const unsubscribe = subscribeCurrentConsumer(reloadIdentity);
        const checkToken = () => {
            if (getMemberToken() !== observedToken) reloadIdentity();
        };
        window.addEventListener('storage', checkToken);
        const timer = window.setInterval(checkToken, 1000);
        return () => {
            unsubscribe(); window.removeEventListener('storage', checkToken);
            window.clearInterval(timer);
        };
    }, [reloadCartFromDb, reloadCartGroups]);

    /**
     * 폴백 동기화.
     */
    useEffect(() => {

        const timer =
            window.setInterval(() => {

                if (document.hidden) {
                    return;
                }

                reloadCartFromDb();

            }, 3000);

        return () =>
            window.clearInterval(timer);

    }, [reloadCartFromDb]);


    // ============================================================
    // 길찾기 안내(장바구니 리스트) — 09-09
    // ============================================================

    /**
     * 1층 입구 좌표. Agent/sim/map_layout.py 의 FACILITIES 에 (1, 10, 70, 1, 3, 'ENTRANCE')
     * 로 박혀 있는 그 자리다. 입구 칸은 api/locations.ts 에서 회색 시설 블록으로 칠하지
     * 않는(=통행 가능한) 예외로 처리돼 있으므로 캐릭터가 실제로 설 수 있다.
     * 맵 데이터가 바뀌면 이 상수도 같이 바꿔야 한다.
     */
    const ENTRANCE: { floor: number; x: number; y: number } = { floor: 1, x: 10, y: 70 };

    /**
     * runGuidedRoute 는 startTrip/openLocationPopup 뒤에서야 정의할 수 있는데,
     * 그걸 호출하는 handleShowCartRoute 는 이 파일에서 그보다 위에 있다. useCallback 의
     * 의존성 배열은 렌더 시점에 평가되므로 직접 참조하면 TDZ 로 터진다 — 이 파일이
     * showProductPinRef 에서 쓰던 것과 같은 우회다.
     */
    const runGuidedRouteRef =
        useRef<
            ((stops: {
                skuId: number | null;
                name: string | null;
                floor: number;
                x: number;
                y: number;
            }[], goToEntranceFirst?: boolean) => Promise<void>) | null
        >(null);

    /**
     * 지금 어느 매대 앞에 멈춰 서 있는지. null 이면 안내가 진행 중이 아니거나 이동 중이다.
     * 이 값이 있는 동안에는 캐릭터 조작이 풀려 있어서, 리스트에 없는 상품을 사러 직접
     * 돌아다니다가 바코드를 찍고 돌아올 수 있다(09-09 요청).
     */
    const [guidedStop, setGuidedStop] =
        useState<{
            index: number;
            total: number;
            name: string;
        } | null>(null);

    /** '다음 상품으로 이동' 버튼이 부르는 함수. 멈춰 있는 동안에만 채워져 있다. */
    const guidedResumeRef =
        useRef<(() => void) | null>(null);

    // ============================================================
    // 쇼핑목록
    // ============================================================

    const [
        shoppingList,
        setShoppingList,
    ] = useState<ShoppingListItem[]>(
        () => loadShoppingList()
    );

    const [
        shoppingListOpen,
        setShoppingListOpen,
    ] = useState(false);

    const [
        navigatingIndex,
        setNavigatingIndex,
    ] = useState<number | null>(null);


    useEffect(() => {
        saveShoppingList(shoppingList);
    }, [shoppingList]);


    // ============================================================
    // Frontend panel resize
    // ============================================================

    useEffect(() => {

        const onMove =
            (e: MouseEvent) => {

                if (!draggingRef.current) {
                    return;
                }

                const newWidth =
                    window.innerWidth -
                    e.clientX;

                setFrontendWidth(
                    Math.min(
                        Math.max(
                            newWidth,
                            280
                        ),
                        window.innerWidth -
                        320
                    )
                );
            };


        const onUp = () => {

            draggingRef.current =
                false;

            document.body.style.cursor =
                '';
        };


        window.addEventListener(
            'mousemove',
            onMove
        );

        window.addEventListener(
            'mouseup',
            onUp
        );


        return () => {

            window.removeEventListener(
                'mousemove',
                onMove
            );

            window.removeEventListener(
                'mouseup',
                onUp
            );
        };

    }, []);


    // ============================================================
    // Frontend → Simulation 메시지
    // ============================================================

    useEffect(() => {

        const onMessage =
            (event: MessageEvent) => {
                const frame = document.querySelector<HTMLIFrameElement>('iframe[title="frontend"]');
                if (!frame || event.source !== frame.contentWindow ||
                    event.origin !== new URL(frame.src).origin) return;

                const data =
                    event.data;

                if (
                    !data ||
                    data.source !==
                    'storeflow-frontend'
                ) {
                    return;
                }


                console.log(
                    '[시뮬레이션] frontend로부터 메시지 수신:',
                    data
                );


                if (
                    data.type === 'LOGIN' && getMemberToken() &&
                    typeof data.consumerId ===
                    'number'
                ) {

                    setCurrentConsumer(
                        data.consumerId,
                        data.name ?? null,
                        data.phoneNumber ?? null
                    );

                    setLoggedInName(
                        data.name ??
                        `회원#${data.consumerId}`
                    );

                    setLoggedInPhone(
                        data.phoneNumber ?? null
                    );

                } else if (
                    data.type === 'LOGOUT'
                ) {

                    resetCurrentConsumerToDefault();

                    setLoggedInName(null);
                    setLoggedInPhone(null);

            } else if (data.type === 'LOCATE_PRODUCT') {
                // 오른쪽 웹 화면 검색 결과에서 가격 밑 위치를 누른 것.
                // 프론트가 층과 좌표까지 실어 보내주므로 여기서 다시 조회하지 않는다.
                if (typeof data.floorNo === 'number' && typeof data.x === 'number' && typeof data.y === 'number') {
                    void showProductPinRef.current?.({
                        skuId: Number(data.skuId) || 0,
                        name: typeof data.name === 'string' && data.name ? data.name : '선택한 상품',
                        floorNo: data.floorNo,
                        x: data.x,
                        y: data.y,
                    });
                }

            } else if (data.type === 'SCANNED_PRODUCT') {
                // 09-09: '지금 위치에서부터 길찾기'로 대기 중일 때만 의미가 있다.
                // 평소 장보기 스캔에서도 이 메시지는 오지만, 대기 중이 아니면 아래
                // 함수가 스스로 아무 일도 하지 않고 돌아간다.
                if (typeof data.skuId === 'number') {
                    void runRouteFromScannedProductRef.current?.(
                        data.skuId,
                        typeof data.name === 'string' && data.name ? data.name : '찍은 상품',
                    );
                }

                } else if (
                    data.type === 'CART_CHANGED'
                ) {

                    requestCartReload();
                }
            };


        window.addEventListener(
            'message',
            onMessage
        );


        return () =>
            window.removeEventListener(
                'message',
                onMessage
            );

    }, [requestCartReload]);


    // ============================================================
    // Floor data
    // ============================================================

    const floorCacheRef =
        useRef<Map<number, FloorData>>(
            new Map()
        );


    const getFloorData =
        useCallback(
            async (
                floor: number
            ): Promise<FloorData> => {

                if (
                    !floorCacheRef.current.has(
                        floor
                    )
                ) {

                    floorCacheRef.current.set(
                        floor,
                        await fetchFloorData(
                            floor
                        )
                    );
                }

                return floorCacheRef.current.get(
                    floor
                )!;
            },
            []
        );


    useEffect(() => {

        let cancelled = false;

        getFloorData(1)
            .then((data) => {

                if (cancelled) {
                    return;
                }

                setViewFloorData(data);
            });


        return () => {
            cancelled = true;
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    const handleFloorSwitch =
        useCallback(
            async (floor: number) => {

                if (
                    busy ||
                    floor === viewFloor
                ) {
                    return;
                }


                const data =
                    await getFloorData(
                        floor
                    );


                setViewFloor(floor);
                setViewFloorData(data);


                const isPlayerFloor =
                    floor === playerFloor;


                canvasRef.current?.loadFloor(
                    data,
                    {
                        startCell:
                            isPlayerFloor
                                ? (
                                    playerCell ??
                                    undefined
                                )
                                : undefined,

                        hidePlayer:
                            !isPlayerFloor,
                    }
                );
            },

            [
                busy,
                viewFloor,
                playerFloor,
                playerCell,
                getFloorData,
            ]
        );


    const handlePlayerArrive =
        useCallback(
            (point: GridPoint) => {

                setPlayerCell(point);
        // 핀이 가리키던 자리에 도착했으면 핀을 지운다. 목적지 표시라 도착하면 역할이 끝난다.
        // (도착 지점은 매대 바로 옆 통행 칸일 수 있어서 한 칸 오차까지 도착으로 본다.)
        setPinnedProduct((prev) => {
            if (!prev || prev.floorNo !== playerFloor) return prev;
            const near = Math.abs(prev.x - point.x) <= 1 && Math.abs(prev.y - point.y) <= 1;
            if (!near) return prev;
            canvasRef.current?.clearProductPin();
            return null;
        });


            },
            [playerFloor]
        );


    // ============================================================
    // Backend 동선 → Simulation 선
    // ============================================================

    /**
     * 09-10: 매장 바닥에 파란 경로선을 그리던 기능을 뺐다.
     *
     * [왜] 예전에는 경로를 그려놓고 캐릭터는 따로 움직였다. 지금은 '이 리스트로 길찾기'가
     * 캐릭터를 실제로 그 순서대로 걷게 하므로, 선은 같은 정보를 두 번 보여주는 셈이었다.
     * 게다가 안내가 멈춰 있는 동안 사용자가 직접 돌아다니면 선과 실제 위치가 어긋나서
     * 오히려 틀린 안내처럼 보였다.
     *
     * 함수를 지우지 않고 남긴 이유는 층을 바꾸거나 새 안내를 시작할 때 **이전에 남아 있던
     * 선을 확실히 지우기** 위해서다. 되살리려면 canvas.drawRoute(points, stops)를 다시
     * 부르면 된다(StoreScene 쪽 구현은 그대로 있다).
     */
    const drawRouteForFloor =
        useCallback(
            (
                _route: CartRoute,
                _floor: number
            ) => {
                canvasRef.current?.clearRoute();
            },
            []
        );




    const handleShowCartRoute =
        useCallback(
            async (
                groupId: number,
                items: {
                    skuId: number;
                    name: string;
                }[]
            ) => {

                if (!playerCell) {

                    setStatusMessage(
                        '캐릭터 위치를 아직 확인하지 못했습니다.'
                    );

                    setTimeout(
                        () =>
                            setStatusMessage(
                                ''
                            ),
                        2500
                    );

                    return;
                }


                if (
                    items.length === 0
                ) {
                    return;
                }


                setRouteLoadingGroupId(
                    groupId
                );


                try {

                    /**
                     * 현재 버전은 상품 위치를 읽어
                     * 가까운 순서로 정렬한 뒤
                     * route API에 전달한다.
                     */
                    const withLoc =
                        await Promise.all(

                            items.map(
                                async (it) => ({
                                    item: it,

                                    loc:
                                        await resolveProductLocation(
                                            it.skuId
                                        ),
                                })
                            )
                        );


                    const found =
                        withLoc.filter(
                            (
                                v
                            ): v is {
                                item:
                                    typeof v.item;

                                loc:
                                    NonNullable<
                                        typeof v.loc
                                    >;
                            } =>
                                v.loc !== null
                        );


                    const notFound =
                        withLoc
                            .filter(
                                (v) =>
                                    v.loc ===
                                    null
                            )
                            .map(
                                (v) =>
                                    v.item
                            );


                    const FLOOR_PENALTY =
                        1000;


                    // 09-09: 방문 순서의 기준점은 "캐릭터가 지금 서 있는 곳"이 아니라
                    // 항상 1층 입구다. 실제 손님은 입구에서 들어와 한 바퀴 돌고 입구로
                    // 나가므로, 캐릭터가 어쩌다 3층에 있다고 해서 순서가 달라지면 안 된다.
                    let cursor = {
                        floor: ENTRANCE.floor,
                        x: ENTRANCE.x,
                        y: ENTRANCE.y,
                    };


                    const pool =
                        [...found];


                    const ordered:
                        typeof items = [];


                    while (
                        pool.length > 0
                        ) {

                        let bestIdx = 0;
                        let bestDist =
                            Infinity;


                        pool.forEach(
                            (v, i) => {

                                const floorPenalty =
                                    v.loc.floorNo ===
                                    cursor.floor
                                        ? 0
                                        : FLOOR_PENALTY;


                                const dist =
                                    floorPenalty +
                                    Math.abs(
                                        v.loc.x -
                                        cursor.x
                                    ) +
                                    Math.abs(
                                        v.loc.y -
                                        cursor.y
                                    );


                                if (
                                    dist <
                                    bestDist
                                ) {

                                    bestDist =
                                        dist;

                                    bestIdx =
                                        i;
                                }
                            }
                        );


                        const [picked] =
                            pool.splice(
                                bestIdx,
                                1
                            );


                        ordered.push(
                            picked.item
                        );


                        cursor = {

                            floor:
                            picked.loc.floorNo,

                            x:
                            picked.loc.x,

                            y:
                            picked.loc.y,
                        };
                    }


                    ordered.push(
                        ...notFound
                    );


                    const route =
                        await fetchCartRoute({
                            floor: ENTRANCE.floor,
                            x: ENTRANCE.x,
                            y: ENTRANCE.y,
                            items: ordered,
                        });


                    setActiveRoute(
                        route
                    );

                    setCartGroupOpen(
                        false
                    );


                    const startFloor =
                        route.path[0]
                            ?.floor ??
                        playerFloor;


                    if (
                        startFloor !==
                        viewFloor
                    ) {

                        await handleFloorSwitch(
                            startFloor
                        );
                    }


                    drawRouteForFloor(
                        route,
                        startFloor
                    );


                    setStatusMessage(

                        route.unresolvedCount >
                        0

                            ? `🧭 동선 안내: ${route.stops.length}개 매대, 총 ${route.totalDistance}칸 (${route.unresolvedCount}개는 위치를 찾지 못함)`

                            : `🧭 동선 안내: ${route.stops.length}개 매대, 총 ${route.totalDistance}칸`
                    );


                    // 09-09: 경로를 그리는 데서 끝내지 않고 캐릭터가 실제로 그 순서대로
                    // 돈다. await 하지 않는다 — 이 안내는 매대마다 사용자가 버튼을 누를
                    // 때까지 멈춰 있어서 몇 분이 걸릴 수 있는데, 여기서 기다리면 아래
                    // finally 가 늦게 돌아 버튼이 계속 "동선 계산 중"으로 남는다.
                    void runGuidedRouteRef.current?.(route.stops);

                } catch (err) {

                    console.error(
                        '[handleShowCartRoute] 동선 조회 실패',
                        err
                    );


                    setStatusMessage(

                        err instanceof Error

                            ? err.message

                            : '동선을 불러오지 못했습니다.'
                    );


                    setTimeout(
                        () =>
                            setStatusMessage(
                                ''
                            ),
                        3500
                    );

                } finally {

                    setRouteLoadingGroupId(
                        null
                    );
                }
            },

            [
                playerFloor,
                playerCell,
                viewFloor,
                handleFloorSwitch,
                drawRouteForFloor,
            ]
        );




    // ============================================================
    // Tile / Facility interaction
    // ============================================================

    /**
     * 09-08 상품 위치 핀 표시.
     * 다른 층 상품이면 보고 있는 화면을 그 층으로 먼저 넘긴 다음 핀을 꽂는다.
     * (loadFloor 가 핀을 지우므로 층 전환이 끝난 뒤에 꽂아야 한다.)
     * 캐릭터는 아직 안 움직인다 — 핀을 눌러야 출발한다.
     */
    const showProductPin = useCallback(
        async (info: { skuId: number; name: string; floorNo: number; x: number; y: number }) => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            if (info.floorNo !== viewFloor) {
                const data = await getFloorData(info.floorNo);
                setViewFloor(info.floorNo);
                setViewFloorData(data);
                canvas.loadFloor(data, {
                    startCell: info.floorNo === playerFloor ? (playerCell ?? undefined) : undefined,
                    hidePlayer: info.floorNo !== playerFloor,
                });
            }

            canvas.showProductPin({ x: info.x, y: info.y }, info.name);
            setPinnedProduct(info);
            setStatusMessage(`${info.name} 위치를 표시했습니다. 핀을 누르면 그 매대로 이동합니다.`);
            setTimeout(() => setStatusMessage(''), 3000);
        },
        [viewFloor, playerFloor, playerCell, getFloorData]
    );

    useEffect(() => {
        showProductPinRef.current = showProductPin;
    }, [showProductPin]);

    // 핀 클릭 — 바로 출발한다.
    // 같은 층이면 걸어가고, 다른 층이면 기존 이동수단 선택 창(엘리베이터/에스컬레이터)으로
    // 넘긴다. handleTileClick 과 같은 규칙이다. 그 창 자체가 이미 확인 역할을 하므로
    // "이 매대로 이동할까요?" 를 따로 띄우지 않는다.
    const handleProductPinClick = useCallback(() => {
        if (busy) return;
        const target = pinnedProduct;
        if (!target) return;
        const cell = { x: target.x, y: target.y };
        if (target.floorNo === playerFloor) {
            canvasRef.current?.walkTo(cell);
        } else {
            setTransferPrompt({ targetFloor: target.floorNo, targetCell: cell });
        }
    }, [busy, pinnedProduct, playerFloor]);


    const handleTileClick =
        useCallback(
            (
                cell: GridPoint,
                loc: LocationInfo | null
            ) => {

                if (loc) {
                    setSelectedLocation(loc);
                }


                if (busy) {
                    return;
                }


                const isFacility =
                    viewFloorData
                        ?.facilities
                        .some(
                            (f) =>
                                f.x ===
                                cell.x &&
                                f.y ===
                                cell.y
                        ) ??
                    false;


                if (
                    !loc &&
                    !isFacility
                ) {
                    return;
                }


                if (
                    viewFloor ===
                    playerFloor
                ) {

                    canvasRef.current?.walkTo(
                        cell
                    );

                } else {

                    setTransferPrompt({
                        targetFloor:
                        viewFloor,

                        targetCell:
                        cell,
                    });
                }
            },

            [
                busy,
                viewFloor,
                playerFloor,
                viewFloorData,
            ]
        );


    // ============================================================
    // 층 이동
    // ============================================================

    const startTrip =
        useCallback(
            async (
                fromFloor: number,
                toFloor: number,
                targetCell: GridPoint,
                method: TransferMethod
            ): Promise<boolean> => {

                const canvas =
                    canvasRef.current;

                if (!canvas) {
                    return false;
                }


                setBusy(true);

                setTransferPrompt(
                    null
                );

                setElevatorPrompt(
                    false
                );


                try {

                    const startData =
                        await getFloorData(
                            fromFloor
                        );


                    setViewFloor(
                        fromFloor
                    );

                    setViewFloorData(
                        startData
                    );


                    const liveCell =
                        canvas.getPlayerGrid() ??
                        playerCell ??
                        undefined;


                    canvas.loadFloor(
                        startData,
                        {
                            startCell:
                            liveCell,

                            hidePlayer:
                                false,
                        }
                    );


                    const arrived =
                        await runTrip({

                            canvas,

                            fromFloor,

                            toFloor,

                            targetCell,

                            method,

                            onFloorChange:
                                (
                                    floor,
                                    data
                                ) => {

                                    setPlayerFloor(
                                        floor
                                    );

                                    setViewFloor(
                                        floor
                                    );

                                    setViewFloorData(
                                        data
                                    );
                                },

                            onStepMessage:
                            setStatusMessage,
                        });


                    setPlayerCell(
                        canvas.getPlayerGrid()
                    );


                    return arrived;

                } catch (err) {

                    console.error(
                        '[startTrip] 이동 중 오류',
                        err
                    );


                    setStatusMessage(
                        '이동 중 오류가 발생했습니다.'
                    );


                    setTimeout(
                        () =>
                            setStatusMessage(
                                ''
                            ),
                        2500
                    );


                    return false;

                } finally {

                    setBusy(false);
                }
            },

            [
                playerCell,
                getFloorData,
            ]
        );


    const handleFacilityInteract =
        useCallback(
            (
                facility: FacilityInfo
            ) => {

                if (
                    busy ||
                    viewFloor !==
                    playerFloor
                ) {
                    return;
                }


                if (
                    facility.type ===
                    'escalator_up' ||
                    facility.type ===
                    'escalator_down'
                ) {

                    const dir =
                        facility.type ===
                        'escalator_up'
                            ? 1
                            : -1;


                    const target =
                        playerFloor +
                        dir;


                    const route =
                        escalatorRoute(
                            playerFloor,
                            target
                        );


                    if (!route) {

                        setStatusMessage(
                            `${floorLabel(
                                playerFloor
                            )}에서는 이 에스컬레이터로 갈 수 있는 층이 없습니다.`
                        );


                        setTimeout(
                            () =>
                                setStatusMessage(
                                    ''
                                ),
                            2000
                        );


                        return;
                    }


                    startTrip(
                        playerFloor,
                        target,
                        {
                            x:
                            facility.x,

                            y:
                            facility.y,
                        },
                        'escalator'
                    );

                } else if (
                    facility.type ===
                    'elevator'
                ) {

                    setElevatorPrompt(
                        true
                    );
                }
            },

            [
                busy,
                viewFloor,
                playerFloor,
                startTrip,
            ]
        );


    // ============================================================
    // 상품 매대
    // ============================================================

    const parseShelfLevel =
        (
            locationId: string
        ): number => {

            const m =
                locationId.match(
                    /-L(\d+)$/
                );

            return m
                ? Number(m[1])
                : 0;
        };


    /**
     * 매대 상품창 열기 — busy 검사가 없는 알맹이.
     *
     * [왜 분리했나] 길찾기 안내가 매대에 도착해서 "일시정지" 상태로 서 있을 때도 상품창을
     * 자동으로 열어야 하는데(09-09 요청), 그 순간은 안내가 진행 중이라 busy 가 true 다.
     * 예전처럼 busy 검사가 함수 안에 박혀 있으면 자동 열기가 조용히 무시된다 — 그래서
     * 검사는 바깥(handleLocationInteract)으로 빼고, 안내 쪽은 이 알맹이를 직접 부른다.
     */
    const openLocationPopup =
        useCallback(
            async (
                locs: LocationInfo[]
            ) => {

                if (locs.length === 0) {
                    return;
                }


                const zone =
                    viewFloorData
                        ?.zones
                        .find(
                            (z) =>
                                z.zoneId ===
                                locs[0].zoneId
                        );


                const results =
                    await Promise.all(

                        locs.map(
                            async (loc) => ({

                                location:
                                loc,

                                level:
                                    parseShelfLevel(
                                        loc.locationId
                                    ),

                                products:
                                    await fetchProductsAtLocation(
                                        loc,
                                        zone?.label ??
                                        loc.zoneId
                                    ),
                            })
                        )
                    );


                const groups =
                    results
                        .filter(
                            (g) =>
                                g.products.length >
                                0
                        )
                        .sort(
                            (a, b) =>
                                a.level -
                                b.level
                        );


                const baseLabel =
                    locs[0]
                        .locationId
                        .replace(
                            /-L\d+$/,
                            ''
                        );


                setProductPopup({
                    baseLabel,
                    groups,
                });
            },

            [
                viewFloorData,
            ]
        );


    /** 스페이스바 상호작용 — 안내/이동 중(busy)에는 무시한다. */
    const handleLocationInteract =
        useCallback(
            async (
                locs: LocationInfo[]
            ) => {

                if (busy) {
                    return;
                }

                await openLocationPopup(locs);
            },

            [
                busy,
                openLocationPopup,
            ]
        );


    // ============================================================
    // 장바구니 길찾기 안내 실행기 (09-09)
    // ============================================================

    /**
     * openLocationPopup 은 viewFloorData 가 바뀔 때마다 새로 만들어진다. 안내 루프는 층을
     * 옮겨 다니며 몇십 초씩 도는 async 함수라, 루프가 시작될 때 붙잡아둔 옛 함수를 계속
     * 부르면 존 이름표가 이전 층 것으로 나온다 — 그래서 항상 최신판을 ref 로 읽는다.
     */
    const openLocationPopupRef =
        useRef<typeof openLocationPopup | null>(null);

    useEffect(() => {
        openLocationPopupRef.current = openLocationPopup;
    }, [openLocationPopup]);

    /**
     * 안내 루프가 매대 앞에서 멈춰 있는 동안 사용자가 직접 다른 층으로 가버릴 수 있다.
     * 그때 루프가 붙잡아둔 옛 playerFloor 로 다음 구간을 계산하면 "이미 3층인데 3층으로
     * 올라가라"는 엉뚱한 이동이 된다 — 재개 직후엔 항상 이 ref 로 실제 층을 다시 읽는다.
     */
    const playerFloorRef = useRef<number>(playerFloor);

    useEffect(() => {
        playerFloorRef.current = playerFloor;
    }, [playerFloor]);


    /**
     * 장바구니 리스트 안내 — 1층 입구에서 출발해 매대를 차례로 돌고 다시 1층 입구로 나간다.
     *
     * [흐름] 입구로 이동 → (매대마다) 이동 → 도착하면 상품창 자동으로 열고 멈춤 →
     *        사용자가 '다음 상품으로 이동'을 누르면 다음 매대 → 마지막에 입구 복귀.
     *
     * [멈춰 있는 동안] busy 를 풀고 조작을 되살린다. 리스트에 없는 물건을 사러 직접
     * 돌아다니다가 바코드를 찍고 돌아올 수 있어야 하기 때문이다(09-09 요청). 그래서
     * '다음 상품으로 이동'은 바코드를 찍었는지와 무관하게 아무 때나 눌린다 — 결제 대상은
     * 프론트가 스캔 기준으로 관리하므로 시뮬레이션이 그걸 강제할 이유가 없다.
     *
     * [끊길 때] 경로를 못 찾으면 그 자리에서 멈추고 안내를 끝낸다. 도착한 척하고 다음
     * 매대로 넘어가면 캐릭터가 엉뚱한 데서 출발해 경로가 계속 어긋난다.
     */
    const runGuidedRoute =
        useCallback(
            async (
                stops: {
                    skuId: number | null;
                    name: string | null;
                    floor: number;
                    x: number;
                    y: number;
                }[],
                /**
                 * 1층 입구까지 먼저 내려간 뒤 시작할지. 장바구니 전체 안내는 true(입구에서
                 * 들어와 한 바퀴). 바코드로 "지금 이 자리부터" 다시 잡은 경우에는 캐릭터가
                 * 이미 그 매대 앞에 서 있으므로 false 로 부른다 — 굳이 입구까지 내려갔다가
                 * 다시 올라오면 사용자가 방금 지정한 출발점이 무의미해진다.
                 */
                goToEntranceFirst: boolean = true
            ): Promise<void> => {

                const canvas = canvasRef.current;
                if (!canvas || stops.length === 0) {
                    return;
                }

                const walk = (goal: GridPoint) =>
                    new Promise<boolean>((resolve) =>
                        canvas.walkTo(goal, resolve));

                const fail = (msg: string) => {
                    setStatusMessage(msg);
                    setTimeout(() => setStatusMessage(''), 3500);
                };

                /** 매대 앞에서 멈춰서 '다음 상품으로 이동'을 기다린다. */
                const pauseAt = async (
                    index: number,
                    stop: { name: string | null; floor: number; x: number; y: number }
                ) => {
                    const label = stop.name ?? '상품';

                    // 상품창 자동 열기 — 바코드는 사용자가 직접 열어서 찍는다.
                    try {
                        const data = await getFloorData(stop.floor);
                        const locs = data.locations.filter(
                            (l) => l.x === stop.x && l.y === stop.y);
                        if (locs.length > 0) {
                            await openLocationPopupRef.current?.(locs);
                        }
                    } catch (e) {
                        console.error('[runGuidedRoute] 상품창 자동 열기 실패', e);
                    }

                    // 멈춰 있는 동안에는 직접 조작할 수 있어야 한다.
                    setBusy(false);
                    canvas.setControlsEnabled(true);

                    setGuidedStop({
                        index,
                        total: stops.length,
                        name: label,
                    });

                    await new Promise<void>((resolve) => {
                        guidedResumeRef.current = () => {
                            guidedResumeRef.current = null;
                            setGuidedStop(null);
                            resolve();
                        };
                    });

                    // 사용자가 직접 돌아다녔을 수 있으므로 현재 칸을 다시 읽는다.
                    setPlayerCell(canvas.getPlayerGrid());
                    setBusy(true);
                };

                setBusy(true);

                try {
                    // ── 1) 1층 입구로 ──
                    let currentFloor = playerFloorRef.current;

                    if (!goToEntranceFirst) {
                        setStatusMessage('지금 위치에서 안내를 시작합니다.');
                    } else if (currentFloor !== ENTRANCE.floor) {
                        setStatusMessage('1층 입구로 내려가는 중...');
                        const ok = await startTrip(
                            currentFloor, ENTRANCE.floor,
                            { x: ENTRANCE.x, y: ENTRANCE.y }, 'elevator');
                        if (!ok) {
                            fail('1층 입구까지 내려가지 못했습니다. (엘리베이터 경로를 찾지 못했어요)');
                            return;
                        }
                        currentFloor = ENTRANCE.floor;
                        setBusy(true);
                    } else {
                        setStatusMessage('1층 입구에서 출발합니다.');
                        if (!(await walk({ x: ENTRANCE.x, y: ENTRANCE.y }))) {
                            fail('1층 입구까지 경로를 찾지 못했습니다.');
                            return;
                        }
                    }
                    setPlayerCell(canvas.getPlayerGrid());

                    // ── 2) 매대 순회 ──
                    for (let i = 0; i < stops.length; i++) {
                        const stop = stops[i];
                        const label = stop.name ?? '상품';

                        setStatusMessage(
                            `(${i + 1}/${stops.length}) "${label}"(으)로 이동 중...`);

                        if (stop.floor === currentFloor) {
                            if (!(await walk({ x: stop.x, y: stop.y }))) {
                                fail(`"${label}" 위치까지 경로를 찾지 못했습니다. (맵에 막힌 구간이 있을 수 있어요)`);
                                return;
                            }
                        } else {
                            const ok = await startTrip(
                                currentFloor, stop.floor,
                                { x: stop.x, y: stop.y }, 'elevator');
                            if (!ok) {
                                fail(`${stop.floor}층으로 이동하지 못했습니다. (엘리베이터 경로를 찾지 못했어요)`);
                                return;
                            }
                            currentFloor = stop.floor;
                            setBusy(true);
                        }

                        setPlayerCell(canvas.getPlayerGrid());
                        setStatusMessage(
                            `(${i + 1}/${stops.length}) "${label}" 도착 — 바코드를 찍고 '다음 상품으로 이동'을 누르세요.`);

                        await pauseAt(i, stop);

                        // 멈춰 있는 동안 사용자가 다른 층으로 갔을 수 있다.
                        currentFloor = playerFloorRef.current ?? currentFloor;
                    }

                    // ── 3) 입구 복귀 ──
                    setStatusMessage('쇼핑 완료 — 1층 입구로 나가는 중...');

                    if (currentFloor !== ENTRANCE.floor) {
                        const ok = await startTrip(
                            currentFloor, ENTRANCE.floor,
                            { x: ENTRANCE.x, y: ENTRANCE.y }, 'elevator');
                        if (!ok) {
                            fail('1층 입구로 돌아가지 못했습니다.');
                            return;
                        }
                        setBusy(true);
                    } else if (!(await walk({ x: ENTRANCE.x, y: ENTRANCE.y }))) {
                        fail('1층 입구까지 경로를 찾지 못했습니다.');
                        return;
                    }

                    setPlayerCell(canvas.getPlayerGrid());
                    setStatusMessage('쇼핑을 마치고 매장을 나섰습니다. 결제는 스캔한 상품 기준입니다.');
                    setTimeout(() => setStatusMessage(''), 4000);

                } catch (err) {
                    console.error('[runGuidedRoute] 안내 중 오류', err);
                    fail('길찾기 안내 중 오류가 발생했습니다.');
                } finally {
                    guidedResumeRef.current = null;
                    setGuidedStop(null);
                    setBusy(false);
                    canvas.setControlsEnabled(true);
                }
            },

            [
                playerFloor,
                startTrip,
                getFloorData,
            ]
        );

    useEffect(() => {
        runGuidedRouteRef.current = runGuidedRoute;
    }, [runGuidedRoute]);


    // ============================================================
    // '지금 위치에서부터 길찾기' — 바코드로 출발점 잡기 (09-09)
    // ============================================================

    /**
     * 스캔을 기다리는 동안 들고 있는 방문 대상. 버튼을 누른 시점의 리스트를 그대로 잡아둔다.
     * null 이면 대기 중이 아니다 — 평소 스캔(장바구니 담기)까지 길찾기로 오해하면 안 된다.
     */
    const pendingScanRouteRef =
        useRef<{ skuId: number; name: string }[] | null>(null);

    const [waitingForScan, setWaitingForScan] =
        useState(false);

    /** 버튼을 누르면 오른쪽 웹 화면을 스캔 페이지로 보내고, 바코드가 찍히길 기다린다. */
    const handleRouteFromHere =
        useCallback(
            (
                _groupId: number,
                items: { skuId: number; name: string }[]
            ) => {
                if (items.length === 0) {
                    return;
                }

                pendingScanRouteRef.current = items;
                setWaitingForScan(true);
                setShowFrontend(true);
                setCartGroupOpen(false);
                frontendPanelRef.current?.openScanner();
                setStatusMessage(
                    '오른쪽 화면에서 지금 서 있는 자리의 상품 바코드를 찍어주세요. 그 자리를 출발점으로 다시 안내합니다.');
            },
            []
        );

    /**
     * 프론트에서 SCANNED_PRODUCT 가 오면 그 상품 매대를 출발점으로 잡고 다시 순서를 짠다.
     * 찍은 상품 자체는 방문 대상에서 뺀다 — 지금 그 앞에 서 있으니 다시 갈 이유가 없다.
     */
    const runRouteFromScannedProduct =
        useCallback(
            async (skuId: number, name: string) => {

                const items = pendingScanRouteRef.current;
                if (!items) {
                    return; // 길찾기를 기다리던 중이 아니면 평소 스캔이다 — 건드리지 않는다.
                }
                pendingScanRouteRef.current = null;
                setWaitingForScan(false);

                try {
                    setStatusMessage(`"${name}" 자리에서 출발하는 동선을 계산 중...`);

                    const start = await resolveProductLocation(skuId);
                    if (!start) {
                        setStatusMessage(`"${name}"의 매대 위치를 찾지 못했습니다.`);
                        setTimeout(() => setStatusMessage(''), 3500);
                        return;
                    }

                    const rest = items.filter((it) => it.skuId !== skuId);

                    const withLoc = await Promise.all(
                        rest.map(async (it) => ({
                            item: it,
                            loc: await resolveProductLocation(it.skuId),
                        })));

                    const found = withLoc
                        .filter((v) => v.loc !== null)
                        .map((v) => ({
                            skuId: v.item.skuId,
                            name: v.item.name,
                            floorNo: v.loc!.floorNo,
                            x: v.loc!.x,
                            y: v.loc!.y,
                        }));

                    const ordered = orderStopsNearestFirst(found, {
                        floor: start.floorNo,
                        x: start.x,
                        y: start.y,
                    });

                    const route = await fetchCartRoute({
                        floor: start.floorNo,
                        x: start.x,
                        y: start.y,
                        items: ordered.map((o) => ({ skuId: o.skuId, name: o.name })),
                    });

                    setActiveRoute(route);

                    const startFloor = route.path[0]?.floor ?? start.floorNo;
                    if (startFloor !== viewFloor) {
                        await handleFloorSwitch(startFloor);
                    }
                    drawRouteForFloor(route, startFloor);

                    // 출발(찍은 매대) / 도착(1층 입구) 마커. 지금 보고 있는 층에 있는 것만
                    // 그린다 — 다른 층 좌표를 그대로 찍으면 엉뚱한 자리를 가리킨다.
                    canvasRef.current?.showRouteEndpoints(
                        startFloor === start.floorNo ? { x: start.x, y: start.y } : null,
                        startFloor === ENTRANCE.floor ? { x: ENTRANCE.x, y: ENTRANCE.y } : null,
                    );

                    setStatusMessage(
                        `🧭 "${name}" 자리에서 출발: 남은 매대 ${route.stops.length}곳을 거쳐 1층 입구로 나갑니다.`);

                    // 캐릭터는 이미 그 매대 앞에 있다고 보고 입구로 내려가지 않는다.
                    void runGuidedRouteRef.current?.(route.stops, false);

                } catch (err) {
                    console.error('[runRouteFromScannedProduct] 동선 계산 실패', err);
                    setStatusMessage(
                        err instanceof Error ? err.message : '동선을 다시 잡지 못했습니다.');
                    setTimeout(() => setStatusMessage(''), 3500);
                }
            },
            [
                viewFloor,
                handleFloorSwitch,
                drawRouteForFloor,
            ]
        );

    /** 메시지 수신부(이 파일 위쪽)가 아래에 정의된 이 함수를 부를 수 있게 하는 우회. */
    const runRouteFromScannedProductRef =
        useRef<typeof runRouteFromScannedProduct | null>(null);

    useEffect(() => {
        runRouteFromScannedProductRef.current = runRouteFromScannedProduct;
    }, [runRouteFromScannedProduct]);


    // ============================================================
    // 상품 담기
    // ============================================================

    const handleAddToCart = useCallback(async (location: LocationInfo, product: ProductInfo) => {
        const token = getMemberToken();
        if (!token) { setStatusMessage('오른쪽 앱에서 회원 로그인을 먼저 해주세요.'); return; }
        if (product.stock <= 0) return;
        try {
            await addItemToDbCart(product.skuId, 1, selectedGroupId);
            if (getMemberToken() !== token) return;
            const [items, groups] = await Promise.all([
                fetchCartFromDb(getCurrentConsumerId()), fetchCartGroups(getCurrentConsumerId()),
            ]);
            if (getMemberToken() !== token) return;
            setCart(prev => items.map(item => ({ ...item, locationId:
                item.skuId === product.skuId ? location.locationId :
                prev.find(p => p.skuId === item.skuId)?.locationId ?? item.locationId })));
            setCartGroups(groups);
            frontendPanelRef.current?.notifyCartChanged();
            setStatusMessage('회원 장바구니에 반영했습니다.');
        } catch (error) {
            if (getMemberToken() !== token) return;
            setStatusMessage(error instanceof Error ? error.message : '장바구니 반영 실패');
        }
    }, [selectedGroupId]);

    // ============================================================
    // ★ 재고 채우기 +5
    // ============================================================

    const handleManualRestock =
        useCallback(
            async (
                location: LocationInfo,
                product: ProductInfo
            ) => {

                const RESTOCK_QTY = 5;


                try {

                    setStatusMessage(
                        `"${product.name}" 재고를 채우는 중...`
                    );


                    /**
                     * 1. Backend 실제 재고 DB +5
                     *
                     * /internal/events/shelf
                     * → RESTOCK_IN
                     * → InventoryService.applyChange()
                     * → stocks.qty 증가
                     */
                    await confirmRestock(
                        location.locationId,
                        product.skuId,
                        RESTOCK_QTY
                    );


                    /**
                     * 2. Simulation의 로컬 재고 오버레이도 +5
                     *
                     * 다음번 매대 팝업을 다시 열어도
                     * 증가한 수량이 표시되게 한다.
                     */
                    adjustStock(
                        location.locationId,
                        product.skuId,
                        RESTOCK_QTY
                    );


                    /**
                     * 3. 현재 열려 있는 팝업의 숫자도 즉시 +5.
                     */
                    setProductPopup(
                        (prev) => {

                            if (!prev) {
                                return prev;
                            }


                            return {
                                ...prev,

                                groups:
                                    prev.groups.map(
                                        (group) => {

                                            if (
                                                group
                                                    .location
                                                    .locationId !==
                                                location.locationId
                                            ) {
                                                return group;
                                            }


                                            return {
                                                ...group,

                                                products:
                                                    group.products.map(
                                                        (p) => {

                                                            if (
                                                                p.skuId !==
                                                                product.skuId
                                                            ) {
                                                                return p;
                                                            }


                                                            return {
                                                                ...p,

                                                                stock:
                                                                    p.stock +
                                                                    RESTOCK_QTY,
                                                            };
                                                        }
                                                    ),
                                            };
                                        }
                                    ),
                            };
                        }
                    );


                    setStatusMessage(
                        `✅ "${product.name}" 재고 +${RESTOCK_QTY}`
                    );


                    setTimeout(
                        () =>
                            setStatusMessage(
                                ''
                            ),
                        2000
                    );

                } catch (err) {

                    console.error(
                        '[재고 채우기] 실패:',
                        err
                    );


                    setStatusMessage(
                        err instanceof Error
                            ? `재고 채우기 실패: ${err.message}`
                            : '재고 채우기에 실패했습니다.'
                    );


                    setTimeout(
                        () =>
                            setStatusMessage(
                                ''
                            ),
                        3500
                    );


                    throw err;
                }
            },
            []
        );


    // 09-09: 시뮬레이션의 로컬 잔액/구매/환불(cash, purchased, handleCheckout,
    // handleRefund)을 걷어냈다. 실제 결제 API가 붙기 전에 만든 흉내내기였는데,
    //   - 화면에 남아 있던 건 상단바의 '💰 $99,999,999' 칩 하나뿐이었고
    //   - handleCheckout/handleRefund 는 선언만 되고 부르는 곳이 없었으며
    //     (CartModal.tsx 도 어디에서도 import 하지 않는다)
    //   - 진짜 결제는 오른쪽 웹 화면의 스캔/결제 흐름이 담당한다.
    // 지워도 동작이 바뀌는 곳이 없어서 통째로 걷어냈다.

    // ============================================================
    // 쇼핑목록 추가/삭제/순서변경
    // ============================================================

    const handleAddShoppingItem =
        useCallback(
            async (
                product:
                ProductSearchResult
            ) => {

                const loc =
                    await resolveProductLocation(
                        product.skuId
                    );


                if (!loc) {

                    setStatusMessage(
                        '이 상품의 매대 위치를 찾을 수 없습니다.'
                    );


                    setTimeout(
                        () =>
                            setStatusMessage(
                                ''
                            ),
                        2000
                    );


                    return;
                }


                setShoppingList(
                    (prev) => [
                        ...prev,

                        {
                            skuId:
                            product.skuId,

                            name:
                            product.name,

                            price:
                            product.price,

                            floorNo:
                            loc.floorNo,

                            x:
                            loc.x,

                            y:
                            loc.y,

                            locationId:
                            loc.locationId,

                            zoneId:
                            loc.zoneId,
                        },
                    ]
                );
            },
            []
        );


    // 시뮬레이션 자체 검색에서 "위치" 를 눌렀을 때. 목록에 담지 않고 핀만 꽂는다.
    // 오른쪽 웹 화면의 LOCATE_PRODUCT 와 같은 곳으로 흘러간다.
    const handleLocateShoppingItem = useCallback(async (product: ProductSearchResult) => {
        const loc = await resolveProductLocation(product.skuId);
        if (!loc) {
            setStatusMessage('이 상품의 매대 위치를 찾을 수 없습니다.');
            setTimeout(() => setStatusMessage(''), 2000);
            return;
        }
        setShoppingListOpen(false);
        await showProductPin({
            skuId: product.skuId,
            name: product.name,
            floorNo: loc.floorNo,
            x: loc.x,
            y: loc.y,
        });
    }, [showProductPin]);


    const handleRemoveShoppingItem =
        useCallback(
            (
                index: number
            ) => {

                setShoppingList(
                    (prev) =>
                        prev.filter(
                            (_, i) =>
                                i !==
                                index
                        )
                );
            },
            []
        );


    const handleMoveShoppingItem =
        useCallback(
            (
                index: number,
                direction:
                    -1 | 1
            ) => {

                setShoppingList(
                    (prev) => {

                        const target =
                            index +
                            direction;


                        if (
                            target < 0 ||
                            target >=
                            prev.length
                        ) {
                            return prev;
                        }


                        const next =
                            [...prev];


                        [
                            next[index],
                            next[target],
                        ] = [
                            next[target],
                            next[index],
                        ];


                        return next;
                    }
                );
            },
            []
        );


    // ============================================================
    // 쇼핑목록 자동 이동
    // ============================================================

    const handleNavigateShoppingList =
        useCallback(
            async () => {

                if (
                    busy ||
                    navigatingIndex !==
                    null ||
                    shoppingList.length ===
                    0
                ) {
                    return;
                }


                const canvas =
                    canvasRef.current;


                if (!canvas) {
                    return;
                }


                setShoppingListOpen(
                    false
                );

                setBusy(true);


                try {

                    const startData =
                        await getFloorData(
                            playerFloor
                        );


                    setViewFloor(
                        playerFloor
                    );

                    setViewFloorData(
                        startData
                    );


                    canvas.loadFloor(
                        startData,
                        {
                            startCell:
                                playerCell ??
                                undefined,

                            hidePlayer:
                                false,
                        }
                    );


                    let currentFloor =
                        playerFloor;


                    for (
                        let i = 0;
                        i <
                        shoppingList.length;
                        i++
                    ) {

                        const it =
                            shoppingList[i];


                        setNavigatingIndex(
                            i
                        );


                        if (
                            it.floorNo ===
                            currentFloor
                        ) {

                            setStatusMessage(
                                `"${it.name}"(으)로 이동 중...`
                            );


                            const arrived =
                                await new Promise<boolean>(
                                    (
                                        resolve
                                    ) =>
                                        canvas.walkTo(
                                            {
                                                x:
                                                it.x,

                                                y:
                                                it.y,
                                            },
                                            resolve
                                        )
                                );


                            if (!arrived) {

                                setStatusMessage(
                                    `"${it.name}" 위치까지 경로를 찾지 못했습니다. (맵에 막힌 구간이 있을 수 있어요)`
                                );


                                setTimeout(
                                    () =>
                                        setStatusMessage(
                                            ''
                                        ),
                                    3500
                                );


                                return;
                            }


                            setPlayerCell(
                                canvas.getPlayerGrid()
                            );

                        } else {

                            const arrived =
                                await startTrip(
                                    currentFloor,
                                    it.floorNo,
                                    {
                                        x:
                                        it.x,

                                        y:
                                        it.y,
                                    },
                                    'elevator'
                                );


                            if (!arrived) {

                                setStatusMessage(
                                    `${it.floorNo}층으로 이동하지 못했습니다. (엘리베이터 경로를 찾지 못했어요)`
                                );


                                setTimeout(
                                    () =>
                                        setStatusMessage(
                                            ''
                                        ),
                                    3500
                                );


                                return;
                            }


                            currentFloor =
                                it.floorNo;


                            setBusy(true);
                        }
                    }


                    setStatusMessage(
                        '쇼핑목록 안내를 완료했습니다.'
                    );


                    setTimeout(
                        () =>
                            setStatusMessage(
                                ''
                            ),
                        2500
                    );

                } catch (err) {

                    console.error(
                        '[handleNavigateShoppingList] 안내 중 오류',
                        err
                    );


                    setStatusMessage(
                        '쇼핑목록 안내 중 오류가 발생했습니다.'
                    );


                    setTimeout(
                        () =>
                            setStatusMessage(
                                ''
                            ),
                        2500
                    );

                } finally {

                    setNavigatingIndex(
                        null
                    );

                    setBusy(false);
                }
            },

            [
                busy,
                navigatingIndex,
                shoppingList,
                playerFloor,
                playerCell,
                getFloorData,
                startTrip,
            ]
        );


    const escalatorAvailable =
        transferPrompt

            ? !!escalatorRoute(
                playerFloor,
                transferPrompt.targetFloor
            )

            : false;


    // ============================================================
    // UI
    // ============================================================

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
            }}
        >
            <header
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    background: '#12141a',
                    borderBottom:
                        '1px solid #2a2d35',
                    gap: 12,
                    flexWrap: 'wrap',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                    }}
                >
                    <FloorDropdown
                        current={
                            viewFloor
                        }
                        onChange={
                            handleFloorSwitch
                        }
                    />


                    <div
                        style={{
                            padding:
                                '6px 12px',
                            borderRadius: 8,
                            border:
                                '1px solid #3a3f4b',
                            background:
                                '#1e2128',
                            color:
                                '#e5e7eb',
                            fontSize: 12,
                            maxWidth: 200,
                            overflow:
                                'hidden',
                            textOverflow:
                                'ellipsis',
                            whiteSpace:
                                'nowrap',
                        }}
                        title={
                            selectedLocation
                                ? selectedLocation.locationId
                                : '선택한 위치 없음'
                        }
                    >
                        📍{' '}
                        {selectedLocation
                            ? selectedLocation.locationId
                            : '위치 미선택'}
                    </div>


                    <button
                        onClick={() =>
                            setCartGroupOpen(
                                true
                            )
                        }
                        style={{
                            display: 'flex',
                            alignItems:
                                'center',
                            gap: 6,
                            padding:
                                '6px 12px',
                            borderRadius: 8,
                            border:
                                '1px solid #3a3f4b',
                            background:
                                '#1e2128',
                            color:
                                '#4ade80',
                            fontWeight: 700,
                            cursor:
                                'pointer',
                        }}
                    >
                        🛒{' '}
                        {cart.reduce(
                            (
                                n,
                                it
                            ) =>
                                n +
                                it.qty,
                            0
                        )}
                    </button>


                    <button
                        onClick={() =>
                            setCheckoutTargetOpen(
                                true
                            )
                        }
                        title="cart_item.is_checked = true 인 실제 결제 대상 상품"
                        style={{
                            display: 'flex',
                            alignItems:
                                'center',
                            gap: 6,
                            padding:
                                '6px 12px',
                            borderRadius: 8,
                            border:
                                '1px solid #3a3f4b',
                            background:
                                '#1e2128',
                            color:
                                '#fbbf24',
                            fontWeight: 700,
                            cursor:
                                'pointer',
                        }}
                    >
                        🧾 결제 대상
                    </button>




                    <button
                        onClick={() =>
                            setShowFrontend(
                                (v) =>
                                    !v
                            )
                        }
                        style={{
                            display: 'flex',
                            alignItems:
                                'center',
                            gap: 6,
                            padding:
                                '6px 12px',
                            borderRadius: 8,
                            border:
                                '1px solid #3a3f4b',
                            background:
                                '#1e2128',
                            color:
                                '#34d399',
                            fontWeight: 700,
                            cursor:
                                'pointer',
                        }}
                    >
                        🖥️ 웹 UI{' '}
                        {showFrontend
                            ? '숨기기'
                            : '보기'}
                    </button>


                    <span
                        style={{
                            padding:
                                '6px 10px',
                            borderRadius: 8,
                            background:
                                '#1e2128',
                            color:
                                loggedInName
                                    ? '#34d399'
                                    : '#9ca3af',
                            fontSize: 13,
                            fontWeight: 600,
                        }}
                        title="frontend에서 로그인한 계정을 따라갑니다"
                    >
                        👤{' '}
                        {loggedInPhone
                            ? `손님 캐릭터(${loggedInPhone.slice(
                                -4
                            )})`
                            : '비로그인'}
                    </span>


                    {viewFloor !==
                        playerFloor && (
                            <div
                                style={{
                                    fontSize:
                                        11,
                                    color:
                                        '#9ca3af',
                                }}
                            >
                                (캐릭터 위치:{' '}
                                {floorLabel(
                                    playerFloor
                                )}
                                )
                            </div>
                        )}


                    {statusMessage && (
                        <div
                            style={{
                                fontSize:
                                    12,
                                color:
                                    '#22c55e',
                            }}
                        >
                            {
                                statusMessage
                            }
                        </div>
                    )}


                </div>
            </header>


            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    minHeight: 0,
                }}
            >
                <div
                    style={{
                        flex: 1,
                        position:
                            'relative',
                        minWidth: 0,
                        minHeight: 0,
                        overflow:
                            'hidden',
                    }}
                >
                    <GameCanvas
                        ref={
                            canvasRef
                        }
                        floorData={
                            viewFloorData
                        }
                        events={{
                            onTileClick:
                            handleTileClick,

                            onPlayerArrive:
                            handlePlayerArrive,

                            onFacilityInteract:
                            handleFacilityInteract,

                            onProductPinClick: handleProductPinClick,
                            onLocationInteract:
                            handleLocationInteract,
                        }}
                    />


                    {viewFloor !==
                        playerFloor && (
                            <div
                                style={{
                                    position:
                                        'absolute',
                                    top: 8,
                                    left: 8,
                                    background:
                                        '#1f2937cc',
                                    color:
                                        '#fbbf24',
                                    padding:
                                        '6px 10px',
                                    borderRadius:
                                        6,
                                    fontSize:
                                        12,
                                }}
                            >
                                지금 보고 있는
                                층에는 캐릭터가
                                없습니다 — 매대를
                                클릭하면 이동
                                방법을 물어봅니다.
                            </div>
                        )}
                </div>


                {showFrontend && (
                    <>
                        <div
                            onMouseDown={() => {
                                draggingRef.current =
                                    true;

                                document.body.style.cursor =
                                    'col-resize';
                            }}
                            style={{
                                width: 6,
                                flexShrink:
                                    0,
                                cursor:
                                    'col-resize',
                                background:
                                    '#2a2f3a',
                            }}
                        />

                        <FrontendPanel
                            ref={
                                frontendPanelRef
                            }
                            width={
                                frontendWidth
                            }
                        />
                    </>
                )}
            </div>


            <SidePanel
                selectedLocation={
                    selectedLocation
                }
            />


            {transferPrompt && (
                <TransferChoiceModal
                    fromFloor={
                        playerFloor
                    }
                    toFloor={
                        transferPrompt.targetFloor
                    }
                    escalatorAvailable={
                        escalatorAvailable
                    }
                    onChoose={(
                        method
                    ) =>
                        startTrip(
                            playerFloor,
                            transferPrompt.targetFloor,
                            transferPrompt.targetCell,
                            method
                        )
                    }
                    onCancel={() =>
                        setTransferPrompt(
                            null
                        )
                    }
                />
            )}


            {elevatorPrompt && (
                <ElevatorFloorModal
                    currentFloor={
                        playerFloor
                    }
                    onChoose={async (
                        floor
                    ) => {

                        const data =
                            await getFloorData(
                                floor
                            );


                        const facility =
                            data.facilities.find(
                                (f) =>
                                    f.type ===
                                    'elevator'
                            );


                        const target =
                            facility
                                ? {
                                    x:
                                    facility.x,

                                    y:
                                    facility.y,
                                }
                                : {
                                    x: 2,
                                    y: 2,
                                };


                        startTrip(
                            playerFloor,
                            floor,
                            target,
                            'elevator'
                        );
                    }}
                    onCancel={() =>
                        setElevatorPrompt(
                            false
                        )
                    }
                />
            )}


            {/* ===================================================
                상품 팝업
                담기 + 재고 채우기
               =================================================== */}
            {productPopup && (
                <ProductPopup
                    baseLabel={
                        productPopup.baseLabel
                    }
                    groups={
                        productPopup.groups
                    }
                    cartQtyByKey={
                        Object.fromEntries(

                            cart.map(
                                (it) => [
                                    `${it.locationId}::${it.skuId}`,
                                    it.qty,
                                ]
                            )
                        )
                    }

                    onAddToCart={(
                        location,
                        p
                    ) =>
                        handleAddToCart(
                            location,
                            p
                        )
                    }

                    onRestock={(
                        location,
                        p
                    ) =>
                        handleManualRestock(
                            location,
                            p
                        )
                    }

                    onClose={() =>
                        setProductPopup(
                            null
                        )
                    }
                />
            )}


            {cartGroupOpen && (
                <CartGroupModal
                    groups={
                        cartGroups
                    }
                    selectedGroupId={
                        selectedGroupId
                    }
                    onSelectGroup={(
                        groupId
                    ) => {

                        setSelectedGroupId(
                            groupId
                        );
                    }}
                    onClose={() =>
                        setCartGroupOpen(
                            false
                        )
                    }
                    onShowRoute={
                        handleShowCartRoute
                    }
                    onRouteFromHere={
                        handleRouteFromHere
                    }
                    routeLoadingGroupId={
                        routeLoadingGroupId
                    }
                />
            )}


            {checkoutTargetOpen && (
                <CheckoutTargetModal
                    onClose={() =>
                        setCheckoutTargetOpen(
                            false
                        )
                    }
                />
            )}


            {/* 09-09: 바코드로 출발점을 정하는 중이라는 표시 + 취소 */}
            {waitingForScan && (
                <div
                    style={{
                        position: 'fixed',
                        left: 0,
                        right: 0,
                        bottom: 24,
                        display: 'flex',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                        zIndex: 2600,
                    }}
                >
                    <div
                        style={{
                            pointerEvents: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                            padding: '12px 16px',
                            borderRadius: 12,
                            border: '1px solid #4c1d95',
                            background: '#12141a',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.55)',
                            color: '#e5e7eb',
                        }}
                    >
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>
                                📷 바코드를 기다리는 중
                            </div>
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
                                오른쪽 화면 카메라로 지금 서 있는 자리의 상품을 찍어주세요.
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                pendingScanRouteRef.current = null;
                                setWaitingForScan(false);
                                setStatusMessage('');
                            }}
                            style={{
                                flexShrink: 0,
                                padding: '9px 14px',
                                borderRadius: 8,
                                border: '1px solid #3a3f4b',
                                background: '#1e2128',
                                color: '#9ca3af',
                                fontWeight: 700,
                                fontSize: 12,
                                cursor: 'pointer',
                            }}
                        >
                            취소
                        </button>
                    </div>
                </div>
            )}

            {/*
              길찾기 안내 일시정지 패널 (09-09).
              zIndex 는 Modal(2000)/BarcodeModal(2400)보다 위다 — 상품창이나 바코드가 떠
              있는 채로도 '다음 상품으로 이동'을 누를 수 있어야 하기 때문. 바깥 래퍼는
              pointerEvents:none 이라 이 패널이 화면 조작을 가로막지 않는다.
            */}
            {guidedStop && (
                <div
                    style={{
                        position: 'fixed',
                        left: 0,
                        right: 0,
                        bottom: 24,
                        display: 'flex',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                        zIndex: 2600,
                    }}
                >
                    <div
                        style={{
                            pointerEvents: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                            padding: '12px 16px',
                            borderRadius: 12,
                            border: '1px solid #3a3f4b',
                            background: '#12141a',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.55)',
                            color: '#e5e7eb',
                            maxWidth: '90vw',
                        }}
                    >
                        <div style={{ minWidth: 0 }}>
                            <div
                                style={{
                                    fontSize: 12,
                                    color: '#9ca3af',
                                    marginBottom: 2,
                                }}
                            >
                                {guidedStop.index + 1} / {guidedStop.total} 도착
                            </div>
                            <div
                                style={{
                                    fontSize: 14,
                                    fontWeight: 700,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 320,
                                }}
                            >
                                {guidedStop.name}
                            </div>
                            <div
                                style={{
                                    fontSize: 11,
                                    color: '#6b7280',
                                    marginTop: 3,
                                }}
                            >
                                바코드를 찍거나, 다른 상품을 사러 직접 움직여도 됩니다.
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() =>
                                guidedResumeRef.current?.()
                            }
                            style={{
                                flexShrink: 0,
                                padding: '10px 18px',
                                borderRadius: 8,
                                border: 'none',
                                background: '#3b82f6',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: 'pointer',
                            }}
                        >
                            다음 상품으로 이동 →
                        </button>
                    </div>
                </div>
            )}


        </div>
    );
}
