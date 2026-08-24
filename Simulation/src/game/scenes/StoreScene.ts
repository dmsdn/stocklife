import Phaser from 'phaser';
import type { FloorData, LocationInfo, FacilityInfo, GridPoint } from '../types';
import { Grid, findPath } from '../pathfinding/astar';
import { fetchProductsAtLocation, adjustStock } from '../../api/products';
import { confirmRestock } from '../../api/locations';

const TILE = 16; // 렌더링 타일 크기(px)
const PLAYER_SPEED = 220; // px/sec
const HOLD_MOVE_DELAY = 140; // 방향키를 누르고 있을 때 한 칸 이동 간격(ms)

// ── NPC(재고 담당 직원) 관련 상수 ──
// NPC는 "지하 창고에서 물건을 받아 각 층 매대로 배달"하는 흐름을 표현한다 — 실제로 B1 씬까지
// 오가는 건 아니고(한 번에 한 층만 씬에 로드되는 구조라서), 그 층의 엘리베이터 앞을 "지하
// 창고 반입구"로 삼아 NPC가 매번 그 자리를 거쳐서 매대로 이동하는 것으로 연출한다.
const NPC_COUNT = 3; // 층당 동시에 돌아다니는 직원 수
const NPC_SPEED = 1000; // px/sec — 요청에 따라 최대 속도로 설정(플레이어 220의 약 4.5배)
const LOW_STOCK_THRESHOLD = 5; // 이 재고 미만이면 "재입고 필요"로 판단
const RESTOCK_QTY = 15; // 한 번 재입고할 때 채워 넣는 수량
const NPC_RESTOCK_PAUSE_MS = 500; // 재입고 후 잠깐 멈춰있는 연출용 딜레이
const NPC_WAREHOUSE_PAUSE_MS = 300; // 창고 반입구에서 재고 싣는 연출용 딜레이
const NPC_IDLE_WAIT_MS = 1200; // 재입고할 매대가 없을 때 배회 후 재확인까지 대기 시간

// Phaser 레이어 쌓임 순서를 display-list 추가 순서가 아니라 명시적으로 고정한다.
// (buildFloor()가 loadFloor()마다 floorTileLayer를 새로 만들면서 pathGraphics보다
// 나중에 추가돼 그 위를 덮어버리는 문제가 있었음 — depth로 고정해서 항상 같은 순서 보장)
const DEPTH_FLOOR_TILE = 0;
const DEPTH_SHELF = 10;
const DEPTH_FACILITY = 20;
const DEPTH_LABEL = 30;
const DEPTH_PATH = 40;
const DEPTH_NPC = 900;
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

