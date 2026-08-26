import Phaser from 'phaser';
import type { FloorData, LocationInfo, FacilityInfo, GridPoint } from '../types';
import { Grid, findPath } from '../pathfinding/astar';
import { fetchProductsAtLocation, adjustStock } from '../../api/products';
import { confirmRestock } from '../../api/locations';

// ════════════════════════════════════════════════════════════════════════════
// StoreScene.ts — 매장 층(B1/1F/2F/3F) 하나를 그리고 캐릭터를 움직이는 Phaser Scene.
// 이 파일 하나가 "그 층이 어떻게 생겼는지"부터 "클릭하면 어디로 걷는지"까지 다 담당한다.
// 아래는 코드를 직접 손보려는 사람을 위한 전체 지도(map) 겸 설명이다 — 각 항목이 파일의
// 어느 부분에 해당하는지 적어뒀으니, 이 주석만 읽고도 어디를 고쳐야 할지 감을 잡을 수 있다.
//
// 1) 이미지(텍스처) 교체는 여기서 한다 — 아래 3개의 Record<string, string> 상수
//    - ZONE_TEXTURE        : 존(zoneId)마다 "칸 하나짜리"(48x48) 매대 이미지. 합쳐지지 못하고
//                            혼자 남는 칸이나, mergedTex가 없는 존에서 쓰인다.
//    - ZONE_TEXTURE_MERGED : 존마다 "여러 칸을 합친" 이미지(원본 96x96, "-m" 접미사 파일).
//                            같은 존의 인접한 두세 칸을 하나의 큰 이미지로 그릴 때 이 값을 쓴다.
//                            실제 이미지 파일은 public/assets/tiles/ 폴더에 있고, preload()에서
//                            이 파일 이름 그대로 텍스처로 로드한다(파일명 = 텍스처 키).
//    - FACILITY_IMAGE      : 엘리베이터·화장실·정수기 같은 "시설"용 이미지(예: 정수기 =
//                            facility-water.png). 이 맵에 없는 시설 타입은 이미지 대신
//                            이모지 원형 배지(FACILITY_ICON/FACILITY_COLOR)로 그려진다.
//    ⇒ 이미지를 바꾸고 싶으면: (a) public/assets/tiles/에 새 PNG를 넣고 (b) preload()의 로드
//      목록에 추가하고 (c) 위 3개 맵 중 해당하는 곳의 값(파일명, 확장자 뺀 텍스처 키)을
//      바꾸면 된다. 코드의 나머지 부분(좌표 계산, 합치기 로직 등)은 손댈 필요 없다.
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
// 4) 매대 "칸 합치기" 로직(buildFloor() 안, rackGroups 순회 부분) — 원래는 매대 1칸에
//    이미지 1개씩이었는데, 그러면 실제 매장처럼 안 보여서 인접한 칸들을 묶어 큰 이미지 하나로
//    그리도록 바꿨다. 같은 rack(매대 묶음) 안에서 "2행짜리(세로로 두 줄)"면 ZONE_ROWS2_MODE,
//    "2열짜리(가로로 두 줄)"면 ZONE_COLS2_MODE 설정을 보고 2칸씩(1x2/2x1) 또는 2x2로 묶는다.
//    2x2로 묶다가 칸 수가 홀수라 짝이 안 맞아 혼자 남는 줄/칸도, 다른 매대들과 크기가
//    똑같아 보이도록 일부러 2x2 크기 그대로 크게 그린다(실제 칸은 좁아도 이미지가 옆
//    통로 쪽으로 살짝 넘치는 걸 감수함 — "칸 하나하나를 정확히 표현"하는 것보다 "매장처럼
//    커 보이는 것"을 우선하기로 한 팀 결정).
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
const PLAYER_SPEED = 330; // px/sec — TILE 16→24(1.5배)에 맞춰 화면상 체감 속도가 그대로이도록 같이 1.5배
const HOLD_MOVE_DELAY = 140; // 방향키를 누르고 있을 때 한 칸 이동 간격(ms)

// ── NPC(재고 담당 직원) 관련 상수 ──
// NPC는 "지하 창고에서 물건을 받아 각 층 매대로 배달"하는 흐름을 표현한다 — 실제로 B1 씬까지
// 오가는 건 아니고(한 번에 한 층만 씬에 로드되는 구조라서), 그 층의 엘리베이터 앞을 "지하
// 창고 반입구"로 삼아 NPC가 매번 그 자리를 거쳐서 매대로 이동하는 것으로 연출한다.
const NPC_COUNT = 3; // 층당 동시에 돌아다니는 직원 수
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
const DEPTH_FACILITY = 20;
const DEPTH_LABEL = 30;
const DEPTH_PATH = 40;
const DEPTH_NPC = 900;
const DEPTH_PLAYER = 1000;

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

// 시설 중 실제 타일팩 이미지가 있는 것만 여기 등록 — 나머지는 계속 이모지 아이콘을 쓴다.
// (정수기는 "Modern Supermarket" 팩에 냉온수기 스프라이트가 있어서 이모지 대신 이걸 쓴다.
// 엘리베이터/에스컬레이터는 새로 받은 "Modern Shopping Mall" 팩에서 잘라 넣었다. 남녀 화장실은
// AI 생성 프롬프트로 만든 문 표지판 이미지를 추가했다. 가족 화장실(family_restroom)은 마땅한
// 그림이 없어서 계속 이모지 배지를 쓴다.)
const FACILITY_IMAGE: Record<string, string> = {
  water: 'facility-water',
  elevator: 'facility-elevator',
  escalator_up: 'facility-escalator-up',
  escalator_down: 'facility-escalator-down',
  restroom_male: 'facility-restroom-male',
  restroom_female: 'facility-restroom-female',
};

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

