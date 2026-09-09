import Phaser from 'phaser';
import type { FloorData, LocationInfo, FacilityInfo, GridPoint } from '../types';
import { Grid, findPath } from '../pathfinding/astar';
import { fetchProductsAtLocation, fetchLowStockLocations, adjustStock } from '../../api/products';
import { confirmRestock } from '../../api/locations';
import { ZONE_LABEL_OVERRIDES, SERVICE_AREA_LABEL_OVERRIDES } from '../../data/floorAmenities';

// ════════════════════════════════════════════════════════════════════════════
// StoreScene.ts — 매장 층(B1/1F/2F/3F) 하나를 그리고 캐릭터를 움직이는 Phaser Scene.
// 이 파일 하나가 "그 층이 어떻게 생겼는지"부터 "클릭하면 어디로 걷는지"까지 다 담당한다.
// 아래는 코드를 직접 손보려는 사람을 위한 전체 지도(map) 겸 설명이다 — 각 항목이 파일의
// 어느 부분에 해당하는지 적어뒀으니, 이 주석만 읽고도 어디를 고쳐야 할지 감을 잡을 수 있다.
//
// 1) 매대(선반)는 이미지가 아니라 zone.color(ZONE_COLORS, floorAmenities.ts)로 채운 단색
//    사각형으로 그린다. 시설(엘리베이터·화장실·정수기 등)과 서비스 구역(계산대·ATM 등)도
//    2026-08-31부로 이미지를 전부 걷어내고 이모지 원형 배지(FACILITY_ICON/FACILITY_COLOR)
//    또는 회색 박스+글자만으로 통일했다 — 참고 도면 이미지와 스타일을 맞추기 위함.
//
// 2) 좌표계 — 그리드 1칸 = TILE px(현재 24px). 화면(world) 좌표는 항상 "그리드 좌표 * TILE".
//    예: 그리드 (x=3, y=5) 칸의 왼쪽 위 모서리는 화면 좌표 (72, 120). 매대 이미지는 칸의
//    "가운데"에 그리므로 중심점은 (x*TILE + TILE/2, y*TILE + TILE/2)를 쓴다(2칸 합치면
//    TILE/2 대신 TILE, 즉 두 칸의 정중앙).
//
// 3) 렌더링 순서(위→아래로 겹쳐 그려짐, DEPTH_* 상수로 고정) — 바닥(0) → 매대(10) →
//    시설 아이콘(20) → 존 이름표(30) → 이동 경로 표시선(40) → NPC(900) → 플레이어(1000).
//    buildFloor()가 층을 바꿀 때마다 이 레이어들을 통째로 새로 그린다.
//
// 4) (2026-08-31 삭제) 예전에는 인접한 매대 칸을 2x2 등으로 묶어 큰 이미지 하나로 그리는
//    "칸 합치기" 로직이 있었지만, 단색 블록 렌더링으로 바뀌면서 필요 없어져 제거했다 —
//    이제 buildFloor()는 location마다 정확히 그 칸 크기의 사각형 하나를 그린다.
//
// 5) 화면 맞춤(fitCameraToWorld()) — 층 전체(worldW x worldH)가 "절대 잘리지 않고" 화면
//    (canvasW x canvasH) 안에 다 들어오도록 줌을 계산한다. 가로 기준 배율과 세로 기준 배율
//    중 더 작은 쪽(=화면에 다 담기 위해 더 많이 축소해야 하는 쪽)을 최종 줌으로 쓰는
//    "contain" 방식 — 매장 비율이 화면 비율과 다르면 남는 축에 여백이 생기지만, 그 대신
//    어느 쪽도 화면 밖으로 잘려나가지 않는다(예전엔 반대로 더 큰 배율을 쓰는 "cover" 방식을
//    썼다가 화면 비율이 안 맞을 때 위아래가 계속 잘리는 문제가 있었음).
//
// 6) NPC(재고 담당 직원) — 배경 연출용으로 스스로 돌아다니며 재고가 적은 매대를 찾아
//    "재입고"하는 애니메이션을 반복한다. 실제 재고 API를 호출하긴 하지만 게임 진행에는
//    영향 없는 순수 연출 요소.
// ════════════════════════════════════════════════════════════════════════════

// 렌더링 타일 크기(px). 16 -> 24로 키움: 매대 이미지가 96x48/48x96짜리 원본을 심하게
// 축소해서 뭉개져 보이던 걸(다닥다닥 붙어 보이던 원인 중 하나) 줄이기 위함 — 원본 해상도에
// 더 가깝게 그릴수록 디테일이 살아서 또렷해진다. fitCameraToWorld()가 줌을 world 크기에
// 반비례하게 맞추므로 기본(꽉 채운) 화면에서 전체 크기는 그대로고, 실제로 달라지는 건
// 렌더링 선명도 + 사용자가 확대했을 때 보이는 디테일이다.
const TILE = 24;
const PLAYER_SPEED = 1200; // px/sec — 09-09: 성원님 요청으로 2000에서 소폭 하향. 2000은
// 눈으로 따라가기 어려울 만큼 빨라서 "어디로 갔는지 모르겠다"는 느낌이 있었다. 타일 이동
// tween에는 최소 40ms 바닥이 걸려 있어(advancePath() 참고) 이 값이 더 커져도 순간이동처럼
// 보이진 않는다. 더 느리게 하려면 이 값만 낮추면 되고 HOLD_MOVE_DELAY는 아래에서 이 값에
// 맞춰 자동으로 따라간다.
// 09-03: 이전엔 140ms 고정값이었는데, PLAYER_SPEED를 크게 올려도(타일 하나 이동에 실제로
// 걸리는 시간은 훨씬 짧아짐) 이 값이 그대로 140ms라서 "한 칸 휙 움직이고 ~130ms 가만히
// 서있다가 다음 칸 휙"처럼 뚝뚝 끊겨 보였다(성원님 피드백) — 실제 원인은 tween 길이가
// 아니라 이 입력 간격이 tween보다 훨씬 길었던 것. 그래서 타일 하나 이동에 걸리는 실제
// 시간(TILE / PLAYER_SPEED)에 맞춰 계산하도록 바꿨다 — PLAYER_SPEED가 나중에 또 바뀌어도
// 같은 문제가 재발하지 않는다. 최소 8ms는 advancePath()의 tween 하한과 동일한 이유로
// 둔 바닥(0이면 같은 프레임에서 다음 입력을 계속 받아 과도하게 자주 처리될 수 있음).
const HOLD_MOVE_DELAY = Math.max((TILE / PLAYER_SPEED) * 1000, 8); // 방향키를 누르고 있을 때 한 칸 이동 간격(ms)

// ── NPC(재고 담당 직원) 관련 상수 ──
// 요청으로 재입고 NPC를 화면에서 완전히 없앤다 — NPC_COUNT=0이면 spawnNpcs()가 아무것도
// 만들지 않고 아래 로직(순찰/재입고 루프)은 그냥 실행되지 않는다. 관련 로직 자체는 나중에
// 다시 켤 수 있도록 지우지 않고 남겨둔다.
const NPC_COUNT = 0; // 층당 동시에 돌아다니는 직원 수 (0 = 비활성화)
const NPC_SPEED = 1500; // px/sec — 요청에 따라 최대 속도로 설정(플레이어의 약 4.5배). TILE 변경에 맞춰 1.5배
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
const DEPTH_LABEL = 30;
// 09-03: 시설 아이콘/이름표(엘리베이터·에스컬레이터 등)가 존 이름표(DEPTH_LABEL)에 가려
// 보이던 문제 — 존 이름표보다 위(DEPTH_LABEL보다 큰 값)로 올려서 항상 위에 그려지게 한다.
const DEPTH_FACILITY = 35;
const DEPTH_PATH = 40;
const DEPTH_ROUTE = 41; // 추천 동선은 걷기 경로(DEPTH_PATH)보다 위, NPC/플레이어보다는 아래
const DEPTH_NPC = 900;
const DEPTH_PLAYER = 1000;
// 상품 위치 핀은 캐릭터보다도 위에 그린다 — 목적지 표시라 무엇에도 가리면 안 된다.
const DEPTH_PRODUCT_PIN = 1100;
// 상품 위치 핀 크기. 지도를 축소해서 봐도 눈에 들어와야 해서 타일보다 크게 잡는다.
const PIN_HEAD_R = TILE * 0.85;
const PIN_LABEL_SIZE = 26;

// ── 캐릭터(플레이어/직원 NPC) 스프라이트 애니메이션 설정 ──
// "빨간모자" 손님 캐릭터(플레이어)와 "로봇" 직원 캐릭터(NPC) 에셋 팩에서, idle/run 상태별로
// 프레임을 개별 PNG로 잘라 public/assets/characters/<name>/<state>-<n>.png 로 저장해뒀다.
// (한 스프라이트시트가 아니라 파일이 여러 장인 이유: 원본 에셋 팩 자체가 애니메이션 상태별
// 폴더에 프레임을 한 장씩 담아 배포하는 형식이라, 그 구조를 그대로 살려서 잘랐다.)
// Phaser는 이렇게 "서로 다른 텍스처 키 여러 장"으로도 anims.create(frames:[{key},...])로
// 애니메이션을 만들 수 있어서, 굳이 하나의 스프라이트시트로 합칠 필요는 없다.
interface CharacterAnimConfig {
  key: string; // 텍스처 키/애니메이션 키 접두사 (예: 'char-redhood')
  path: string; // public/ 기준 경로
  idleFrames: number;
  runFrames: number;
  displayHeight: number; // 화면에 그릴 때 세로 크기(px) — 가로는 원본 비율대로 자동 계산
}
const PLAYER_CHAR: CharacterAnimConfig = {
  key: 'char-redhood',
  path: 'assets/characters/redhood',
  idleFrames: 10,
  runFrames: 8,
  displayHeight: TILE * 1.7,
};
const NPC_CHAR: CharacterAnimConfig = {
  key: 'char-robot',
  path: 'assets/characters/robot',
  idleFrames: 10,
  runFrames: 8,
  displayHeight: TILE * 1.7,
};

