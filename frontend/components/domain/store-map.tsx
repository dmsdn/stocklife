// components/domain/store-map.tsx
// ✅ 좌우 꽉 차게 + 세로로 더 넓게(h-[70vh]). 손가락 핀치 확대/축소, 마우스 휠 확대/축소,
//   드래그로 이동. 동선은 흰 통로(lib/pathfinding.ts, A*)만 따라가도록 계산. 핀은 항상 이름을
//   보여주지 않고, 눌렀을 때만 이미지+이름+가격 팝업이 뜹니다.
// ✅ 참고 이미지(Group_408) 반영 — 우측 하단 층 선택을 세로로 쌓인 알약(있으면),
//   하단 중앙 리브 버튼(있으면), 핀 팝업을 흰 카드+실제 상품 이미지로.
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  PiBowlFoodDuotone,
  PiCookieDuotone,
  PiCarrotDuotone,
  PiFishSimpleDuotone,
  PiDropDuotone,
  PiWineDuotone,
  PiSnowflakeDuotone,
  PiCubeDuotone,
  PiPawPrintDuotone,
  PiHeartbeatDuotone,
  PiPackageDuotone,
  PiToiletPaperDuotone,
  PiCookingPotDuotone,
  PiWashingMachineDuotone,
  PiSoccerBallDuotone,
  PiTelevisionDuotone,
  PiPuzzlePieceDuotone,
  PiTShirtDuotone,
  PiHandbagDuotone,
  PiTagDuotone,
} from "react-icons/pi";
import type { IconType } from "react-icons/lib";
import { RiMapPin2Fill } from "@remixicon/react";
import { getFloorMap, fetchRealFloorMap, getZoneRegions, getZoneCenters, getZoneName, FLOOR_MAPS, navigationImagePosition } from "@/lib/map-config";
import type { GridPoint } from "@/lib/pathfinding";

// ✅ 수정(요청 — "매장 지도 각 구역별 아이콘 phosphor icons에서 각각 찾아서, 모든 층 다") —
//   map_layout.py의 ZONE_LABELS(실제 판매 카테고리)를 기준으로 19개 구역(1~3층) 전부에
//   실제 어울리는 Phosphor 아이콘을 골랐습니다. react-icons에 이미 phosphor(react-icons/pi)가
//   포함돼 있어서 새 패키지 설치 없이 바로 씀.
const ZONE_ICONS: Record<string, IconType> = {
  "F1-A": PiBowlFoodDuotone, // 쌀·면·통조림
  "F1-B": PiCookieDuotone, // 간식·베이커리
  "F1-C": PiCarrotDuotone, // 청과·채소
  "F1-D": PiFishSimpleDuotone, // 정육·수산·계란
  "F1-E": PiDropDuotone, // 소스·조미료·오일
  "F1-F": PiWineDuotone, // 음료·주류
  "F1-G": PiSnowflakeDuotone, // 냉장식품
  "F1-H": PiCubeDuotone, // 냉동식품
  "F2-A": PiPawPrintDuotone, // 반려동물용품
  "F2-B": PiHeartbeatDuotone, // 뷰티·헬스
  "F2-C": PiPackageDuotone, // 수납·생활잡화
  "F2-D": PiToiletPaperDuotone, // 화장지·위생
  "F2-E": PiCookingPotDuotone, // 주방용품
  "F2-F": PiWashingMachineDuotone, // 세탁·청소
  "F3-A": PiSoccerBallDuotone, // 스포츠·레저
  "F3-B": PiTelevisionDuotone, // 홈·가전
  "F3-C": PiPuzzlePieceDuotone, // 완구·문구
  "F3-D": PiTShirtDuotone, // 의류
  "F3-E": PiHandbagDuotone, // 잡화·가방
};
function getZoneIcon(zoneId: string) {
  return ZONE_ICONS[zoneId] ?? PiTagDuotone;
}

