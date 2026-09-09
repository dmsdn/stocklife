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
import ShoppingListModal from './components/ShoppingListModal';

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

    const drawRouteForFloor =
        useCallback(
            (
                route: CartRoute,
                floor: number
            ) => {

                const canvas =
                    canvasRef.current;

                if (!canvas) {
                    return;
                }


                const points =
                    pathPointsOnFloor(
                        route.path,
                        floor
                    );


                if (
                    points.length === 0
                ) {

                    canvas.clearRoute();
                    return;
                }


                const stops =
                    route.stops
                        .filter(
                            (s) =>
                                s.floor ===
                                floor
                        )
                        .map((s) => ({
                            x: s.x,
                            y: s.y,
                        }));


                canvas.drawRoute(
                    points,
                    stops
                );
            },
            []
        );


    useEffect(() => {

        if (!activeRoute) {
            return;
        }

        drawRouteForFloor(
            activeRoute,
            viewFloor
        );

    }, [
        activeRoute,
        viewFloor,
        drawRouteForFloor,
    ]);


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


                    let cursor = {
                        floor:
                        playerFloor,

                        x:
                        playerCell.x,

                        y:
                        playerCell.y,
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
                            floor:
                            playerFloor,

                            x:
                            playerCell.x,

                            y:
                            playerCell.y,

                            items:
                            ordered,
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

                            ? `🧭 동선 안내: ${route.stops.length}개 매대 · 총 ${route.totalDistance}칸 (${route.unresolvedCount}개는 위치를 찾지 못함)`

                            : `🧭 동선 안내: ${route.stops.length}개 매대 · 총 ${route.totalDistance}칸`
                    );

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


    const handleClearRoute =
        useCallback(() => {

            setActiveRoute(null);

            canvasRef.current?.clearRoute();

            setStatusMessage('');

        }, []);


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


    const handleLocationInteract =
        useCallback(
            async (
                locs: LocationInfo[]
            ) => {

                if (
                    busy ||
                    locs.length === 0
                ) {
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
                busy,
                viewFloorData,
            ]
        );


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
                            setShoppingListOpen(
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
                                '#f472b6',
                            fontWeight: 700,
                            cursor:
                                'pointer',
                        }}
                    >
                        📝 쇼핑목록{' '}
                        {
                            shoppingList.length
                        }
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


                    {activeRoute && (
                        <button
                            onClick={
                                handleClearRoute
                            }
                            style={{
                                padding:
                                    '4px 10px',
                                borderRadius:
                                    6,
                                border:
                                    '1px solid #3a3f4b',
                                background:
                                    '#1e2128',
                                color:
                                    '#60a5fa',
                                fontSize:
                                    11,
                                fontWeight:
                                    700,
                                cursor:
                                    'pointer',
                            }}
                        >
                            🧭 동선 지우기
                        </button>
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


            {shoppingListOpen && (
                <ShoppingListModal
                    items={
                        shoppingList
                    }
                    navigatingIndex={
                        navigatingIndex
                    }
                    onLocate={handleLocateShoppingItem}
                    onAdd={
                        handleAddShoppingItem
                    }
                    onRemove={
                        handleRemoveShoppingItem
                    }
                    onMove={
                        handleMoveShoppingItem
                    }
                    onNavigate={
                        handleNavigateShoppingList
                    }
                    onClose={() =>
                        setShoppingListOpen(
                            false
                        )
                    }
                />
            )}
        </div>
    );
}
