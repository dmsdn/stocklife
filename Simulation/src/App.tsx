import { useCallback, useEffect, useRef, useState } from 'react';
import GameCanvas, { type GameCanvasHandle } from './game/GameCanvas';
import FloorDropdown from './components/FloorDropdown';
import SidePanel from './components/SidePanel';
import TransferChoiceModal from './components/TransferChoiceModal';
import ElevatorFloorModal from './components/ElevatorFloorModal';
import ProductPopup from './components/ProductPopup';
import CartModal from './components/CartModal';
import AIChatModal from './components/AIChatModal';
import { fetchFloorData } from './api/locations';
import { fetchProductsAtLocation, adjustStock } from './api/products';
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

  // 상단바 — 지금은 실제 결제 API 연동 전이라 잔액/구매내역은 프론트 로컬 상태(placeholder)다.
  // 구매하기/환불하기는 이 로컬 상태 안에서만 금액 차감·환급 및 재고 증감(products.ts의 오버레이)을 흉내낸다.
  const [cash, setCash] = useState(99999999);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [purchased, setPurchased] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [productPopup, setProductPopup] = useState<{ location: LocationInfo; products: ProductInfo[] } | null>(null);

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

  const startTrip = useCallback(
    async (toFloor: number, targetCell: GridPoint, method: TransferMethod) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setBusy(true);
      setTransferPrompt(null);
      setElevatorPrompt(false);

      // 트립 시작 전, 씬을 캐릭터가 실제로 있는 층 + 실제 위치로 되돌려 놓는다
      // (지금 보고 있던 화면이 목적지 층이었을 수 있으므로).
      const startData = await getFloorData(playerFloor);
      setViewFloor(playerFloor);
      setViewFloorData(startData);
      canvas.loadFloor(startData, { startCell: playerCell ?? undefined, hidePlayer: false });

      await runTrip({
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
      setBusy(false);
      setStatusMessage('');
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
    setCart((prev) => {
      const idx = prev.findIndex((it) => it.locationId === location.locationId && it.skuId === product.skuId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [...prev, { ...product, locationId: location.locationId, qty: 1 }];
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

          {viewFloor !== playerFloor && (
            <div style={{ fontSize: 11, color: '#9ca3af' }}>
              (캐릭터 위치: {floorLabel(playerFloor)})
            </div>
          )}
          {statusMessage && <div style={{ fontSize: 12, color: '#22c55e' }}>{statusMessage}</div>}
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, position: 'relative' }}>
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
    </div>
  );
}
