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
  walkTo: (goal: GridPoint, onArrive?: (success: boolean) => void) => void;
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
      // 캔버스 크기를 컨테이너에 맞춰 늘였다 줄였다 할 수 있게(고정 크기로 박아두면
      // 창이 좁아졌을 때 매장 오른쪽이 캔버스 밖으로 잘려서 안 보이게 된다).
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.NO_CENTER,
      },
    });
    gameRef.current.scene.start('StoreScene', { floorData, events });
    sceneReadyRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorData]);

  // 컨테이너(div) 크기가 바뀔 때마다(창 크기 변경, 사이드패널 토글 등) Phaser 캔버스 자체의
  // 픽셀 크기도 같이 맞춰준다 — Scale.RESIZE 모드는 캔버스 크기를 바꿔주긴 하지만 그 트리거는
  // 우리가 명시적으로 game.scale.resize()를 불러줘야 한다(윈도우 resize 이벤트만으론
  // 부모가 flex로 줄어드는 경우까지 못 잡을 수 있어서 ResizeObserver로 컨테이너 자체를 본다).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      gameRef.current?.scale.resize(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
});

export default GameCanvas;