// 재고를 채우러 다니는 직원 NPC 한 명의 상태. 플레이어(this.playerGrid/currentPath/moving)와
// 똑같은 구조지만 여러 명이 동시에 독립적으로 움직여야 해서 배열로 관리한다.
interface NpcAgent {
  container: Phaser.GameObjects.Container;
  gridPos: GridPoint;
  path: GridPoint[];
  moving: boolean;
}

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

  // ── NPC(재입고 직원) 상태 ──
  // loadFloor()로 층이 바뀔 때마다 그 층 소속 NPC를 새로 만들고 이전 NPC의 비동기 루프는
  // "세대(generation)" 번호로 무효화한다 — setTimeout/tween 콜백이 완료되는 시점엔 이미
  // 다른 층으로 넘어가 있을 수 있어서, 단순 destroy만으로는 콜백이 옛 데이터를 참조하는 걸
  // 막을 수 없기 때문.
  private npcs: NpcAgent[] = [];
  private npcGeneration = 0;
  private claimedTargets = new Set<string>(); // 이미 다른 NPC가 향하고 있는 "locationId::skuId"
  private npcScanQueue: Promise<unknown> = Promise.resolve(); // 재고 스캔을 한 번에 하나씩만(동시에 같은 매대를 집지 않도록)
  private npcHomeCell: GridPoint = { x: 0, y: 0 }; // 이번 층의 "지하 창고 반입구"로 삼는 지점(엘리베이터 앞)
  private npcHomeMarker?: Phaser.GameObjects.Text;

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
    this.spawnNpcs(NPC_COUNT);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) return;
      const gx = Math.floor(pointer.worldX / TILE);
      const gy = Math.floor(pointer.worldY / TILE);
      this.handleTileClick(gx, gy);
    });

    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.spaceKey.on('down', () => this.handleSpacePress());

    this.fitCameraToWorld();
    this.setupCameraDrag();
    // 브라우저 창 크기가 바뀌면(캔버스 컨테이너 크기 변경 포함) 항상 매장 전체가
    // 다시 화면에 들어오도록 재조정한다 — 그렇지 않으면 창이 좁을 때 매장 오른쪽
    // (화장실/엘리베이터/에스컬레이터 등)이 화면 밖으로 잘려 나가 안 보이게 된다.
    this.scale.on('resize', () => this.fitCameraToWorld());
  }

  // 매장 전체 폭/높이가 지금 캔버스 크기에 다 들어오도록 줌을 자동으로 맞추고 가운데 정렬한다.
  // (수동 휠 줌/드래그는 이후에도 계속 가능 — 이건 "처음 봤을 때 잘리지 않게"를 위한 기본값일 뿐)
  private fitCameraToWorld() {
    if (!this.floorData) return;
    const worldW = this.floorData.gridWidth * TILE;
    const worldH = this.floorData.gridHeight * TILE;
    const canvasW = this.scale.width || worldW;
    const canvasH = this.scale.height || worldH;
    const zoom = Phaser.Math.Clamp(Math.min(canvasW / worldW, canvasH / worldH), 0.15, 3);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(worldW / 2, worldH / 2);
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
    this.spawnNpcs(NPC_COUNT);
    this.fitCameraToWorld();
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

  // 플레이어와 구분되도록 안전조끼 색(주황) + 짙은 모자 + "직원" 태그를 단 캐릭터.
  private buildNpcVisual(): Phaser.GameObjects.Container {
    const shadow = this.add.ellipse(0, 6, 12, 5, 0x000000, 0.25);
    const body = this.add.circle(0, 0, 6, 0xf59e0b);
    body.setStrokeStyle(1.5, 0xb45309, 1);
    const vestStripe = this.add.rectangle(0, 1, 8, 3, 0xfef3c7, 0.85);
    const head = this.add.circle(0, -8, 4.5, 0x4b5563);
    head.setStrokeStyle(1, 0x374151, 1);
    const tag = this.add.text(0, -18, '직원', {
      fontSize: '8px',
      color: '#78350f',
      backgroundColor: '#fef3c7cc',
      padding: { x: 2, y: 0 },
    });
    tag.setOrigin(0.5);
    const c = this.add.container(0, 0, [shadow, body, vestStripe, head, tag]);
    c.setDepth(DEPTH_NPC);
    return c;
  }

  private randomWalkableCell(): GridPoint {
    for (let i = 0; i < 200; i++) {
      const x = Phaser.Math.Between(0, this.floorData.gridWidth - 1);
      const y = Phaser.Math.Between(0, this.floorData.gridHeight - 1);
      if (this.grid.isWalkable(x, y)) return { x, y };
    }
    return this.findEntranceCell();
  }

  // 재입고할 매대가 없을 때 NPC가 창고 반입구 근처에서 배회하도록 — 매장 전체를 정처 없이
  // 돌아다니는 것보다 "대기 중인 직원"처럼 보인다.
  private randomWalkableCellNear(center: GridPoint, radius: number): GridPoint {
    for (let i = 0; i < 50; i++) {
      const x = Phaser.Math.Clamp(
        center.x + Phaser.Math.Between(-radius, radius),
        0,
        this.floorData.gridWidth - 1
      );
      const y = Phaser.Math.Clamp(
        center.y + Phaser.Math.Between(-radius, radius),
        0,
        this.floorData.gridHeight - 1
      );
      if (this.grid.isWalkable(x, y)) return { x, y };
    }
    return center;
  }

  // 이번 층에 재입고 직원 NPC를 새로 배치하고, 각자 독립적인 순찰/재입고 루프를 시작시킨다.
  // 층 전환 등으로 이전 NPC가 남아있으면 정리하고, generation을 올려서 옛 NPC의 진행 중인
  // 비동기 루프(이동/대기 콜백)가 계속 살아있더라도 더 이상 동작하지 않도록 만든다.
  private spawnNpcs(count: number) {
    this.npcGeneration++;
    const gen = this.npcGeneration;
    for (const npc of this.npcs) npc.container.destroy();
    this.npcs = [];
    this.claimedTargets.clear();

    // 이번 층의 "지하 창고 반입구" 지점 — 엘리베이터가 있으면 그 앞, 없으면(예: 도면상
    // 엘리베이터가 없는 층) 매장 입구로 대체한다. NPC는 매번 이 지점을 거쳐서 매대로 간다.
    const elevatorFac = (this.floorData.facilities ?? []).find((f) => f.type === 'elevator');
    const homeGoal = elevatorFac ? { x: elevatorFac.x, y: elevatorFac.y } : this.findEntranceCell();
    this.npcHomeCell = this.grid.nearestWalkableTo(homeGoal) ?? homeGoal;

    this.npcHomeMarker?.destroy();
    this.npcHomeMarker = this.add
      .text(this.npcHomeCell.x * TILE + TILE / 2, this.npcHomeCell.y * TILE - 2, '🚚 지하 창고 반입구', {
        fontSize: '9px',
        color: '#78350f',
        backgroundColor: '#fef3c7cc',
        padding: { x: 2, y: 0 },
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_NPC);

    for (let i = 0; i < count; i++) {
      const cell = this.npcHomeCell;
      const container = this.buildNpcVisual();
      container.setPosition(cell.x * TILE + TILE / 2, cell.y * TILE + TILE / 2);
      const npc: NpcAgent = { container, gridPos: cell, path: [], moving: false };
      this.npcs.push(npc);
      this.runNpcLoop(npc, gen);
    }
  }

  // 플레이어의 walkTo와 동일한 A* + 셀 단위 tween 방식이지만, NPC별로 독립된 상태(gridPos/path)를
  // 쓰고 Promise로 "도착"을 알려줘서 async 루프(runNpcLoop) 안에서 await로 이어 쓸 수 있게 한다.
  private npcMoveTo(npc: NpcAgent, goal: GridPoint, gen: number): Promise<void> {
    return new Promise((resolve) => {
      const target = this.grid.nearestWalkableTo(goal) ?? goal;
      const path = findPath(this.grid, npc.gridPos, target);
      if (path.length === 0) {
        resolve();
        return;
      }
      npc.path = path.slice(1);
      const step = () => {
        if (gen !== this.npcGeneration) {
          resolve();
          return;
        }
        if (npc.path.length === 0) {
          npc.moving = false;
          resolve();
          return;
        }
        npc.moving = true;
        const next = npc.path.shift()!;
        const tx = next.x * TILE + TILE / 2;
        const ty = next.y * TILE + TILE / 2;
        const dist = Phaser.Math.Distance.Between(npc.container.x, npc.container.y, tx, ty);
        const duration = Math.max((dist / NPC_SPEED) * 1000, 40);
        this.tweens.add({
          targets: npc.container,
          x: tx,
          y: ty,
          duration,
          onComplete: () => {
            npc.gridPos = next;
            step();
          },
        });
      };
      step();
    });
  }

  // 현재 층의 매대를 훑어서 재고가 LOW_STOCK_THRESHOLD 미만인 상품이 하나라도 있는 매대를 찾는다.
  // 그 매대에 재고 부족한 상품이 여러 개면(skuId 여러 개) 한 번에 다 담아 온다 — 매대 단위로
  // 선점(claim)하기 때문에, 상품 단위로 선점했을 때처럼 서로 다른 NPC가 "같은 매대의 다른
  // 상품"을 노리다가 결과적으로 한 매대에 몰리는 걸 막을 수 있다.
  // 매번 배열 순서대로만 훑으면 여러 NPC가 항상 앞쪽의 같은 매대부터 보게 되어 몰리기 쉬우므로,
  // 스캔 시작 지점을 매번 무작위로 돌려서(원형 탐색) 어떤 매대를 먼저 발견할지 분산시킨다.
  private async findLowStockTarget(): Promise<{ loc: LocationInfo; skuIds: number[] } | null> {
    const zoneById = new Map(this.floorData.zones.map((z) => [z.zoneId, z]));
    const locations = this.floorData.locations;
    const offset = Phaser.Math.Between(0, Math.max(0, locations.length - 1));
    for (let i = 0; i < locations.length; i++) {
      const loc = locations[(offset + i) % locations.length];
      if (this.claimedTargets.has(loc.locationId)) continue;
      const zone = zoneById.get(loc.zoneId);
      const products = await fetchProductsAtLocation(loc, zone?.label ?? loc.zoneId);
      const lowSkus = products.filter((p) => p.stock < LOW_STOCK_THRESHOLD).map((p) => p.skuId);
      if (lowSkus.length > 0) {
        return { loc, skuIds: lowSkus };
      }
    }
    return null;
  }

  // 여러 NPC가 동시에 findLowStockTarget을 부르면 같은 매대를 "먼저" 찾을 수 있으므로,
  // 스캔+선점(claim)을 큐로 직렬화해서 한 번에 한 NPC만 매대를 고르게 한다.
  private claimLowStockTarget(): Promise<{ loc: LocationInfo; skuIds: number[] } | null> {
    const run = this.npcScanQueue.then(() => this.findLowStockTarget());
    this.npcScanQueue = run.catch(() => null);
    return run.then((target) => {
      if (target) this.claimedTargets.add(target.loc.locationId);
      return target;
    });
  }

  private showRestockBubble(npc: NpcAgent, text: string) {
    const t = this.add
      .text(npc.container.x, npc.container.y - 16, text, {
        fontSize: '10px',
        color: '#16a34a',
        backgroundColor: '#ffffffcc',
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_NPC + 1);
    this.tweens.add({ targets: t, y: t.y - 14, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, () => resolve()));
  }

  // NPC 한 명의 배달 루프: "재고 부족한 매대 찾기 → 지하 창고 반입구에서 물건 싣기 →
  // 그 매대까지 배달 → 재입고 → 잠깐 대기 → 반복". 재입고할 매대가 없으면 반입구 근처에서
  // 대기하다가 다시 확인한다. gen이 바뀌면(층 전환 등) 즉시 멈춘다.
  private async runNpcLoop(npc: NpcAgent, gen: number) {
    if (gen !== this.npcGeneration) return;
    const target = await this.claimLowStockTarget();
    if (gen !== this.npcGeneration) return;

    if (!target) {
      await this.npcMoveTo(npc, this.randomWalkableCellNear(this.npcHomeCell, 6), gen);
      if (gen !== this.npcGeneration) return;
      await this.delay(NPC_IDLE_WAIT_MS);
      if (gen !== this.npcGeneration) return;
      this.runNpcLoop(npc, gen);
      return;
    }

    const key = target.loc.locationId;

    // 1) 지하 창고 반입구를 거쳐 물건을 싣는다.
    await this.npcMoveTo(npc, this.npcHomeCell, gen);
    if (gen !== this.npcGeneration) {
      this.claimedTargets.delete(key);
      return;
    }
    this.showRestockBubble(npc, '🚚 재고 싣는 중');
    await this.delay(NPC_WAREHOUSE_PAUSE_MS);
    if (gen !== this.npcGeneration) {
      this.claimedTargets.delete(key);
      return;
    }

    // 2) 매대까지 배달.
    await this.npcMoveTo(npc, { x: target.loc.x, y: target.loc.y }, gen);
    if (gen !== this.npcGeneration) {
      this.claimedTargets.delete(key);
      return;
    }

    // 이 매대에서 재고 부족했던 상품을 한 번에 전부 채운다(한 매대에 여러 명이 오갈 필요 없이).
    for (const skuId of target.skuIds) {
      adjustStock(target.loc.locationId, skuId, RESTOCK_QTY);
      confirmRestock(target.loc.locationId, skuId, RESTOCK_QTY);
    }
    const label = target.skuIds.length > 1 ? `📦 +${RESTOCK_QTY} ×${target.skuIds.length}` : `📦 +${RESTOCK_QTY}`;
    this.showRestockBubble(npc, label);
    this.claimedTargets.delete(key);

    await this.delay(NPC_RESTOCK_PAUSE_MS);
    if (gen !== this.npcGeneration) return;
    this.runNpcLoop(npc, gen);
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
      const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.15, 3);
      this.cameras.main.setZoom(zoom);
    });
  }
}
