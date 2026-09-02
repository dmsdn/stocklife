// components/domain/store-map.tsx
// ✅ 좌우 꽉 차게 + 세로로 더 넓게(h-[70vh]). 손가락 핀치 확대/축소, 마우스 휠 확대/축소,
//   드래그로 이동. 동선은 흰 통로(lib/pathfinding.ts, A*)만 따라가도록 계산. 핀은 항상 이름을
//   보여주지 않고, 눌렀을 때만 이미지+이름+가격 팝업이 뜹니다.
// ✅ 참고 이미지(Group_408) 반영 — 우측 하단 층 선택을 세로로 쌓인 알약(있으면),
//   하단 중앙 리브 버튼(있으면), 핀 팝업을 흰 카드+실제 상품 이미지로.
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getFloorMap, fetchRealFloorMap, getFloorLocations, FLOOR_MAPS } from "@/lib/map-config";
import { findPath, type GridPoint } from "@/lib/pathfinding";

export interface MapPin {
  id: number;
  name: string;
  price: number;
  x: number;
  y: number;
  collected?: boolean;
  /** ✅ 신규 — 있으면 핀 팝업에 실제 상품 이미지를 보여줌(없으면 회색 박스로 대체) */
  image?: string;
}

export interface StoreMapProps {
  floorNo: number;
  pins: MapPin[];
  routeOrder: number[];
  /** ✅ 매대(위치) 박스를 클릭 가능하게 표시하고 싶을 때 전달 — 아무 매대나 눌러서
   *  그 안의 상품 목록을 보는 "매장 둘러보기" 기능용. 안 넘기면 기존처럼 핀만 보여줌. */
  onLocationClick?: (locationId: string) => void;
  /** ✅ 신규 — 넘기면 우측 하단에 층 선택 알약(3F/2F/1F 세로 스택)을 띄움.
   *  안 넘기면(단일 층 동선 등) 표시 안 함. */
  onFloorChange?: (floorNo: number) => void;
  /** ✅ 신규 — 넘기면 하단 중앙에 리브 원형 버튼을 띄움(눌리면 AI챗 오픈 등). */
  onLivClick?: () => void;
  /** ✅ 신규 — 실제 백엔드 동선 API(getRoute)가 이미 계산해준 경로를 그대로 그리고 싶을 때
   *  전달. 넘기면 이 안에서 A*를 다시 계산하지 않고 이 좌표를 그대로 씀(현재 층에 해당하는
   *  좌표만 걸러서 넘겨주면 됨). 안 넘기면 기존처럼 로컬 A*로 계산(매장 둘러보기 등). */
  precomputedPath?: GridPoint[];
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

function dist(a: React.Touch, b: React.Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function StoreMap({ floorNo, pins, routeOrder, onLocationClick, onFloorChange, onLivClick, precomputedPath }: StoreMapProps) {
  const config = getFloorMap(floorNo);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activePinId, setActivePinId] = useState<number | null>(null);
  // ✅ 실제 GET /api/map/floors/{floorNo} 로딩 완료 후 재계산되도록 트리거용 상태
  const [realMapReady, setRealMapReady] = useState(false);

  useEffect(() => {
    fetchRealFloorMap(floorNo).then(() => setRealMapReady(true));
  }, [floorNo]);

  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);

  if (!config) {
    return <p className="p-4 text-center text-sm text-muted-foreground">{floorNo}층 지도가 아직 등록되지 않았어요.</p>;
  }

  // ✅ legacyTopOffsetPercent 보정 — 기존 좌표(잘리기 전 이미지 기준)를 새(크롭된) 이미지에
  //   맞게 재투영. x축(가로)은 안 잘렸으니 그대로, y축만 보정.
  const toPercent = (x: number, y: number) => {
    const rawTop = (y / config.gridHeight) * 100;
    const offset = config.legacyTopOffsetPercent ?? 0;
    const top = offset > 0 ? ((rawTop - offset) / (100 - offset)) * 100 : rawTop;
    return {
      left: (x / config.gridWidth) * 100,
      top,
    };
  };

