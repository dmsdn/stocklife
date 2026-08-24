// components/domain/store-map.tsx
// ✅ 좌우 꽉 차게 + 세로로 더 넓게(h-[70vh]). 손가락 핀치 확대/축소, 마우스 휠 확대/축소,
//   드래그로 이동. 동선은 흰 통로(lib/pathfinding.ts, A*)만 따라가도록 계산. 핀은 항상 이름을
//   보여주지 않고, 눌렀을 때만 이미지+이름+가격 팝업이 뜹니다.
"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { getFloorMap } from "@/lib/map-config";
import { findPath, type GridPoint } from "@/lib/pathfinding";

export interface MapPin {
  id: number;
  name: string;
  price: number;
  x: number;
  y: number;
  collected?: boolean;
}

export interface StoreMapProps {
  floorNo: number;
  pins: MapPin[];
  routeOrder: number[];
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

function dist(a: React.Touch, b: React.Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function StoreMap({ floorNo, pins, routeOrder }: StoreMapProps) {
  const config = getFloorMap(floorNo);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activePinId, setActivePinId] = useState<number | null>(null);

  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);

  if (!config) {
    return <p className="p-4 text-center text-sm text-muted-foreground">{floorNo}층 지도가 아직 등록되지 않았어요.</p>;
  }

  const toPercent = (x: number, y: number) => ({
    left: (x / config.gridWidth) * 100,
    top: (y / config.gridHeight) * 100,
  });

  // 방문 순서대로, 각 구간을 A*로 이어서 통로만 따라가는 전체 경로 좌표 만들기
  const routePins = routeOrder.map((id) => pins.find((p) => p.id === id)).filter((p): p is MapPin => !!p);
  let fullPath: GridPoint[] = [];
  for (let i = 0; i < routePins.length - 1; i++) {
    const segment = findPath(floorNo, { x: routePins[i].x, y: routePins[i].y }, { x: routePins[i + 1].x, y: routePins[i + 1].y });
    fullPath = fullPath.length ? [...fullPath, ...segment.slice(1)] : segment;
  }
  const pathPoints = fullPath.map((p) => { const { left, top } = toPercent(p.x, p.y); return `${left},${top}`; }).join(" ");

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => clampZoom(z - e.deltaY * 0.0025));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPan({ x: dragRef.current.panX + (e.clientX - dragRef.current.startX), y: dragRef.current.panY + (e.clientY - dragRef.current.startY) });
  };
  const handlePointerUp = () => { dragRef.current = null; };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = { startDist: dist(e.touches[0], e.touches[1]), startZoom: zoom };
    }
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const ratio = dist(e.touches[0], e.touches[1]) / pinchRef.current.startDist;
      setZoom(clampZoom(pinchRef.current.startZoom * ratio));
    }
  };
  const handleTouchEnd = () => { pinchRef.current = null; };

  const activePin = pins.find((p) => p.id === activePinId);

  return (
    <div className="space-y-2">
      <div
        className="relative h-[70vh] w-full touch-none overflow-hidden bg-muted select-none"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="absolute inset-0"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center center" }}
        >
          {/* TODO: public/maps/floor-1.png 없으면 이 자리는 회색 배경으로만 보입니다 */}
          <Image src={config.image} alt={`매장 ${floorNo}층 지도`} fill className="object-contain" unoptimized />

          {fullPath.length > 1 && (
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline
                points={pathPoints}
                fill="none"
                stroke="var(--route)"
                strokeWidth="0.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="2 1.3"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}

          {pins.map((pin) => {
            const { left, top } = toPercent(pin.x, pin.y);
            const order = routeOrder.indexOf(pin.id);
            const isActive = activePinId === pin.id;
            return (
              <div key={pin.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: `${top}%` }}>
                {isActive && (
                  <div
                    className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl border border-border bg-card p-2 shadow-lg"
                    style={{ transform: `translateX(-50%) scale(${1 / zoom})`, transformOrigin: "bottom center" }}
                  >
                    <div className="h-10 w-10 shrink-0 rounded-md bg-muted" />
                    <div className="pr-1 text-left">
                      <p className="text-xs font-medium">{pin.name}</p>
                      <p className="text-sm font-bold">{pin.price.toLocaleString()}원</p>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setActivePinId(isActive ? null : pin.id)}
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-[10px] font-semibold shadow ${
                    pin.collected ? "bg-muted-foreground text-background" : "bg-primary text-primary-foreground"
                  }`}
                  style={{ transform: `scale(${1 / zoom})` }}
                >
                  {order >= 0 ? order + 1 : "✓"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pb-4 text-xs text-muted-foreground">
        <span>손가락으로 확대·이동하거나 마우스 휠로 확대할 수 있어요. 핀을 누르면 상품 정보가 떠요.</span>
        <button type="button" onClick={resetView} className="shrink-0 underline">
          원래대로
        </button>
      </div>
    </div>
  );
}
