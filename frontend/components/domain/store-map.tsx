// components/domain/store-map.tsx
// public/maps/MAP_GUIDE.md 참고. 이미지 위에 핀(pins)을 좌표로 찍고, routeOrder 순서대로
// 선으로 잇습니다. 이미지가 없으면 회색 배경 + 좌표 격자만 보여줍니다.
"use client";

import Image from "next/image";
import { getFloorMap } from "@/lib/map-config";

export interface MapPin {
  id: number;
  name: string;
  x: number;
  y: number;
  /** 이미 스캔해서 담은 상품이면 회색으로, 아직 못 담은(동선 대상) 상품이면 강조색으로 */
  collected?: boolean;
}

export interface StoreMapProps {
  floorNo: number;
  pins: MapPin[];
  /** 동선에 포함할 pin id 순서. 지나갈 필요 없는 핀(이미 담은 것)은 안 넣으면 됨 */
  routeOrder: number[];
}

export function StoreMap({ floorNo, pins, routeOrder }: StoreMapProps) {
  const config = getFloorMap(floorNo);

  if (!config) {
    return (
      <p className="p-4 text-center text-sm text-muted-foreground">
        {floorNo}층 지도가 아직 등록되지 않았어요. (lib/map-config.ts 참고)
      </p>
    );
  }

  const toPercent = (x: number, y: number) => ({
    left: (x / config.gridWidth) * 100,
    top: (y / config.gridHeight) * 100,
  });

  const routePins = routeOrder
    .map((id) => pins.find((p) => p.id === id))
    .filter((p): p is MapPin => !!p);

  const points = routePins
    .map((p) => {
      const { left, top } = toPercent(p.x, p.y);
      return `${left},${top}`;
    })
    .join(" ");

  return (
    <div
      className="relative w-full overflow-hidden rounded-md border border-border bg-muted"
      style={{ aspectRatio: `${config.gridWidth} / ${config.gridHeight}` }}
    >
      {/* TODO: public/maps/floor-1.png 없으면 다음 줄에서 404가 나되, 화면은 회색 배경으로 대체됩니다 */}
      <Image src={config.image} alt={`매장 ${floorNo}층 지도`} fill className="object-contain" unoptimized />

      {routePins.length > 1 && (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline
            points={points}
            fill="none"
            stroke="var(--route)"
            strokeWidth="0.8"
            strokeDasharray="2 1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}

      {pins.map((pin) => {
        const { left, top } = toPercent(pin.x, pin.y);
        const order = routeOrder.indexOf(pin.id);
        return (
          <div
            key={pin.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${left}%`, top: `${top}%` }}
          >
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-[10px] font-semibold shadow ${
                pin.collected ? "bg-muted-foreground text-background" : "bg-primary text-primary-foreground"
              }`}
            >
              {order >= 0 ? order + 1 : "✓"}
            </div>
            <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background">
              {pin.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
