// 층이 다른 곳을 클릭했을 때의 "이동 계획" 실행기.
// 캐릭터는 반드시 에스컬레이터/엘리베이터를 실제로 밟아야만 층이 바뀐다 —
// FloorSwitcher로 보기 층(view)만 바꾸는 것과 캐릭터의 실제 층 이동은 분리되어 있다.

import type { GameCanvasHandle } from './GameCanvas';
import type { FloorData, GridPoint } from './types';
import { escalatorRoute } from './floorGraph';
import { fetchFloorData } from '../api/locations';

export type TransferMethod = 'elevator' | 'escalator';

interface RunTripArgs {
  canvas: GameCanvasHandle;
  fromFloor: number;
  toFloor: number;
  targetCell: GridPoint; // 최종 목적지(클릭한 매대 칸)
  method: TransferMethod;
  onFloorChange: (floor: number, floorData: FloorData) => void; // React 상태(playerFloor/viewFloor) 동기화용
  onStepMessage?: (msg: string) => void;
}

function walkToAsync(canvas: GameCanvasHandle, goal: GridPoint): Promise<void> {
  return new Promise((resolve) => canvas.walkTo(goal, resolve));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const floorCache = new Map<number, FloorData>();
async function loadFloorCached(floor: number): Promise<FloorData> {
  if (!floorCache.has(floor)) {
    floorCache.set(floor, await fetchFloorData(floor));
  }
  return floorCache.get(floor)!;
}

export async function runTrip({
  canvas,
  fromFloor,
  toFloor,
  targetCell,
  method,
  onFloorChange,
  onStepMessage,
}: RunTripArgs): Promise<void> {
  canvas.setControlsEnabled(false);

  const sequence = method === 'escalator' ? escalatorRoute(fromFloor, toFloor) : [fromFloor, toFloor];

  if (!sequence) {
    onStepMessage?.('에스컬레이터로는 갈 수 없는 구간입니다.');
    canvas.setControlsEnabled(true);
    return;
  }

  for (let i = 0; i < sequence.length - 1; i++) {
    const currentFloor = sequence[i];
    const nextFloor = sequence[i + 1];
    const currentData = await loadFloorCached(currentFloor);

    // 에스컬레이터는 방향이 있다 — 올라갈 땐 escalator_up, 내려갈 땐 escalator_down을 타야 함.
    const goingUp = nextFloor > currentFloor;
    const facType = method === 'elevator' ? 'elevator' : goingUp ? 'escalator_up' : 'escalator_down';
    const facility = currentData.facilities.find((f) => f.type === facType);
    if (!facility) {
      onStepMessage?.(`${currentFloor}층에 ${method === 'elevator' ? '엘리베이터' : '에스컬레이터'}가 없습니다.`);
      canvas.setControlsEnabled(true);
      return;
    }

    onStepMessage?.(
      `${currentFloor}층 ${method === 'elevator' ? '엘리베이터' : '에스컬레이터'}로 이동 중...`
    );
    await walkToAsync(canvas, { x: facility.x, y: facility.y });

    if (method === 'escalator') {
      // 중간층을 실제로 거쳤는지 확인 가능하도록 1초 머무른다.
      await wait(1000);
    }

    const nextData = await loadFloorCached(nextFloor);
    // 도착 층엔 반대 방향 에스컬레이터가 있을 수도, 없을 수도 있다 — 있으면 그 자리로,
    // 없으면(예: 1F는 상행만 있음) 같은 타입이라도 있는 자리로 착지시킨다.
    const landingFacility =
      nextData.facilities.find((f) => f.type === (method === 'elevator' ? 'elevator' : goingUp ? 'escalator_down' : 'escalator_up')) ??
      nextData.facilities.find((f) => f.type === facType) ??
      facility;
    canvas.loadFloor(nextData, { startCell: { x: landingFacility.x, y: landingFacility.y } });
    onFloorChange(nextFloor, nextData);
  }

  // 마지막 층에서 실제 목적지까지 도보 이동
  await walkToAsync(canvas, targetCell);
  onStepMessage?.('도착했습니다.');
  canvas.setControlsEnabled(true);
}
