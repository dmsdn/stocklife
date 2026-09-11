"use client";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {useOpenAiChat} from "@/lib/use-open-ai-chat";
import {Dialog,DialogContent,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {StoreMap,type MapPin} from "./store-map";
import {ShoppingRouteActions} from "./shopping-route-actions";
import {ProductInsights,useProductInsights} from "./product-insights";
import {loadCartGroups,type CartGroup} from "@/lib/cart-storage";
import {getOptimizedRoute,type OptimizedRouteResult,type PathPoint} from "@/lib/navigation";
import {buildRequestKey,readRouteProgress,saveRouteProgress,rebaseRouteFrom} from "@/lib/shopping-route-progress";
import {sessionFor,writeShoppingSession,SHOPPING_CHANGED} from "@/lib/shopping-session";
import {useBottomBarVisibility} from "@/components/layout/bottom-bar-visibility-context";
import {fetchInventoryBatch,pickLocation,formatLocationLabel} from "@/lib/product-location";

interface Props {open:boolean;onClose:()=>void;groupId:number;collectedIds:Set<number>;
  /** ✅ 신규(요청 — "리스트>동선 모달은 스캔 화면이랑 통일, 계획 바꾸기/안내박스/리브
   *  버튼 다 빼고 화면비율도 동선처럼") — 이 다이얼로그는 checkout-complete(결제 후
   *  "출구까지 길찾기" — 실제로 걸으면서 단계별 도착 확인이 꼭 필요함)와 saved 리스트
   *  상세("동선 보기" — 아직 스캔 전, 그냥 전체 경로 미리보기)에서 같이 쓰여서 두
   *  화면의 요구사항이 다르다. plan=true면 후자(미리보기 전용)로 동작: 단계별
   *  안내박스·에스컬레이터 층 버튼·"여기 도착했어요"·계획 바꾸기(ShoppingRouteActions)·
   *  리브 버튼을 전부 빼고, 지도도 현재 단계 한 구간만이 아니라 스캔 화면처럼 전체
   *  동선(모든 층 이어붙인 pins/segments)을 보여준다. 기본값 false면 기존 동작 그대로. */
  plan?: boolean;}

/** 안내 선택과 실제 위치 확인을 분리한다. 지도 이미지는 StoreMap의 기존 원본을 사용한다. */
export function StoreMapDialog({open,onClose,groupId,collectedIds,plan=false}:Props) {
  const router=useRouter();
  const openAiChat=useOpenAiChat();
  const contentRef=useRef<HTMLDivElement>(null);
  const [group,setGroup]=useState<CartGroup|null>(null);
  const [route,setRoute]=useState<OptimizedRouteResult|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const [floor,setFloor]=useState(1);
  const [step,setStep]=useState(0);
  const [revision,setRevision]=useState(0);
  const {setHidden}=useBottomBarVisibility();
  const insights=useProductInsights(open?(group?.products.map(p=>p.id)??[]):[]);
  const collectedKey=[...collectedIds].sort((a,b)=>a-b).join(",");
  useEffect(()=>{if(!open)return;setHidden(true);return()=>setHidden(false);},[open,setHidden]);
  useEffect(()=>{const update=()=>setRevision(v=>v+1);window.addEventListener(SHOPPING_CHANGED,update);return()=>window.removeEventListener(SHOPPING_CHANGED,update);},[]);
  useEffect(()=>{
    if(!open)return;
    let active=true;setLoading(true);setError(null);
    (async()=>{
      const found=(await loadCartGroups()).find(g=>g.id===groupId)??null;
      if(!active)return;
      setGroup(found);
      const session=sessionFor(groupId);
      const collected=new Set([...session.scannedSkuIds,...collectedKey.split(",").filter(Boolean).map(Number)]);
      const ids=(found?.products??[]).filter(p=>!collected.has(p.id)).map(p=>p.id);
      if(!found&&!session.paid)throw new Error("리스트를 찾을 수 없어요.");
      // ✅ 버그 수정(인계 문서 — "동선이 처음으로 돌아감") — requestKey가 지난번과 같으면
      //   (즉 도착 확인·먼저 들르기가 이미 이 조건에 맞는 진행 상태를 저장해뒀으면) 전체
      //   재최적화를 또 부르지 않고 그 진행 상태(순서+지금 보던 단계)를 그대로 복원합니다.
      const key=buildRequestKey({groupId,skuIds:ids,anchor:session.anchor,detourLocationId:session.detourLocationId,paid:session.paid});
      const cached=readRouteProgress(groupId);
      if(cached&&cached.requestKey===key){
        if(active){setRoute(cached.route);setStep(cached.step??0);setFloor(cached.route.start.floorNo);}
        return;
      }
      const result=await getOptimizedRoute(ids,{anchor:session.anchor,detourLocationId:session.detourLocationId,paid:session.paid});
      if(active){
        setRoute(result);setStep(0);setFloor(result.start.floorNo);
        saveRouteProgress({groupId,requestKey:key,route:result,step:0});
      }
    })().catch(e=>{if(active){setRoute(null);setError(e instanceof Error?e.message:"동선을 불러오지 못했어요.");}}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[open,groupId,collectedKey,revision]);
  const current=route?.journeySteps[step];
  const itemFor=(sku?:number)=>group?.products.find(p=>p.id===sku);
  // ✅ 수정(요청 — "구역명 말고, 지금 상품 위치를 소비자에게 보여주는 걸 기준으로") —
  //   zone 이름 대신, saved/[groupId]/page.tsx·검색·상품상세·장바구니·스캔 화면이 전부
  //   똑같이 쓰는 고객용 위치 포맷(formatLocationLabel, 예: "2층 D01 4번칸 1단")을
  //   그대로 재사용. lib/map-config.ts의 zone 캐시는 더 이상 안 씀.
  const [locationLabelBySku,setLocationLabelBySku]=useState<Map<number,string>>(new Map());
  useEffect(()=>{
    if(!open||!group)return;
    let active=true;
    (async()=>{
      const skuIds=group.products.map(p=>p.id);
      const inv=await fetchInventoryBatch(skuIds);
      if(!active)return;
      const map=new Map<number,string>();
      for(const [skuId,items] of inv.entries()){
        const loc=pickLocation(items);
        if(loc)map.set(skuId,formatLocationLabel(loc.locationId));
      }
      setLocationLabelBySku(map);
    })();
    return()=>{active=false;};
  },[open,group]);
  // ✅ 수정(요청 — "에스컬레이터만인지 엘리베이터도 그런지 확인해서 둘 다 맞춰줘. 그리고
  //   1층→3층인데 1층→2층까지만 뜨고, 3층→1층인데 3층→2층까지만 떠") — 라벨 문자열에
  //   "에스컬레이터"가 있는지로만 판단하던 걸, "엘리베이터"도 같이 인식하도록 넓혔다.
  //   그리고 "앞부분만 잡히는" 원인은 각 단계 라벨 텍스트에서 층수를 정규식으로 추출해
  //   썼기 때문에, 라벨 형태가 예상과 다르면 중간에 못 알아보고 구간을 일찍 끊었던 것.
  //   이제 라벨 텍스트를 아예 안 쓰고, 각 단계가 실제로 갖고 있는 path(좌표+층번호,
  //   백엔드가 준 정확한 데이터)의 시작/끝 층번호를 직접 읽어서 판단한다 — 몇 번을
  //   갈아타든, 라벨 문구가 뭐든 상관없이 처음 시작층과 마지막 도착층만 정확히 뽑힌다.
  type PendingItem=NonNullable<typeof route>["journeySteps"][number];
  const collapseEscalatorLabels=(items:PendingItem[]):string[]=>{
    const isVertical=(it:PendingItem)=>{
      if(it.kind==="ESCALATOR"||it.label.includes("에스컬레이터")||it.label.includes("엘리베이터"))return true;
      const f0=it.path[0]?.floorNo,f1=it.path[it.path.length-1]?.floorNo;
      return f0!=null&&f1!=null&&f0!==f1;
    };
    const isBareFloor=(it:PendingItem)=>/^\s*\d+\s*층\s*$/.test(it.label);
    const startFloorOf=(it:PendingItem)=>it.path[0]?.floorNo;
    const endFloorOf=(it:PendingItem)=>it.path[it.path.length-1]?.floorNo;
    const out:string[]=[];
    let i=0;
    while(i<items.length){
      if(!isVertical(items[i])){out.push(items[i].label);i++;continue;}
      let j=i;
      let startFloor:number|undefined;
      let lastFloor:number|undefined;
      const kindLabel=items[i].label.includes("엘리베이터")?"엘리베이터":"에스컬레이터";
      while(j<items.length&&(isVertical(items[j])||isBareFloor(items[j]))){
        const s0=startFloorOf(items[j]),e0=endFloorOf(items[j]);
        if(startFloor==null)startFloor=s0;
        if(e0!=null)lastFloor=e0; else if(s0!=null)lastFloor=s0;
        j++;
      }
      if(startFloor!=null&&lastFloor!=null&&startFloor!==lastFloor){
        out.push(`${kindLabel}로 ${startFloor}층 → ${lastFloor}층 이동`);
      } else {
        for(let k=i;k<j;k++)out.push(items[k].label);
      }
      i=j;
    }
    return out;
  };
  // ✅ 신규(요청 — "계획에서 리스트의 동선보기 내용도 스캔의 동선보기처럼. 지도 아래로
  //   이동경로, 리스트, 이동경로, 리스트 이런식으로") — 스캔 화면(app/(main)/scan/page.tsx)의
  //   listBlocks와 같은 방식: PRODUCT 단계 사이사이에 낀 이동 단계(WALK/ESCALATOR 등)
  //   라벨을 모아 그 상품 앞에 붙는 "이동경로" 한 줄로 만들고, 지도 아래에 [이동경로] →
  //   [상품] → [이동경로] → [상품] ... 순서로 나열한다. 이 화면은 아직 스캔 전(계획 단계)
  //   이라 collected 구분 없이 전체 journeySteps를 그대로 씀.
  type JourneyBlock =
    | {kind:"route";text:string}
    | {kind:"product";step:NonNullable<typeof route>["journeySteps"][number]};
  const journeyListBlocks:JourneyBlock[]=(()=>{
    const out:JourneyBlock[]=[];
    let pending:PendingItem[]=[];
    for(const s of route?.journeySteps??[]){
      if(s.kind==="PRODUCT"){
        const collapsed=collapseEscalatorLabels(pending);
        const fallback=(s.skuId&&locationLabelBySku.get(s.skuId))||s.label;
        out.push({kind:"route",text:collapsed.length>0?collapsed.join(" → "):fallback});
        pending=[];
        out.push({kind:"product",step:s});
      } else {
        pending.push(s);
      }
    }
    return out;
  })();
  const segments:PathPoint[][]=[];let segment:PathPoint[]=[];
  for(const p of current?.path??[]){if(p.floorNo===floor)segment.push(p);else if(segment.length){segments.push(segment);segment=[];}}
  if(segment.length)segments.push(segment);
  const last=current?.path[current.path.length-1];
  const pins:MapPin[]=last?.floorNo===floor?[{id:step+1,name:current?.label??"도착",price:itemFor(current?.skuId)?.price??0,x:last.x,y:last.y,image:itemFor(current?.skuId)?.image,facility:current?.kind!=="PRODUCT"}]:[];
  // ✅ 신규(plan 모드 전용) — 스캔 화면(app/(main)/scan/page.tsx)의 routeMapSegments/
  //   routeMapPins와 동일한 방식: 현재 단계 하나가 아니라 전체 journeySteps를 이어붙여서,
  //   지금 보고 있는 층(floor)에 해당하는 구간만 끊어서 그린다.
  const splitByFloor=(path:(PathPoint&{floorNo:number})[]):PathPoint[][]=>{
    const segs:PathPoint[][]=[];let cur:PathPoint[]=[];
    for(const p of path){if(p.floorNo===floor)cur.push(p);else if(cur.length){segs.push(cur);cur=[];}}
    if(cur.length)segs.push(cur);
    return segs;
  };
  const routeMapPath:(PathPoint&{floorNo:number})[]=route?.journeySteps.flatMap(s=>s.path)??[];
  const routeMapPins:(MapPin&{floorNo:number})[]=route?.journeySteps
    .filter(s=>s.kind==="PRODUCT"&&s.path.length>0)
    .map((s,i)=>{const last=s.path[s.path.length-1];const product=itemFor(s.skuId);return{id:s.skuId??i,name:s.label,price:product?.price??0,x:last.x,y:last.y,floorNo:last.floorNo,image:product?.image};})??[];
  // ✅ 되돌림(요청 — "계획의 동선은 진하게/연하게 나눌 필요 없어, 그건 스캔 화면 얘기였어")
  //   — 진하게/연하게 구분은 app/(main)/scan/page.tsx(실제 매장에서 스캔 중)에만
  //   적용하고, 여긴(리스트 상세의 "동선 보기", 아직 스캔 전 미리보기) 원래대로 전체
  //   경로를 하나의 색으로만 보여준다.
  const routeMapSegments:PathPoint[][]=splitByFloor(routeMapPath);
  // ✅ 버그 수정(인계 문서 — "동선이 처음으로 돌아감") — 예전엔 세션에 anchor만 써두고
  //   effect의 전체 재최적화(getOptimizedRoute)에 맡겼는데, 그러면 아직 안 스캔한
  //   상품들의 방문 "순서" 자체가 매번 새로 섞였습니다(도착 확인이 그냥 "다음 안내로
  //   넘긴 것"일 뿐인데, 전체 계획을 다시 짜버린 셈). 이제 에스컬레이터·시설 도착은
  //   순서를 그대로 둔 채 걷는 길만 다시 계산(rebaseRouteFrom)하고, 그 결과를 진행
  //   상태로 직접 저장해서 effect가 다시 돌아도(SHOPPING_CHANGED) 재최적화를 또
  //   부르지 않게 합니다. 계산 도중 모달이 닫히면(active 참고) 결과를 반영하지 않습니다.
  // ✅ arrive() 계산 도중 모달이 닫히면 그 결과를 반영하지 않기 위한 ref.
  const arriveActiveRef=useRef(true);
  useEffect(()=>{arriveActiveRef.current=open;},[open]);
  const arrive=async ()=>{
    if(!current||!route)return;
    const saved=sessionFor(groupId);
    if(current.kind==="EXIT") {if(saved.paid){writeShoppingSession(null);onClose();}return;}
    const anchor=current.anchor??(current.locationId?{locationId:current.locationId}:undefined);
    if(!anchor)return;
    if(current.kind==="CHECKOUT") {
      writeShoppingSession({...saved,anchor,detourLocationId:saved.detourLocationId});
      onClose();router.push(`/scan?group=${groupId}`);
      return;
    }
    // ESCALATOR / FACILITY 도착 — 순서는 그대로 두고 새 위치에서부터 다시 계산
    const last=current.path[current.path.length-1];
    const nextDetour=current.kind==="FACILITY"?undefined:saved.detourLocationId;
    try {
      const nextRoute=await rebaseRouteFrom(route,last,route.orderedSkuIds);
      if(!arriveActiveRef.current)return;
      const key=buildRequestKey({groupId,skuIds:route.orderedSkuIds,anchor,detourLocationId:nextDetour,paid:saved.paid});
      saveRouteProgress({groupId,requestKey:key,route:nextRoute,step:0});
      writeShoppingSession({...saved,anchor,detourLocationId:nextDetour},{preserveRoute:true});
      setRoute(nextRoute);setStep(0);setFloor(nextRoute.start.floorNo);
    } catch {
      // 재계산 실패해도 위치는 갱신 — 다음 effect 실행에서 전체 재최적화로 복구됨
      writeShoppingSession({...saved,anchor,detourLocationId:nextDetour});
    }
  };
  return <Dialog open={open} onOpenChange={v=>{if(!v)onClose();}}>
    <DialogContent ref={contentRef} className="max-h-[94dvh] max-w-3xl gap-0 overflow-y-auto p-0">
      <DialogHeader className="px-4 pt-4 pb-3 pr-12"><DialogTitle>{route?.paid?"출구까지 안내":"입구부터 출구까지 장보기"}</DialogTitle><p className="text-xs text-muted-foreground">{group?.title??"장보기 리스트"}</p></DialogHeader>
      {loading&&<p role="status" className="bg-orange-50 px-4 py-2 text-sm">현재 위치에서 남은 동선을 계산하고 있어요…</p>}
      {error&&<div className="p-4"><p role="alert">{error}</p><button className="mt-3 rounded border p-2" onClick={()=>setRevision(v=>v+1)}>다시 계산</button></div>}
      {route&&<div className={loading?"pointer-events-none opacity-50":""} aria-busy={loading}>
        {/* ✅ 수정(요청 6번) — "텍스트 요약 + 이미지 + 방문순서 목록"이 한 화면에 다 있어서
            너무 복잡했음. 위쪽 텍스트 요약 블록과 아래쪽 "전체 방문 순서" 목록을 없애고,
            지도 이미지 + 안내 표시(주황 박스)만 남김. "이전 안내/다음 안내" 버튼도 제거 —
            이제 단계 이동은 도착 시 자동 재계산(아래 "여기 도착했어요") 또는 에스컬레이터
            층 버튼으로만 이뤄짐. (참고: 여러 층을 하나로 이어 붙인 지도는 층별 지도 이미지가
            분리돼 있어서 지금 구조로는 어려움 — 같은 층 구간은 이미 segments로 하나의
            연결된 선으로 표시하고 있음.) */}
        {/* ✅ 버그 수정(요청 — "리스트>동선은 스캔 화면이랑 통일. 계획 바꾸기/안내박스/
            리브 버튼 다 빼고, 동선 로직·화면비율도 스캔처럼") — plan=true(saved 리스트
            상세의 "동선 보기")일 땐 단계별 안내박스·에스컬레이터 층 버튼·"여기
            도착했어요"·계획 바꾸기(ShoppingRouteActions)·리브 버튼을 전부 빼고, 지도도
            현재 단계 한 구간이 아니라 스캔 화면처럼 전체 동선(routeMapPins/
            routeMapSegments)을 보여준다. checkout-complete의 "출구까지 길찾기"(plan
            기본값 false)는 실제로 걸으면서 단계별 도착 확인이 필요해서 기존 동작 그대로 둠. */}
        {!plan && (
          <div className="border-y bg-orange-50 px-4 py-2.5"><p className="text-xs text-orange-700">안내 {step+1}/{route.journeySteps.length}</p><p className="mt-1 font-semibold">{current?.label}</p><p className="mt-1 text-xs">{current?.coldLabel??(current?.kind==="ESCALATOR"?"도착 층에서도 에스컬레이터 앞부터 이어서 안내해요.":"주황색 선을 따라 이동하세요.")}</p>{current?.skuId&&<ProductInsights item={insights[current.skuId]}/>}</div>
        )}
        {/* ✅ 수정(요청 — "지도 화면 높이를 줄여줘, 1:1 정도로") — 뷰포트 높이 기준(dvh)
            대신 폭 기준(vw)으로 바꿔서 정사각형에 가깝게. 데스크톱처럼 폭이 넓을 때
            지나치게 커지지 않게 max-h로 상한만 둠. */}
        {/* ✅ 버그 수정(요청 — "지도 아래 이동경로 부분이 너무 멀리 떨어져 있음") — 원인:
            StoreMap이 hideHelpText를 안 받으면 지도 밑에 "손가락으로 확대·이동..." 도움말
            문단(px-4 pb-4)을 항상 그리는데, plan 모드에선 이걸 안 빼서 지도와 아래 이동경로
            목록 사이에 그 문단 한 줄+패딩만큼 빈 틈이 생겼던 것. 스캔 화면도 이 도움말은
            hideHelpText로 끄고 있어서 그것과 맞춰 여기서도 끔. */}
        {/* ✅ 수정(요청 — "지도 아래 이동경로 목록 8px 마진 말고, 지도 자체에 20px
            마진을 줘서 띄워줘") — 목록 쪽 mt-2(8px)는 빼고, 지도를 감싼 div에
            mb-5(20px)를 대신 줌. */}
        {plan ? (
          <div className="mb-5">
            <StoreMap floorNo={floor} pins={routeMapPins.filter(p=>p.floorNo===floor)} routeOrder={routeMapPins.map(p=>p.id)} pathSegments={routeMapSegments} onFloorChange={setFloor} heightClassName="h-[88vw] max-h-[420px]" hideHelpText/>
          </div>
        ) : (
          <StoreMap floorNo={floor} pins={pins} routeOrder={route.journeySteps.map((_,i)=>i+1)} pathSegments={segments} routeOrigin={segments[0]?.[0]?{...segments[0][0],label:current?.path[0]?.floorNo===floor?"이 구간 출발":"에스컬레이터 도착"}:undefined} onFloorChange={setFloor} onLivClick={()=>openAiChat(group ? `"${group.title}" 리스트 동선 관련해서 물어볼게` : undefined, groupId)} heightClassName="h-[34vh] min-h-[190px]"/>
        )}
        {!plan && current?.kind==="ESCALATOR"&&<div className="flex justify-center gap-3 p-2">{current.path.map(p=><button key={p.floorNo} className="rounded border px-3 py-2 text-xs" onClick={()=>setFloor(p.floorNo)}>{p.floorNo}층 {p===current.path[0]?"탑승":"도착"} 위치</button>)}</div>}
        {/* ✅ 이동경로/상품 목록 카드 스타일을 스캔 화면(app/(main)/scan/page.tsx의
            listBlocks)과 동일하게 맞춤: 이동경로는 회색 라운드 카드, 상품은 h-14 이미지 +
            가로 리스트 행. */}
        {journeyListBlocks.length>0&&<div className="px-4 pb-2">{journeyListBlocks.map((block,idx)=>block.kind==="route"?(
          <div key={`route-${idx}`} className="my-2 rounded-[14px] border border-card-border bg-muted px-3 py-2">
            <p className="mb-1 text-xs font-medium text-muted-foreground">이동경로</p>
            <p className="text-sm leading-relaxed">→ {block.text}</p>
          </div>
        ):(
          <div key={`item-${block.step.skuId??idx}`} className={`flex items-center gap-3 px-1 py-3 ${idx>0&&journeyListBlocks[idx-1].kind==="product"?"border-t border-border":""}`}>
            {itemFor(block.step.skuId)?.image?(
              // eslint-disable-next-line @next/next/no-img-element
              <img src={itemFor(block.step.skuId)!.image} alt="" className="h-14 w-14 shrink-0 rounded-sm border border-border object-cover"/>
            ):(
              <div className="h-14 w-14 shrink-0 rounded-sm border border-border bg-muted"/>
            )}
            <div className="min-w-0 flex-1"><p className="truncate text-base">{block.step.label}</p></div>
          </div>
        ))}</div>}
        {!plan && <div className="flex justify-end gap-2 px-4 py-2">
        {current&&["FACILITY","ESCALATOR","CHECKOUT","EXIT"].includes(current.kind)&&<button disabled={current.kind==="EXIT"&&!route.paid} onClick={arrive} className="rounded bg-orange-600 px-3 py-2 text-sm text-white disabled:opacity-40">{current.kind==="CHECKOUT"?"계산대 도착 · 결제 화면":current.kind==="EXIT"?(route.paid?"퇴장 완료":"결제 후 퇴장 완료할 수 있어요"):"여기 도착했어요 · 재계산"}</button>}</div>}
        {!plan && <ShoppingRouteActions groupId={groupId} route={route}/>}
        {route.excluded.length>0&&<div className="mx-4 mt-3 rounded border p-3 text-sm"><strong>현재 구매 경로에서 제외</strong>{route.excluded.map(e=><div key={e.skuId} className="mt-2">{itemFor(e.skuId)?.name??e.skuId} · {e.reason}<ProductInsights item={insights[e.skuId]}/></div>)}</div>}
        {!plan && <p className="mx-4 mt-3 pb-3 text-xs text-muted-foreground">선택한 구간만 지도에 표시해요. 실제 담은 상품을 스캔하면 남은 상품만 다시 계산해요. 중간에 일반 상품을 추가하면 이미 담은 냉장품을 되돌릴 수 없으므로 남은 상품에 한해 순서를 적용해요.</p>}
        {plan && <div className="h-3" />}
      </div>
      }
    </DialogContent>
  </Dialog>;
}