const FACILITY_ICON: Record<string, string> = {
  escalator_up: '⬆️',
  escalator_down: '⬇️',
  elevator: '🛗',
  restroom_male: '🚹',
  restroom_female: '🚺',
  family_restroom: '🚼',
  water: '💧',
};

// 2026-08-31: 참고 도면 이미지와 스타일을 맞추기 위해 시설도 사진풍 타일 이미지 대신
// 전부 단순한 이모지 원형 배지(FACILITY_ICON/FACILITY_COLOR)로 통일했다.

// 엘리베이터/에스컬레이터가 너무 작아서 잘 안 보인다는 피드백 — 기본 TILE(24px) 크기의
// 이 배수만큼 키워서 그린다. 정수기(water)는 원래 크기가 딱 맞아서 그대로 둔다.
const FACILITY_ICON_SCALE: Record<string, number> = {
  elevator: 1.7,
  escalator_up: 1.7,
  escalator_down: 1.7,
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

// 2026-08-31: 참고 도면 이미지와 동일하게 계산대·ATM·베이커리 같은 서비스 구역도
// 이미지 없이 회색 박스 + 이름표만으로 단순화했다(아래 buildFloor()의 serviceAreas 렌더링
// 참고).

// ── 매대(선반) 렌더링: 이미지 대신 zone별 단색 블록으로 그린다 ──
// 팀 도면(1F/2F/3F 참고 이미지)과 완전히 동일하게 맞추기 위해 매대 이미지(픽셀아트 타일팩)
// 렌더링은 걷어내고, buildFloor()에서 매대 칸마다 zoneById로 구한 zone.color로 채운 단색
// 사각형을 그린다. 캐릭터/시설(엘리베이터·화장실·정수기 등) 이미지는 그대로 유지한다.

// 바닥 텍스처 — 타일팩의 RPG Maker 오토타일(칸마다 경계선이 박혀있어 반복하면 "격자"처럼
// 보임) 대신, 큰 패널(6칸=144px) 단위로만 아주 옅게 명암이 바뀌는 자체 제작 시임리스 텍스처를
// 쓴다. 칸 하나하나의 경계가 아니라 몇 칸에 한 번씩만 아주 은은하게 나뉘어 보이므로 매대들
// 사이 "바닥"이라는 느낌은 살아있으면서 자잘한 격자처럼 보이지 않는다. 1F·2F·3F(매장 층)는
// 완전히 같은 텍스처를 써서 층 간 이질감이 없게 하고, B1(지하 창고)만 콘크리트 톤으로 구분.
const SALES_FLOOR_TEX = 'floor-sales'; // 1F·2F·3F 공통
const WAREHOUSE_FLOOR_TEX = 'floor-warehouse2'; // B1

function floorTexFor(floor: number): string {
  return floor === 0 ? WAREHOUSE_FLOOR_TEX : SALES_FLOOR_TEX;
}

// 매대 사각형을 칸 크기 그대로 꽉 채우지 않고 살짝만 인셋을 줘서, 옆 칸 매대와 완전히
// 붙어있지 않고 사이에 아주 얇은 틈만 보이게 한다(도면 이미지처럼 칸 사이 흰 여백).
// 2026-08-31: 매대 칸을 더 크게 키워달라는 요청으로 0.85 -> 0.95로 올림.
const SHELF_INSET = 0.95;

// 재고를 채우러 다니는 직원 NPC 한 명의 상태. 플레이어(this.playerGrid/currentPath/moving)와
// 똑같은 구조지만 여러 명이 동시에 독립적으로 움직여야 해서 배열로 관리한다.
interface NpcAgent {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite; // container 안의 실제 로봇 스프라이트(애니메이션/좌우반전 제어용)
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
  // 매대 바로 옆에서 스페이스바 — 그 매대(같은 아일 좌표를 공유하는 모든 진열 단(L1/L2/L3...))에
  // 진열된 상품 팝업을 띄우라는 신호. 배열인 이유: locations.x/y는 "매대 몸체"가 아니라 그 매대의
  // 통로 접근 지점(rack/bay)이고, 같은 rack/bay 안의 여러 단(level)이 이 좌표를 공유하기 때문에
  // 한 번의 상호작용으로 그 매대의 모든 단을 다 받아야 한다.
  onLocationInteract?: (locs: LocationInfo[]) => void;
  // 09-08 상품 위치 핀을 클릭했을 때. 오른쪽 웹 화면에서 "3층 홈 가전 구역" 같은 위치를
  // 누르면 그 매대에 핀이 꽂히고, 그 핀을 누르면 이 콜백이 불린다.
  // 씬이 직접 걷게 하지 않는 이유는 onTileClick 과 같다 — 다른 층이면 이동수단을 골라야 하고,
  // 그 판단은 App(React)이 한다.
  onProductPinClick?: (cell: GridPoint) => void;
}

export default class StoreScene extends Phaser.Scene {
  private floorData!: FloorData;
  private grid!: Grid;
  private player!: Phaser.GameObjects.Container;
  private playerSprite!: Phaser.GameObjects.Sprite; // player 컨테이너 안의 실제 캐릭터 스프라이트
  private playerLabel!: Phaser.GameObjects.Text; // 09-03: 플레이어 머리 위 이름표(휴대폰 뒷번호/비로그인 표시)
  private playerGrid: GridPoint = { x: 2, y: 2 };
  private pathGraphics!: Phaser.GameObjects.Graphics;
  // 캐릭터가 실제로 걷는 pathGraphics(초록, walkTo마다 clear됨)와 별개 레이어.
  // "장바구니 추천 동선"은 캐릭터를 움직이지 않고 화면에 안내선만 계속 띄워두는 용도라
  // walkTo/advancePath가 pathGraphics를 지울 때 같이 지워지면 안 되어 분리했다.
  private routeGraphics!: Phaser.GameObjects.Graphics;
  // 09-08 상품 위치 핀. 한 번에 하나만 띄운다(새로 찍으면 이전 것은 지운다).
  private routeEndpointLayer?: Phaser.GameObjects.Container; // 출발/도착 마커(09-09)
  private productPin?: Phaser.GameObjects.Container;
  private productPinCell?: GridPoint;
  private floorTileLayer?: Phaser.GameObjects.Graphics;
  private shelfLayer!: Phaser.GameObjects.Container;
  private labelLayer!: Phaser.GameObjects.Container;
  private facilityLayer!: Phaser.GameObjects.Container;
  private currentPath: GridPoint[] = [];
  private moving = false;
  private controlsEnabled = true; // 프로그램 트립 진행 중에는 키보드 조작을 잠근다
  private events2: StoreSceneEvents = {};
  // 디버그 라벨(O키) 등 "이 칸에 매대가 하나 있다"는 것만 알면 되는 곳에서 쓰는 단일 값 버전 —
  // 같은 x,y를 공유하는 여러 단(level) 중 마지막으로 세팅된 것 하나만 남는다.
  private locationByCell = new Map<string, LocationInfo>();
  // 실제 상품 팝업(onLocationInteract)에서 쓰는 버전 — 같은 x,y를 공유하는 모든 단을 배열로 보관한다.
  private locationsByCell = new Map<string, LocationInfo[]>();
  private facilityByCell = new Map<string, FacilityInfo>();
  private lastHoldMoveAt = 0;
  // 이번 층에서 "화면을 꽉 채우는" 줌 값 — fitCameraToWorld()가 매번 다시 계산해서 넣어두고,
  // 휠 줌의 최소값으로도 같이 써서 사용자가 이보다 더 축소해서 매장을 작게 만들 수 없게 한다.
  private minZoom = 0.15;
  // 사용자가 휠로 직접 확대해서 보고 있는 중인지. 창이나 패널 크기가 바뀌었을 때
  // "화면에 맞춰 다시 정렬해도 되는 상태"인지 판단하는 데 쓴다(handleResize 참고).
  private userZoomed = false;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private debugKey!: Phaser.Input.Keyboard.Key;
  private debugOccupiedLayer?: Phaser.GameObjects.Graphics;
  private cellAddressKey!: Phaser.Input.Keyboard.Key; // P키 — 마우스 아래 칸의 좌표를 화면에 표시(맵 좌표를 직접 알아내기 위한 디버그용)
  private cellAddressLabel?: Phaser.GameObjects.Text;

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

  preload() {
    const base = 'assets/tiles';
    const keys = new Set<string>([
      SALES_FLOOR_TEX,
      WAREHOUSE_FLOOR_TEX,
    ]);
    for (const key of keys) this.load.image(key, `${base}/${key}.png`);

    // 플레이어(빨간모자 손님)/NPC(로봇 직원) 캐릭터 애니메이션 프레임 로드.
    for (const cfg of [PLAYER_CHAR, NPC_CHAR]) {
      for (let i = 1; i <= cfg.idleFrames; i++) {
        this.load.image(`${cfg.key}-idle-${i}`, `${cfg.path}/idle-${i}.png`);
      }
      for (let i = 1; i <= cfg.runFrames; i++) {
        this.load.image(`${cfg.key}-run-${i}`, `${cfg.path}/run-${i}.png`);
      }
    }
  }

  // 개별 이미지 텍스처 키들을 프레임으로 묶어 idle/run 애니메이션 두 개를 등록한다.
  // (한 스프라이트시트가 아니라 텍스처 키가 여러 개라 generateFrameNumbers를 못 쓰고,
  // frames 배열에 {key} 객체를 하나씩 나열하는 방식을 쓴다.)
  private createCharacterAnims(cfg: CharacterAnimConfig) {
    const idleFrames = Array.from({ length: cfg.idleFrames }, (_, i) => ({
      key: `${cfg.key}-idle-${i + 1}`,
    }));
    const runFrames = Array.from({ length: cfg.runFrames }, (_, i) => ({
      key: `${cfg.key}-run-${i + 1}`,
    }));
    if (!this.anims.exists(`${cfg.key}-idle`)) {
      this.anims.create({ key: `${cfg.key}-idle`, frames: idleFrames, frameRate: 6, repeat: -1 });
    }
    if (!this.anims.exists(`${cfg.key}-run`)) {
      this.anims.create({ key: `${cfg.key}-run`, frames: runFrames, frameRate: 10, repeat: -1 });
    }
  }

  // 스프라이트의 이동 방향에 맞춰 idle/run 애니메이션을 재생하고 좌우로 뒤집는다.
  // 두 캐릭터 원본 아트가 모두 오른쪽을 보고 있으므로, 왼쪽으로 이동할 때만 flipX.
  private setCharMotion(sprite: Phaser.GameObjects.Sprite, cfg: CharacterAnimConfig, running: boolean, dx: number) {
    if (dx !== 0) sprite.setFlipX(dx < 0);
    const key = running ? `${cfg.key}-run` : `${cfg.key}-idle`;
    if (sprite.anims.currentAnim?.key !== key) sprite.play(key, true);
  }

  create() {
    this.cameras.main.setBackgroundColor('#f4f1ea');
    this.createCharacterAnims(PLAYER_CHAR);
    this.createCharacterAnims(NPC_CHAR);
    this.buildFloor();

    this.pathGraphics = this.add.graphics();
    this.pathGraphics.setDepth(DEPTH_PATH);
    this.routeGraphics = this.add.graphics();
    this.routeGraphics.setDepth(DEPTH_ROUTE);
    this.player = this.buildPlayer();
    this.placePlayerAt(this.findEntranceCell());
    this.spawnNpcs(NPC_COUNT);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) return;

      // 핀을 눌렀으면 그 칸을 클릭한 것으로 치지 않고 핀 클릭으로만 처리한다.
      // 핀에 setInteractive 를 걸어 처리하지 않는 이유는, Phaser에서 오브젝트 클릭과
      // 이 전역 pointerdown 이 둘 다 발생해서 "핀 클릭 + 타일 클릭"이 겹치기 때문이다.
      // 여기서 좌표로 직접 판정하면 순서에 의존하지 않는다.
      if (this.hitProductPin(pointer.worldX, pointer.worldY)) {
        if (this.productPinCell) this.events2.onProductPinClick?.(this.productPinCell);
        return;
      }

      const gx = Math.floor(pointer.worldX / TILE);
      const gy = Math.floor(pointer.worldY / TILE);
      this.handleTileClick(gx, gy);
    });

    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.spaceKey.on('down', () => this.handleSpacePress());

    // 4번(눈에 보이지 않는 충돌구역 확인용): O키를 누르면 지금 층의 occupied(통행 불가) 칸
    // 전부를 반투명 빨간 사각형으로 덮어 그린다 — 매대 이미지가 없는데도 막혀있는 칸(진짜
    // "안 보이는 벽")이 있으면 이걸로 바로 눈에 보인다. 다시 누르면 꺼진다.
    this.debugKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.O);
    this.debugKey.on('down', () => this.toggleOccupiedDebugOverlay());

    // P키: 지금 마우스 커서가 올라가 있는 칸의 그리드 좌표(x,y)를 그 칸 위에 표시한다.
    // floorAmenities.ts에서 facilities/serviceAreas 좌표를 손으로 넣을 때, 원하는 칸의
    // 정확한 x,y 값을 화면에서 바로 읽을 수 있게 하기 위한 디버그 기능. 다시 누르면 지워진다.
    this.cellAddressKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.cellAddressKey.on('down', () => this.showCellAddressAtPointer());

    this.fitCameraToWorld();
    this.setupCameraDrag();
    // 브라우저 창 크기가 바뀔 때(캔버스 컨테이너 크기 변경 포함) 매장이 화면 밖으로
    // 잘리지 않게 최소 줌만 다시 계산한다 — 예전엔 여기서 fitCameraToWorld()를 그대로
    // 불러서 줌 자체를 강제로 초기화했는데, 그러면 확대해서 보고 있다가 사이드패널
    // 토글이나 브라우저의 아주 미세한 레이아웃 재계산(ResizeObserver)만 일어나도 줌이
    // 도로 축소돼버렸다("확대해도 자꾸 자동으로 축소된다" 버그의 원인). handleResize()는
    // 화면에 다 담기는 데 필요한 최소 줌(minZoom)만 다시 계산하고, 사용자가 그보다 더
    // 확대해놓은 상태는 그대로 둔다 — 층을 새로 불러올 때(loadFloor)만 fitCameraToWorld()로
    // 다시 리셋한다.
    this.scale.on('resize', () => this.handleResize());
  }

  // 매장 "전체"가 화면 안에 항상 다 들어오도록(위아래/좌우 어느 쪽도 잘리지 않게) 줌을 맞추고
  // 가운데 정렬한다.
  //
  // 예전엔 max(가로비율,세로비율) — 이른바 "cover" 방식 — 을 썼다: 두 축 중 더 확대해야 하는
  // 쪽에 줌을 맞춰서 화면을 항상 꽉 채우고, 덜 확대해도 되는 반대쪽은 화면 밖으로 넘쳐서
  // 잘려나가는 걸 감수하는 방식이었다. 문제는 HORIZONTAL/VERTICAL_FILL_RATIO를 아무리 낮춰도
  // "잘리는 축 자체"가 없어지지 않는다는 것 — 매장 가로세로 비율이 화면 비율과 다르면 두 배율
  // 중 하나가 항상 더 크게 나오고, max()는 그 큰 쪽을 그대로 쓰기 때문에 작은 쪽 배율 기준으로
  // 계산했던 "여백"은 의미가 없어지고 그 축이 그대로 화면 밖으로 밀려나간다. 세로 여백 비율을
  // 계속 줄여도 "여전히 위아래가 잘린다"는 피드백이 반복된 근본 원인이 이것이었다.
  //
  // 그래서 min(가로비율,세로비율) — "contain" 방식 — 으로 바꿨다: 두 축 중 더 "적게" 확대해도
  // 되는 쪽(=화면에 다 담기 위해 필요한 축소가 더 큰 쪽)에 줌을 맞춘다. 이러면 매장의 짧은 쪽
  // 기준으로 화면을 다 채우지 못해 위아래(또는 좌우)에 여백이 남을 수 있지만, 대신 어느 쪽도
  // 절대 잘리지 않고 매장 전체가 항상 한 화면에 다 보인다 — "매장 전체를 한눈에 보고 싶다"는
  // 요청에는 화면을 여백 없이 꽉 채우는 것보다 이쪽이 맞는 우선순위.
  private fitCameraToWorld() {
    if (!this.floorData) return;
    const worldW = this.floorData.gridWidth * TILE;
    const worldH = this.floorData.gridHeight * TILE;
    const canvasW = this.scale.width || worldW;
    const canvasH = this.scale.height || worldH;
    // 두 축 다 캔버스 크기의 96%까지만 채우는 걸 목표로 잡아서(FILL_RATIO), 매장 테두리가
    // 화면 가장자리에 딱 붙지 않고 아주 약간의 숨 쉴 여백을 남긴다.
    const FILL_RATIO = 0.96;
    const containZoom = Math.min(
        (canvasW * FILL_RATIO) / worldW,
        (canvasH * FILL_RATIO) / worldH,
    );
    this.minZoom = Phaser.Math.Clamp(containZoom, 0.1, 3);
    this.cameras.main.setZoom(this.minZoom);
    this.cameras.main.centerOn(worldW / 2, worldH / 2);
    // 여기를 지나면 화면에 딱 맞춰진 기본 상태이므로, 사용자가 확대해둔 상태는 아니다.
    // (씬 생성 시점과 층 전환 loadFloor() 양쪽에서 이 함수를 부르므로 둘 다 커버된다.)
    this.userZoomed = false;
  }

  // ── 하단 드래그바(React가 그리는 HTML 스크롤바)를 위한 카메라 조회/설정 ──
  // 확대(zoom > minZoom)했을 때만 실제로 좌우로 옮길 여백(worldWidth - viewWidth)이 생긴다.
  // GameCanvas.tsx가 매 프레임 이 값을 읽어서 스크롤바 두께/위치를 계산하고, 스크롤바를
  // 드래그하면 setScrollX()를 불러서 반대로 카메라를 옮긴다 — 우클릭 드래그/휠 줌과
  // 같은 this.cameras.main을 그대로 공유하므로 서로 항상 동기화된 상태를 유지한다.
  getScrollInfo(): {
    scrollX: number; minX: number; maxX: number; worldWidth: number; viewWidth: number;
    scrollY: number; minY: number; maxY: number; worldHeight: number; viewHeight: number;
  } | null {
    if (!this.floorData) return null;
    const cam = this.cameras.main;
    const worldWidth = this.floorData.gridWidth * TILE;
    const worldHeight = this.floorData.gridHeight * TILE;
    const viewWidth = cam.width / cam.zoom;
    const viewHeight = cam.height / cam.zoom;
    const maxX = Math.max(0, worldWidth - viewWidth);
    const maxY = Math.max(0, worldHeight - viewHeight);
    return {
      scrollX: cam.scrollX, minX: 0, maxX, worldWidth, viewWidth,
      scrollY: cam.scrollY, minY: 0, maxY, worldHeight, viewHeight,
    };
  }

  setScrollX(x: number) {
    if (!this.floorData) return;
    const cam = this.cameras.main;
    const worldWidth = this.floorData.gridWidth * TILE;
    const viewWidth = cam.width / cam.zoom;
    const maxX = Math.max(0, worldWidth - viewWidth);
    cam.scrollX = Phaser.Math.Clamp(x, 0, maxX);
  }

  setScrollY(y: number) {
    if (!this.floorData) return;
    const cam = this.cameras.main;
    const worldHeight = this.floorData.gridHeight * TILE;
    const viewHeight = cam.height / cam.zoom;
    const maxY = Math.max(0, worldHeight - viewHeight);
    cam.scrollY = Phaser.Math.Clamp(y, 0, maxY);
  }

  // 창/컨테이너 크기가 바뀔 때 호출된다 — fitCameraToWorld()와 달리 사용자가 이미 확대해
  // 놓은 배율이나 스크롤 위치는 그대로 두고, "화면에 다 들어오는 최소 줌(minZoom)"만 새
  // 캔버스 크기에 맞게 다시 계산한다.
  private handleResize() {
    if (!this.floorData) return;
    // 사용자가 확대해서 보고 있는 게 아니라면(=화면 맞춤 상태), 새 캔버스 크기에 맞춰
    // 줌과 가운데 정렬을 다시 계산한다. 예전에는 이 경우에도 minZoom 만 다시 구하고
    // 카메라는 그대로 뒀기 때문에, 웹 UI 패널을 열어 캔버스가 좁아지면 넓을 때의 줌이
    // 그대로 남아 지도가 왼쪽에 붙고 오른쪽에 빈 공간이 생겼다.
    if (!this.userZoomed) {
      this.fitCameraToWorld();
      return;
    }
    const worldW = this.floorData.gridWidth * TILE;
    const worldH = this.floorData.gridHeight * TILE;
    const canvasW = this.scale.width || worldW;
    const canvasH = this.scale.height || worldH;
    const FILL_RATIO = 0.96;
    const containZoom = Math.min(
        (canvasW * FILL_RATIO) / worldW,
        (canvasH * FILL_RATIO) / worldH,
    );
    this.minZoom = Phaser.Math.Clamp(containZoom, 0.1, 3);
    const cam = this.cameras.main;
    // 지금 줌이 새로 계산된 최소 줌보다 작아졌을 때만(창이 커져서 최소 줌 자체가 올라간
    // 경우) 끌어올린다 — 사용자가 확대해놓은 상태는 절대 강제로 건드리지 않는다.
    if (cam.zoom < this.minZoom) cam.setZoom(this.minZoom);
    // 캔버스 크기가 바뀌면 한 화면에 보이는 world 폭/높이도 바뀌므로, 지금 스크롤 위치가
    // 새 범위를 벗어나 있으면(예: 확대된 채로 창이 커진 경우) 범위 안으로만 당겨준다.
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const maxX = Math.max(0, worldW - viewW);
    const maxY = Math.max(0, worldH - viewH);
    cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, maxX);
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, maxY);
  }

  // ── 층 전환/트립 진행 중 씬 재사용 ──
  loadFloor(floorData: FloorData, opts?: { startCell?: GridPoint; hidePlayer?: boolean }) {
    this.floorData = floorData;
    this.cellAddressLabel?.destroy();
    this.cellAddressLabel = undefined;
    this.shelfLayer.destroy();
    this.labelLayer.destroy();
    this.facilityLayer.destroy();
    this.locationByCell.clear();
    this.locationsByCell.clear();
    this.facilityByCell.clear();
    this.buildFloor();
    // 09-03: hidePlayer(다른 층을 "구경만" 할 때 — 층 드롭다운으로 안 서있는 층 조회)로
    // 불릴 때도 이 아래 placePlayerAt()이 항상 실행돼서, 캐릭터가 화면엔 안 보이지만
    // playerGrid(씬 내부 실제 좌표)는 "지금 구경 중인 층의 입구 칸"(대개 지도 왼쪽 하단)
    // 으로 조용히 덮어써지고 있었다. 이후 다른 층 상품으로 이동(App.tsx의 startTrip)할 때
    // canvas.getPlayerGrid()로 "현재 위치"를 물어보면 이 오염된 좌표가 나와서, 실제 층을
    // 다시 불러올 때 캐릭터가 그 잘못된(막힌) 자리에 떨어져 못 움직이는 버그였다(성원님
    // 리포트: "다른층 매대로 이동하면 1층 왼쪽 하단에 갇힘"). startCell이 명시적으로 주어지지
    // 않은 채 hidePlayer인 경우(=순수 구경용 조회)는 아예 재배치를 건너뛰어 playerGrid를
    // 보존한다 — 화면에 안 보이는 캐릭터를 굳이 옮길 이유도 없다.
    if (opts?.startCell || !opts?.hidePlayer) {
      this.placePlayerAt(opts?.startCell ?? this.findEntranceCell());
    }
    this.setPlayerVisible(!opts?.hidePlayer);
    this.pathGraphics.clear();
    this.routeGraphics.clear(); // 이전 층에서 그려둔 추천 동선은 층이 바뀌면 좌표가 무의미해지므로 같이 지운다
    this.clearProductPin();     // 상품 위치 핀도 같은 이유로 지운다. 다른 층 좌표에 남아 있으면 엉뚱한 자리를 가리킨다
    this.clearRouteEndpoints(); // 출발/도착 마커도 마찬가지 — 층이 바뀌면 그 좌표는 다른 자리를 가리킨다
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
  // onArrive(success): success=false는 "경로를 못 찾아서 실제로는 한 칸도 못 움직였다"는
  // 뜻이다(안 보이는 충돌구역 등으로 목적지가 고립된 경우) — 호출부가 이걸 "도착했다"로
  // 착각하고 다음 단계로 넘어가면 안 된다(4번 문제와 엮인 2/3번 버그의 원인이었다).
  walkTo(goal: GridPoint, onArrive?: (success: boolean) => void) {
    // 목적지가 매대 칸이면 그 앞 통로 칸으로 대신 간다. 예전에는 바로 옆 8칸만 봐서,
    // 여러 칸짜리 매대 덩어리의 한가운데를 클릭하면 후보를 못 찾고 막힌 칸을 그대로
    // 목적지로 써서 경로 탐색이 항상 실패했다(층간 이동 후 "경로를 찾지 못했습니다").
    // 이제는 반지름을 넓혀가며 후보를 모으고, 실제로 갈 수 있는 곳이 나올 때까지 시도한다.
    // 가장 가까운 칸이 벽 반대편처럼 갈 수 없는 자리일 수도 있어서 하나만 보면 부족하다.
    const candidates = this.grid.walkableCellsNear(goal);
    for (const target of candidates) {
      const path = findPath(this.grid, this.playerGrid, target);
      if (path.length === 0) continue;
      this.currentPath = path.slice(1);
      this.drawPath(path);
      this.pendingArriveCallback = () => onArrive?.(true);
      if (!this.moving) this.advancePath();
      return;
    }
    onArrive?.(false);
  }

  teleportTo(cell: GridPoint) {
    this.placePlayerAt(cell);
  }

  /**
   * 장바구니 동선 안내 — 백엔드(navigation.CartRouteService)가 DB map_cells 기반 A*로
   * 이미 계산해준 실제 경로 좌표(현재 층 구간만 필터링된 것)를 받아서 그대로 선으로 그린다.
   * 프론트에서 경로를 다시 계산하지 않는다 — 캐릭터를 걷게 하지도 않고 안내선만 표시한다.
   * stops는 그 중 "몇 번째로 들르는 매대인지" 표시할 지점들(옵션).
   */
  drawRoute(pathPoints: GridPoint[], stops: GridPoint[] = []) {
    this.routeGraphics.clear();
    if (pathPoints.length < 2) return;
    this.drawRouteLine(pathPoints, stops);
  }

  clearRoute() {
    this.routeGraphics.clear();
  }

  /**
   * 동선의 출발점과 도착점에 마커를 꽂는다(09-09).
   *
   * [왜 productPin 과 따로인가] productPin 은 "한 번에 하나"만 유지하는 구조다(핀을 새로
   * 꽂으면 이전 핀을 지운다 — 클릭하면 그 자리로 출발하는 동작이 붙어 있어서 둘 이상이면
   * 어느 쪽으로 가야 할지 모호해진다). 출발/도착은 동시에 둘 다 보여야 하므로 클릭 동작이
   * 없는 별도 레이어로 그린다.
   *
   * 좌표는 "지금 로드된 층" 기준이다. 다른 층의 지점은 부르는 쪽에서 null 로 넘겨야 한다 —
   * 층이 다른 좌표를 그대로 그리면 엉뚱한 자리를 가리킨다.
   */
  showRouteEndpoints(start: GridPoint | null, end: GridPoint | null) {
    this.clearRouteEndpoints();

    const layer = this.add.container(0, 0);
    layer.setDepth(DEPTH_ROUTE);

    const marker = (cell: GridPoint, color: number, text: string) => {
      const cx = cell.x * TILE + TILE / 2;
      const cy = cell.y * TILE + TILE / 2;
      const r = TILE * 0.62;

      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.25);
      g.fillEllipse(cx, cy + r * 0.75, r * 1.6, r * 0.5);
      g.fillStyle(color, 1);
      g.fillCircle(cx, cy, r);
      g.lineStyle(3, 0xffffff, 0.95);
      g.strokeCircle(cx, cy, r);
      layer.add(g);

      const label = this.add.text(cx, cy, text, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(TILE * 0.5)}px`,
        color: '#ffffff',
        fontStyle: 'bold',
      });
      label.setOrigin(0.5, 0.5);
      layer.add(label);
    };

    if (start) marker(start, 0x22c55e, '출발');
    if (end) marker(end, 0xef4444, '도착');

    this.routeEndpointLayer = layer;
  }

  clearRouteEndpoints() {
    this.routeEndpointLayer?.destroy(true);
    this.routeEndpointLayer = undefined;
  }

  /**
   * 09-08 상품 위치 핀.
   *
   * 오른쪽 웹 화면의 검색 결과에서 가격 밑 위치("3층 홈 가전 구역")를 누르면, 그 상품이
   * 놓인 매대 칸에 지도 앱에서 보는 물방울 모양 핀을 꽂는다. 핀을 누르면 App(React)이
   * 확인 창을 띄우고, 확인하면 캐릭터가 그 자리로 간다.
   *
   * 한 번에 하나만 띄운다. 새 상품을 누르면 이전 핀은 지운다 — 여러 개가 남아 있으면
   * 어느 것이 방금 누른 것인지 알 수 없다.
   */
  /**
   * 매대 몸체 그리기 — 2x2 베이 단위로 묶어서 큰 사각형 하나로 그린다(09-09 성원님 요청).
   *
   * [왜] 예전엔 칸(1x1)마다 사각형을 하나씩 그려서, 4칸 두께 매대가 자잘한 네모 16개로
   * 보였다. 세계 데이터(map_cells)는 손대면 안 되므로(상품 위치·통행 판정이 전부 거기서
   * 나온다) **차지하는 칸은 그대로 두고 그리는 단위만** 2x2로 키운다.
   *
   * [불변식] 이 함수는 칸을 더 칠하지도, 덜 칠하지도 않는다. 2x2 네 칸이 "모두" 같은 존의
   * 매대일 때만 묶고, 하나라도 비었으면 남은 칸을 예전처럼 1x1로 그린다. 그래서 매대의
   * 겉모양(footprint)은 픽셀 단위로 이전과 같고, 클릭 판정(locationByCell)과도 어긋나지
   * 않는다 — 판정은 부르는 쪽에서 칸 단위로 이미 다 만들어 두었다.
   *
   * [격자 기준] 베이는 map_layout.py의 BAY_CELLS=2 규칙에 따라 항상 짝수 좌표에서 시작한다.
   * 그래서 묶음의 기준점은 좌표를 2로 내림한 값(x - x%2)이다. 이 규칙이 바뀌면 여기도 같이
   * 바뀌어야 한다 — 안 그러면 베이 경계를 가로질러 묶여서 이음매가 어긋나 보인다.
   */
  private drawShelfCellsMerged(
      cells: { x: number; y: number; zoneId: string }[],
      colorForZone: (zoneId: string) => number,
  ) {
    const BLOCK = 2; // 묶는 단위(칸). map_layout.py의 BAY_CELLS와 같은 값이어야 한다.

    // 같은 존의 매대 칸인지 빠르게 확인하기 위한 색인. 존까지 키에 넣는 이유는, 서로 다른
    // 존의 매대가 등을 맞대고 붙어 있을 때 색이 다른 두 존을 한 사각형으로 묶어버리면
    // 존 경계가 사라지기 때문이다.
    const present = new Set<string>();
    for (const c of cells) present.add(`${c.x},${c.y},${c.zoneId}`);

    const drawn = new Set<string>();
    const paint = (cx: number, cy: number, size: number, color: number) => {
      this.shelfLayer.add(this.add.rectangle(cx, cy, size, size, color));
    };

    for (const cell of cells) {
      const key = `${cell.x},${cell.y}`;
      if (drawn.has(key)) continue;

      const bx = cell.x - (cell.x % BLOCK);
      const by = cell.y - (cell.y % BLOCK);
      const quad: [number, number][] = [];
      for (let dx = 0; dx < BLOCK; dx++) {
        for (let dy = 0; dy < BLOCK; dy++) quad.push([bx + dx, by + dy]);
      }

      const canMerge = quad.every(
          ([qx, qy]) => present.has(`${qx},${qy},${cell.zoneId}`) && !drawn.has(`${qx},${qy}`));

      if (canMerge) {
        for (const [qx, qy] of quad) drawn.add(`${qx},${qy}`);
        paint(
            bx * TILE + (TILE * BLOCK) / 2,
            by * TILE + (TILE * BLOCK) / 2,
            TILE * BLOCK * SHELF_INSET,
            colorForZone(cell.zoneId));
      } else {
        // 묶이지 않는 자투리 칸(존 경계, 홀수 폭 매대 등) — 예전 방식 그대로 한 칸으로.
        drawn.add(key);
        paint(
            cell.x * TILE + TILE / 2,
            cell.y * TILE + TILE / 2,
            TILE * SHELF_INSET,
            colorForZone(cell.zoneId));
      }
    }
  }

  showProductPin(cell: GridPoint, label: string) {
    this.clearProductPin();

    const cx = cell.x * TILE + TILE / 2;
    const cy = cell.y * TILE + TILE / 2;

    // 핀 모양: 위쪽 원 + 아래로 뾰족한 삼각형 + 가운데 흰 점.
    // 좌표는 컨테이너 기준이라 (0,0)이 대상 칸의 중심이고, 핀은 그 위로 떠 있게 그린다.
    // 크기는 PIN_HEAD_R 하나로 조절한다 — 더 키우거나 줄이려면 이 값만 바꾸면 된다.
    const HEAD_R = PIN_HEAD_R;
    const HEAD_Y = -(HEAD_R * 2.1);

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(0, TILE * 0.12, HEAD_R * 1.3, HEAD_R * 0.45); // 바닥 그림자

    g.fillStyle(0xffffff, 1);                                    // 흰 테두리(지도 위에서 잘 보이게)
    g.fillCircle(0, HEAD_Y, HEAD_R + 3);
    g.fillTriangle(
        -(HEAD_R + 3) * 0.6, HEAD_Y + (HEAD_R + 3) * 0.75,
        (HEAD_R + 3) * 0.6, HEAD_Y + (HEAD_R + 3) * 0.75,
        0, TILE * 0.1,
    );

    g.fillStyle(0xef4444, 1);
    g.fillCircle(0, HEAD_Y, HEAD_R);
    g.fillTriangle(
        -HEAD_R * 0.6, HEAD_Y + HEAD_R * 0.75,
        HEAD_R * 0.6, HEAD_Y + HEAD_R * 0.75,
        0, TILE * 0.02,
    );
    g.fillStyle(0xffffff, 1);
    g.fillCircle(0, HEAD_Y, HEAD_R * 0.38);

    const tag = this.add.text(0, HEAD_Y - HEAD_R - PIN_LABEL_SIZE * 0.9, label, {
      fontSize: `${PIN_LABEL_SIZE}px`,
      color: '#7f1d1d',
      backgroundColor: '#fee2e2f2',
      padding: { x: 8, y: 3 },
      fontStyle: 'bold',
    });
    tag.setOrigin(0.5);

    const pin = this.add.container(cx, cy, [g, tag]);
    pin.setDepth(DEPTH_PRODUCT_PIN);

    // 눈에 띄게 위아래로 살짝 떠다니게 한다.
    this.tweens.add({
      targets: pin,
      y: cy - TILE * 0.3,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.productPin = pin;
    this.productPinCell = { x: cell.x, y: cell.y };
  }

  /**
   * 핀을 눌렀는지 판정한다.
   *
   * Container.getBounds()를 쓰지 않고 대상 칸 좌표에서 직접 계산하는 이유:
   * 핀은 대상 칸보다 "위에" 떠 있는 그림이라, 화면에서 핀 머리를 눌러도 그 지점의
   * 격자 좌표는 대상 칸이 아니라 그 위 칸이 된다. 그래서 판정을 안 하면 엉뚱한 칸을
   * 클릭한 것으로 처리돼 캐릭터가 다른 데로 가버린다(실제로 그렇게 동작했다).
   * 라벨까지 포함해 넉넉히 잡는다.
   */
  private hitProductPin(worldX: number, worldY: number): boolean {
    if (!this.productPin || !this.productPin.visible || !this.productPinCell) return false;
    const cx = this.productPinCell.x * TILE + TILE / 2;
    const cy = this.productPinCell.y * TILE + TILE / 2;
    const halfW = Math.max(PIN_HEAD_R * 2.2, TILE * 2);
    const top = cy - (PIN_HEAD_R * 2.1 + PIN_HEAD_R + PIN_LABEL_SIZE * 2);
    const bottom = cy + TILE * 0.5;
    return worldX >= cx - halfW && worldX <= cx + halfW && worldY >= top && worldY <= bottom;
  }

  clearProductPin() {
    if (this.productPin) {
      this.tweens.killTweensOf(this.productPin);
      this.productPin.destroy(true);
    }
    this.productPin = undefined;
    this.productPinCell = undefined;
  }

  private drawRouteLine(path: GridPoint[], stops: GridPoint[]) {
    this.routeGraphics.lineStyle(4, 0x3b82f6, 0.85);
    this.routeGraphics.beginPath();
    path.forEach((p, i) => {
      const px = p.x * TILE + TILE / 2;
      const py = p.y * TILE + TILE / 2;
      if (i === 0) this.routeGraphics.moveTo(px, py);
      else this.routeGraphics.lineTo(px, py);
    });
    this.routeGraphics.strokePath();

    // 각 방문 지점(몇 번째로 들를지)에 번호 원을 찍어준다.
    this.routeGraphics.fillStyle(0x3b82f6, 1);
    stops.forEach((p) => {
      this.routeGraphics.fillCircle(p.x * TILE + TILE / 2, p.y * TILE + TILE / 2, 7);
    });
  }

  getPlayerGrid(): GridPoint {
    return this.playerGrid;
  }

  private pendingArriveCallback?: () => void; // walkTo가 onArrive를 감싸서 넣어둔다(항상 success 인자까지 처리된 상태)

  private buildFloor() {
    this.grid = new Grid(this.floorData.gridWidth, this.floorData.gridHeight, this.floorData.occupied);
    this.debugOccupiedLayer?.destroy();
    this.debugOccupiedLayer = undefined;
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
    // 배경은 참고 도면 이미지와 동일하게 흰색 단색으로 단순화한다(2026-08-31 변경 —
    // 예전엔 타일 텍스처를 깔았지만 참고 도면이 순수 흰 배경이라 통일했다).
    this.floorTileLayer.fillStyle(0xffffff, 1);
    this.floorTileLayer.fillRect(0, 0, worldW0, worldH0);

    // ── 행사 상품·계산대·ATM 같은 "표시용 구역"(ServiceArea) 그리기 ──
    // 팀이 준 매장 도면(1F/2F/3F 이미지)에 나온, 매대는 아니지만 매장을 구성하는 공간들을
    // 회색 사각 박스 + 가운데 이름표로 표시한다. locations/occupied와 무관한 순수 표시용이라
    // NPC 길찾기나 클릭 상품 팝업에는 전혀 관여하지 않는다(타입 정의는 types.ts의 ServiceArea
    // 주석 참고). 실제 칸 폭이 넓어서 라벨이 다 안 들어가면 폰트 크기를 살짝 줄인다.
    //
    // 주의: 바닥 타일(tileSprite)이 별도 floorTileLayer가 아니라 이 shelfLayer 안에
    // 추가되어 있기 때문에(위 코드 참고), serviceAreaLayer를 따로 만들어 다른 depth를
    // 줘도 컨테이너 단위로 비교되어 바닥 밑에 깔려 안 보이는 문제가 있었다. 그래서 이
    // 표시 박스도 shelfLayer에 함께 넣어서 "바닥 다음, 매대 그리기 전" 순서를 보장한다
    // (Phaser 컨테이너는 넣은 순서대로 그려지므로: 바닥 → 서비스 영역 → 매대).
    // 09-03: zone 이름표와 같은 방식의 수동 좌표 지정 — floorAmenities.ts의
    // SERVICE_AREA_LABEL_OVERRIDES 참고.
    const serviceAreaOverridesForFloor = SERVICE_AREA_LABEL_OVERRIDES[this.floorData.floor] ?? {};
    for (const area of this.floorData.serviceAreas ?? []) {
      const areaManualPos = serviceAreaOverridesForFloor[area.id];
      const ax = (areaManualPos ? areaManualPos.x : area.x) * TILE;
      const ay = (areaManualPos ? areaManualPos.y : area.y) * TILE;
      const aw = area.w * TILE;
      const ah = area.h * TILE;
      // 09-02 (로컬 검증안): 백엔드가 시설 footprint(kind=FACILITY)를 주면 진짜 자리는
      // 그쪽이 회색으로 그린다 — 손으로 넣은 이 상자는 좌표가 어긋나 이중으로 보이므로
      // 라벨만 남긴다. kind 가 없는 옛 응답에서는 예전처럼 상자까지 그린다.
      if (!(this.floorData.facilityCells?.length)) {
        const box = this.add.rectangle(ax + aw / 2, ay + ah / 2, aw - 3, ah - 3, 0x9e9e9e, 0.55);
        box.setStrokeStyle(1.5, 0x757575, 0.9);
        this.shelfLayer.add(box);
      }

      // 참고 도면과 동일하게 이미지 없이 회색 박스 + 가운데 이름표만 그린다.
      // 09-03: DB 기반 시설(api/locations.ts의 LABEL_ONLY_KIND)은 실제 매장 폭이 아니라
      // 좌표 하나짜리 점이라 area.w/h가 전부 1칸(24px)으로 내려온다 — 그 폭 그대로
      // wordWrap을 걸면 "계산대 / SCAN" 같은 긴 라벨이 한 칸 상자에 억지로 줄바꿈되며
      // 글자가 잘려 보였다(성원님 피드백). 라벨 상자 폭은 이제 실제 배치에 안 쓰이는
      // 표시 전용 값이므로, 최소 200px은 확보해서 안 잘리게 한다(옛 floorAmenities.ts
      // 손좌표처럼 원래도 넉넉한 폭이었던 경우는 Math.max라 그대로 유지된다).
      const labelWrapWidth = Math.max(aw - 6, 200);
      const label = this.add.text(ax + aw / 2, ay + ah / 2, area.label, {
        fontSize: '20px',
        color: '#3a3a3a',
        align: 'center',
        wordWrap: { width: labelWrapWidth },
      });
      label.setOrigin(0.5);
      // 09-03(성원님 피드백: "다 그래픽 뒤로 가있나봐" — 정확했다): 이 라벨을 박스처럼
      // shelfLayer에 넣으면, shelfLayer 안에 라벨보다 "나중에" 추가되는 facilityCells
      // 회색 블록(불투명, 아래쪽 코드 참고)이 같은 좌표를 완전히 덮어버려서 라벨이 안
      // 보였다 — Phaser 컨테이너는 넣은 순서대로 그려지므로 나중에 추가된 게 위로 온다.
      // 라벨은 항상 그 블록 위에 보여야 하므로, shelfLayer보다 위(DEPTH_LABEL) 레이어인
      // labelLayer에 넣는다 — 존 이름표와 같은 레이어라 깊이 문제 없이 항상 블록 위에 뜬다.
      this.labelLayer.add(label);
    }

    const zoneById = new Map(this.floorData.zones.map((z) => [z.zoneId, z]));

    this.floorData.locations.forEach((loc) => {
      const key = `${loc.x},${loc.y}`;
      this.locationByCell.set(key, loc);
      // 같은 rack/bay의 여러 단(level)이 이 좌표를 공유하므로 덮어쓰지 않고 배열에 모은다 —
      // 안 그러면 마지막 단(예: L3)만 남고 나머지 단(L1/L2)은 클릭해도 안 보이는 버그가 생긴다.
      const existing = this.locationsByCell.get(key);
      if (existing) existing.push(loc);
      else this.locationsByCell.set(key, [loc]);
    });

    // 매대 칸은 locations(매대 "옆" 접근 지점 좌표 — rack_no/bay_no 기준 통로 위치)가 아니라
    // map_cells의 실제 점유(통행 불가) 칸을 기준으로 그린다. DB seed(Agent/sim/out/world_seed.sql)를
    // 직접 파싱해서 확인한 결과, locations.x/y는 매대 몸체 칸과 단 1칸도 겹치지 않는 별도의
    // 좌표(캐릭터가 서서 상호작용하는 통로 칸)였고, 실제 매대 몸체는 그 옆에 붙은 점유 칸
    // 뭉치였다 — "O키 디버그 오버레이(점유 칸)가 참고 도면과 더 잘 맞아 보인다"는 관찰이
    // 정확했다. 그래서 점유 칸 하나하나에 "가장 가까운 location의 zone 색"을 입혀서 매대
    // 몸체 전체가 도면처럼 색칠되게 한다. B1(창고)은 seed에 점유 칸 자체가 없어서 예전 방식
    // (location 칸 하나씩 칠하기)으로 대체한다.
    //
    // 2026-08-31: 실제 seed를 다시 전수 조사해보니, 점유 칸 중 "진짜 매대인데 안 칠해지는"
    // 칸(성원님이 보고한 "네 칸 이상 깊은 매대" 안쪽)과 "원래 벽/구조물이라 안 칠하는 게 맞는"
    // 칸(예: 3층 x=90~94 오른쪽 설비 샤프트, 3층 x=0~1 왼쪽 외벽)이 맨해튼 거리만으로는
    // 절대 구분되지 않았다 — 둘 다 거리 5~13 구간에 고르게 섞여 있어서, 거리 기준만 올리면
    // (예: 4→13) 진짜 깊은 매대는 살지만 벽/구조물까지 같이 매대 색으로 칠해지는 새 버그가
    // 생긴다. 그래서 기준을 하나 더 추가했다: "가장 가까운 location의 zone" 것만으로는
    // 부족하고, 그 zone 소속 location들의 실제 좌표 범위(zoneBBox) 안에 있는 점유 칸만
    // 그 zone 매대로 인정한다 — 벽/구조물 칸은 항상 모든 zone의 좌표 범위 바깥에 있었다
    // (실측: 이 조건 추가 후 거리 기준을 4→8로 올려도 벽 칸 3,699개는 그대로 안 칠해지고,
    // 진짜 깊은 매대 칸 67개만 새로 칠해짐 — 1층 F1-D(x26~32,y29~33), 2층 F2-A(x72~76,y41),
    // 3층 F3-A(x89,y29~43), 3층 F3-B(x2~8,y51~55)).
    const OCCUPIED_ZONE_MAX_DIST = 8;
    const occupiedCells = this.floorData.occupied ?? [];
    const colorForZone = (zoneId: string) => {
      const zone = zoneById.get(zoneId);
      return zone ? Phaser.Display.Color.HexStringToColor(zone.color).color : 0xcccccc;
    };
    // zone별 실제 location 좌표 범위 — 위 "벽/구조물 오인 방지" 판정에만 쓰인다.
    const shelfZoneBBox = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();
    for (const loc of this.floorData.locations) {
      const b = shelfZoneBBox.get(loc.zoneId);
      if (!b) {
        shelfZoneBBox.set(loc.zoneId, { minX: loc.x, minY: loc.y, maxX: loc.x, maxY: loc.y });
      } else {
        b.minX = Math.min(b.minX, loc.x);
        b.minY = Math.min(b.minY, loc.y);
        b.maxX = Math.max(b.maxX, loc.x);
        b.maxY = Math.max(b.maxY, loc.y);
      }
    }
    // ── 09-02 (로컬 검증안): 백엔드가 칸의 정체(kind)와 매대 존(shelf_zone)을 주면
    //    추측 없이 그대로 칠한다. 아래 최근접·bbox 휴리스틱은 kind 가 없는 옛 응답용 폴백.
    //    (휴리스틱의 실패: 1F 행사 블록·3F A/S센터를 매대로 칠하고, 1F 좌측 벽 매대 30개를
    //     bbox 밖이라 벽으로 지웠다 — 데이터가 아니라 추측이 틀린 것이라 데이터로 고친다)
    const shelfCells = this.floorData.shelfCells ?? [];
    if (shelfCells.length > 0) {
      const locsByZone = new Map<string, LocationInfo[]>();
      for (const loc of this.floorData.locations) {
        const arr = locsByZone.get(loc.zoneId) ?? [];
        arr.push(loc);
        locsByZone.set(loc.zoneId, arr);
      }
      for (const [fx, fy] of this.floorData.facilityCells ?? []) {
        // 시설·벽 블록: 연한 회색 — 서비스구역 라벨 박스(floorAmenities)와 별개로 실제 footprint
        const rect = this.add.rectangle(fx * TILE + TILE / 2, fy * TILE + TILE / 2, TILE, TILE, 0xd6d6d6);
        this.shelfLayer.add(rect);
      }
      // 클릭 판정(locationByCell)은 예전 그대로 "칸 하나씩" 만든다 — 아래 그리기만 2x2로
      // 묶는다. 판정과 그림이 어긋나면 안 되므로 이 둘을 절대 한 루프에 합치지 않는다.
      for (const cell of shelfCells) {
        // 클릭 → 상품 팝업 연결: 같은 존의 location 중 가장 가까운 접근 지점
        let nearest: LocationInfo | null = null;
        let bestDist = Infinity;
        for (const loc of locsByZone.get(cell.zoneId) ?? []) {
          const d = Math.abs(loc.x - cell.x) + Math.abs(loc.y - cell.y);
          if (d < bestDist) { bestDist = d; nearest = loc; if (d <= 1) break; }
        }
        const key = `${cell.x},${cell.y}`;
        if (nearest && !this.locationByCell.has(key)) this.locationByCell.set(key, nearest);
      }
      this.drawShelfCellsMerged(shelfCells, colorForZone);
    } else if (occupiedCells.length > 0) {
      for (const [ox, oy] of occupiedCells) {
        let nearest: LocationInfo | null = null;
        let bestDist = Infinity;
        for (const loc of this.floorData.locations) {
          const d = Math.abs(loc.x - ox) + Math.abs(loc.y - oy);
          if (d < bestDist) {
            bestDist = d;
            nearest = loc;
            if (d <= 1) break;
          }
        }
        if (!nearest || bestDist > OCCUPIED_ZONE_MAX_DIST) continue;
        const bbox = shelfZoneBBox.get(nearest.zoneId);
        const insideOwnZone =
            !!bbox && ox >= bbox.minX && ox <= bbox.maxX && oy >= bbox.minY && oy <= bbox.maxY;
        if (!insideOwnZone) continue; // 이 zone 매대 범위 밖 = 벽/구조물로 보고 색칠하지 않는다.
        // 화면에 색칠되는 칸(occupied)과 클릭했을 때 찾는 칸(locationByCell)이 서로 다른
        // 좌표를 쓰고 있어서(위 주석 참고) "매대를 클릭해도 반응이 없다"는 버그가 있었다 —
        // locations.x/y(통로 접근 지점)만 locationByCell에 등록돼 있고, 실제로 화면에 보이는
        // 매대 몸체 칸(occupied)은 하나도 등록되어 있지 않았기 때문. 그래서 점유 칸도 그
        // 칸에 색을 입힌 것과 동일한 location으로 등록해서, 눈에 보이는 매대 어디를 클릭해도
        // 반응하게 한다. 단, locations.x/y 자기 자신(통로 접근 지점, 위에서 이미 등록됨)은
        // 덮어쓰지 않는다 — 그 칸은 통로이지 이 매대의 몸체가 아니므로 원래 있던 값(대개
        // undefined 또는 그 통로 자리에 진짜로 있는 다른 매대)을 그대로 둔다.
        const occKey = `${ox},${oy}`;
        if (!this.locationByCell.has(occKey)) {
          this.locationByCell.set(occKey, nearest);
        }
        if (!this.locationsByCell.has(occKey)) {
          const sameShelfLocations = this.floorData.locations.filter(
              (loc) =>
                  loc.zoneId === nearest!.zoneId &&
                  loc.rack === nearest!.rack &&
                  loc.bay === nearest!.bay
          );

          this.locationsByCell.set(
              occKey,
              sameShelfLocations.length > 0 ? sameShelfLocations : [nearest]
          );
        }
        const cx = ox * TILE + TILE / 2;
        const cy = oy * TILE + TILE / 2;
        const rect = this.add.rectangle(cx, cy, TILE * SHELF_INSET, TILE * SHELF_INSET, colorForZone(nearest.zoneId));
        this.shelfLayer.add(rect);
      }
    } else {
      for (const loc of this.floorData.locations) {
        const cx = loc.x * TILE + TILE / 2;
        const cy = loc.y * TILE + TILE / 2;
        const rect = this.add.rectangle(cx, cy, TILE * SHELF_INSET, TILE * SHELF_INSET, colorForZone(loc.zoneId));
        this.shelfLayer.add(rect);
      }
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
    // 09-03: floorAmenities.ts의 ZONE_LABEL_OVERRIDES에 이 층/zone 좌표가 지정돼 있으면
    // 아래 자동계산(바운딩박스 + 빈 행 탐색)을 건너뛰고 그 좌표를 그대로 쓴다 — 자동계산이
    // 이상한 자리에 놓는 zone을 성원님이 직접 손으로 고정시킬 수 있게 하기 위함.
    const labelOverridesForFloor = ZONE_LABEL_OVERRIDES[this.floorData.floor] ?? {};
    for (const zone of this.floorData.zones) {
      const b = zoneBBox.get(zone.zoneId);
      if (!b) continue;
      const manualPos = labelOverridesForFloor[zone.zoneId];
      let labelX: number;
      let labelRow: number;
      if (manualPos) {
        labelX = manualPos.x;
        labelRow = manualPos.y;
      } else {
        labelX = b.minX + 1;
        const isRowClear = (row: number) => {
          for (let x = labelX; x < labelX + LABEL_SPAN; x++) {
            if (!this.grid.isWalkable(x, row)) return false;
          }
          return true;
        };
        // 존의 좌측 상단 바로 위 행부터, 라벨이 깔릴 가로 폭 전체가 매대로 막혀있지 않은 행을
        // 만날 때까지 한 칸씩 위로 올라가며 찾는다.
        labelRow = b.minY - 1;
        let guard = 0;
        while (labelRow >= 0 && !isRowClear(labelRow) && guard < 10) {
          labelRow--;
          guard++;
        }
        // 그래도 못 찾았으면(매장 맨 위 벽에 닿는 등) 원래 자리로 되돌린다 — 탐색 중 엉뚱한
        // 매대 위에 멈춰있는 상태로 남지 않도록.
        if (labelRow < 0 || !isRowClear(labelRow)) labelRow = Math.max(0, b.minY - 1);
      }
      const txt = this.add.text(labelX * TILE, labelRow * TILE, `${zone.letter} ${zone.label}`, {
        fontSize: '25px', // 전체 라벨 20px로 통일(성원님 요청)
        color: '#333333',
        backgroundColor: '#ffffffaa',
        padding: { x: 2, y: 1 },
      });
      this.labelLayer.add(txt);
    }

    const allFacilities = this.floorData.facilities ?? [];
    for (const fac of allFacilities) {
      this.facilityByCell.set(`${fac.x},${fac.y}`, fac);
      const fx = fac.x * TILE + TILE / 2;
      const fy = fac.y * TILE + TILE / 2;
      // 원하는 확대 배율(FACILITY_ICON_SCALE)을 그대로 적용하면, 바로 옆칸에 다른 시설이
      // 붙어있는 경우(예: 3층의 에스컬레이터 상/하행이 1칸 간격) 아이콘끼리 겹쳐버린다.
      // 그래서 가장 가까운 다른 시설까지의 실제 거리를 구해서, 그 거리를 넘지 않는 선까지만
      // 키운다 — 여유 공간이 있는 시설(예: 엘리베이터 단독)은 최대 배율까지 커지고, 다닥다닥
      // 붙은 시설들은 자동으로 덜 커져서 겹침을 피한다.
      const desiredScale = FACILITY_ICON_SCALE[fac.type] ?? 1;
      let nearestDist = Infinity;
      for (const other of allFacilities) {
        if (other === fac) continue;
        const ox = other.x * TILE + TILE / 2;
        const oy = other.y * TILE + TILE / 2;
        const dist = Math.hypot(ox - fx, oy - fy);
        if (dist < nearestDist) nearestDist = dist;
      }
      const maxSizeFromNeighbor = nearestDist === Infinity ? Infinity : nearestDist * 0.92;
      const displaySize = Math.max(TILE, Math.min(TILE * desiredScale, maxSizeFromNeighbor));
      const iconRadius = displaySize * 0.55;

      const shadow = this.add.circle(fx + 1, fy + 1.5, iconRadius, 0x000000, 0.15);
      this.facilityLayer.add(shadow);
      // 참고 도면과 스타일을 맞추기 위해 이미지 대신 항상 이모지 원형 배지로 그린다.
      const bg = this.add.circle(fx, fy, iconRadius, FACILITY_COLOR[fac.type] ?? 0x1f2937, 0.92);
      bg.setStrokeStyle(1.5, 0xffffff, 0.7);
      const icon = this.add.text(fx, fy, FACILITY_ICON[fac.type] ?? '?', { fontSize: '14px' });
      icon.setOrigin(0.5);
      this.facilityLayer.add(bg);
      this.facilityLayer.add(icon);
      // 엘리베이터/에스컬레이터(상행)/에스컬레이터(하행)가 한 줄에 나란히 붙어있어서
      // 라벨을 같은 높이에 두면 옆칸 라벨과 겹친다 — 종류별로 다른 높이(tier)에 배치해서 피한다.
      // 오프셋도 위에서 구한 iconRadius(=실제로 커진 아이콘 크기) 기준으로 계산해서, 아이콘을
      // 키워도 라벨이 아이콘에 파묻히지 않게 한다.
      const LABEL_TIER: Record<string, number> = { elevator: -2, escalator_up: -1, escalator_down: 1 };
      const tier = LABEL_TIER[fac.type] ?? 1; // 기본: 바로 아래
      const labelY = fy + Math.sign(tier) * (iconRadius + 2 + (Math.abs(tier) - 1) * 12);
      const label = this.add.text(fx, labelY, FACILITY_LABEL[fac.type] ?? fac.type, {
        fontSize: '25px',
        color: '#1f2937',
        backgroundColor: '#ffffffcc',
        padding: { x: 2, y: 1 },
      });
      label.setOrigin(0.5, tier < 0 ? 1 : 0);
      this.facilityLayer.add(label);
    }

    const worldW = this.floorData.gridWidth * TILE;
    const worldH = this.floorData.gridHeight * TILE;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
  }

  // 손님(플레이어) 캐릭터 — "빨간모자" 에셋 팩의 idle 애니메이션으로 시작한다.
  // 원본 primitive-shape(원+타원) 렌더링 대신 실제 스프라이트를 쓰되, 발밑 그림자는 그대로
  // 유지해서 바닥에 붙어있는 느낌을 살린다. this.playerSprite에 실제 스프라이트를 따로
  // 보관해두는 이유는 이동 중 애니메이션 전환(idle↔run)과 좌우 반전(flipX)을
  // walkTo/advancePath에서 직접 제어해야 하기 때문 — container 자체는 위치 이동(tween
  // target)에만 쓰인다.
  private buildPlayer(): Phaser.GameObjects.Container {
    const shadow = this.add.ellipse(0, TILE * 0.55, TILE * 0.6, TILE * 0.22, 0x000000, 0.25);
    const sprite = this.add.sprite(0, 0, `${PLAYER_CHAR.key}-idle-1`);
    this.fitCharSprite(sprite, PLAYER_CHAR);
    sprite.play(`${PLAYER_CHAR.key}-idle`);
    this.playerSprite = sprite;
    // 09-03: NPC(직원) 이름표와 같은 스타일로, 플레이어 머리 위에도 이름표를 띄운다.
    // 초기 텍스트는 App.tsx가 setPlayerLabel()로 로그인 상태를 알려주기 전까지 보일
    // 기본값 — 로그인 여부를 아직 모르는 상태이므로 비로그인으로 시작한다.
    const label = this.add.text(0, -PLAYER_CHAR.displayHeight * 0.62, '(비로그인)', {
      fontSize: '20px',
      color: '#78350f',
      backgroundColor: '#fef3c7cc',
      padding: { x: 2, y: 0 },
    });
    label.setOrigin(0.5);
    this.playerLabel = label;
    const c = this.add.container(0, 0, [shadow, sprite, label]);
    c.setDepth(DEPTH_PLAYER);
    return c;
  }

  // App.tsx(우측 frontend iframe에서 postMessage로 받은 로그인 상태)가 로그인/로그아웃될
  // 때마다 호출 — 휴대폰 뒷번호(마지막 4자리) 또는 "(비로그인)"을 플레이어 머리 위에 표시한다.
  setPlayerLabel(text: string) {
    this.playerLabel?.setText(text);
  }

  // 직원(NPC) 캐릭터 — "로봇" 에셋 팩 스프라이트 + 위에 "직원" 이름표를 띄운다.
  private buildNpcVisual(): { container: Phaser.GameObjects.Container; sprite: Phaser.GameObjects.Sprite } {
    const shadow = this.add.ellipse(0, TILE * 0.55, TILE * 0.6, TILE * 0.22, 0x000000, 0.25);
    const sprite = this.add.sprite(0, 0, `${NPC_CHAR.key}-idle-1`);
    this.fitCharSprite(sprite, NPC_CHAR);
    sprite.play(`${NPC_CHAR.key}-idle`);
    const tag = this.add.text(0, -NPC_CHAR.displayHeight * 0.62, '직원', {
      fontSize: '20px',
      color: '#78350f',
      backgroundColor: '#fef3c7cc',
      padding: { x: 2, y: 0 },
    });
    tag.setOrigin(0.5);
    const c = this.add.container(0, 0, [shadow, sprite, tag]);
    c.setDepth(DEPTH_NPC);
    return { container: c, sprite };
  }

  // 원본 프레임 비율을 유지하면서 세로 크기를 displayHeight에 맞춘다(가로는 비율대로 자동).
  private fitCharSprite(sprite: Phaser.GameObjects.Sprite, cfg: CharacterAnimConfig) {
    const scale = cfg.displayHeight / sprite.height;
    sprite.setScale(scale);
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

    // 지하 창고 제거 요청 — NPC가 없으면(count === 0) "🚚 지하 창고 반입구" 표시도 같이 없앤다.
    this.npcHomeMarker?.destroy();
    this.npcHomeMarker = undefined;
    if (count > 0) {
      this.npcHomeMarker = this.add
          .text(this.npcHomeCell.x * TILE + TILE / 2, this.npcHomeCell.y * TILE - 2, '🚚 지하 창고 반입구', {
            fontSize: '20px',
            color: '#78350f',
            backgroundColor: '#fef3c7cc',
            padding: { x: 2, y: 0 },
          })
          .setOrigin(0.5, 1)
          .setDepth(DEPTH_NPC);
    }

    for (let i = 0; i < count; i++) {
      const cell = this.npcHomeCell;
      const { container, sprite } = this.buildNpcVisual();
      container.setPosition(cell.x * TILE + TILE / 2, cell.y * TILE + TILE / 2);
      const npc: NpcAgent = { container, sprite, gridPos: cell, path: [], moving: false };
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
          this.setCharMotion(npc.sprite, NPC_CHAR, false, 0);
          resolve();
          return;
        }
        npc.moving = true;
        const next = npc.path.shift()!;
        const tx = next.x * TILE + TILE / 2;
        const ty = next.y * TILE + TILE / 2;
        const dist = Phaser.Math.Distance.Between(npc.container.x, npc.container.y, tx, ty);
        // 09-03: 하한을 40ms->8ms로 낮춤(성원님 요청: 높을 이유 없음). 0으로 두지
        // 않는 이유는 duration:0인 tween은 onComplete가 같은 프레임에서 바로 또 불려서,
        // 경로가 아주 길면 advancePath()가 동기적으로 계속 재귀 호출되며 콜스택을 먹을
        // 위험이 있다 — 8ms(최소 한 프레임)만 줘도 매 스텝이 다음 프레임으로 넘어가서
        // 그 문제가 없다.
        const duration = Math.max((dist / NPC_SPEED) * 1000, 8);
        this.setCharMotion(npc.sprite, NPC_CHAR, true, next.x - npc.gridPos.x);
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
    // 예전엔 매대 하나하나(많으면 수천 개)를 순서대로 /api/locations/{id}/products로 조회
    // 했다 — 층이 커지면서 이 스캔 한 번에 요청이 수천 번 나가 NPC가 멈춘 것처럼 보이고
    // 다른 요청(매대 클릭 등)까지 브라우저 동시연결 수 제한에 걸려 밀리는 문제가 있었다.
    // 지금은 층 전체 재고부족 매대를 서버 쿼리 한 번으로 받아온다.
    const locationById = new Map(this.floorData.locations.map((l) => [l.locationId, l]));
    let candidates: { locationId: string; skuIds: number[] }[];
    try {
      candidates = await fetchLowStockLocations(this.floorData.floor);
    } catch {
      return null; // 서버 오류 시 이번 라운드는 그냥 쉬고 다음에 다시 시도
    }
    const offset = Phaser.Math.Between(0, Math.max(0, candidates.length - 1));
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[(offset + i) % candidates.length];
      if (this.claimedTargets.has(cand.locationId)) continue;
      const loc = locationById.get(cand.locationId);
      if (!loc) continue; // 방어적: floorAmenities 등 표시용 데이터와 안 겹치는 실제 매대만
      return { loc, skuIds: cand.skuIds };
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
          fontSize: '20px',
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

  private toggleOccupiedDebugOverlay() {
    if (this.debugOccupiedLayer) {
      this.debugOccupiedLayer.destroy();
      this.debugOccupiedLayer = undefined;
      return;
    }
    const g = this.add.graphics();
    g.setDepth(DEPTH_PATH + 1); // 매대/라벨/시설보다도 위에 그려서 확실히 보이게
    g.fillStyle(0xff0000, 0.35);
    for (const [x, y] of this.floorData.occupied) {
      g.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    this.debugOccupiedLayer = g;
  }

  // P키로 호출됨 — 지금 마우스가 있는 칸의 grid 좌표(x,y)와, 그 칸이 매대/시설이면 관련
  // 정보(zoneId, locationId, 시설 타입)까지 같이 보여준다. 다시 누르면 사라진다(토글).
  private showCellAddressAtPointer() {
    if (this.cellAddressLabel) {
      this.cellAddressLabel.destroy();
      this.cellAddressLabel = undefined;
      return;
    }
    const pointer = this.input.activePointer;
    const gx = Math.floor(pointer.worldX / TILE);
    const gy = Math.floor(pointer.worldY / TILE);
    const loc = this.locationByCell.get(`${gx},${gy}`);
    const fac = this.facilityByCell.get(`${gx},${gy}`);
    const blocked = !this.grid.isWalkable(gx, gy);
    let info = `x: ${gx}, y: ${gy}`;
    if (loc) info += `\n${loc.zoneId} / ${loc.locationId}`;
    if (fac) info += `\n시설: ${fac.type}`;
    if (blocked && !loc && !fac) info += `\n[점유칸(매대/벽)]`;
    const label = this.add.text(gx * TILE + TILE / 2, gy * TILE, info, {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#000000cc',
      align: 'center',
      padding: { x: 4, y: 2 },
    });
    label.setOrigin(0.5, 1);
    label.setDepth(DEPTH_PATH + 2);
    this.cellAddressLabel = label;
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
      const locs = this.locationsByCell.get(`${this.playerGrid.x + dx},${this.playerGrid.y + dy}`);
      if (locs && locs.length > 0) {
        this.events2.onLocationInteract?.(locs);
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
      this.setCharMotion(this.playerSprite, PLAYER_CHAR, false, 0);
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
    // 걷는 방향(가로 성분)에 맞춰 캐릭터를 좌우로 뒤집고 run 애니메이션으로 전환한다.
    this.setCharMotion(this.playerSprite, PLAYER_CHAR, true, next.x - this.playerGrid.x);
    this.tweens.add({
      targets: this.player,
      x: targetX,
      y: targetY,
      duration: Math.max(duration, 8), // 09-03: 40ms->8ms로 낮춤(성원님 요청) — 이유는 위 NPC 쪽 주석과 동일
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

  // 09-03: 우클릭 드래그(pointermove)가 scrollX/scrollY를 clamp 없이 그냥 더해서, 지도
  // 밖으로 한없이 끌고 나갈 수 있었다("확대/축소해도 끝까지 안 보인다"는 성원님 피드백의
  // 원인) — getScrollInfo()/setScrollX()/setScrollY()가 쓰는 것과 똑같은 공식으로 여기서도
  // 매번 다시 맵 범위 안으로 당겨준다. 휠 줌도 줌 배율이 바뀌면 한 화면에 보이는 world
  // 폭/높이(viewWidth/viewHeight)가 바뀌어서 기존 스크롤 위치가 새 범위를 벗어날 수 있으므로
  // 줌을 바꾼 직후에도 똑같이 다시 당겨준다.
  private clampCameraScroll() {
    if (!this.floorData) return;
    const cam = this.cameras.main;
    const worldWidth = this.floorData.gridWidth * TILE;
    const worldHeight = this.floorData.gridHeight * TILE;
    const viewWidth = cam.width / cam.zoom;
    const viewHeight = cam.height / cam.zoom;
    const maxX = Math.max(0, worldWidth - viewWidth);
    const maxY = Math.max(0, worldHeight - viewHeight);
    cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, maxX);
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, maxY);
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
      this.clampCameraScroll();
    });
    this.input.on('pointerup', () => (dragging = false));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, this.minZoom, 3);
      this.cameras.main.setZoom(zoom);
      // 최소 줌보다 더 확대한 상태에서만 "사용자가 직접 확대 중"으로 본다. 도로 끝까지
      // 축소하면 다시 자동 맞춤 대상이 된다.
      this.userZoomed = zoom > this.minZoom + 0.0001;
      this.clampCameraScroll();
    });
  }
}