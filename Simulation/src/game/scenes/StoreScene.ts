import Phaser from 'phaser';
import type { FloorData, LocationInfo, FacilityInfo, GridPoint } from '../types';
import { Grid, findPath } from '../pathfinding/astar';

const TILE = 16; // 렌더링 타일 크기(px)
const PLAYER_SPEED = 220; // px/sec
const HOLD_MOVE_DELAY = 140; // 방향키를 누르고 있을 때 한 칸 이동 간격(ms)

// Phaser 레이어 쌓임 순서를 display-list 추가 순서가 아니라 명시적으로 고정한다.
// (buildFloor()가 loadFloor()마다 floorTileLayer를 새로 만들면서 pathGraphics보다
// 나중에 추가돼 그 위를 덮어버리는 문제가 있었음 — depth로 고정해서 항상 같은 순서 보장)
const DEPTH_FLOOR_TILE = 0;
const DEPTH_SHELF = 10;
const DEPTH_FACILITY = 20;
const DEPTH_LABEL = 30;
const DEPTH_PATH = 40;
const DEPTH_PLAYER = 1000;

const FACILITY_ICON: Record<string, string> = {
  escalator_up: '⬆️',
  escalator_down: '⬇️',
  elevator: '🛗',
  restroom_male: '🚹',
  restroom_female: '🚺',
  family_restroom: '🚼',
  water: '💧',
};

const FACILITY_COLOR: Record<string, number> = {
  escalator_up: 0x16a34a,
  escalator_down: 0xea580c,
  elevator: 0x334155,
  restroom_male: 0x2563eb,
  restroom_female: 0xdb2777,
  family_restroom: 0x7c3aed,
  water: 0x0891b2,
};

const FACILITY_LABEL: Record<string, string> = {
  escalator_up: '에스컬레이터(상행)',
  escalator_down: '에스컬레이터(하행)',
  elevator: '엘리베이터',
  restroom_male: '남자화장실',
  restroom_female: '여자화장실',
  family_restroom: '가족화장실',
  water: '정수기',
};

export interface StoreSceneEvents {
  // 매대든 빈 칸이든 클릭 자체는 항상 React로 올려보낸다 — "지금 보는 층이 캐릭터의 실제
  // 층이 아니면 걷지 말고 이동수단 선택 팝업을 띄워야 한다"는 판단은 씬이 아니라
  // App(React)이 해야 하기 때문. 씬 내부에서 바로 걷게 하면 이 규칙을 우회하게 된다.
  onTileClick?: (cell: GridPoint, loc: LocationInfo | null) => void;
  onPlayerArrive?: (point: GridPoint) => void;
  onFacilityInteract?: (facility: FacilityInfo) => void;
  // 매대 바로 옆에서 스페이스바 — 그 매대에 진열된 상품 팝업을 띄우라는 신호.
  onLocationInteract?: (loc: LocationInfo) => void;
}

