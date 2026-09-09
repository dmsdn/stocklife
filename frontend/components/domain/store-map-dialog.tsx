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
      const result=await getOptimizedRoute(ids,{anchor:session.anchor,detourLocationId:session.detourLocationId,paid:session.paid});
      if(active){setRoute(result);setStep(0);setFloor(result.start.floorNo);}
    })().catch(e=>{if(active){setRoute(null);setError(e instanceof Error?e.message:"동선을 불러오지 못했어요.");}}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[open,groupId,collectedKey,revision]);
  const current=route?.journeySteps[step];
  const itemFor=(sku?:number)=>group?.products.find(p=>p.id===sku);
  const select=(i:number)=>{setStep(i);const p=route?.journeySteps[i]?.path[0];if(p)setFloor(p.floorNo);contentRef.current?.scrollTo({top:0,behavior:"smooth"});};
  const segments:PathPoint[][]=[];let segment:PathPoint[]=[];
  for(const p of current?.path??[]){if(p.floorNo===floor)segment.push(p);else if(segment.length){segments.push(segment);segment=[];}}
  if(segment.length)segments.push(segment);
  const last=current?.path[current.path.length-1];
  const pins:MapPin[]=last?.floorNo===floor?[{id:step+1,name:current?.label??"도착",price:itemFor(current?.skuId)?.price??0,x:last.x,y:last.y,image:itemFor(current?.skuId)?.image,facility:current?.kind!=="PRODUCT"}]:[];
  const arrive=()=>{
    if(!current)return;
    const saved=sessionFor(groupId);
    if(current.kind==="EXIT") {if(saved.paid){writeShoppingSession(null);onClose();}return;}
    const anchor=current.anchor??(current.locationId?{locationId:current.locationId}:undefined);
    if(!anchor)return;
    writeShoppingSession({...saved,anchor,detourLocationId:current.kind==="FACILITY"?undefined:saved.detourLocationId});
    if(current.kind==="CHECKOUT") {onClose();router.push(`/scan?group=${groupId}`);}
  };
  return <Dialog open={open} onOpenChange={v=>{if(!v)onClose();}}>
    <DialogContent ref={contentRef} className="max-h-[94dvh] max-w-3xl gap-0 overflow-y-auto p-0">
      <DialogHeader className="px-4 pt-4 pb-3 pr-12"><DialogTitle>{route?.paid?"출구까지 안내":"입구부터 출구까지 장보기"}</DialogTitle><p className="text-xs text-muted-foreground">{group?.title??"장보기 리스트"}</p></DialogHeader>
      {loading&&<p role="status" className="bg-orange-50 px-4 py-2 text-sm">현재 위치에서 남은 동선을 계산하고 있어요…</p>}
      {error&&<div className="p-4"><p role="alert">{error}</p><button className="mt-3 rounded border p-2" onClick={()=>setRevision(v=>v+1)}>다시 계산</button></div>}
      {route&&<div className={loading?"pointer-events-none opacity-50":""} aria-busy={loading}>
        <div className="px-4 pb-3 text-sm"><strong>{route.methodLabel}</strong><p className="mt-1">{route.start.label} 출발 · 남은 상품 {route.orderedSkuIds.length}종 · {route.floorOrder.map(f=>`${f}층`).join(" → ")}</p><p className="mt-1 text-xs text-muted-foreground">일반 → 신선·냉장 → 냉동 → 계산대 → 출구. 이동 비용 {route.totalDistance}칸 (보행 1칸≈1m, 층 이동 3칸 환산)</p></div>
        <div className="border-y bg-orange-50 px-4 py-3"><p className="text-xs text-orange-700">안내 {step+1}/{route.journeySteps.length} · 미리보기 선택은 현재 위치를 바꾸지 않아요</p><p className="mt-1 font-semibold">{current?.label}</p><p className="mt-1 text-xs">{current?.coldLabel??(current?.kind==="ESCALATOR"?"도착 층에서도 에스컬레이터 앞부터 이어서 안내해요.":"주황색 선을 따라 이동하세요.")}</p>{current?.skuId&&<ProductInsights item={insights[current.skuId]}/>}</div>
        <StoreMap floorNo={floor} pins={pins} routeOrder={route.journeySteps.map((_,i)=>i+1)} pathSegments={segments} routeOrigin={segments[0]?.[0]?{...segments[0][0],label:current?.path[0]?.floorNo===floor?"이 구간 출발":"에스컬레이터 도착"}:undefined} onFloorChange={setFloor} onLivClick={()=>openAiChat(group ? `"${group.title}" 리스트 동선 관련해서 물어볼게` : undefined, groupId)} heightClassName="h-[40vh] min-h-[230px]"/>
        {current?.kind==="ESCALATOR"&&<div className="flex justify-center gap-3 p-2">{current.path.map(p=><button key={p.floorNo} className="rounded border px-3 py-2 text-xs" onClick={()=>setFloor(p.floorNo)}>{p.floorNo}층 {p===current.path[0]?"탑승":"도착"} 위치</button>)}</div>}
        <div className="flex flex-wrap justify-between gap-2 px-4 py-2"><button disabled={step===0} className="rounded border px-3 py-2 text-sm disabled:opacity-40" onClick={()=>select(step-1)}>이전 안내</button><button disabled={step===route.journeySteps.length-1} className="rounded border px-3 py-2 text-sm disabled:opacity-40" onClick={()=>select(step+1)}>다음 안내 보기</button>
        {current&&["FACILITY","ESCALATOR","CHECKOUT","EXIT"].includes(current.kind)&&<button disabled={current.kind==="EXIT"&&!route.paid} onClick={arrive} className="rounded bg-orange-600 px-3 py-2 text-sm text-white disabled:opacity-40">{current.kind==="CHECKOUT"?"계산대 도착 · 결제 화면":current.kind==="EXIT"?(route.paid?"퇴장 완료":"결제 후 퇴장 완료할 수 있어요"):"여기 도착했어요 · 재계산"}</button>}</div>
        <ShoppingRouteActions groupId={groupId} route={route}/>
        <div className="border-t px-4 py-3"><h3 className="mb-2 text-sm font-semibold">전체 방문 순서</h3><ol className="divide-y">{route.journeySteps.map((s,i)=><li key={i}><button className={`flex w-full gap-3 rounded p-2 text-left ${i===step?"bg-orange-50":""}`} aria-current={i===step?"step":undefined} onClick={()=>select(i)}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-xs text-white">{i+1}</span><span className="text-sm"><span className="block font-medium">{s.label}</span><span className="text-xs text-muted-foreground">{s.path[s.path.length-1]?.floorNo}층 · {s.coldLabel??(s.kind==="CHECKOUT"?"실제 담은 상품을 확인하고 결제":"안내 지점")}</span>{s.skuId&&<ProductInsights item={insights[s.skuId]}/>}</span></button></li>)}</ol>
        {route.excluded.length>0&&<div className="mt-3 rounded border p-3 text-sm"><strong>현재 구매 경로에서 제외</strong>{route.excluded.map(e=><div key={e.skuId} className="mt-2">{itemFor(e.skuId)?.name??e.skuId} · {e.reason}<ProductInsights item={insights[e.skuId]}/></div>)}</div>}
        <p className="mt-3 text-xs text-muted-foreground">선택한 구간만 지도에 표시해요. 실제 담은 상품을 스캔하면 남은 상품만 다시 계산해요. 중간에 일반 상품을 추가하면 이미 담은 냉장품을 되돌릴 수 없으므로 남은 상품에 한해 순서를 적용해요.</p></div>
      </div>}
    </DialogContent>
  </Dialog>;
}
