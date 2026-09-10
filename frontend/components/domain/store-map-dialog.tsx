"use client";
import {floorSegments,nextDestinationSteps} from "@/lib/route-display";
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

interface Props {open:boolean;onClose:()=>void;groupId:number;collectedIds:Set<number>;}

/** 안내 선택과 실제 위치 확인을 분리한다. 지도 이미지는 StoreMap의 기존 원본을 사용한다. */
export function StoreMapDialog({open,onClose,groupId,collectedIds}:Props) {
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
  const segments:PathPoint[][]=[];let segment:PathPoint[]=[];
  for(const p of current?.path??[]){if(p.floorNo===floor)segment.push(p);else if(segment.length){segments.push(segment);segment=[];}}
  if(segment.length)segments.push(segment);
  const last=current?.path[current.path.length-1];
  const pins:MapPin[]=last?.floorNo===floor?[{id:step+1,name:current?.label??"도착",price:itemFor(current?.skuId)?.price??0,x:last.x,y:last.y,image:itemFor(current?.skuId)?.image,facility:current?.kind!=="PRODUCT"}]:[];
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
        <div className="border-y bg-orange-50 px-4 py-3"><p className="text-xs text-orange-700">안내 {step+1}/{route.journeySteps.length}</p><p className="mt-1 font-semibold">{current?.label}</p><p className="mt-1 text-xs">{current?.coldLabel??(current?.kind==="ESCALATOR"?"도착 층에서도 에스컬레이터 앞부터 이어서 안내해요.":"파란색 선이 다음 목적지까지의 경로예요.")}</p>{current?.skuId&&<ProductInsights item={insights[current.skuId]}/>}</div>
        <StoreMap floorNo={floor} pins={pins} routeOrder={route.journeySteps.map((_,i)=>i+1)} pathSegments={floorSegments(route.journeySteps.slice(step),floor)} activePathSegments={floorSegments(nextDestinationSteps(route.journeySteps.slice(step)),floor)} routeOrigin={segments[0]?.[0]?{...segments[0][0],label:current?.path[0]?.floorNo===floor?"이 구간 출발":"에스컬레이터 도착"}:undefined} onFloorChange={setFloor} onLivClick={()=>openAiChat(group ? `"${group.title}" 리스트 동선 관련해서 물어볼게` : undefined, groupId)} heightClassName="h-[40vh] min-h-[230px]"/>
        {current?.kind==="ESCALATOR"&&<div className="flex justify-center gap-3 p-2">{current.path.map(p=><button key={p.floorNo} className="rounded border px-3 py-2 text-xs" onClick={()=>setFloor(p.floorNo)}>{p.floorNo}층 {p===current.path[0]?"탑승":"도착"} 위치</button>)}</div>}
        <div className="flex justify-end gap-2 px-4 py-2">
        {current&&["FACILITY","ESCALATOR","CHECKOUT","EXIT"].includes(current.kind)&&<button disabled={current.kind==="EXIT"&&!route.paid} onClick={arrive} className="rounded bg-orange-600 px-3 py-2 text-sm text-white disabled:opacity-40">{current.kind==="CHECKOUT"?"계산대 도착 · 결제 화면":current.kind==="EXIT"?(route.paid?"퇴장 완료":"결제 후 퇴장 완료할 수 있어요"):"여기 도착했어요 · 재계산"}</button>}</div>
        <ShoppingRouteActions groupId={groupId} route={route}/>
        {route.excluded.length>0&&<div className="mx-4 mt-3 rounded border p-3 text-sm"><strong>현재 구매 경로에서 제외</strong>{route.excluded.map(e=><div key={e.skuId} className="mt-2">{itemFor(e.skuId)?.name??e.skuId} · {e.reason}<ProductInsights item={insights[e.skuId]}/></div>)}</div>}
        <p className="mx-4 mt-3 pb-3 text-xs text-muted-foreground">전체 동선과 다음 목적지까지의 파란색 경로를 함께 표시해요. 실제 담은 상품을 스캔하면 남은 상품만 다시 계산해요. 중간에 일반 상품을 추가하면 이미 담은 냉장품을 되돌릴 수 없으므로 남은 상품에 한해 순서를 적용해요.</p></div>
      }
    </DialogContent>
  </Dialog>;
}