// ServiceArea(계산대·ATM·베이커리 같은 "표시용 구역")도 "Modern Shopping Mall" 팩에서
// 잘라 넣은 이미지가 있으면 회색 박스 대신 그 이미지를 그린다. 키는 floor{N}.json의
// serviceAreas[].id — 1F의 event-1/event-2 두 곳은 같은 이미지(행사 매대)를 재사용한다.
// 이 표에 없는 id(예: 안경·보청기 센터, 약국, A/S센터 — 이 팩에도 마땅한 그림이 없었음)는
// 계속 예전처럼 회색 박스 + 글자만 표시된다.
const SERVICE_AREA_IMAGE: Record<string, string> = {
  checkout: 'service-checkout',
  atm: 'service-atm',
  'bakery-counter': 'service-bakery',
  'food-court': 'service-food-court',
  'customer-center': 'service-customer-center',
  entrance: 'service-entrance',
  'event-1': 'service-event-1f',
  'event-2': 'service-event-1f',
  event: 'service-event-2f',
  'tasting-corner': 'service-tasting-corner',
  'appliance-experience': 'service-appliance',
  lounge: 'service-lounge',
  'as-center': 'service-as-center', // 모니터·카메라·키보드 진열 이미지로 대체 — 전자기기 A/S 이미지에 가장 가까움
  'optical-hearing-center': 'service-optical-hearing',
  pharmacy: 'service-pharmacy',
};

// ── 매대/바닥 스프라이트 (Kenney가 아니라 "Modern Supermarket" 유료 픽셀아트 타일팩,
// comshadow/Cute SCKR, CC 상업이용 허용) ──
// public/assets/tiles/*.png 로 슬라이스해서 넣어둔 48x48 원본을 TILE 크기로 축소해서 그린다.
// zoneId(예: 'F1-A') 단위로 매핑 — 층마다 zoneId가 겹치지 않으므로 이걸로 충분하다.
const ZONE_TEXTURE: Record<string, string> = {
  'F1-A': 'zone-f1-a-canned',
  'F1-B': 'zone-f1-b-snack',
  'F1-C': 'zone-f1-c-produce',
  'F1-D': 'zone-f1-d-meat',
  'F1-E': 'zone-f1-e-sauce',
  'F1-F': 'zone-f1-f-drinks',
  'F1-G': 'zone-f1-g-refrigerated',
  'F1-H': 'zone-f1-h-frozen',
  'F2-A': 'zone-f2-a-pet',
  'F2-B': 'zone-f2-b-beauty',
  'F2-C': 'zone-f2-c-storage',
  'F2-D': 'zone-f2-d-hygiene',
  'F2-E': 'zone-f2-e-kitchen',
  'F2-F': 'zone-f2-f-cleaning',
  'F3-A': 'zone-f3-a-sports',
  'F3-B': 'zone-f3-b-appliance',
  'F3-C': 'zone-f3-c-toys',
  'F3-D': 'zone-f3-d-clothing',
  'F3-E': 'zone-f3-e-bags',
};

// zoneId별 "합쳐진 매대" 텍스처(96x48 원본, 여러 상품이 한 이미지에 진열된 형태) — 인접한 두 칸을
// 하나로 합쳐서 그릴 때 씀(칸마다 매대 하나를 반복해서 그리는 대신, 실제 매대처럼 넓게 진열된
// 이미지를 쓰기 위함). 세로로 합칠 땐 TILE x TILE*2로, 가로로 합칠 땐 TILE*2 x TILE로 늘려서 그린다.
const ZONE_TEXTURE_MERGED: Record<string, string> = {
  'F1-A': 'zone-f1-a-canned-m',
  'F1-B': 'zone-f1-b-snack-m',
  'F1-C': 'zone-f1-c-produce-m',
  'F1-D': 'zone-f1-d-meat-m',
  'F1-E': 'zone-f1-e-sauce-m',
  'F1-F': 'zone-f1-f-drinks-m',
  'F1-G': 'zone-f1-g-refrigerated-m',
  'F1-H': 'zone-f1-h-frozen-m',
  'F2-A': 'zone-f2-a-pet-m',
  'F2-B': 'zone-f2-b-beauty-m',
  'F2-C': 'zone-f2-c-storage-m',
  'F2-D': 'zone-f2-d-hygiene-m',
  'F2-E': 'zone-f2-e-kitchen-m',
  'F2-F': 'zone-f2-f-cleaning-m',
  'F3-A': 'zone-f3-a-sports-m',
  'F3-B': 'zone-f3-b-appliance-m',
  'F3-C': 'zone-f3-c-toys-m',
  'F3-D': 'zone-f3-d-clothing-m',
  'F3-E': 'zone-f3-e-bags-m',
};

// B1(중앙창고)은 존이 하나(B1-W)뿐이라 텍스처도 하나면 단조로우므로, 위치 인덱스에 따라
// 상자/크레이트 몇 종을 순환시켜 창고답게 섞어 놓는다.
const WAREHOUSE_CRATES = ['crate-red', 'crate-green', 'crate-blue', 'crate-box', 'crate-wood'];