export interface MapPin {
  id: number;
  name: string;
  price: number;
  x: number;
  y: number;
  collected?: boolean;
  facility?: boolean;
  /** ✅ 신규 — 있으면 핀 팝업에 실제 상품 이미지를 보여줌(없으면 회색 박스로 대체) */
  image?: string;
  /** ✅ 신규(요청 — "동선 지도에도 방금 찍은 매대 위에 현위치 핀") — 여러 개의 collected
   *  핀(지나온 매대) 중 "지금 서 있는" 자리 딱 하나에만 true. 번호/체크 배지 대신 흰
   *  원 배경 + 은은한 그림자 + 메인 오렌지 map-pin-2-fill 아이콘으로 특별하게 그림. */
  isCurrentLocation?: boolean;
}

// ✅ 행사상품 핀. 일반 담은 상품 핀(MapPin, 순번 원형 배지)과는 다르게 태그 아이콘으로
//   구분하고, 눌렀을 때 가격 대신 할인 정보를 보여줌.
// ⚠ 이전 턴에서 만들어뒀는데 구역 아이콘 작업 중 실수로 렌더링 코드가 빠졌던 걸
//   이번에 다시 복구했습니다.
export interface PromoPin {
  id: number;
  floorNo: number;
  x: number;
  y: number;
  title: string;
  discountLabel: string;
  validUntil: string;
  image?: string;
}

export interface StoreMapProps {
  floorNo: number;
  pins: MapPin[];
  routeOrder: number[];
  /** ✅ 수정(2026-09) — 매대 칸 하나하나에 박스를 그려서 누르게 하던 기능은 없앴습니다
   *  (실제 매장 이미지 위에 격자 박스가 겹쳐 보여서 지저분했음). 이제 구역 단위로만
   *  누를 수 있고(showZones), 결과도 외부 모달 대신 지도 위에 핀처럼 뜹니다. */
  showZones?: boolean;
  /** ✅ 신규 — 넘기면 우측 하단에 층 선택 알약(3F/2F/1F 세로 스택)을 띄움.
   *  안 넘기면(단일 층 동선 등) 표시 안 함. */
  onFloorChange?: (floorNo: number) => void;
  /** ✅ 신규 — 넘기면 하단 중앙에 리브 원형 버튼을 띄움(눌리면 AI챗 오픈 등). */
  onLivClick?: () => void;
  /** ✅ 수정(요청 — "동선 선 두께 4px로") — 다시 그립니다. 실제 보행 경로(agent가 A*로
   *  계산해준 PathPoint 배열, floorNo별로 필터링해서 넘겨야 함)를 4px 두께 선으로 이어
   *  그림. 확대/축소해도 항상 화면 기준 4px(vector-effect: non-scaling-stroke). */
  precomputedPath?: GridPoint[];
  pathSegments?: GridPoint[][];
  activePathSegments?: GridPoint[][];
  routeOrigin?: GridPoint & { label: string };
  /** ✅ 신규(요청 — "바코드 찍으면 가장 최근 찍은 상품 위치를 현재 위치로") — 있으면 그
   *  좌표에 "현재 위치" 전용 아이콘(파란 점, 살짝 펄스)을 띄움. */
  currentLocationPin?: { x: number; y: number };
  /** ✅ 신규 — 지도 영역 높이 클래스. 기본은 기존과 동일한 70vh(리스트 동선 다이얼로그 등).
   *  화면 전체를 지도로 쓰는 "매장 지도 둘러보기" 페이지처럼 더 넓게 쓰고 싶을 때 오버라이드. */
  heightClassName?: string;
  /** ✅ 신규 — 지도 아래 안내 문구("손가락으로 확대·이동…")를 숨김. 화면을 스크롤 없이
   *  꽉 채워야 하는 페이지(매장 지도 둘러보기)에서 사용. */
  hideHelpText?: boolean;
  /** ✅ 수정(요청) — "층 표시가 필요한 건 매대위치 모달이지 지도 모달이 아니다" —
   *  지도 모달(동선 보기·매장 둘러보기)엔 이미 층 전환 알약이 있어서 몇 층인지 알 수
   *  있는데, 그 알약이 없는 매대위치 단일 핀 보기(LocationMapDialog)만 층을 알 방법이
   *  없었습니다. 그래서 전체가 아니라 이걸 명시적으로 켠 화면에서만 배지를 띄웁니다. */
  showFloorBadge?: boolean;
  /** ✅ 행사상품 핀(태그 아이콘). 넘긴 층(promoPin.floorNo)이 지금 보고 있는 floorNo와
   *  같은 것만 그려짐. (이전 턴 작업, 복구) */
  promoPins?: PromoPin[];
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

function dist(a: React.Touch, b: React.Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function StoreMap({ floorNo, pins, routeOrder, showZones, onFloorChange, onLivClick, heightClassName, hideHelpText, showFloorBadge, promoPins, precomputedPath, currentLocationPin, pathSegments, activePathSegments, routeOrigin }: StoreMapProps) {
  const arrowId = useId().replace(/:/g, "");
  const config = getFloorMap(floorNo);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activePinId, setActivePinId] = useState<number | null>(null);
  // ✅ 신규 — 구역을 누르면 그 구역 이름을 상품 핀과 같은 스타일의 작은 팝업으로 보여줌
  //   (요청: "누르면 화면 위로 핀처럼 무슨 구역 정도만"). 외부 모달 없이 지도 안에서 처리.
  // ✅ 신규(요청) — 구역마다 누른 "지점"이 아니라 항상 정해진 중심점(getZoneCenters)에
  //   팝업이 뜨므로, 클릭 지점을 따로 기억해둘 필요가 없어짐(activeZonePos 삭제).
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  // ✅ 실제 GET /api/map/floors/{floorNo} 로딩 완료 후 재계산되도록 트리거용 상태
  const [realMapReady, setRealMapReady] = useState(false);

  useEffect(() => {
    let active=true;setRealMapReady(false);
    fetchRealFloorMap(floorNo).then(() => {if(active)setRealMapReady(true);});
    return ()=>{active=false;};
  }, [floorNo]);

  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);

