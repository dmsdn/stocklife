import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { ChangeEvent } from 'react';
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
    // 장바구니 추천 동선을 파란 선으로 표시/제거한다. drawRoute는 전 구간이 다 이어졌으면 true.
    drawRoute: (waypoints: GridPoint[]) => boolean;
    clearRoute: () => void;
    setControlsEnabled: (enabled: boolean) => void;
    setPlayerVisible: (visible: boolean) => void;
    getPlayerGrid: () => GridPoint | null;
    // 하단/우측 드래그바(가로·세로 스크롤) 지원용 — StoreScene.getScrollInfo()/setScrollX()
    // /setScrollY() 그대로 위임.
    getScrollInfo: () => {
        scrollX: number; minX: number; maxX: number; worldWidth: number; viewWidth: number;
        scrollY: number; minY: number; maxY: number; worldHeight: number; viewHeight: number;
    } | null;
    setScrollX: (x: number) => void;
    setScrollY: (y: number) => void;
    // 09-03: 플레이어 머리 위 이름표(휴대폰 뒷번호/비로그인 표시) — App.tsx가 로그인 상태
    // 바뀔 때마다 호출한다.
    setPlayerLabel: (text: string) => void;
}

const GameCanvas = forwardRef<GameCanvasHandle, Props>(function GameCanvas({ floorData, events }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Phaser.Game | null>(null);
    const sceneReadyRef = useRef(false);

    // ── 하단 가로 드래그바(줌인했을 때 좌우 이동용) ──
    // Phaser 캔버스 위에 얹는 얇은 HTML <input type="range"> 오버레이다. 매 프레임
    // requestAnimationFrame으로 카메라 스크롤 위치를 읽어 슬라이더 값에 반영하고(우클릭
    // 드래그·휠 줌으로 카메라가 움직여도 항상 동기화), 슬라이더를 직접 끌면 반대로
    // StoreScene.setScrollX()를 불러 카메라를 옮긴다. React state로 매 프레임 리렌더하면
    // 느려지므로 DOM에 직접 값을 꽂아 넣는다.
    const scrollBarWrapRef = useRef<HTMLDivElement>(null);
    const sliderRef = useRef<HTMLInputElement>(null);
    const draggingScrollRef = useRef(false);
    // 우측 세로 드래그바(위아래 이동)도 같은 원리 — 별도 ref/상태로 관리한다.
    const vScrollBarWrapRef = useRef<HTMLDivElement>(null);
    const vSliderRef = useRef<HTMLInputElement>(null);
    const draggingVScrollRef = useRef(false);
    const SLIDER_MAX = 1000;
    // 세로 슬라이더는 writingMode:'vertical-lr' + direction:'rtl'로 눕혀 쓰는데, 이 조합에서는
    // "값이 클수록 막대 위쪽"이 된다. 우리는 "막대 위쪽 = 지도 맨 위(scrollY 최솟값)"가 되길
    // 원하므로 값을 뒤집어서 매핑한다 — 만약 실제로 켜보니 방향이 반대로 느껴지면 이 한 줄만
    // false로 바꾸면 된다.
    const INVERT_VERTICAL = true;

    const getSceneScrollInfo = () => {
        const scene = gameRef.current?.scene.getScene('StoreScene') as StoreScene | null;
        return scene?.getScrollInfo() ?? null;
    };
    const setSceneScrollX = (x: number) => {
        const scene = gameRef.current?.scene.getScene('StoreScene') as StoreScene | null;
        scene?.setScrollX(x);
    };
    const setSceneScrollY = (y: number) => {
        const scene = gameRef.current?.scene.getScene('StoreScene') as StoreScene | null;
        scene?.setScrollY(y);
    };

    const handleScrollBarInput = (e: ChangeEvent<HTMLInputElement>) => {
        const info = getSceneScrollInfo();
        if (!info) return;
        const frac = Number(e.target.value) / SLIDER_MAX;
        setSceneScrollX(info.minX + frac * (info.maxX - info.minX));
    };

    const handleVScrollBarInput = (e: ChangeEvent<HTMLInputElement>) => {
        const info = getSceneScrollInfo();
        if (!info) return;
        let frac = Number(e.target.value) / SLIDER_MAX;
        if (INVERT_VERTICAL) frac = 1 - frac;
        setSceneScrollY(info.minY + frac * (info.maxY - info.minY));
    };

    useEffect(() => {
        const onUp = () => {
            draggingScrollRef.current = false;
            draggingVScrollRef.current = false;
        };
        window.addEventListener('pointerup', onUp);

        let raf = 0;
        const tick = () => {
            const info = getSceneScrollInfo();
            const wrap = scrollBarWrapRef.current;
            const slider = sliderRef.current;
            if (wrap) {
                // 확대하지 않아 화면에 매장 전체가 다 보이면(움직일 여백이 1px도 없으면) 드래그바를 숨긴다.
                const scrollable = !!info && info.maxX - info.minX > 1;
                wrap.style.opacity = scrollable ? '1' : '0';
                wrap.style.pointerEvents = scrollable ? 'auto' : 'none';
                if (scrollable && slider && !draggingScrollRef.current && info) {
                    const frac = (info.scrollX - info.minX) / (info.maxX - info.minX);
                    slider.value = String(Math.round(Math.min(1, Math.max(0, frac)) * SLIDER_MAX));
                }
            }
            const vWrap = vScrollBarWrapRef.current;
            const vSlider = vSliderRef.current;
            if (vWrap) {
                const scrollableV = !!info && info.maxY - info.minY > 1;
                vWrap.style.opacity = scrollableV ? '1' : '0';
                vWrap.style.pointerEvents = scrollableV ? 'auto' : 'none';
                if (scrollableV && vSlider && !draggingVScrollRef.current && info) {
                    let frac = (info.scrollY - info.minY) / (info.maxY - info.minY);
                    frac = Math.min(1, Math.max(0, frac));
                    if (INVERT_VERTICAL) frac = 1 - frac;
                    vSlider.value = String(Math.round(frac * SLIDER_MAX));
                }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('pointerup', onUp);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        drawRoute: (waypoints) => {
            const scene = gameRef.current?.scene.getScene('StoreScene') as StoreScene | null;
            return scene?.drawRoute(waypoints) ?? false;
        },
        clearRoute: () => {
            const scene = gameRef.current?.scene.getScene('StoreScene') as StoreScene | null;
            scene?.clearRoute();
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
        getScrollInfo: () => {
            const scene = gameRef.current?.scene.getScene('StoreScene') as StoreScene | null;
            return scene?.getScrollInfo() ?? null;
        },
        setScrollX: (x) => {
            const scene = gameRef.current?.scene.getScene('StoreScene') as StoreScene | null;
            scene?.setScrollX(x);
        },
        setScrollY: (y) => {
            const scene = gameRef.current?.scene.getScene('StoreScene') as StoreScene | null;
            scene?.setScrollY(y);
        },
        setPlayerLabel: (text) => {
            const scene = gameRef.current?.scene.getScene('StoreScene') as StoreScene | null;
            scene?.setPlayerLabel(text);
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
        // Phaser.Scale.RESIZE 모드는 <canvas>에 CSS width/height를 직접 입혀주지 않는다 —
        // 캔버스는 자기 width/height "속성"(비트맵 해상도) 값을 그대로 CSS 픽셀 크기로도 쓴다.
        // 그런데 이 속성 값과 컨테이너의 실제 clientWidth/Height가 아주 살짝(반올림 오차 몇 px)
        // 어긋나면 — 특히 성원님 컴퓨터처럼 윈도우 배율이 100%가 아닐 때(예: 175%) 자주 생김 —
        // 캔버스가 부모보다 미세하게 커져서 부모(및 그 위 flex 조상들)를 다시 밀어 키우고, 그게
        // ResizeObserver를 또 건드려서 Phaser가 또 리사이즈하고... 하는 식으로 서로 되먹임이
        // 걸린다. 이게 "확대/축소가 계속 반복되는 것처럼 보이고 화면이 까맣게 된다"는 증상의
        // 진짜 원인이었다(캔버스가 리사이즈되는 그 찰나엔 WebGL이 아직 다시 그리기 전이라 검게
        // 보임). 고치는 법은 간단하다 — 캔버스의 CSS 크기를 Phaser의 내부 계산에 맡기지 않고
        // "항상 부모 100%"로 못박아버리면, 되먹임 루프 자체가 생길 수가 없다.
        gameRef.current.canvas.style.display = 'block';
        gameRef.current.canvas.style.width = '100%';
        gameRef.current.canvas.style.height = '100%';
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

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
            <div
                ref={scrollBarWrapRef}
                style={{
                    position: 'absolute',
                    left: 12,
                    right: 34,
                    bottom: 10,
                    height: 16,
                    display: 'flex',
                    alignItems: 'center',
                    background: '#1e2128cc',
                    border: '1px solid #3a3f4b',
                    borderRadius: 8,
                    padding: '0 6px',
                    opacity: 0,
                    transition: 'opacity 0.15s ease',
                }}
            >
                <input
                    ref={sliderRef}
                    type="range"
                    min={0}
                    max={SLIDER_MAX}
                    defaultValue={0}
                    onPointerDown={() => {
                        draggingScrollRef.current = true;
                    }}
                    onInput={handleScrollBarInput}
                    onChange={handleScrollBarInput}
                    style={{ width: '100%', accentColor: '#60a5fa', cursor: 'pointer' }}
                    aria-label="맵 좌우 이동"
                />
            </div>
            <div
                ref={vScrollBarWrapRef}
                style={{
                    position: 'absolute',
                    top: 12,
                    bottom: 34,
                    right: 10,
                    width: 16,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    background: '#1e2128cc',
                    border: '1px solid #3a3f4b',
                    borderRadius: 8,
                    padding: '6px 0',
                    opacity: 0,
                    transition: 'opacity 0.15s ease',
                }}
            >
                <input
                    ref={vSliderRef}
                    type="range"
                    min={0}
                    max={SLIDER_MAX}
                    defaultValue={0}
                    onPointerDown={() => {
                        draggingVScrollRef.current = true;
                    }}
                    onInput={handleVScrollBarInput}
                    onChange={handleVScrollBarInput}
                    style={{
                        writingMode: 'vertical-lr',
                        direction: 'rtl',
                        height: '100%',
                        accentColor: '#60a5fa',
                        cursor: 'pointer',
                    }}
                    aria-label="맵 상하 이동"
                />
            </div>
        </div>
    );
});

export default GameCanvas;