// 특정 존은 "매대(rack) 하나당 텍스처 하나"를 고정으로 반복하지 않고, 그 존 안의 rack마다
// 서로 다른 이미지를 순환해서 쓴다 — 완구·문구(F3-C) 존이 "매대 구성: 서로 다른 인형매대
// 2종류 + 자동차매대"로 채워달라는 요청을 받아 추가한 구조. rackGroups를 순회하면서
// zoneId가 여기 등록돼 있으면, ZONE_TEXTURE/ZONE_TEXTURE_MERGED의 고정 텍스처 대신
// 아래 배열을 rack 등장 순서대로 순환시켜 골라 쓴다(WAREHOUSE_CRATES와 같은 방식이지만
// "칸 단위"가 아니라 "rack 단위"로 순환한다는 점이 다르다).
const ZONE_RACK_TEXTURE_VARIANTS: Record<string, { single: string; merged: string }[]> = {
  // 1층 식료품 존들 — "Modern Supermarket2" 팩(실사 수퍼마켓 상품 아이콘)을 받아서 추가.
  // 기존 zone-f1-*(단일 텍스처)는 ZONE_TEXTURE/ZONE_TEXTURE_MERGED에 남겨두고 그대로
  // variant 1번으로 재사용 — 매대마다 완전히 다른 상품이 보이도록 2~3종을 더했다.
  'F1-A': [
    { single: 'zone-f1-a-canned', merged: 'zone-f1-a-canned-m' }, // 기존 통조림 매대
    { single: 'zone-f1-a-canned-1', merged: 'zone-f1-a-canned-1-m' }, // 토마토/과일 통조림
    { single: 'zone-f1-a-canned-2', merged: 'zone-f1-a-canned-2-m' }, // 채소 통조림
    { single: 'zone-f1-a-canned-3', merged: 'zone-f1-a-canned-3-m' }, // 시리얼·파스타
  ],
  'F1-B': [
    { single: 'zone-f1-b-snack', merged: 'zone-f1-b-snack-m' }, // 기존 과자 매대
    { single: 'zone-f1-b-snack-1', merged: 'zone-f1-b-snack-1-m' }, // 초콜릿바
    { single: 'zone-f1-b-snack-2', merged: 'zone-f1-b-snack-2-m' }, // 빵(번)
    { single: 'zone-f1-b-snack-3', merged: 'zone-f1-b-snack-3-m' }, // 페이스트리·케이크
  ],
  'F1-C': [
    { single: 'zone-f1-c-produce', merged: 'zone-f1-c-produce-m' }, // 기존 채소 매대
    { single: 'zone-f1-c-produce-1', merged: 'zone-f1-c-produce-1-m' }, // 사과
    { single: 'zone-f1-c-produce-2', merged: 'zone-f1-c-produce-2-m' }, // 오렌지
    { single: 'zone-f1-c-produce-3', merged: 'zone-f1-c-produce-3-m' }, // 청사과·오렌지
  ],
  'F1-D': [
    { single: 'zone-f1-d-meat', merged: 'zone-f1-d-meat-m' }, // 기존 정육 진열대
    { single: 'zone-f1-d-meat-2', merged: 'zone-f1-d-meat-2-m' }, // 정육(스테이크·덩어리)
    { single: 'zone-f1-d-meat-3', merged: 'zone-f1-d-meat-3-m' }, // 델리(햄) 진열대
  ],
  'F1-E': [
    { single: 'zone-f1-e-sauce', merged: 'zone-f1-e-sauce-m' }, // 기존 소스 매대
    { single: 'zone-f1-e-sauce-1', merged: 'zone-f1-e-sauce-1-m' }, // 향신료 병 진열대
    { single: 'zone-f1-e-sauce-2', merged: 'zone-f1-e-sauce-2-m' }, // 향신료 벌크 디스펜서
  ],
  'F1-F': [
    { single: 'zone-f1-f-drinks', merged: 'zone-f1-f-drinks-m' }, // 기존 음료 매대
    { single: 'zone-f1-f-drinks-1', merged: 'zone-f1-f-drinks-1-m' }, // 콜라
    { single: 'zone-f1-f-drinks-2', merged: 'zone-f1-f-drinks-2-m' }, // 사이다·환타
    { single: 'zone-f1-f-drinks-3', merged: 'zone-f1-f-drinks-3-m' }, // 과일주스
    { single: 'zone-f1-f-drinks-4', merged: 'zone-f1-f-drinks-4-m' }, // 이온음료·차
  ],
  'F1-G': [
    { single: 'zone-f1-g-refrigerated', merged: 'zone-f1-g-refrigerated-m' }, // 기존 냉장 매대
    { single: 'zone-f1-g-refrigerated-1', merged: 'zone-f1-g-refrigerated-1-m' }, // 냉장 음료 케이스
    { single: 'zone-f1-g-refrigerated-2', merged: 'zone-f1-g-refrigerated-2-m' }, // 냉장 케이스(다른 색)
    { single: 'zone-f1-g-refrigerated-3', merged: 'zone-f1-g-refrigerated-3-m' }, // 냉장 진열 상품
  ],
  'F1-H': [
    { single: 'zone-f1-h-frozen', merged: 'zone-f1-h-frozen-m' }, // 기존 냉동 매대
    { single: 'zone-f1-h-frozen-1', merged: 'zone-f1-h-frozen-1-m' }, // 냉동고 케이스
    { single: 'zone-f1-h-frozen-2', merged: 'zone-f1-h-frozen-2-m' }, // 냉동고 케이스(대형)
    { single: 'zone-f1-h-frozen-3', merged: 'zone-f1-h-frozen-3-m' }, // 냉동고 케이스(세로형)
  ],
  'F3-C': [
    { single: 'zone-f3-c-toys-plush1', merged: 'zone-f3-c-toys-plush1-m' }, // 곰인형 매대
    { single: 'zone-f3-c-toys-plush2', merged: 'zone-f3-c-toys-plush2-m' }, // 인형뽑기 기계
    { single: 'zone-f3-c-toys-cars', merged: 'zone-f3-c-toys-cars-m' }, // 자동차 장난감 매대
  ],
  'F3-D': [
    { single: 'zone-f3-d-clothing-1', merged: 'zone-f3-d-clothing-1-m' }, // 접힌 옷 진열대
    { single: 'zone-f3-d-clothing-2', merged: 'zone-f3-d-clothing-2-m' }, // 청바지 옷걸이
    { single: 'zone-f3-d-clothing-3', merged: 'zone-f3-d-clothing-3-m' }, // 컬러풀 옷걸이 랙
    { single: 'zone-f3-d-clothing-4', merged: 'zone-f3-d-clothing-4-m' }, // 회전식 원형 옷걸이
    { single: 'zone-f3-d-clothing-5', merged: 'zone-f3-d-clothing-5-m' }, // 서랍장 진열대
  ],
  // 2층 뷰티·헬스 구역 — "Shopping Mall" 팩의 화장품 매대 3종을 받아서 추가. 나머지
  // 5개 구역(세탁·청소/화장지·위생/반려용품/수납·생활잡화/주방용품)은 두 팩(Modern Shopping
  // Mall2, Shopping Mall) 어디에도 다른 상품과 섞이지 않은 깔끔한 매대형 이미지가 없어서
  // AI 생성 프롬프트로 매대형 이미지를 새로 만들어 추가했다(채팅 답변 참고).
  'F2-B': [
    { single: 'zone-f2-b-beauty', merged: 'zone-f2-b-beauty-m' }, // 기존 단품 아이콘 매대
    { single: 'zone-f2-b-beauty-2', merged: 'zone-f2-b-beauty-2-m' }, // 로션·튜브 매대
    { single: 'zone-f2-b-beauty-3', merged: 'zone-f2-b-beauty-3-m' }, // 아이섀도·립스틱 매대
    { single: 'zone-f2-b-beauty-4', merged: 'zone-f2-b-beauty-4-m' }, // 마스카라·향수 매대
  ],
  'F2-F': [
    { single: 'zone-f2-f-cleaning', merged: 'zone-f2-f-cleaning-m' }, // 기존 단품 아이콘 매대
    { single: 'zone-f2-f-cleaning-rack', merged: 'zone-f2-f-cleaning-rack-m' }, // AI 생성 세제·청소용품 매대
  ],
  'F2-D': [
    { single: 'zone-f2-d-hygiene', merged: 'zone-f2-d-hygiene-m' }, // 기존 단품 아이콘 매대
    { single: 'zone-f2-d-hygiene-rack', merged: 'zone-f2-d-hygiene-rack-m' }, // AI 생성 화장지·위생용품 매대
  ],
  'F2-A': [
    { single: 'zone-f2-a-pet', merged: 'zone-f2-a-pet-m' }, // 기존 단품 아이콘 매대
    { single: 'zone-f2-a-pet-rack', merged: 'zone-f2-a-pet-rack-m' }, // AI 생성 반려용품 매대
  ],
  'F2-C': [
    { single: 'zone-f2-c-storage', merged: 'zone-f2-c-storage-m' }, // 기존 단품 아이콘 매대
    { single: 'zone-f2-c-storage-rack', merged: 'zone-f2-c-storage-rack-m' }, // AI 생성 수납·생활잡화 매대
  ],
  'F2-E': [
    { single: 'zone-f2-e-kitchen', merged: 'zone-f2-e-kitchen-m' }, // 기존 단품 아이콘 매대
    { single: 'zone-f2-e-kitchen-rack', merged: 'zone-f2-e-kitchen-rack-m' }, // AI 생성 주방용품 매대
  ],
};

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

