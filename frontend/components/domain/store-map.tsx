// components/domain/store-map.tsx
// ✅ 좌우 꽉 차게 + 세로로 더 넓게(h-[70vh]). 손가락 핀치 확대/축소, 마우스 휠 확대/축소,
//   드래그로 이동. 동선은 흰 통로(lib/pathfinding.ts, A*)만 따라가도록 계산. 핀은 항상 이름을
//   보여주지 않고, 눌렀을 때만 이미지+이름+가격 팝업이 뜹니다.
// ✅ 참고 이미지(Group_408) 반영 — 우측 하단 층 선택을 세로로 쌓인 알약(있으면),
//   하단 중앙 리브 버튼(있으면), 핀 팝업을 흰 카드+실제 상품 이미지로.
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getFloorMap, fetchRealFloorMap, getZoneRegions, getZoneName, FLOOR_MAPS } from "@/lib/map-config";
import type { GridPoint } from "@/lib/pathfinding";

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
  /** ✅ 수정(2026-09) — 매대 칸 하나하나에 박스를 그려서 누르게 하던 기능은 없앴습니다
   *  (실제 매장 이미지 위에 격자 박스가 겹쳐 보여서 지저분했음). 이제 구역 단위로만
   *  누를 수 있고(showZones), 결과도 외부 모달 대신 지도 위에 핀처럼 뜹니다. */
  showZones?: boolean;
  /** ✅ 신규 — 넘기면 우측 하단에 층 선택 알약(3F/2F/1F 세로 스택)을 띄움.
   *  안 넘기면(단일 층 동선 등) 표시 안 함. */
  onFloorChange?: (floorNo: number) => void;
  /** ✅ 신규 — 넘기면 하단 중앙에 리브 원형 버튼을 띄움(눌리면 AI챗 오픈 등). */
  onLivClick?: () => void;
  /** ✅ 참고용으로만 남겨둠 — 더 이상 이 컴포넌트 안에서 경로선을 그리지 않습니다(요청:
   *  "동선 볼 때 들어가있는 이상한 선 다 빼"). 방문 순서는 핀 위 번호로만 표시. */
  precomputedPath?: GridPoint[];
  /** ✅ 신규 — 지도 영역 높이 클래스. 기본은 기존과 동일한 70vh(리스트 동선 다이얼로그 등).
   *  화면 전체를 지도로 쓰는 "매장 지도 둘러보기" 페이지처럼 더 넓게 쓰고 싶을 때 오버라이드. */
  heightClassName?: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

function dist(a: React.Touch, b: React.Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function StoreMap({ floorNo, pins, routeOrder, showZones, onFloorChange, onLivClick, heightClassName }: StoreMapProps) {
  const config = getFloorMap(floorNo);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activePinId, setActivePinId] = useState<number | null>(null);
  // ✅ 신규 — 구역을 누르면 그 구역 이름을 상품 핀과 같은 스타일의 작은 팝업으로 보여줌
  //   (요청: "누르면 화면 위로 핀처럼 무슨 구역 정도만"). 외부 모달 없이 지도 안에서 처리.
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
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
        className={`relative w-full touch-none overflow-hidden bg-muted select-none ${heightClassName ?? "h-[70vh]"}`}
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

          {/* ✅ 수정(2026-09) — 매대 칸마다 있던 격자 박스, 동선 경로선을 전부 없앴습니다
              (요청: "이상한 박스, 선 다 빼"). 구역은 여전히 누를 수 있지만(showZones) 평소엔
              완전히 안 보이고, 누르면 그 구역 위에 상품 핀과 같은 스타일의 작은 팝업만 뜹니다. */}
          {showZones &&
            getZoneRegions(floorNo).map((z) => {
              const p1 = toPercent(z.x1, z.y1);
              const p2 = toPercent(z.x2, z.y2);
              const centerLeft = (p1.left + p2.left) / 2;
              const centerTop = (p1.top + p2.top) / 2;
              const isActive = activeZoneId === z.zoneId;
              return (
                <div key={z.zoneId}>
                  <button
                    type="button"
                    onClick={() => setActiveZoneId(isActive ? null : z.zoneId)}
                    aria-label={`${getZoneName(floorNo, z.zoneId) ?? z.zoneId} 구역 정보`}
                    className="absolute bg-transparent"
                    style={{
                      left: `${p1.left}%`,
                      top: `${p1.top}%`,
                      width: `${p2.left - p1.left}%`,
                      height: `${p2.top - p1.top}%`,
                    }}
                  />
                  {isActive && (
                    <div
                      className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full border border-[#F4F4F4] bg-white px-3 py-1.5 text-sm font-medium shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
                      style={{ left: `${centerLeft}%`, top: `${centerTop}%`, transform: `translate(-50%, calc(-100% - 8px)) scale(${1 / zoom})`, transformOrigin: "bottom center" }}
                    >
                      {getZoneName(floorNo, z.zoneId) ?? z.zoneId}
                    </div>
                  )}
                </div>
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

        {/* ✅ 신규(2026-09) — "원래대로"를 하단 안내문 옆 텍스트 링크 대신, 지도 우측 상단에
            떠 있는 버튼으로. 확대/이동한 채로 지도를 보다가 바로 손 닿는 자리에서 리셋할 수 있게. */}
        <button
          type="button"
          onClick={resetView}
          className="absolute top-4 right-4 rounded-full border border-border bg-white/90 px-3 py-1.5 text-xs font-medium shadow-[0_4px_20px_rgba(0,0,0,0.12)] backdrop-blur"
        >
          원래대로
        </button>

        {/* ✅ 리브 — 하단 중앙 원형 버튼 */}
        {onLivClick && (
          <button
            type="button"
            onClick={onLivClick}
            className="absolute bottom-4 left-1/2 flex h-14 w-14 -translate-x-1/2 flex-col items-center justify-center gap-0.5 rounded-full bg-white text-xs shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
          >
            <img src="/icons/liv-line.svg" alt="" className="h-5 w-5 shrink-0" />
            리브
          </button>
        )}
      </div>

      <p className="px-4 pb-4 text-xs text-muted-foreground">
        손가락으로 확대·이동하거나 마우스 휠로 확대할 수 있어요. 핀을 누르면 상품 정보가 떠요.
        {showZones && " 색칠된 구역을 누르면 어떤 카테고리인지 볼 수 있어요."}
      </p>
    </div>
  );
}
