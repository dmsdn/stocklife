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
import { resolvePinCoord } from "./location-pins";

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

// ✅ 신규(요청) — locationId 원본("F2-D-R01-B04-L1")을 그대로 보여주면 무슨 뜻인지 알 수
//   없어서, 사람이 읽는 형태("2층 D01 4번칸 1단")로 바꿔줍니다.
//   F2=층(floorNo), D=구역(zoneId), R01=랙 번호(rackNo), B04=베이 번호(bayNo, "칸"),
//   L1=레벨(levelNo, "단") — 같은 랙+베이의 L1~L6은 같은 자리에서 위아래 층만 다름
//   (L1~L3는 손님이 직접 집는 진열 층, L4~L6은 위쪽 예비재고).
//   형식이 다르면(예상 못 한 값) 안전하게 원본 그대로 반환합니다.
export function formatLocationLabel(locationId: string): string {
  const match = locationId.match(/^F(\d+)-([A-Za-z0-9]+)-R(\d+)-B(\d+)-L(\d+)$/);
  if (!match) return locationId;
  const [, floor, zone, rack, bay, level] = match;
  return `${floor}층 ${zone}${rack} ${parseInt(bay, 10)}번칸 ${parseInt(level, 10)}단`;
}

type InventoryBatchResponse = Record<string, InventoryItem[]>;

// 같은 skuId 조합을 화면 안에서 여러 컴포넌트가 동시에 요청해도 API를 한 번만 타도록
// in-flight 요청을 재사용한다 (예: 리스트 화면의 카드 20개가 마운트 시 동시에 호출하는 경우).
let pendingBatch: Promise<Map<number, InventoryItem[]>> | null = null;
let pendingKey = "";

// ✅ 신규(2026-09) — 검색 결과처럼 skuId가 수천 개까지 넘어오는 경우, 전부 한 GET
//   쿼리스트링에 욱여넣으면 URL이 수만 자까지 길어져서 브라우저/서버가 요청 자체를
//   거부(net::ERR_FAILED)했습니다. 청크 단위로 잘라서 병렬 요청 후 합칩니다 — 호출부가
//   몇 개를 넘기든 이 함수 하나만 고치면 전부 방어됩니다.
const CHUNK_SIZE = 150;

/** 여러 skuId의 위치를 한 번에 조회합니다. 재고 위치가 여러 곳이면 배열로 다 옵니다
 *  (PICK/BULK 등) — 화면에는 보통 PICK 위치 하나만 보여주면 됩니다 (pickLocation 참고). */
export async function fetchInventoryBatch(skuIds: number[]): Promise<Map<number, InventoryItem[]>> {
  const uniqueIds = Array.from(new Set(skuIds)).filter((id) => Number.isFinite(id));
  if (uniqueIds.length === 0) return new Map();

  const key = uniqueIds.slice().sort((a, b) => a - b).join(",");
  if (pendingBatch && pendingKey === key) return pendingBatch;

  pendingKey = key;
  const chunks: number[][] = [];
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    chunks.push(uniqueIds.slice(i, i + CHUNK_SIZE));
  }

  pendingBatch = Promise.all(
    chunks.map((chunk) =>
      apiFetch<InventoryBatchResponse>(`/api/products/inventory?skuIds=${chunk.join(",")}`, { auth: false }).catch(
        () => ({} as InventoryBatchResponse)
      )
    )
  )
    .then((results) => {
      const map = new Map<number, InventoryItem[]>();
      for (const res of results) {
        for (const [skuIdStr, items] of Object.entries(res)) {
          map.set(Number(skuIdStr), items);
        }
      }
      return map;
    })
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
  const picked = items.find((i) => i.tierRole === "PICK") ?? items[0];
  // ✅ 신규(요청) — 백엔드 좌표 대신 직접 찍어둔 좌표(lib/location-pins.ts)가 있으면
  //   그걸 우선으로. 못 찾으면 백엔드 좌표 그대로(기존 동작과 동일).
  const resolved = resolvePinCoord(picked.locationId, { floorNo: picked.floorNo, x: picked.x, y: picked.y });
  return { ...picked, floorNo: resolved.floorNo, x: resolved.x, y: resolved.y };
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