  // ✅ 신규 — "좌표가 화면이랑 안 맞는다" 버그의 진짜 원인: 지도 박스는 세로로 긴 모바일
  //   비율인데 실제 이미지 비율은 그거랑 달라서, object-contain으로 표시하면 위/아래에
  //   레터박스 여백이 생긴다. 그런데 좌표(%) 계산은 "이미지가 박스를 꽉 채운다"고 가정하고
  //   있었어서, 실제 이미지 위치와 어긋났다(이미지 중심에서 멀수록, 특히 위쪽일수록 더 크게
  //   어긋남 — 실제로 겪으신 증상과 일치). 박스 실측 크기를 추적해서 이미지가 지금 이 박스
  //   안에서 실제로 어디에 얼마 크기로 떠 있는지 계산하고, 아래 toPercent가 그 영역
  //   기준으로 %를 계산하게 고친다. 구역 박스·핀·클릭 판정·팝업이 전부 toPercent를
  //   거쳐가므로 이거 하나로 다 같이 맞아떨어진다.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const imgRect = useMemo(() => {
    const imgW = config?.imageWidth ?? 0;
    const imgH = config?.imageHeight ?? 0;
    if (!imgW || !imgH || !containerSize.width || !containerSize.height) {
      return { offsetLeftPercent: 0, offsetTopPercent: 0, widthPercent: 100, heightPercent: 100 };
    }
    const scale = Math.min(containerSize.width / imgW, containerSize.height / imgH);
    const widthPercent = ((imgW * scale) / containerSize.width) * 100;
    const heightPercent = ((imgH * scale) / containerSize.height) * 100;
    return {
      offsetLeftPercent: (100 - widthPercent) / 2,
      offsetTopPercent: (100 - heightPercent) / 2,
      widthPercent,
      heightPercent,
    };
  }, [config?.imageWidth, config?.imageHeight, containerSize.width, containerSize.height]);

  const navigationPercent = (x: number, y: number) => {
    const p = navigationImagePosition(floorNo, x, y);
    return p
      ? { left: imgRect.offsetLeftPercent + p.left * imgRect.widthPercent, top: imgRect.offsetTopPercent + p.top * imgRect.heightPercent }
      : toPercent(x, y);
  };

  if (!config) {
    return <p className="p-4 text-center text-sm text-muted-foreground">{floorNo}층 지도가 아직 등록되지 않았어요.</p>;
  }

  // ✅ legacyTopOffsetPercent 보정 — 기존 좌표(잘리기 전 이미지 기준)를 새(크롭된) 이미지에
  //   맞게 재투영(x축은 안 잘렸으니 그대로, y축만). 그다음 imgRect로 "이미지 기준 %"를
  //   "박스(container) 기준 %"로 다시 변환한다(레터박스 오프셋 반영).
  const toPercent = (x: number, y: number) => {
    const rawLeftOfImage = (x / config.gridWidth) * 100;
    const rawTopOfImage = (y / config.gridHeight) * 100;
    const offset = config.legacyTopOffsetPercent ?? 0;
    const topOfImage = offset > 0 ? ((rawTopOfImage - offset) / (100 - offset)) * 100 : rawTopOfImage;
    return {
      left: imgRect.offsetLeftPercent + (rawLeftOfImage / 100) * imgRect.widthPercent,
      top: imgRect.offsetTopPercent + (topOfImage / 100) * imgRect.heightPercent,
    };
  };

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const handleWheel = (e: React.WheelEvent | WheelEvent) => {
    e.preventDefault();
    setZoom((z) => clampZoom(z - e.deltaY * 0.0025));
  };

  // ✅ 버그 수정(요청 — "Unable to preventDefault inside passive event listener") —
  //   React의 onWheel prop은 wheel 이벤트를 기본적으로 passive(수동)로 등록해서,
  //   그 안에서 e.preventDefault()를 불러도 무시됩니다(경고만 뜨고 실제로는 페이지
  //   스크롤이 안 막힘 — 지도 확대/축소랑 같이 뒤 페이지도 스크롤되는 버그로 이어짐).
  //   JSX의 onWheel 대신 이렇게 직접 {passive:false}로 리스너를 붙여야 진짜로 막힙니다.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPan({ x: dragRef.current.panX + (e.clientX - dragRef.current.startX), y: dragRef.current.panY + (e.clientY - dragRef.current.startY) });
  };
  const handlePointerUp = () => { dragRef.current = null; };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = { startDist: dist(e.touches[0], e.touches[1]), startZoom: zoom };
    }
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const ratio = dist(e.touches[0], e.touches[1]) / pinchRef.current.startDist;
      setZoom(clampZoom(pinchRef.current.startZoom * ratio));
    }
  };
  const handleTouchEnd = () => { pinchRef.current = null; };

  // ✅ 수정(요청 — "누른 자리가 아니라 엉뚱한 왼쪽 위에 뜬다") — 클릭 지점을 pan/zoom
  //   역산해서 구하던 방식이 오차가 누적됐던 게 원인. 이제 위치 계산 자체를 안 하고,
  //   항상 getZoneCenters()가 미리 계산해둔 고정 중심점을 씀 — 아이콘을 몇 번을 눌러도
  //   항상 같은 자리(그 구역 한가운데)에 뜨니 이 버그 자체가 원천적으로 없어짐.
  const handleZoneClick = (zoneId: string, isActive: boolean) => {
    setActiveZoneId(isActive ? null : zoneId);
  };

  const activePin = pins.find((p) => p.id === activePinId);

  return (
    // ✅ 버그 수정(요청 — "지도, 동선이 떠야하는데 안 뜸") — 콘솔에 "Image ... has a
    //   height value of 0" 경고가 근본 원인이었습니다. 이 바깥 래퍼가 space-y-2(높이를
    //   전혀 지정 안 함, 콘텐츠만큼만 차지)라서, heightClassName="h-full"을 쓰는 화면
    //   (scan/page.tsx의 카메라/지도 전환)에서 안쪽 containerRef div가 "부모의 100%"를
    //   달라고 해도 그 부모(이 바깥 래퍼) 자체가 높이가 없어서 0으로 계산됐습니다.
    //   flex+h-full로 바꿔서, 바깥 래퍼가 실제로 자기 부모(호출한 화면 쪽 컨테이너)의
    //   높이를 그대로 물려받아 안쪽까지 제대로 내려가게 했습니다. 고정 높이(h-[70vh] 등)를
    //   쓰는 다른 화면들은 이 변경과 무관하게 그대로 동작합니다.
    <div className={`flex flex-col gap-2 ${heightClassName === "h-full" ? "h-full min-h-0" : "shrink-0"}`}>
      <div
        ref={containerRef}
        className={`relative w-full shrink-0 touch-none overflow-hidden bg-muted select-none ${heightClassName ?? "h-[70vh]"}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="absolute inset-0"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center center" }}
        >
          {/* TODO: public/maps/floor-1.png 없으면 이 자리는 회색 배경으로만 보입니다 */}
          <Image src={config.image} alt={`매장 ${floorNo}층 지도`} fill className="object-contain" unoptimized />

          {/* ✅ 버그 수정(요청 — "상품 위치랑 동선 표시가 이상하다") — 같은 경로
              (precomputedPath)를 svg 두 개가 각각 그리고 있었습니다: 하나는 화살표 없이
              4px로, 바로 아래 두 번째 svg는 pathSegments가 없을 때 같은 precomputedPath를
              다시 받아 2.5px+화살표로 겹쳐 그렸습니다(둘 다 zIndex:1). 그래서 선이 두 겹으로
              겹쳐 보이거나(굵기 다른 선이 살짝 어긋나 보임), 화살표 위치가 이상해 보였던
              원인이었습니다. svg 하나로 합치고, "동선 두께 4px" 요청과 방향 화살표를 함께
              적용합니다. 구역/핀보다 먼저(=아래) 그려서 핀이 선 위에 보이게 zIndex:1 유지. */}
          {/* ✅ 쌀 아이콘만이 아니라 구역 전체를 눌러도 반응하게. 다만 예전 버그(누른 지점을
              계산해서 그 자리에 팝업을 띄우던 방식)는 다시 안 넣었습니다 — 이 투명
              오버레이도 단순히 "그 zoneId를 눌렀다"는 토글만 하고, 팝업 위치는 여전히
              getZoneCenters()의 고정 중심 좌표를 씁니다. 그래서 구역 어디를 눌러도 팝업은
              항상 그 구역 정중앙(쌀 아이콘 자리)에서 뜹니다. */}
          {/* 서버가 계산한 동선만 표시합니다. 층이 다른 구간은 호출 측에서 분리합니다. */}
          <svg aria-label="계산된 동선" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ zIndex: 1 }}>
            <defs><marker id={arrowId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--brand, #e65c16)" /></marker></defs>
            {(pathSegments ?? (precomputedPath ? [precomputedPath] : [])).map((segment, index) => {
              const points = segment.map((point) => { const p = navigationPercent(point.x, point.y); return `${p.left},${p.top}`; }).join(" ");
              return segment.length > 1 ? <polyline key={index} points={points} fill="none" stroke="var(--brand, #e65c16)" strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#${arrowId})`} opacity={activePathSegments ? 0.35 : 0.85} /> : null;
            })}
            {(activePathSegments ?? []).map((segment,index) => segment.length>1 ? <polyline key={`active-${index}`} points={segment.map(point=>{const p=navigationPercent(point.x,point.y);return `${p.left},${p.top}`;}).join(" ")} fill="none" stroke="#2563eb" strokeWidth={5} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /> : null)}
          </svg>
          {routeOrigin && (
            <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-full border border-orange-600 bg-white px-2 py-1 text-xs text-orange-700" style={{ left: `${navigationPercent(routeOrigin.x, routeOrigin.y).left}%`, top: `${navigationPercent(routeOrigin.x, routeOrigin.y).top}%` }}>
              {routeOrigin.label}
            </span>
          )}

          {showZones &&
            getZoneRegions(floorNo).map((z, idx) => {
              // ⚠ 같은 zoneId가 여러 사각형 조각(L자 모양 등)으로 나뉠 수 있어서 zoneId만으론
              //   key가 중복된다 — idx까지 합쳐서 유일한 key를 만든다.
              const p1 = toPercent(z.x1, z.y1);
              const p2 = toPercent(z.x2, z.y2);
              const isActive = activeZoneId === z.zoneId;
              return (
                <button
                  key={`${z.zoneId}-${idx}`}
                  type="button"
                  onClick={() => handleZoneClick(z.zoneId, isActive)}
                  aria-label={`${getZoneName(floorNo, z.zoneId) ?? z.zoneId} 구역 정보`}
                  className="absolute bg-transparent"
                  style={{
                    left: `${p1.left}%`,
                    top: `${p1.top}%`,
                    width: `${p2.left - p1.left}%`,
                    height: `${p2.top - p1.top}%`,
                  }}
                />
              );
            })}

          {/* ✅ 구역 중앙 아이콘 마커 + 팝업 — 위 투명 오버레이와 같은 activeZoneId
              상태를 공유. 아이콘 자체를 눌러도, 구역 아무 데나 눌러도 항상 같은 결과.
              ✅ 수정(요청) — 아이콘을 구역마다 어울리는 remix 아이콘으로, 팝업은 흰
              배경 카드 대신 배경 없이 이름 텍스트만(그림자로 살짝 읽기 편하게만). */}
          {showZones &&
            getZoneCenters(floorNo).map((z) => {
              const { left, top } = toPercent(z.x, z.y);
              const isActive = activeZoneId === z.zoneId;
              const ZoneIcon = getZoneIcon(z.zoneId);
              return (
                <div
                  key={z.zoneId}
                  className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                  style={{ left: `${left}%`, top: `${top}%` }}
                >
                  {isActive && (
                    <div
                      className="absolute bottom-full mb-0.5 whitespace-nowrap text-base font-semibold text-foreground"
                      style={{
                        transform: `scale(${1 / zoom})`,
                        transformOrigin: "bottom center",
                        // ✅ 수정(요청) — 텍스트 뒤 흰 테두리를 더 연하고(투명도 낮춤) 넓게
                        //   (블러 반경 키움) 흩뿌려서 각지지 않고 은은하게 보이도록.
                        textShadow:
                          "0 0 6px rgba(255,255,255,0.55), 0 0 10px rgba(255,255,255,0.45), 0 0 14px rgba(255,255,255,0.35)",
                      }}
                    >
                      {getZoneName(floorNo, z.zoneId) ?? z.zoneId}
                    </div>
                  )}
                  <div
                    className="pointer-events-none flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-white text-foreground shadow"
                    style={{ transform: `scale(${1 / zoom})` }}
                  >
                    <ZoneIcon size={16} />
                  </div>
                </div>
              );
            })}

          {/* ✅ 신규(요청) — "현재 위치" 마커. 상품 핀(순번 원형)과는 다르게 파란 점 +
              은은한 펄스 링으로 구분. 실제 위치 추적이 아니라 "가장 최근에 스캔한 상품
              위치"를 대신 씀 — 그래서 진짜 GPS처럼 계속 움직이진 않고, 스캔할 때마다
              한 번씩 갱신됩니다.
              ✅ 버그 수정(요청 — "동선/핀 좌표계 확인") — 이 좌표도 상품 핀·동선 선과
              똑같이 백엔드가 주는 실제 위치(pickLocation() 결과)라서, 정밀 변환 함수인
              navigationPercent()를 써야 다른 핀들과 같은 자리에 정확히 겹쳐 보입니다.
              예전엔 toPercent()(구역용, 대략치)를 쓰고 있어서 아주 살짝 어긋날 수 있었음. */}
          {currentLocationPin && (() => {
            const { left, top } = navigationPercent(currentLocationPin.x, currentLocationPin.y);
            return (
              <div
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${left}%`, top: `${top}%`, transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
              >
                <span className="absolute inset-0 -m-2 animate-ping rounded-full bg-blue-400 opacity-50" />
                <span className="relative block h-4 w-4 rounded-full border-2 border-white bg-blue-500 shadow" />
              </div>
            );
          })()}

          {pins.map((pin) => {
            const { left, top } = navigationPercent(pin.x, pin.y);
            const order = routeOrder.indexOf(pin.id);
            const isActive = activePinId === pin.id;
            return (
              // ✅ 수정(요청 — "선택한 핀이 가장 위로 올라오게, 겹치면 헷갈린다") — 지금까지
              //   모든 핀이 zIndex:2로 동일해서, 바로 옆 핀과 겹칠 때 어느 게 위로 그려질지
              //   배열 순서(=DOM 순서)에 맡겨져 있었습니다. 누른(active) 핀만 zIndex를
              //   크게 올려서, 팝업 카드와 핀 본체가 이웃 핀 위로 항상 올라오게 합니다.
              <div key={pin.id} className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${left}%`, top: `${top}%`, zIndex: isActive ? 20 : 2 }}>
                {pin.facility && !isActive && <span className="absolute bottom-full mb-1 whitespace-nowrap rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white" style={{transform:`scale(${1/zoom})`,transformOrigin:"bottom center"}}>목적지 · {pin.name}</span>}
                {isActive && (
                  <div
                    className="pointer-events-auto absolute bottom-full mb-2 flex items-center gap-3 whitespace-nowrap rounded-[20px] border border-[#F4F4F4] bg-white p-3 shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
                    style={{ transform: `scale(${1 / zoom})`, transformOrigin: "bottom center" }}
                  >
                    {/* ✅ 수정(요청 — "카드 내용 말고, 핀이랑 카드를 가운데 정렬") — 카드
                        내용(이미지 왼쪽·글자 오른쪽)은 원래대로 되돌리고, 대신 핀과
                        카드의 정렬 방식 자체를 구역 아이콘과 같은 flex 방식으로 바꿈.
                        예전엔 카드 폭이 핀 버튼 폭(24px)에 종속된 바깥 div 기준으로
                        translate-x-1/2를 두 번 겹쳐 계산해서 어긋날 여지가 있었는데,
                        이제 핀 버튼과 카드가 같은 flex 부모 안에서 각자 독립적으로
                        가운데 정렬되어 항상 핀 중심축에 정확히 맞습니다. */}
                    {pin.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pin.image} alt="" className="h-12 w-12 shrink-0 rounded-md border border-border object-cover" />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded-md bg-muted" />
                    )}
                    <div className="pr-1 text-left">
                      <p className="text-sm">{pin.name}</p>
                      {pin.facility && <p className="text-xs font-semibold text-blue-700">목적지</p>}
                      {!pin.facility && <p className="text-base font-bold">{pin.price.toLocaleString()}원</p>}
                    </div>
                  </div>
                )}
                {pin.isCurrentLocation ? (
                  // ✅ 신규 — "지금 서 있는" 자리 전용 핀. 다른 핀들(번호/체크 원형 배지)과
                  //   구분되게 흰 원 배경 + 은은한 그림자 + 메인 오렌지 아이콘만(배경색 없이).
                  <button
                    type="button"
                    onClick={() => setActivePinId(isActive ? null : pin.id)}
                    aria-label="현재 위치"
                    className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-white shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
                    style={{ transform: `scale(${1 / zoom})` }}
                  >
                    <RiMapPin2Fill size={18} className="text-brand" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActivePinId(isActive ? null : pin.id)}
                    className={`pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-base font-semibold shadow ${
                      pin.collected ? "bg-muted-foreground text-background" : "bg-primary text-primary-foreground"
                    }`}
                    style={{ transform: `scale(${1 / zoom})` }}
                  >
                    {order >= 0 ? order + 1 : "✓"}
                  </button>
                )}
              </div>
            );
          })}

          {/* ✅ 행사상품 핀 — 일반 담은 상품 핀과 구분되게 태그 아이콘 + 호박색, 눌렀을
              때 가격 대신 할인 정보를 보여줌. (이전 턴 작업, 복구) */}
          {/* ✅ 수정(요청 — "행사상품은 이미 지도에 텍스트로 적혀있으니까 좌표에 내용만
              가운데 띄워주면 될 것 같아") — 태그 아이콘을 눌러야 뜨던 카드 팝업 대신,
              구역 이름과 같은 스타일(배경 없는 텍스트)로 좌표에 항상 바로 보이게 단순화. */}
          {/* ✅ 수정(요청 — "매장지도에 할인내용 빼라니까. 텍스트 다 남아있잖아") — 지도
              이미지 자체에 이미 행사 문구가 들어가 있어서, 여기서 또 title/discountLabel을
              겹쳐 그리면 중복입니다. 완전히 뺐습니다 — promoPins 데이터(좌표)는 나중에
              다른 용도(예: 그 자리를 눌러서 이동)로 쓸 수 있어 남겨뒀지만, 화면엔 아무것도
              안 그립니다. */}
        </div>

        {/* ✅ 신규(요청) — "몇 층인지 표시가 안 보인다" — 층 전환 버튼(onFloorChange)이
            없는 화면(단일 층 위치 보기 등)에서도 지금 보고 있는 층을 항상 알 수 있게,
            우측에 층 배지를 따로 하나 더 둠(층 전환 알약과는 별개로 항상 보임). */}
        {showFloorBadge && (
          <div className="absolute right-4 top-16 flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-semibold shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
            {floorNo}F
          </div>
        )}

        {/* ✅ 층 선택 — 세로로 쌓인 알약, 현재 층만 브랜드 오렌지 원. */}
        {onFloorChange && FLOOR_MAPS.length > 1 && (
          <div className="absolute bottom-4 right-4 flex flex-col items-center gap-1 rounded-full bg-white p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
            {[...FLOOR_MAPS].reverse().map((f) => (
              <button
                key={f.floorNo}
                type="button"
                onClick={() => onFloorChange(f.floorNo)}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium ${
                  f.floorNo === floorNo ? "bg-brand text-brand-foreground" : "text-muted-foreground"
                }`}
              >
                {f.floorNo}F
              </button>
            ))}
          </div>
        )}

        {/* ✅ 신규(2026-09) — "원래대로"를 하단 안내문 옆 텍스트 링크 대신, 지도 우측 상단에
            떠 있는 버튼으로. 확대/이동한 채로 지도를 보다가 바로 손 닿는 자리에서 리셋할 수 있게. */}
        <button
          type="button"
          onClick={resetView}
          className="absolute top-4 right-4 rounded-full border border-border bg-white/90 px-3 py-1.5 text-xs font-medium shadow-[0_4px_20px_rgba(0,0,0,0.12)] backdrop-blur"
        >
          원래대로
        </button>

        {/* ✅ 리브 — 하단 중앙 원형 버튼 */}
        {onLivClick && (
          <button
            type="button"
            onClick={onLivClick}
            className="absolute bottom-4 left-1/2 flex h-14 w-14 -translate-x-1/2 flex-col items-center justify-center gap-0.5 rounded-full bg-white text-xs shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
          >
            <img src="/icons/liv-line.svg" alt="" className="h-5 w-5 shrink-0" />
            리브
          </button>
        )}
      </div>

      {!hideHelpText && (
        <p className="px-4 pb-4 text-xs text-muted-foreground">
          손가락으로 확대·이동하거나 마우스 휠로 확대할 수 있어요. 핀을 누르면 상품 정보가 떠요.
          {showZones && " 색칠된 구역을 누르면 어떤 카테고리인지 볼 수 있어요."}
        </p>
      )}
    </div>
  );
}