// 매대 스프라이트를 칸 크기 그대로 꽉 채우지 않고 살짝 인셋을 줘서, 옆 칸 매대와 완전히
// 붙어있지 않고 사이에 얇은 바닥 틈이 보이게 한다 — "다닥다닥 붙어있다"는 인상을 줄이기 위함.
// 0.92 → 0.85로 더 낮춰서 매대 사이 틈을 눈에 띄게 넓혔다.
const SHELF_INSET = 0.85;

// rack이 "여러 칸 x 2행"(가로로 긴 두 줄) 모양일 때, 기본은 한 칸씩 세로로만 합쳐서
// 1x2(칸 하나 너비 x 2칸 높이)로 그린다. 존별로 '2x2'를 지정하면 가로로도 두 칸씩 묶어서
// 2x2(정사각형에 가까운) 큰 이미지 하나로 그린다 — 이미지가 원래 정사각형(96x96)이라 2x2로
// 그리면 늘리지 않고 그대로 보여줄 수 있어서 더 선명하게 보인다.
// 처음엔 1F 일부 존만 2x2로 바꿨었는데, 2F·3F가 여전히 얇은 1x2 줄로 남아 다닥다닥해 보인다는
// 피드백을 받아 아래에 명시 안 된 존도 기본값을 '2x2'로 올렸다 — 결과적으로 거의 모든 존이 2x2.
const ZONE_ROWS2_MODE_DEFAULT: '1x2' | '2x2' = '2x2';
const ZONE_ROWS2_MODE: Record<string, '1x2' | '2x2'> = {
  'F1-A': '2x2', // 쌀·면·통조림
  'F1-D': '2x2', // 정육·수산·계란
  'F1-E': '2x2', // 소스·조미료·오일
  'F1-F': '2x2', // 음료·주류
  'F1-B': '1x2', // 간식·베이커리 — 위쪽(폭 넓은) 매대는 1x2 유지
  // F2/F3는 아래 명시 안 된 나머지 전부 위 기본값('2x2')을 그대로 따름
};