  // 방문 순서대로, 각 구간을 A*로 이어서 통로만 따라가는 전체 경로 좌표 만들기
  // ✅ precomputedPath가 있으면(실제 백엔드 agent가 계산해준 경로) 그걸 그대로 쓰고,
  //   없을 때만(매장 둘러보기 등 동선이 필요 없는 화면) 로컬 A*로 대체 계산.
  let fullPath: GridPoint[] = precomputedPath ?? [];
  if (!precomputedPath) {
    const routePins = routeOrder.map((id) => pins.find((p) => p.id === id)).filter((p): p is MapPin => !!p);
    for (let i = 0; i < routePins.length - 1; i++) {
      const segment = findPath(floorNo, { x: routePins[i].x, y: routePins[i].y }, { x: routePins[i + 1].x, y: routePins[i + 1].y });
      fullPath = fullPath.length ? [...fullPath, ...segment.slice(1)] : segment;
    }
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

          {onLocationClick &&
            getFloorLocations(floorNo).map((loc) => {
              const { left, top } = toPercent(loc.x, loc.y);
              return (
                <button
                  key={loc.locationId}
                  type="button"
                  onClick={() => onLocationClick(loc.locationId)}
                  aria-label={`매대 ${loc.locationId} 상품 보기`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-foreground/15 bg-foreground/5 hover:bg-foreground/15"
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    width: `${(1 / config.gridWidth) * 100}%`,
                    height: `${(1 / config.gridHeight) * 100}%`,
                  }}
                />
              );
            })}

          {pins.map((pin) => {
            const { left, top } = toPercent(pin.x, pin.y);
            const order = routeOrder.indexOf(pin.id);
            const isActive = activePinId === pin.id;
            return (
              <div key={pin.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: `${top}%` }}>
                {isActive && (
                  <div
                    className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-[20px] border border-[#F4F4F4] bg-white p-3 shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
                    style={{ transform: `translateX(-50%) scale(${1 / zoom})`, transformOrigin: "bottom center" }}
                  >
                    {pin.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pin.image} alt="" className="h-12 w-12 shrink-0 rounded-md border border-border object-cover" />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded-md bg-muted" />
                    )}
                    <div className="pr-1 text-left">
                      <p className="text-sm">{pin.name}</p>
                      <p className="text-base font-bold">{pin.price.toLocaleString()}원</p>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setActivePinId(isActive ? null : pin.id)}
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-base font-semibold shadow ${
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

        {/* ✅ 층 선택 — 세로로 쌓인 알약, 현재 층만 브랜드 오렌지 원. */}
        {onFloorChange && FLOOR_MAPS.length > 1 && (
          <div className="absolute bottom-4 right-4 flex flex-col items-center gap-1 rounded-full bg-white p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
            {[...FLOOR_MAPS].reverse().map((f) => (
              <button
                key={f.floorNo}
                type="button"
                onClick={() => onFloorChange(f.floorNo)}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium ${
                  f.floorNo === floorNo ? "bg-brand text-brand-foreground" : "text-muted-foreground"
                }`}
              >
                {f.floorNo}F
              </button>
            ))}
          </div>
        )}

        {/* ✅ 리브 — 하단 중앙 원형 버튼 */}
        {onLivClick && (
          <button
            type="button"
            onClick={onLivClick}
            className="absolute bottom-4 left-1/2 flex h-14 w-14 -translate-x-1/2 flex-col items-center justify-center gap-0.5 rounded-full bg-white text-xs shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
          >
            <img src="/icons/liv-line.svg" alt="" className="h-5 w-5" />
            리브
          </button>
        )}
      </div>

      <div className="flex items-center justify-between px-4 pb-4 text-xs text-muted-foreground">
        <span>
          손가락으로 확대·이동하거나 마우스 휠로 확대할 수 있어요. 핀을 누르면 상품 정보가 떠요.
          {onLocationClick && " 매대 칸을 누르면 그 안의 상품 목록을 볼 수 있어요."}
        </span>
        <button type="button" onClick={resetView} className="shrink-0 underline">
          원래대로
        </button>
      </div>
    </div>
  );
}
