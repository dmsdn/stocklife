import { useCallback, useEffect, useRef, useState } from 'react';
import GameCanvas, { type GameCanvasHandle } from './game/GameCanvas';
import FloorDropdown from './components/FloorDropdown';
import SidePanel from './components/SidePanel';
import FrontendPanel from './components/FrontendPanel';
import TransferChoiceModal from './components/TransferChoiceModal';
import ElevatorFloorModal from './components/ElevatorFloorModal';
import ProductPopup from './components/ProductPopup';
import CartModal from './components/CartModal';
import AIChatModal from './components/AIChatModal';
import ShoppingListModal from './components/ShoppingListModal';
import { fetchFloorData } from './api/locations';
import { fetchProductsAtLocation, adjustStock } from './api/products';
import { addItemToDbCart, fetchCartFromDb } from './api/cart';
import {
    setCurrentConsumer,
    resetCurrentConsumerToDefault,
    getCurrentConsumerName,
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
import type { FloorData, LocationInfo, FacilityInfo, GridPoint, ProductInfo, CartItem } from './game/types';

interface TransferPrompt {
    targetFloor: number;
    targetCell: GridPoint;
}

export default function App() {
    const canvasRef = useRef<GameCanvasHandle>(null);

    const [playerFloor, setPlayerFloor] = useState(1);
    const [playerCell, setPlayerCell] = useState<GridPoint | null>(null);
    const [viewFloor, setViewFloor] = useState(1);
    const [viewFloorData, setViewFloorData] = useState<FloorData | null>(null);

    const [selectedLocation, setSelectedLocation] = useState<LocationInfo | null>(null);
    const [transferPrompt, setTransferPrompt] = useState<TransferPrompt | null>(null);
    const [elevatorPrompt, setElevatorPrompt] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [busy, setBusy] = useState(false);
    const [showFrontend, setShowFrontend] = useState(true);
    const [frontendWidth, setFrontendWidth] = useState(640);
    const [loggedInName, setLoggedInName] = useState<string | null>(getCurrentConsumerName());
    const draggingRef = useRef(false);

    // 상단바 — 지금은 실제 결제 API 연동 전이라 잔액/구매내역은 프론트 로컬 상태(placeholder)다.
    // 구매하기/환불하기는 이 로컬 상태 안에서만 금액 차감·환급 및 재고 증감(products.ts의 오버레이)을 흉내낸다.
    const [cash, setCash] = useState(99999999);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [purchased, setPurchased] = useState<CartItem[]>([]);
    const [cartOpen, setCartOpen] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [productPopup, setProductPopup] = useState<{ location: LocationInfo; products: ProductInfo[] } | null>(null);

    // 상단 장바구니 배지가 새로고침하면 0개로 보이던 문제 — cart state를 로컬에만 두지 않고
    // (1) 처음 켜질 때, (2) 로그인/로그아웃으로 계정이 바뀔 때마다 DB(cart_group/cart_item)에서
    // 실제 값을 다시 읽어와 채운다. 계정이 바뀌면 그 계정의 기존 장바구니로 통째로 교체된다.
    useEffect(() => {
        const loadCartFromDb = (consumerId: number) => {
            fetchCartFromDb(consumerId)
                .then((items) => setCart(items))
                .catch((err) => console.error('[DB장바구니] 조회 실패:', err));
        };

        loadCartFromDb(getCurrentConsumerId());

        const unsubscribe = subscribeCurrentConsumer((consumerId) => {
            loadCartFromDb(consumerId);
        });
        return unsubscribe;
    }, []);


    // 쇼핑목록(9~11번): 검색해서 담고, 순서를 바꾸고, 그 순서대로 캐릭터를 안내한다.
    const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>(() => loadShoppingList());
    const [shoppingListOpen, setShoppingListOpen] = useState(false);
    const [navigatingIndex, setNavigatingIndex] = useState<number | null>(null);

    useEffect(() => {
        saveShoppingList(shoppingList);
    }, [shoppingList]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!draggingRef.current) return;
            const newWidth = window.innerWidth - e.clientX;
            setFrontendWidth(Math.min(Math.max(newWidth, 280), window.innerWidth - 320));
        };
        const onUp = () => {
            draggingRef.current = false;
            document.body.style.cursor = '';
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);

    // 오른쪽 frontend(iframe)에서 로그인/로그아웃하면 postMessage로 알려온다 —
    // 그걸 받아서 캐릭터가 이후부터 이 계정으로 장바구니 등 API를 호출하게 전환한다.
    // 보안 참고: iframe src를 우리가 직접 지정하므로(FrontendPanel의 VITE_FRONTEND_URL)
    // 완전히 낯선 origin은 아니지만, 그래도 메시지 형태(source 필드)는 꼭 확인한다.
    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            const data = event.data;
            if (!data || data.source !== 'storeflow-frontend') return;

            console.log('[시뮬레이션] frontend로부터 메시지 수신:', data);

            if (data.type === 'LOGIN' && typeof data.consumerId === 'number') {
                setCurrentConsumer(data.consumerId, data.name ?? null);
                setLoggedInName(data.name ?? `회원#${data.consumerId}`);
            } else if (data.type === 'LOGOUT') {
                resetCurrentConsumerToDefault();
                setLoggedInName(null);
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, []);



    const floorCacheRef = useRef<Map<number, FloorData>>(new Map());
    const getFloorData = useCallback(async (floor: number): Promise<FloorData> => {
        if (!floorCacheRef.current.has(floor)) {
            floorCacheRef.current.set(floor, await fetchFloorData(floor));
        }
        return floorCacheRef.current.get(floor)!;
    }, []);

    // 최초 로드: 1층 데이터를 가져와서 씬을 생성
    useEffect(() => {
        let cancelled = false;
        getFloorData(1).then((data) => {
            if (cancelled) return;
            setViewFloorData(data);
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleFloorSwitch = useCallback(
        async (floor: number) => {
            if (busy || floor === viewFloor) return;
            const data = await getFloorData(floor);
            setViewFloor(floor);
            setViewFloorData(data);
            const isPlayerFloor = floor === playerFloor;
            canvasRef.current?.loadFloor(data, {
                startCell: isPlayerFloor ? (playerCell ?? undefined) : undefined,
                hidePlayer: !isPlayerFloor,
            });
        },
        [busy, viewFloor, playerFloor, playerCell, getFloorData]
    );

    const handlePlayerArrive = useCallback((point: GridPoint) => {
        setPlayerCell(point);
    }, []);

    const handleTileClick = useCallback(
        (cell: GridPoint, loc: LocationInfo | null) => {
            if (loc) setSelectedLocation(loc);
            if (busy) return;
            // 매대나 시설물(엘리베이터/에스컬레이터/화장실 등)을 클릭했을 때만 이동한다 —
            // 그냥 빈 배경(통로) 클릭은 무시.
            const isFacility = viewFloorData?.facilities.some((f) => f.x === cell.x && f.y === cell.y) ?? false;
            if (!loc && !isFacility) return;
            if (viewFloor === playerFloor) {
                canvasRef.current?.walkTo(cell);
            } else {
                setTransferPrompt({ targetFloor: viewFloor, targetCell: cell });
            }
        },
        [busy, viewFloor, playerFloor, viewFloorData]
    );

    // 반환값: 목적지 층까지 실제로 도착했으면 true. false면(경로 없음/시설 없음/에러 등)
    // 호출부가 "도착한 셈 치고" 다음 단계로 넘어가면 안 된다 — 2번(쇼핑목록이 걷지도 않고
    // 다음 층으로 넘어가버리는) 버그가 바로 이걸 안 지켜서 생겼던 것.
    const startTrip = useCallback(
        async (toFloor: number, targetCell: GridPoint, method: TransferMethod): Promise<boolean> => {
            const canvas = canvasRef.current;
            if (!canvas) return false;
            setBusy(true);
            setTransferPrompt(null);
            setElevatorPrompt(false);

            // 트립 시작 전, 씬을 캐릭터가 실제로 있는 층 + 실제 위치로 되돌려 놓는다
            // (지금 보고 있던 화면이 목적지 층이었을 수 있으므로).
            // 중간에 fetch/이동 중 에러가 나도 busy가 true로 영영 남아있으면 그 이후로는
            // 매대 클릭/층 전환/쇼핑목록 안내가 전부 조용히 아무 반응도 안 하는 것처럼 보인다 —
            // try/finally로 무슨 일이 있어도 busy는 반드시 풀리게 한다.
            try {
                const startData = await getFloorData(playerFloor);
                setViewFloor(playerFloor);
                setViewFloorData(startData);
                canvas.loadFloor(startData, { startCell: playerCell ?? undefined, hidePlayer: false });

                const arrived = await runTrip({
                    canvas,
                    fromFloor: playerFloor,
                    toFloor,
                    targetCell,
                    method,
                    onFloorChange: (floor, data) => {
                        setPlayerFloor(floor);
                        setViewFloor(floor);
                        setViewFloorData(data);
                    },
                    onStepMessage: setStatusMessage,
                });

                setPlayerCell(canvas.getPlayerGrid());
                return arrived;
            } catch (err) {
                console.error('[startTrip] 이동 중 오류', err);
                setStatusMessage('이동 중 오류가 발생했습니다.');
                setTimeout(() => setStatusMessage(''), 2500);
                return false;
            } finally {
                setBusy(false);
            }
        },
        [playerFloor, playerCell, getFloorData]
    );

    const handleFacilityInteract = useCallback(
        (facility: FacilityInfo) => {
            if (busy || viewFloor !== playerFloor) return; // 캐릭터가 실제로 그 자리에 있을 때만 반응
            if (facility.type === 'escalator_up' || facility.type === 'escalator_down') {
                const dir = facility.type === 'escalator_up' ? 1 : -1;
                const target = playerFloor + dir;
                const route = escalatorRoute(playerFloor, target);
                if (!route) {
                    setStatusMessage(`${floorLabel(playerFloor)}에서는 이 에스컬레이터로 갈 수 있는 층이 없습니다.`);
                    setTimeout(() => setStatusMessage(''), 2000);
                    return;
                }
                startTrip(target, { x: facility.x, y: facility.y }, 'escalator');
            } else if (facility.type === 'elevator') {
                setElevatorPrompt(true);
            }
        },
        [busy, viewFloor, playerFloor, startTrip]
    );

    const handleLocationInteract = useCallback(
        async (loc: LocationInfo) => {
            if (busy) return;
            const zone = viewFloorData?.zones.find((z) => z.zoneId === loc.zoneId);
            const products = await fetchProductsAtLocation(loc, zone?.label ?? loc.zoneId);
            setProductPopup({ location: loc, products });
        },
        [busy, viewFloorData]
    );

    const handleAddToCart = useCallback((location: LocationInfo, product: ProductInfo) => {
        // setCart의 업데이터 함수는 비동기로(리액트 배치 처리 중에) 실행되기 때문에,
        // 그 안에서 클로저 변수(added)를 true로 바꿔도 바로 아래에서 읽으면 아직 반영 전이라
        // 항상 false로 읽히는 버그가 있었다 — 그래서 addItemToDbCart가 실제로는 한 번도
        // 호출되지 못했었음. 재고 0 여부만 먼저 걸러내고, 나머지는 로컬 표시용 캡과 무관하게
        // 클릭할 때마다 DB에도 반영한다.
        if (product.stock <= 0) return;

        setCart((prev) => {
            const idx = prev.findIndex((it) => it.locationId === location.locationId && it.skuId === product.skuId);
            if (idx >= 0) {
                // 재고(product.stock)보다 많이 담기지 않도록 캡을 건다 — 안 그러면 "담기" 버튼을
                // 계속 눌러서 재고가 1개인 상품도 장바구니에 20개, 30개씩 쌓을 수 있는 버그가 있었음.
                if (prev[idx].qty >= product.stock) return prev;
                const next = [...prev];
                next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
                return next;
            }
            return [...prev, { ...product, locationId: location.locationId, qty: 1 }];
        });

        // 화면(로컬 상태) 반영과 별개로, consumer_id=1(회원000001) 캐릭터의 실제 DB 장바구니
        // (cart_group/cart_item)에도 담는다. 실패해도 게임 진행엔 영향 없도록 콘솔에만 남긴다.
        addItemToDbCart(product.skuId, 1).catch((err) => {
            console.error('DB 장바구니 반영 실패:', err);
        });
    }, []);

    const handleCheckout = useCallback(() => {
        const total = cart.reduce((sum, it) => sum + it.price * it.qty, 0);
        if (cart.length === 0 || total > cash) return;
        setCash((prev) => prev - total);
        for (const it of cart) adjustStock(it.locationId, it.skuId, -it.qty);
        setPurchased((prev) => [...prev, ...cart]);
        setCart([]);
    }, [cart, cash]);

    const handleRefund = useCallback((index: number) => {
        setPurchased((prev) => {
            const it = prev[index];
            if (!it) return prev;
            setCash((c) => c + it.price * it.qty);
            adjustStock(it.locationId, it.skuId, it.qty);
            return prev.filter((_, i) => i !== index);
        });
    }, []);

    const handleAddShoppingItem = useCallback(async (product: ProductSearchResult) => {
        const loc = await resolveProductLocation(product.skuId);
        if (!loc) {
            setStatusMessage('이 상품의 매대 위치를 찾을 수 없습니다.');
            setTimeout(() => setStatusMessage(''), 2000);
            return;
        }
        setShoppingList((prev) => [
            ...prev,
            {
                skuId: product.skuId,
                name: product.name,
                price: product.price,
                floorNo: loc.floorNo,
                x: loc.x,
                y: loc.y,
                locationId: loc.locationId,
                zoneId: loc.zoneId,
            },
        ]);
    }, []);

    const handleRemoveShoppingItem = useCallback((index: number) => {
        setShoppingList((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const handleMoveShoppingItem = useCallback((index: number, direction: -1 | 1) => {
        setShoppingList((prev) => {
            const target = index + direction;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    }, []);

    // 쇼핑목록 순서대로 캐릭터를 안내(11번). 같은 층 항목은 바로 걸어가고, 다른 층 항목은
    // 엘리베이터(모든 층 직행 가능)로 이동한다 — 에스컬레이터는 인접 층만 연결돼 있어서
    // 자동 안내에는 항상 갈 수 있는 엘리베이터를 쓰는 게 안전하다.
    const handleNavigateShoppingList = useCallback(async () => {
        if (busy || navigatingIndex !== null || shoppingList.length === 0) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        setShoppingListOpen(false);
        setBusy(true);

        try {
            // 보고 있던 화면이 캐릭터 층이 아니었을 수 있으니, 시작 전에 캐릭터 실제 위치로 맞춘다.
            const startData = await getFloorData(playerFloor);
            setViewFloor(playerFloor);
            setViewFloorData(startData);
            canvas.loadFloor(startData, { startCell: playerCell ?? undefined, hidePlayer: false });

            let currentFloor = playerFloor;
            for (let i = 0; i < shoppingList.length; i++) {
                const it = shoppingList[i];
                setNavigatingIndex(i);
                if (it.floorNo === currentFloor) {
                    setStatusMessage(`"${it.name}"(으)로 이동 중...`);
                    const arrived = await new Promise<boolean>((resolve) => canvas.walkTo({ x: it.x, y: it.y }, resolve));
                    if (!arrived) {
                        // 실제로는 못 걸어간 건데 "도착했다"고 치고 다음 항목으로 넘어가던 게 2번 버그의
                        // 핵심 원인이었다 — 여기서 멈추고 사용자에게 알린다(4번: 안 보이는 충돌구역일 수 있음).
                        setStatusMessage(`"${it.name}" 위치까지 경로를 찾지 못했습니다. (맵에 막힌 구간이 있을 수 있어요)`);
                        setTimeout(() => setStatusMessage(''), 3500);
                        return;
                    }
                    // 같은 층 안에서 이동한 뒤에는 반드시 playerCell을 갱신해야 한다 — 이걸 빼먹으면
                    // 다음에 startTrip()이 호출될 때(층 이동 시작 시) playerCell이 옛날(이 목록을 시작하기
                    // 전 위치, 즉 "1층 출발점")로 남아있어서 캐릭터가 방금 걸어온 경로를 잊고 그 옛날
                    // 자리로 순간이동한 것처럼 보이는 게 2번 버그의 진짜 원인이었다.
                    setPlayerCell(canvas.getPlayerGrid());
                } else {
                    // startTrip은 자기 자신이 busy를 true→false로 관리하고 끝에 반드시 false로 풀어준다
                    // (try/finally). 목록 전체가 끝날 때까지는 다시 잠가서 중간에 다른 조작이 끼어들지 않게 한다.
                    const arrived = await startTrip(it.floorNo, { x: it.x, y: it.y }, 'elevator');
                    if (!arrived) {
                        setStatusMessage(`${it.floorNo}층으로 이동하지 못했습니다. (엘리베이터 경로를 찾지 못했어요)`);
                        setTimeout(() => setStatusMessage(''), 3500);
                        return;
                    }
                    currentFloor = it.floorNo;
                    setBusy(true);
                }
            }

            setStatusMessage('쇼핑목록 안내를 완료했습니다.');
            setTimeout(() => setStatusMessage(''), 2500);
        } catch (err) {
            console.error('[handleNavigateShoppingList] 안내 중 오류', err);
            setStatusMessage('쇼핑목록 안내 중 오류가 발생했습니다.');
            setTimeout(() => setStatusMessage(''), 2500);
        } finally {
            setNavigatingIndex(null);
            setBusy(false);
        }
    }, [busy, navigatingIndex, shoppingList, playerFloor, playerCell, getFloorData, startTrip]);

    const escalatorAvailable = transferPrompt
        ? !!escalatorRoute(playerFloor, transferPrompt.targetFloor)
        : false;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <header
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    background: '#12141a',
                    borderBottom: '1px solid #2a2d35',
                    gap: 12,
                    flexWrap: 'wrap',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: '1px solid #3a3f4b',
                            background: '#1e2128',
                            color: '#facc15',
                            fontWeight: 700,
                        }}
                        title="예시 잔액 (구매 기능 미구현이라 차감되지 않음)"
                    >
                        💰 ${cash.toLocaleString()}
                    </div>

                    <FloorDropdown current={viewFloor} onChange={handleFloorSwitch} />

                    <div
                        style={{
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: '1px solid #3a3f4b',
                            background: '#1e2128',
                            color: '#e5e7eb',
                            fontSize: 12,
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                        title={selectedLocation ? selectedLocation.locationId : '선택한 위치 없음'}
                    >
                        📍 {selectedLocation ? selectedLocation.locationId : '위치 미선택'}
                    </div>

                    <button
                        onClick={() => setCartOpen(true)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: '1px solid #3a3f4b',
                            background: '#1e2128',
                            color: '#4ade80',
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        🛒 {cart.reduce((n, it) => n + it.qty, 0)}
                    </button>

                    <button
                        onClick={() => setChatOpen(true)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: '1px solid #3a3f4b',
                            background: '#1e2128',
                            color: '#60a5fa',
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        🤖💬 AI Chat
                    </button>

                    <button
                        onClick={() => setShoppingListOpen(true)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: '1px solid #3a3f4b',
                            background: '#1e2128',
                            color: '#f472b6',
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        📝 쇼핑목록 {shoppingList.length}
                    </button>

                    <button
                        onClick={() => setShowFrontend((v) => !v)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: '1px solid #3a3f4b',
                            background: '#1e2128',
                            color: '#34d399',
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        🖥️ 웹 UI {showFrontend ? '숨기기' : '보기'}
                    </button>

                    <span
                        style={{
                            padding: '6px 10px',
                            borderRadius: 8,
                            background: '#1e2128',
                            color: loggedInName ? '#34d399' : '#9ca3af',
                            fontSize: 13,
                            fontWeight: 600,
                        }}
                        title="frontend에서 로그인한 계정을 따라갑니다"
                    >
                        👤 {loggedInName ? `${loggedInName}님` : '기본 캐릭터(비로그인)'}
                    </span>

                    {viewFloor !== playerFloor && (
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>
                            (캐릭터 위치: {floorLabel(playerFloor)})
                        </div>
                    )}
                    {statusMessage && <div style={{ fontSize: 12, color: '#22c55e' }}>{statusMessage}</div>}
                </div>
            </header>

            <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                <div style={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
                    <GameCanvas
                        ref={canvasRef}
                        floorData={viewFloorData}
                        events={{
                            onTileClick: handleTileClick,
                            onPlayerArrive: handlePlayerArrive,
                            onFacilityInteract: handleFacilityInteract,
                            onLocationInteract: handleLocationInteract,
                        }}
                    />
                    {viewFloor !== playerFloor && (
                        <div
                            style={{
                                position: 'absolute',
                                top: 8,
                                left: 8,
                                background: '#1f2937cc',
                                color: '#fbbf24',
                                padding: '6px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                            }}
                        >
                            지금 보고 있는 층에는 캐릭터가 없습니다 — 매대를 클릭하면 이동 방법을 물어봅니다.
                        </div>
                    )}
                </div>
                <SidePanel selectedLocation={selectedLocation} />
                {showFrontend && (
                    <>
                        <div
                            onMouseDown={() => {
                                draggingRef.current = true;
                                document.body.style.cursor = 'col-resize';
                            }}
                            style={{
                                width: 6,
                                flexShrink: 0,
                                cursor: 'col-resize',
                                background: '#2a2f3a',
                            }}
                        />
                        <FrontendPanel width={frontendWidth} />
                    </>
                )}
            </div>

            {transferPrompt && (
                <TransferChoiceModal
                    fromFloor={playerFloor}
                    toFloor={transferPrompt.targetFloor}
                    escalatorAvailable={escalatorAvailable}
                    onChoose={(method) => startTrip(transferPrompt.targetFloor, transferPrompt.targetCell, method)}
                    onCancel={() => setTransferPrompt(null)}
                />
            )}

            {elevatorPrompt && (
                <ElevatorFloorModal
                    currentFloor={playerFloor}
                    onChoose={async (floor) => {
                        const data = await getFloorData(floor);
                        const facility = data.facilities.find((f) => f.type === 'elevator');
                        const target = facility ? { x: facility.x, y: facility.y } : { x: 2, y: 2 };
                        startTrip(floor, target, 'elevator');
                    }}
                    onCancel={() => setElevatorPrompt(false)}
                />
            )}

            {productPopup && (
                <ProductPopup
                    location={productPopup.location}
                    products={productPopup.products}
                    cartQtyBySku={Object.fromEntries(
                        cart
                            .filter((it) => it.locationId === productPopup.location.locationId)
                            .map((it) => [it.skuId, it.qty])
                    )}
                    onAddToCart={(p) => handleAddToCart(productPopup.location, p)}
                    onClose={() => setProductPopup(null)}
                />
            )}

            {cartOpen && (
                <CartModal
                    items={cart}
                    purchased={purchased}
                    cash={cash}
                    onRemove={(i) => setCart((prev) => prev.filter((_, idx) => idx !== i))}
                    onCheckout={handleCheckout}
                    onRefund={handleRefund}
                    onClose={() => setCartOpen(false)}
                />
            )}

            {chatOpen && <AIChatModal onClose={() => setChatOpen(false)} />}

            {shoppingListOpen && (
                <ShoppingListModal
                    items={shoppingList}
                    navigatingIndex={navigatingIndex}
                    onAdd={handleAddShoppingItem}
                    onRemove={handleRemoveShoppingItem}
                    onMove={handleMoveShoppingItem}
                    onNavigate={handleNavigateShoppingList}
                    onClose={() => setShoppingListOpen(false)}
                />
            )}
        </div>
    );
}