export default class StoreScene extends Phaser.Scene {
  private floorData!: FloorData;
  private grid!: Grid;
  private player!: Phaser.GameObjects.Container;
  private playerGrid: GridPoint = { x: 2, y: 2 };
  private pathGraphics!: Phaser.GameObjects.Graphics;
  private floorTileLayer?: Phaser.GameObjects.Graphics;
  private shelfLayer!: Phaser.GameObjects.Container;
  private labelLayer!: Phaser.GameObjects.Container;
  private facilityLayer!: Phaser.GameObjects.Container;
  private currentPath: GridPoint[] = [];
  private moving = false;
  private controlsEnabled = true; // 프로그램 트립 진행 중에는 키보드 조작을 잠근다
  private events2: StoreSceneEvents = {};
  private locationByCell = new Map<string, LocationInfo>();
  private facilityByCell = new Map<string, FacilityInfo>();
  private lastHoldMoveAt = 0;
  private spaceKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('StoreScene');
  }

  init(data: { floorData: FloorData; events?: StoreSceneEvents }) {
    this.floorData = data.floorData;
    this.events2 = data.events ?? {};
  }

  create() {
    this.cameras.main.setBackgroundColor('#f4f1ea');
    this.buildFloor();

    this.pathGraphics = this.add.graphics();
    this.pathGraphics.setDepth(DEPTH_PATH);
    this.player = this.buildPlayer();
    this.placePlayerAt(this.findEntranceCell());

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) return;
      const gx = Math.floor(pointer.worldX / TILE);
      const gy = Math.floor(pointer.worldY / TILE);
      this.handleTileClick(gx, gy);
    });

    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.spaceKey.on('down', () => this.handleSpacePress());

    this.cameras.main.setZoom(1);
    this.setupCameraDrag();
  }

  // ── 층 전환/트립 진행 중 씬 재사용 ──
  loadFloor(floorData: FloorData, opts?: { startCell?: GridPoint; hidePlayer?: boolean }) {
    this.floorData = floorData;
    this.shelfLayer.destroy();
    this.labelLayer.destroy();
    this.facilityLayer.destroy();
    this.locationByCell.clear();
    this.facilityByCell.clear();
    this.buildFloor();
    this.placePlayerAt(opts?.startCell ?? this.findEntranceCell());
    this.setPlayerVisible(!opts?.hidePlayer);
    this.pathGraphics.clear();
    this.currentPath = [];
    this.moving = false;
  }

  setPlayerVisible(visible: boolean) {
    this.player.setVisible(visible);
  }

  setControlsEnabled(enabled: boolean) {
    this.controlsEnabled = enabled;
  }

  // React 쪽 콜백은 렌더마다 새로 만들어지고 그 안의 state(viewFloor 등)도 바뀌므로,
  // init() 시점에 한 번 캡처한 콜백을 계속 쓰면 stale closure가 된다. 매번 최신 것으로 갈아끼운다.
  setEvents(events: StoreSceneEvents) {
    this.events2 = events;
  }

  // 프로그램에서(트립 orchestration) 특정 좌표로 캐릭터를 걷게 시키는 공개 메서드.
  // 클릭 이동과 동일한 A* + tween 로직을 재사용한다.
  walkTo(goal: GridPoint, onArrive?: () => void) {
    const target = this.grid.nearestWalkableTo(goal) ?? goal;
    const path = findPath(this.grid, this.playerGrid, target);
    if (path.length === 0) {
      onArrive?.();
      return;
    }
    this.currentPath = path.slice(1);
    this.drawPath(path);
    this.pendingArriveCallback = onArrive;
    if (!this.moving) this.advancePath();
  }

  teleportTo(cell: GridPoint) {
    this.placePlayerAt(cell);
  }

  getPlayerGrid(): GridPoint {
    return this.playerGrid;
  }

  private pendingArriveCallback?: () => void;

  private buildFloor() {
    this.grid = new Grid(this.floorData.gridWidth, this.floorData.gridHeight, this.floorData.occupied);
    this.floorTileLayer?.destroy();
    this.floorTileLayer = this.add.graphics();
    this.floorTileLayer.setDepth(DEPTH_FLOOR_TILE);
    this.shelfLayer = this.add.container(0, 0);
    this.labelLayer = this.add.container(0, 0);
    this.facilityLayer = this.add.container(0, 0);
    this.shelfLayer.setDepth(DEPTH_SHELF);
    this.labelLayer.setDepth(DEPTH_LABEL);
    this.facilityLayer.setDepth(DEPTH_FACILITY);

    const worldW0 = this.floorData.gridWidth * TILE;
    const worldH0 = this.floorData.gridHeight * TILE;
    // 바닥 타일 느낌을 살짝 주는 체크무늬 배경 (밋밋한 단색보다 매장 바닥처럼 보이게)
    this.floorTileLayer.fillStyle(0xefece2, 1);
    this.floorTileLayer.fillRect(0, 0, worldW0, worldH0);
    this.floorTileLayer.fillStyle(0xe8e4d8, 1);
    for (let gy = 0; gy < this.floorData.gridHeight; gy++) {
      for (let gx = 0; gx < this.floorData.gridWidth; gx++) {
        if ((gx + gy) % 2 === 0) this.floorTileLayer.fillRect(gx * TILE, gy * TILE, TILE, TILE);
      }
    }
    this.floorTileLayer.lineStyle(1, 0xd8d3c2, 0.5);
    for (let gx = 0; gx <= this.floorData.gridWidth; gx += 5) {
      this.floorTileLayer.lineBetween(gx * TILE, 0, gx * TILE, worldH0);
    }
    for (let gy = 0; gy <= this.floorData.gridHeight; gy += 5) {
      this.floorTileLayer.lineBetween(0, gy * TILE, worldW0, gy * TILE);
    }

    const zoneById = new Map(this.floorData.zones.map((z) => [z.zoneId, z]));

    for (const loc of this.floorData.locations) {
      this.locationByCell.set(`${loc.x},${loc.y}`, loc);
      const zone = zoneById.get(loc.zoneId);
      const color = zone ? Phaser.Display.Color.HexStringToColor(zone.color).color : 0xcccccc;
      const c = Phaser.Display.Color.ValueToColor(color);
      const darker = Phaser.Display.Color.GetColor(
        Math.max(0, c.red - 55),
        Math.max(0, c.green - 55),
        Math.max(0, c.blue - 55)
      );
      const cx = loc.x * TILE + TILE / 2;
      const cy = loc.y * TILE + TILE / 2;
      // 은은한 그림자 → 살짝 어두운 테두리 → 본체 → 위쪽 하이라이트 줄, 순서로 쌓아서
      // 밋밋한 단색 사각형보다 "매대"처럼 입체감 있게 보이도록 함.
      const shadow = this.add.rectangle(cx + 1, cy + 1.5, TILE - 2, TILE - 2, 0x000000, 0.12);
      const rect = this.add.rectangle(cx, cy, TILE - 2, TILE - 2, color);
      rect.setStrokeStyle(1, darker, 0.9);
      const highlight = this.add.rectangle(cx, cy - TILE / 2 + 2.5, TILE - 4, 2, 0xffffff, 0.35);
      this.shelfLayer.add(shadow);
      this.shelfLayer.add(rect);
      this.shelfLayer.add(highlight);
    }

        // 존 라벨은 배열에서 "그 존의 첫 번째 매대"가 아니라, 그 존에 속한 모든 매대의
    // 실제 바운딩박스 좌측 상단(min-x, min-y)을 계산해서 그 자리에 둔다 — 배열 순서상
    // 우연히 존 오른쪽 끝의 매대가 먼저 나오면 라벨이 매대 한복판에 찍히던 버그를 근본적으로 막는다.
    const zoneBBox = new Map<string, { minX: number; minY: number }>();
    for (const loc of this.floorData.locations) {
      const b = zoneBBox.get(loc.zoneId);
      if (!b) zoneBBox.set(loc.zoneId, { minX: loc.x, minY: loc.y });
      else {
        b.minX = Math.min(b.minX, loc.x);
        b.minY = Math.min(b.minY, loc.y);
      }
    }
        // 라벨 텍스트는 한 칸(TILE)보다 훨씬 넓기 때문에, 앵커 칸 하나만 비어있는지 보는 걸로는
    // 부족하다 — 실제로 텍스트가 깔릴 가로 폭(대략 9칸) 전체가 매대로 막혀있지 않은지 확인해야
    // 진짜로 안 겹친다. 그리고 존의 맨 왼쪽 칼럼(b.minX)은 매장 데이터상 여러 존에 걸쳐 위아래로
    // 끊김없이 매대로 차 있는 "고정 랙 칼럼"이라(층 전체를 관통하는 구조) 그 칸 위에는 어떤 행을
    // 골라도 항상 매대 색이 깔려 있다 — 그래서 검사에서 제외하는 것뿐 아니라, 라벨을 그리는
    // x좌표 자체도 그 칼럼 바로 다음 칸(minX+1)부터 시작하도록 옮겨서 라벨 왼쪽 끝이 그 매대
    // 위에 겹쳐 찍히는 걸 막는다.
    const LABEL_SPAN = 9; // 라벨 텍스트가 대략 차지하는 칸 수
    for (const zone of this.floorData.zones) {
      const b = zoneBBox.get(zone.zoneId);
      if (!b) continue;
      const labelX = b.minX + 1;
      const isRowClear = (row: number) => {
        for (let x = labelX; x < labelX + LABEL_SPAN; x++) {
          if (!this.grid.isWalkable(x, row)) return false;
        }
        return true;
      };
      // 존의 좌측 상단 바로 위 행부터, 라벨이 깔릴 가로 폭 전체가 매대로 막혀있지 않은 행을
      // 만날 때까지 한 칸씩 위로 올라가며 찾는다.
      let labelRow = b.minY - 1;
      let guard = 0;
      while (labelRow >= 0 && !isRowClear(labelRow) && guard < 10) {
        labelRow--;
        guard++;
      }
      // 그래도 못 찾았으면(매장 맨 위 벽에 닿는 등) 원래 자리로 되돌린다 — 탐색 중 엉뚱한
      // 매대 위에 멈춰있는 상태로 남지 않도록.
      if (labelRow < 0 || !isRowClear(labelRow)) labelRow = Math.max(0, b.minY - 1);
      const txt = this.add.text(labelX * TILE, labelRow * TILE, `${zone.letter} ${zone.label}`, {
        fontSize: '10px',
        color: '#333333',
        backgroundColor: '#ffffffaa',
        padding: { x: 2, y: 1 },
      });
      this.labelLayer.add(txt);
    }

    for (const fac of this.floorData.facilities ?? []) {
      this.facilityByCell.set(`${fac.x},${fac.y}`, fac);
      const fx = fac.x * TILE + TILE / 2;
      const fy = fac.y * TILE + TILE / 2;
      const shadow = this.add.circle(fx + 1, fy + 1.5, TILE * 0.55, 0x000000, 0.15);
      const bg = this.add.circle(fx, fy, TILE * 0.55, FACILITY_COLOR[fac.type] ?? 0x1f2937, 0.92);
      bg.setStrokeStyle(1.5, 0xffffff, 0.7);
      const icon = this.add.text(fx, fy, FACILITY_ICON[fac.type] ?? '?', { fontSize: '14px' });
      icon.setOrigin(0.5);
      // 엘리베이터/에스컬레이터(상행)/에스컬레이터(하행)가 한 줄에 나란히 붙어있어서
      // 라벨을 같은 높이에 두면 옆칸 라벨과 겹친다 — 종류별로 다른 높이(tier)에 배치해서 피한다.
      const LABEL_TIER: Record<string, number> = { elevator: -2, escalator_up: -1, escalator_down: 1 };
      const tier = LABEL_TIER[fac.type] ?? 1; // 기본: 바로 아래
      const labelY = fy + Math.sign(tier) * (TILE * 0.55 + 2 + (Math.abs(tier) - 1) * 12);
      const label = this.add.text(fx, labelY, FACILITY_LABEL[fac.type] ?? fac.type, {
        fontSize: '9px',
        color: '#1f2937',
        backgroundColor: '#ffffffcc',
        padding: { x: 2, y: 1 },
      });
      label.setOrigin(0.5, tier < 0 ? 1 : 0);
      this.facilityLayer.add(shadow);
      this.facilityLayer.add(bg);
      this.facilityLayer.add(icon);
      this.facilityLayer.add(label);
    }

    const worldW = this.floorData.gridWidth * TILE;
    const worldH = this.floorData.gridHeight * TILE;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
  }

  private buildPlayer(): Phaser.GameObjects.Container {
    const shadow = this.add.ellipse(0, 6, 12, 5, 0x000000, 0.25);
    const body = this.add.circle(0, 0, 6, 0x3b82f6);
    body.setStrokeStyle(1.5, 0x1d4ed8, 1);
    const bodyHighlight = this.add.circle(-2, -2, 2, 0xbfdbfe, 0.8);
    const head = this.add.circle(0, -8, 4.5, 0xfbcfe8);
    head.setStrokeStyle(1, 0xf0abc4, 1);
    const c = this.add.container(0, 0, [shadow, body, bodyHighlight, head]);
    c.setDepth(DEPTH_PLAYER);
    return c;
  }

  private findEntranceCell(): GridPoint {
    for (let y = this.floorData.gridHeight - 1; y >= 0; y--) {
      for (let x = 0; x < 10; x++) {
        if (this.grid.isWalkable(x, y)) return { x, y };
      }
    }
    return { x: 1, y: 1 };
  }

  private placePlayerAt(cell: GridPoint) {
    this.playerGrid = cell;
    this.player.setPosition(cell.x * TILE + TILE / 2, cell.y * TILE + TILE / 2);
  }

  private handleTileClick(gx: number, gy: number) {
    if (!this.controlsEnabled) return;
    const loc = this.locationByCell.get(`${gx},${gy}`) ?? null;
    // 실제로 걷게 할지(같은 층) 트립 팝업을 띄울지(다른 층)는 App이 결정한다.
    this.events2.onTileClick?.({ x: gx, y: gy }, loc);
  }

  private handleSpacePress() {
    if (!this.controlsEnabled) return;
    const fac = this.facilityByCell.get(`${this.playerGrid.x},${this.playerGrid.y}`);
    if (fac) {
      this.events2.onFacilityInteract?.(fac);
      return;
    }
    // 시설물이 없으면 바로 옆(4방향) 매대를 찾아본다 — "매대 앞에서 스페이스바".
    const deltas = [
      [0, -1], [0, 1], [-1, 0], [1, 0],
    ];
    for (const [dx, dy] of deltas) {
      const loc = this.locationByCell.get(`${this.playerGrid.x + dx},${this.playerGrid.y + dy}`);
      if (loc) {
        this.events2.onLocationInteract?.(loc);
        return;
      }
    }
  }

  private drawPath(path: GridPoint[]) {
    this.pathGraphics.clear();
    this.pathGraphics.lineStyle(3, 0x22c55e, 0.8);
    this.pathGraphics.beginPath();
    path.forEach((p, i) => {
      const px = p.x * TILE + TILE / 2;
      const py = p.y * TILE + TILE / 2;
      if (i === 0) this.pathGraphics.moveTo(px, py);
      else this.pathGraphics.lineTo(px, py);
    });
    this.pathGraphics.strokePath();
  }

  private advancePath() {
    if (this.currentPath.length === 0) {
      this.moving = false;
      this.pathGraphics.clear();
      this.events2.onPlayerArrive?.(this.playerGrid);
      const cb = this.pendingArriveCallback;
      this.pendingArriveCallback = undefined;
      cb?.();
      return;
    }
    this.moving = true;
    const next = this.currentPath.shift()!;
    const targetX = next.x * TILE + TILE / 2;
    const targetY = next.y * TILE + TILE / 2;
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, targetX, targetY);
    const duration = (dist / PLAYER_SPEED) * 1000;
    this.tweens.add({
      targets: this.player,
      x: targetX,
      y: targetY,
      duration: Math.max(duration, 40),
      onComplete: () => {
        this.playerGrid = next;
        this.advancePath();
      },
    });
  }

  // 방향키를 누르고 있는 동안 계속 이동 — JustDown이 아니라 isDown + 간격 타이머로 반복 이동
  update(time: number) {
    if (!this.controlsEnabled || this.moving) return;
    const cursors = this.input.keyboard?.createCursorKeys();
    if (!cursors) return;

    let dx = 0, dy = 0;
    if (cursors.left?.isDown) dx = -1;
    else if (cursors.right?.isDown) dx = 1;
    else if (cursors.up?.isDown) dy = -1;
    else if (cursors.down?.isDown) dy = 1;
    if (dx === 0 && dy === 0) return;

    if (time - this.lastHoldMoveAt < HOLD_MOVE_DELAY) return;
    this.lastHoldMoveAt = time;

    const nx = this.playerGrid.x + dx;
    const ny = this.playerGrid.y + dy;
    if (!this.grid.isWalkable(nx, ny)) return;
    this.currentPath = [{ x: nx, y: ny }];
    this.advancePath();
  }

  private setupCameraDrag() {
    let dragging = false;
    let start = { x: 0, y: 0 };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) {
        dragging = true;
        start = { x: p.x, y: p.y };
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!dragging) return;
      this.cameras.main.scrollX -= (p.x - start.x) / this.cameras.main.zoom;
      this.cameras.main.scrollY -= (p.y - start.y) / this.cameras.main.zoom;
      start = { x: p.x, y: p.y };
    });
    this.input.on('pointerup', () => (dragging = false));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.5, 2.5);
      this.cameras.main.setZoom(zoom);
    });
  }
}