// rack이 "2칸 x 여러 행"(세로로 긴 두 줄) 모양일 때, 기본은 한 행씩 가로로만 합쳐서
// 2x1(2칸 너비 x 칸 하나 높이)로 그린다. 존별로 '2x2'를 지정하면 세로로도 두 칸씩 묶는다.
// ROWS2와 마찬가지로 기본값을 '2x2'로 올려서 2F·3F도 큼직하게 보이게 한다.
const ZONE_COLS2_MODE_DEFAULT: '2x1' | '2x2' = '2x2';
const ZONE_COLS2_MODE: Record<string, '2x1' | '2x2'> = {
  'F1-C': '2x2', // 청과·채소
  'F1-H': '2x2', // 냉동식품
  'F1-B': '2x2', // 간식·베이커리 — 아래쪽(폭 좁은) 매대는 2x2로
  'F1-G': '2x1', // 냉장식품 — 그대로 유지
};

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
  // 매대 바로 옆에서 스페이스바 — 그 매대에 진열된 상품 팝업을 띄우라는 신호.
  onLocationInteract?: (loc: LocationInfo) => void;
}

export default class StoreScene extends Phaser.Scene {
  private floorData!: FloorData;
  private grid!: Grid;
  private player!: Phaser.GameObjects.Container;
  private playerSprite!: Phaser.GameObjects.Sprite; // player 컨테이너 안의 실제 캐릭터 스프라이트
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
  // 이번 층에서 "화면을 꽉 채우는" 줌 값 — fitCameraToWorld()가 매번 다시 계산해서 넣어두고,
  // 휠 줌의 최소값으로도 같이 써서 사용자가 이보다 더 축소해서 매장을 작게 만들 수 없게 한다.
  private minZoom = 0.15;
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

