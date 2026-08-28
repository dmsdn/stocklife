// lib/product-location.ts
// ✅ 백엔드 배치 위치 조회(GET /api/products/inventory?skuIds=1,2,3)를 쓰는 공용 유틸.
//   리스트/검색/스캔처럼 상품이 여러 개 쭉 뜨는 화면에서 skuId마다 /inventory를 개별
//   호출하지 않고, 화면에 보이는 skuId를 모아서 한 번에 조회하려고 만들었습니다.
//   동선 보기(StoreMapDialog)도 원래 개별 fetch였던 걸 이걸로 옮겼습니다.
//
// ⚠ 백엔드 배치 API가 아직 배포 전이라 이 파일은 그 스펙(요청/응답 모양)을 가정하고
//   미리 작성해뒀습니다. 실제로 붙여보고 필드명 등이 다르면 손봐야 할 수 있습니다.
import { apiFetch } from "./api-client";
import { getZoneName, fetchRealFloorMap } from "./map-config";

export interface InventoryItem {
  skuId: number;
  locationId: string;
  zoneId: string;
  tierRole: "PICK" | "BULK";
  floorNo: number;
  x: number;
  y: number;
  qty: number;
}

type InventoryBatchResponse = Record<string, InventoryItem[]>;

// 같은 skuId 조합을 화면 안에서 여러 컴포넌트가 동시에 요청해도 API를 한 번만 타도록
// in-flight 요청을 재사용한다 (예: 리스트 화면의 카드 20개가 마운트 시 동시에 호출하는 경우).
let pendingBatch: Promise<Map<number, InventoryItem[]>> | null = null;
let pendingKey = "";

/** 여러 skuId의 위치를 한 번에 조회합니다. 재고 위치가 여러 곳이면 배열로 다 옵니다
 *  (PICK/BULK 등) — 화면에는 보통 PICK 위치 하나만 보여주면 됩니다 (pickLocation 참고). */
export async function fetchInventoryBatch(skuIds: number[]): Promise<Map<number, InventoryItem[]>> {
  const uniqueIds = Array.from(new Set(skuIds)).filter((id) => Number.isFinite(id));
  if (uniqueIds.length === 0) return new Map();

  const key = uniqueIds.slice().sort((a, b) => a - b).join(",");
  if (pendingBatch && pendingKey === key) return pendingBatch;

  pendingKey = key;
  pendingBatch = apiFetch<InventoryBatchResponse>(
    `/api/products/inventory?skuIds=${uniqueIds.join(",")}`,
    { auth: false }
  )
    .then((res) => {
      const map = new Map<number, InventoryItem[]>();
      for (const [skuIdStr, items] of Object.entries(res)) {
        map.set(Number(skuIdStr), items);
      }
      return map;
    })
    .catch(() => new Map<number, InventoryItem[]>())
    .finally(() => {
      pendingBatch = null;
      pendingKey = "";
    });

  return pendingBatch;
}

/** 여러 위치 중 화면에 보여줄 대표 위치 하나 — 손님이 실제로 집는 곳이라 PICK 우선,
 *  없으면 BULK(창고성 진열) 중 첫 번째. */
export function pickLocation(items: InventoryItem[] | undefined): InventoryItem | null {
  if (!items || items.length === 0) return null;
  return items.find((i) => i.tierRole === "PICK") ?? items[0];
}

/** InventoryItem을 "3층 유제품 코너" 같은 사람이 읽을 텍스트로 바꿉니다.
 *  zone 이름 캐시(map-config.ts)가 아직 안 채워져 있으면 zone 이름 없이 층만 보여줍니다 —
 *  이 함수 쓰기 전에 fetchRealFloorMap(floorNo)를 먼저 호출해두는 걸 권장합니다. */
export function formatLocationText(item: InventoryItem): string {
  const zoneName = getZoneName(item.floorNo, item.zoneId);
  return zoneName ? `${item.floorNo}층 ${zoneName}` : `${item.floorNo}층`;
}

/** 리스트 화면에서 흔히 쓰는 조합: skuId 목록을 받아 위치 텍스트 맵까지 바로 만들어 줍니다.
 *  zone 이름 캐시를 위해 관련 층들의 fetchRealFloorMap도 같이 불러옵니다. */
export async function fetchLocationTexts(skuIds: number[]): Promise<Map<number, string>> {
  const inventoryMap = await fetchInventoryBatch(skuIds);

  const floors = new Set<number>();
  for (const items of inventoryMap.values()) {
    const loc = pickLocation(items);
    if (loc) floors.add(loc.floorNo);
  }
  await Promise.all(Array.from(floors).map((floorNo) => fetchRealFloorMap(floorNo)));

  const textMap = new Map<number, string>();
  for (const [skuId, items] of inventoryMap.entries()) {
    const loc = pickLocation(items);
    if (loc) textMap.set(skuId, formatLocationText(loc));
  }
  return textMap;
}