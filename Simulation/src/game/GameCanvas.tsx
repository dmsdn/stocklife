import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import Phaser from 'phaser';
import StoreScene, { type StoreSceneEvents } from './scenes/StoreScene';
import type { FloorData, GridPoint } from './types';

interface Props {
  floorData: FloorData | null;
  events?: StoreSceneEvents;
}

export interface GameCanvasHandle {
  loadFloor: (floorData: FloorData, opts?: { startCell?: GridPoint; hidePlayer?: boolean }) => void;
  walkTo: (goal: GridPoint, onArrive?: () => void) => void;
  teleportTo: (cell: GridPoint) => void;
  setControlsEnabled: (enabled: boolean) => void;
  setPlayerVisible: (visible: boolean) => void;
  getPlayerGrid: () => GridPoint | null;
}

const GameCanvas = forwardRef<GameCanvasHandle, Props>(function GameCanvas({ floorData, events }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneReadyRef = useRef(false);

  useImperativeHandle(ref, () => ({
    loadFloor: (fd, opts) => {
      const scene = gameRef.current?.scene.getScene('StoreScene') as StoreScene | null;
      if (scene?.scene.isActive()) scene.loadFloor(fd, opts);
    },
    walkTo: (goal, onArrive) => {
      const scene = gameRef.current?.scene.getScene('StoreScene') as StoreScene | null;
      scene?.walkTo(goal, onArrive);
    },
    teleportTo: (cell) => {
      const scene = gameRef.current?.scene.getScene('StoreScene') as StoreScene | null;
      scene?.teleportTo(cell);
    },
    setControlsEnabled: (enabled) => {
      const scene = gameRef.current?.scene.getScene('StoreScene') as StoreScene | null;
      scene?.setControlsEnabled(enabled);
    },
    setPlayerVisible: (visible) => {
      const scene = gameRef.current?.scene.getScene('StoreScene') as StoreScene | null;
      scene?.setPlayerVisible(visible);
    },
    getPlayerGrid: () => {
      const scene = gameRef.current?.scene.getScene('StoreScene') as StoreScene | null;
      return scene?.getPlayerGrid() ?? null;
    },
  }));

  // events 안의 콜백들은 App이 리렌더될 때마다 최신 state를 참조하는 새 함수로 바뀐다.
  // 씬 생성 시점에 한 번만 넘기면 그 이후로는 낡은 콜백(stale closure)을 계속 쓰게 되므로,
  // events가 바뀔 때마다 씬에 최신 콜백을 다시 꽂아준다.
  useEffect(() => {
    const scene = gameRef.current?.scene.getScene('StoreScene') as StoreScene | null;
    if (scene) scene.setEvents(events ?? {});
  });

  useEffect(() => {
    // floorData가 처음 채워진 시점(비동기 fetch 완료 후)에 딱 한 번만 게임을 만든다.
    // 이후 층 전환은 ref로 노출된 loadFloor()를 App이 직접 호출해서 처리하므로
    // 여기서는 floorData가 바뀌어도 다시 만들지 않는다.
    if (!containerRef.current || !floorData || gameRef.current) return;
    const scene = new StoreScene();
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: containerRef.current.clientWidth || 800,
      height: containerRef.current.clientHeight || 600,
      backgroundColor: '#f4f1ea',
      scene: [scene],
      physics: { default: undefined },
    });
    gameRef.current.scene.start('StoreScene', { floorData, events });
    sceneReadyRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorData]);

  useEffect(() => {
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
});

export default GameCanvas;