  preload() {
    const base = 'assets/tiles';
    const keys = new Set<string>([
      ...Object.values(ZONE_TEXTURE),
      ...Object.values(ZONE_TEXTURE_MERGED),
      ...WAREHOUSE_CRATES,
      ...Object.values(ZONE_RACK_TEXTURE_VARIANTS).flatMap((variants) =>
        variants.flatMap((v) => [v.single, v.merged]),
      ),
      SALES_FLOOR_TEX,
      WAREHOUSE_FLOOR_TEX,
      ...Object.values(FACILITY_IMAGE),
      ...Object.values(SERVICE_AREA_IMAGE),
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
    // 바닥은 큰 패널 단위로만 아주 은은하게 명암이 바뀌는 시임리스 텍스처 — 1F·2F·3F는 같은
    // 텍스처, B1만 창고 느낌으로 다르게. 텍스처가 TILE=24 배수(288px = 12칸)로 만들어져 있어
    // 별도 스케일 조정 없이 1:1로 반복하면 된다.
    const floorTexKey = floorTexFor(this.floorData.floor);
    if (this.textures.exists(floorTexKey)) {
      const floorTiles = this.add.tileSprite(0, 0, worldW0, worldH0, floorTexKey);
      floorTiles.setOrigin(0, 0);
      this.floorTileLayer.setVisible(false);
      this.floorTileLayer.setDepth(DEPTH_FLOOR_TILE - 1); // fallback은 텍스처보다 더 아래
      this.shelfLayer.add(floorTiles);
      floorTiles.setDepth(DEPTH_FLOOR_TILE);
    } else {
      // 텍스처 로드 실패 시 안전망(단색).
      const fallbackColor = this.floorData.floor === 0 ? 0x9a9a9a : 0xe9e4d8;
      this.floorTileLayer.fillStyle(fallbackColor, 1);
      this.floorTileLayer.fillRect(0, 0, worldW0, worldH0);
    }

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
    for (const area of this.floorData.serviceAreas ?? []) {
      const ax = area.x * TILE;
      const ay = area.y * TILE;
      const aw = area.w * TILE;
      const ah = area.h * TILE;
      const box = this.add.rectangle(ax + aw / 2, ay + ah / 2, aw - 3, ah - 3, 0x9e9e9e, 0.55);
      box.setStrokeStyle(1.5, 0x757575, 0.9);
      this.shelfLayer.add(box);

      const imageKey = SERVICE_AREA_IMAGE[area.id];
      const hasImage = !!imageKey && this.textures.exists(imageKey);
      if (hasImage) {
        // 회색 박스는 "이 구역이 여기까지"라는 경계 표시로 옅게 남겨두고, 그 위에 실제
        // 이미지를 원본 비율 그대로(찌그러뜨리지 않고) 박스 안에 최대한 크게 맞춰 그린다.
        // 라벨은 이미지에 가리지 않도록 박스 아래쪽 끝에 작게 배치.
        box.setFillStyle(0x9e9e9e, 0.22);
        const src = this.textures.get(imageKey).getSourceImage() as HTMLImageElement;
        const availW = aw * 0.88;
        const availH = ah * 0.78; // 라벨 자리를 남겨두기 위해 세로는 더 여유를 둔다
        const scale = Math.min(availW / src.width, availH / src.height, 4);
        const img = this.add.image(ax + aw / 2, ay + ah * 0.42, imageKey);
        img.setDisplaySize(src.width * scale, src.height * scale);
        this.shelfLayer.add(img);
        const label = this.add.text(ax + aw / 2, ay + ah - 3, area.label, {
          fontSize: area.w * TILE < area.label.length * 9 ? '8px' : '10px',
          color: '#3a3a3a',
          align: 'center',
          backgroundColor: '#ffffffaa',
          padding: { x: 2, y: 0 },
          wordWrap: { width: aw - 6 },
        });
        label.setOrigin(0.5, 1);
        this.shelfLayer.add(label);
      } else {
        const fontSize = area.w * TILE < area.label.length * 9 ? '9px' : '11px';
        const label = this.add.text(ax + aw / 2, ay + ah / 2, area.label, {
          fontSize,
          color: '#3a3a3a',
          align: 'center',
          wordWrap: { width: aw - 6 },
        });
        label.setOrigin(0.5);
        this.shelfLayer.add(label);
      }
    }

    const zoneById = new Map(this.floorData.zones.map((z) => [z.zoneId, z]));

    this.floorData.locations.forEach((loc) => {
      this.locationByCell.set(`${loc.x},${loc.y}`, loc);
    });

    // ── 매대를 "칸 하나당 상품 하나"가 아니라, 실제 매대처럼 여러 상품이 한 이미지에 진열된
    // 큰 그림으로 채운다. rack(같은 매대 묶음) 안에서 두 칸이 자연스럽게 짝지어지는 경우
    // (같은 x에 y·y+1이 나란히 있거나, 같은 y에 x·x+1이 나란히 있는 경우) 그 둘을 하나로
    // 합쳐서 TILE x TILE*2(세로) 또는 TILE*2 x TILE(가로) 크기의 "합쳐진 매대" 이미지 하나로
    // 그린다. 짝을 못 찾은 칸만 예전처럼 1칸짜리 이미지로 그린다 — 칸 하나하나를 다 다르게
    // 표현하려는 집착을 버리고, 실제 매대처럼 뭉텅이로 보이게 하는 게 목적.
    const rackGroups = new Map<string, LocationInfo[]>();
    this.floorData.locations.forEach((loc) => {
      const key = `${loc.zoneId}::${loc.rack}`;
      const arr = rackGroups.get(key);
      if (arr) arr.push(loc);
      else rackGroups.set(key, [loc]);
    });

    const merged = new Set<string>(); // 이미 합쳐진 칸(재사용 방지)
    let warehouseIdx = 0;
    // ZONE_RACK_TEXTURE_VARIANTS에 등록된 존은 rack(매대)마다 다른 텍스처를 순환시켜 써야
    // 하므로, zoneId별로 "지금까지 몇 번째 rack을 그렸는지"를 따로 센다.
    const rackVariantIdx = new Map<string, number>();

    const cellKey = (x: number, y: number) => `${x},${y}`;
    const drawSprite = (
      cx: number,
      cy: number,
      w: number,
      h: number,
      texKey: string,
      fallbackColor: number,
      flip?: boolean,
    ) => {
      // 옆 칸과 완전히 붙어 보이지 않도록 살짝 인셋을 줘서 그린다(SHELF_INSET) — 매대 사이
      // 바닥이 얇게 보여서 "매대 하나하나"라는 게 눈에 들어오게 하기 위함.
      const dw = w * SHELF_INSET;
      const dh = h * SHELF_INSET;
      if (this.textures.exists(texKey)) {
        const shadow = this.add.ellipse(cx + 1, cy + dh * 0.32, dw * 0.8, dh * 0.24, 0x000000, 0.18);
        const sprite = this.add.image(cx, cy, texKey);
        sprite.setDisplaySize(dw, dh);
        // 같은 존 안의 매대들이 완전히 똑같은 이미지를 그대로 반복해서 "상품 하나만 잔뜩
        // 진열된 것처럼" 단조롭게 보인다는 피드백 — 새 이미지를 더 만들기 전 우선, 매대마다
        // 좌우로 번갈아 뒤집어서(flipX) 같은 텍스처라도 조금씩 다르게 보이도록 했다.
        if (flip) sprite.setFlipX(true);
        this.shelfLayer.add(shadow);
        this.shelfLayer.add(sprite);
      } else {
        const rect = this.add.rectangle(cx, cy, dw - 2, dh - 2, fallbackColor);
        this.shelfLayer.add(rect);
      }
    };

    for (const [key, locs] of rackGroups) {
      const zoneId = key.split('::')[0];
      const zone = zoneById.get(zoneId);
      const fallbackColor = zone ? Phaser.Display.Color.HexStringToColor(zone.color).color : 0xcccccc;
      let singleTex = zone && ZONE_TEXTURE[zone.zoneId];
      let mergedTex = zone && ZONE_TEXTURE_MERGED[zone.zoneId];
      // 이 존이 "rack마다 다른 텍스처"를 쓰는 존이면(예: F3-C 완구·문구), 위에서 구한 고정
      // singleTex/mergedTex 대신 rack 등장 순서에 맞는 variant로 덮어쓴다.
      const variants = zone && ZONE_RACK_TEXTURE_VARIANTS[zone.zoneId];
      if (variants && variants.length > 0) {
        const idx = rackVariantIdx.get(zoneId) ?? 0;
        const variant = variants[idx % variants.length];
        singleTex = variant.single;
        mergedTex = variant.merged;
        rackVariantIdx.set(zoneId, idx + 1);
      }

      const xs = new Set(locs.map((l) => l.x));
      const ys = new Set(locs.map((l) => l.y));
      const byCell = new Map(locs.map((l) => [cellKey(l.x, l.y), l]));
      // 이 rack 안에서 합쳐진 매대 이미지를 몇 번째로 그리는지 세서, 짝수/홀수마다 좌우로
      // 뒤집어 그린다(위 drawSprite의 flip 인자) — 같은 텍스처가 나란히 반복될 때의 단조로움을
      // 줄이기 위함.
      let mergeIdx = 0;

      // 세로 합침: 이 rack이 정확히 두 개의 y값(=2행 깊이)으로 이루어진 경우, 같은 x에서
      // y·y+1을 하나로 합친다. 존별 설정이 '2x2'면 x도 두 칸씩 짝지어 정사각형(2x2)으로,
      // 짝이 안 맞는 마지막 칸은 1x2로 대체한다.
      if (mergedTex && ys.size === 2) {
        const [y0, y1] = [...ys].sort((a, b) => a - b);
        if (y1 === y0 + 1) {
          const mode = ZONE_ROWS2_MODE[zoneId] ?? ZONE_ROWS2_MODE_DEFAULT;
          const sortedXs = [...xs].sort((a, b) => a - b);
          if (mode === '2x2') {
            let i = 0;
            while (i < sortedXs.length) {
              const x0 = sortedXs[i];
              const x1 = sortedXs[i + 1];
              if (
                x1 !== undefined &&
                x1 === x0 + 1 &&
                byCell.has(cellKey(x0, y0)) &&
                byCell.has(cellKey(x0, y1)) &&
                byCell.has(cellKey(x1, y0)) &&
                byCell.has(cellKey(x1, y1))
              ) {
                const cx = x0 * TILE + TILE;
                const cy = y0 * TILE + TILE;
                drawSprite(cx, cy, TILE * 2, TILE * 2, mergedTex, fallbackColor, mergeIdx++ % 2 === 1);
                merged.add(cellKey(x0, y0));
                merged.add(cellKey(x0, y1));
                merged.add(cellKey(x1, y0));
                merged.add(cellKey(x1, y1));
                i += 2;
                continue;
              }
              // 짝이 안 맞아 혼자 남은 칸도, 옆의 2x2 매대들과 크기가 달라 눈에 띄게 작아
              // 보이지 않도록 똑같이 2x2 크기(TILE*2 x TILE*2)로 크게 그린다 — 실제로는 칸 한 줄
              // 뿐이라 옆 통로 쪽으로 이미지가 살짝 넘치지만, 칸 하나하나의 정확한 경계보다
              // "다른 매대들과 똑같이 커 보이는 것"을 우선한다.
              if (byCell.has(cellKey(x0, y0)) && byCell.has(cellKey(x0, y1))) {
                const cx = x0 * TILE + TILE / 2;
                const cy = y0 * TILE + TILE;
                drawSprite(cx, cy, TILE * 2, TILE * 2, mergedTex, fallbackColor, mergeIdx++ % 2 === 1);
                merged.add(cellKey(x0, y0));
                merged.add(cellKey(x0, y1));
              }
              i += 1;
            }
          } else {
            for (const x of xs) {
              const a = byCell.get(cellKey(x, y0));
              const b = byCell.get(cellKey(x, y1));
              if (!a || !b) continue;
              const cx = x * TILE + TILE / 2;
              const cy = y0 * TILE + TILE;
              drawSprite(cx, cy, TILE, TILE * 2, mergedTex, fallbackColor, mergeIdx++ % 2 === 1);
              merged.add(cellKey(x, y0));
              merged.add(cellKey(x, y1));
            }
          }
        }
      }
      // 가로 합침: 정확히 두 개의 x값(=2열 폭)으로 이루어진 경우, 같은 y에서 x·x+1을 합친다.
      // 존별 설정이 '2x2'면 y도 두 칸씩 짝지어 정사각형(2x2)으로, 짝이 안 맞는 마지막 행은
      // 2x1로 대체한다.
      else if (mergedTex && xs.size === 2) {
        const [x0, x1] = [...xs].sort((a, b) => a - b);
        if (x1 === x0 + 1) {
          const mode = ZONE_COLS2_MODE[zoneId] ?? ZONE_COLS2_MODE_DEFAULT;
          const sortedYs = [...ys].sort((a, b) => a - b);
          if (mode === '2x2') {
            let i = 0;
            while (i < sortedYs.length) {
              const y0 = sortedYs[i];
              const y1 = sortedYs[i + 1];
              if (
                y1 !== undefined &&
                y1 === y0 + 1 &&
                byCell.has(cellKey(x0, y0)) &&
                byCell.has(cellKey(x1, y0)) &&
                byCell.has(cellKey(x0, y1)) &&
                byCell.has(cellKey(x1, y1))
              ) {
                const cx = x0 * TILE + TILE;
                const cy = y0 * TILE + TILE;
                drawSprite(cx, cy, TILE * 2, TILE * 2, mergedTex, fallbackColor, mergeIdx++ % 2 === 1);
                merged.add(cellKey(x0, y0));
                merged.add(cellKey(x1, y0));
                merged.add(cellKey(x0, y1));
                merged.add(cellKey(x1, y1));
                i += 2;
                continue;
              }
              // 짝이 안 맞아 혼자 남은 행도 위와 같은 이유로 2x2 크기로 크게 그린다.
              if (byCell.has(cellKey(x0, y0)) && byCell.has(cellKey(x1, y0))) {
                const cx = x0 * TILE + TILE;
                const cy = y0 * TILE + TILE / 2;
                drawSprite(cx, cy, TILE * 2, TILE * 2, mergedTex, fallbackColor, mergeIdx++ % 2 === 1);
                merged.add(cellKey(x0, y0));
                merged.add(cellKey(x1, y0));
              }
              i += 1;
            }
          } else {
            for (const y of ys) {
              const a = byCell.get(cellKey(x0, y));
              const b = byCell.get(cellKey(x1, y));
              if (!a || !b) continue;
              const cx = x0 * TILE + TILE;
              const cy = y * TILE + TILE / 2;
              drawSprite(cx, cy, TILE * 2, TILE, mergedTex, fallbackColor, mergeIdx++ % 2 === 1);
              merged.add(cellKey(x0, y));
              merged.add(cellKey(x1, y));
            }
          }
        }
      }

      // 위 두 합침 로직 어디에도 안 걸려 혼자 남은 칸도, 그 존에 합쳐진 매대 이미지
      // (mergedTex)가 있으면 다른 매대들과 똑같이 2x2 크기로 크게 그린다 — 칸 하나짜리 자리라도
      // 작게 튀지 않도록. mergedTex가 없는 곳(B1 창고 등)은 예전처럼 1칸짜리 이미지 그대로.
      for (const loc of locs) {
        const k = cellKey(loc.x, loc.y);
        if (merged.has(k)) continue;
        const cx = loc.x * TILE + TILE / 2;
        const cy = loc.y * TILE + TILE / 2;
        if (mergedTex) {
          drawSprite(cx, cy, TILE * 2, TILE * 2, mergedTex, fallbackColor, mergeIdx++ % 2 === 1);
        } else {
          const texKey = singleTex || WAREHOUSE_CRATES[warehouseIdx % WAREHOUSE_CRATES.length];
          if (!singleTex) warehouseIdx++;
          drawSprite(cx, cy, TILE, TILE, texKey, fallbackColor);
        }
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
        fontSize: '12px', // 10px -> 12px: 존 이름이 잘 안 보인다는 피드백으로 약 2pt 키움
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
      const imageKey = FACILITY_IMAGE[fac.type];
      const hasImage = !!imageKey && this.textures.exists(imageKey);

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
      if (hasImage) {
        // 실제 타일팩 스프라이트가 있는 시설(정수기 등)은 이모지 원형 배지 대신 이미지를 쓴다.
        const sprite = this.add.image(fx, fy, imageKey);
        sprite.setDisplaySize(displaySize, displaySize);
        this.facilityLayer.add(sprite);
      } else {
        const bg = this.add.circle(fx, fy, iconRadius, FACILITY_COLOR[fac.type] ?? 0x1f2937, 0.92);
        bg.setStrokeStyle(1.5, 0xffffff, 0.7);
        const icon = this.add.text(fx, fy, FACILITY_ICON[fac.type] ?? '?', { fontSize: '14px' });
        icon.setOrigin(0.5);
        this.facilityLayer.add(bg);
        this.facilityLayer.add(icon);
      }
      // 엘리베이터/에스컬레이터(상행)/에스컬레이터(하행)가 한 줄에 나란히 붙어있어서
      // 라벨을 같은 높이에 두면 옆칸 라벨과 겹친다 — 종류별로 다른 높이(tier)에 배치해서 피한다.
      // 오프셋도 위에서 구한 iconRadius(=실제로 커진 아이콘 크기) 기준으로 계산해서, 아이콘을
      // 키워도 라벨이 아이콘에 파묻히지 않게 한다.
      const LABEL_TIER: Record<string, number> = { elevator: -2, escalator_up: -1, escalator_down: 1 };
      const tier = LABEL_TIER[fac.type] ?? 1; // 기본: 바로 아래
      const labelY = fy + Math.sign(tier) * (iconRadius + 2 + (Math.abs(tier) - 1) * 12);
      const label = this.add.text(fx, labelY, FACILITY_LABEL[fac.type] ?? fac.type, {
        fontSize: '9px',
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
    const c = this.add.container(0, 0, [shadow, sprite]);
    c.setDepth(DEPTH_PLAYER);
    return c;
  }

  // 직원(NPC) 캐릭터 — "로봇" 에셋 팩 스프라이트 + 위에 "직원" 이름표를 띄운다.
  private buildNpcVisual(): { container: Phaser.GameObjects.Container; sprite: Phaser.GameObjects.Sprite } {
    const shadow = this.add.ellipse(0, TILE * 0.55, TILE * 0.6, TILE * 0.22, 0x000000, 0.25);
    const sprite = this.add.sprite(0, 0, `${NPC_CHAR.key}-idle-1`);
    this.fitCharSprite(sprite, NPC_CHAR);
    sprite.play(`${NPC_CHAR.key}-idle`);
    const tag = this.add.text(0, -NPC_CHAR.displayHeight * 0.62, '직원', {
      fontSize: '8px',
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
        const duration = Math.max((dist / NPC_SPEED) * 1000, 40);
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
      const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, this.minZoom, 3);
      this.cameras.main.setZoom(zoom);
    });
  }
}
