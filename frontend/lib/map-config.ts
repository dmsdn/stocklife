// lib/map-config.ts
// public/maps/MAP_GUIDE.md 참고. 이미지 파일이랑 격자 크기만 여기서 관리합니다.
export interface FloorMapConfig {
  floorNo: number;
  image: string;
  gridWidth: number;
  gridHeight: number;
}

// TODO: 실제 지도 이미지 생기면 public/maps/floor-1.png로 교체하고 gridWidth/gridHeight를
// 실제 그림 기준으로 다시 맞춰주세요. 지금은 이미지가 없어서 회색 배경으로만 보입니다.
export const FLOOR_MAPS: FloorMapConfig[] = [
  { floorNo: 1, image: "/maps/floor-1.png", gridWidth: 24, gridHeight: 16 },
];

export function getFloorMap(floorNo: number): FloorMapConfig | undefined {
  return FLOOR_MAPS.find((f) => f.floorNo === floorNo);
}
