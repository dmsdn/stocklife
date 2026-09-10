"use client";
import {useEffect, useRef, useState} from "react";
import {apiFetch} from "@/lib/api-client";
import {addProductToCartGroup, loadCartGroups} from "@/lib/cart-storage";
import {sessionFor, writeShoppingSession} from "@/lib/shopping-session";
import {buildRequestKey, saveRouteProgress, planFacilityDetour, rebaseRouteFrom} from "@/lib/shopping-route-progress";
import {trackConsumerEvent} from "@/lib/consumer-events";
import {useBarcodeScanner} from "@/lib/use-barcode-scanner";
import type {OptimizedRouteResult} from "@/lib/navigation";

interface Product {skuId:number; name:string; categoryL1?:string; finalPriceKrw?:number; priceKrw:number; imageUrl?:string; pickLocationId?:string; discontinued?:boolean;}

/** 검색은 앞으로 살 상품 추가, 스캔은 실물 수집/위치 확인이다. 두 행동을 같은 '담기'로 취급하지 않는다. */
export function ShoppingRouteActions({groupId, route}: {groupId:number; route:OptimizedRouteResult}) {
  const [query,setQuery]=useState("");
  const [results,setResults]=useState<Product[]>([]);
  const [code,setCode]=useState("");
  const [locateOnly,setLocateOnly]=useState(false);
  const [camera,setCamera]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const lock=useRef(false);
  const [facility,setFacility]=useState("");
  const scan = async (value:string) => {
    if(lock.current || !value.trim())return;
    lock.current=true;setBusy(true);setMessage("");
    try {
      const session=sessionFor(groupId);
      const facility=route.facilities.find(f=>f.locationId===value.trim());
      if(facility) {
        // ✅ 버그 수정(인계 문서) — 시설 위치를 직접 스캔한 경우도 상품 순서는 그대로
        //   두고 새 위치에서부터 걷는 길만 다시 계산.
        try {
          const nextRoute = await rebaseRouteFrom(route, facility, route.orderedSkuIds);
          const key = buildRequestKey({ groupId, skuIds: route.orderedSkuIds, anchor: {locationId: facility.locationId}, detourLocationId: undefined, paid: session.paid });
          saveRouteProgress({ groupId, requestKey: key, route: nextRoute, step: 0 });
          writeShoppingSession({...session,anchor:{locationId:facility.locationId},detourLocationId:undefined},{preserveRoute:true});
        } catch {
          writeShoppingSession({...session,anchor:{locationId:facility.locationId},detourLocationId:undefined});
        }
      } else {
        const p=await apiFetch<Product>(`/api/products/barcode/${encodeURIComponent(value.trim())}`,{auth:false});
        if (!p.pickLocationId) throw new Error("이 상품의 매대 위치를 확인하지 못했어요.");
        const onlyPosition = locateOnly || route.paid;
        if (!onlyPosition && p.discontinued) throw new Error("단종 상품은 구매 목록에 추가할 수 없어요.");
        const groups=await loadCartGroups();
        const exists=groups.find(g=>g.id===groupId)?.products.some(x=>x.id===p.skuId);
        // 계획에 있던 상품의 첫 스캔은 수량 추가가 아니라 수집 확인이다. 재스캔도 여기서는 중복 방지한다.
        if (!onlyPosition && !exists) await addProductToCartGroup(groupId,{id:p.skuId,name:p.name,category:p.categoryL1,price:p.finalPriceKrw??p.priceKrw,image:p.imageUrl});
        const ids=onlyPosition?session.scannedSkuIds:[...session.scannedSkuIds.filter(id=>id!==p.skuId),p.skuId];
        writeShoppingSession({...session,scannedSkuIds:ids,anchor:{skuId:p.skuId}});
        trackConsumerEvent({event_type:onlyPosition?"VIEW":"SCAN_ADD",sku_id:p.skuId,location_id:p.pickLocationId});
      }
      setCamera(false);stop();setCode("");
      setMessage("확인한 위치에서 남은 상품과 출구까지 다시 안내해요.");
    } catch(e) {setMessage(e instanceof Error?e.message:"스캔을 확인하지 못했어요.");}
    finally {lock.current=false;setBusy(false);}
  };
  const {videoRef,start,stop,permission}=useBarcodeScanner(scan);
  useEffect(()=>{if(camera)start(); else stop(); return ()=>stop();},[camera]); // scanner callback is held by its hook
  const search=async()=>{
    if(!query.trim())return;
    setBusy(true);setMessage("");
    try {setResults((await apiFetch<Product[]>(`/api/products/search?keyword=${encodeURIComponent(query.trim())}`,{auth:false})).slice(0,8));}
    catch {setMessage("상품 검색을 불러오지 못했어요.");}
    finally {setBusy(false);}
  };
  const add=async(p:Product)=>{
    if(lock.current)return;lock.current=true;setBusy(true);
    try {
      const group=(await loadCartGroups()).find(g=>g.id===groupId);
      if(!group)throw new Error("리스트를 찾을 수 없어요.");
      if(!group.products.some(x=>x.id===p.skuId)) await addProductToCartGroup(groupId,{id:p.skuId,name:p.name,category:p.categoryL1,price:p.finalPriceKrw??p.priceKrw,image:p.imageUrl});
      writeShoppingSession(sessionFor(groupId)); // 현재 위치를 이동시키지 않고 목록만 다시 계산
      setResults([]);setQuery("");setMessage(`${p.name}을 구매 계획에 반영했어요. 매대에서 스캔하면 수집 완료돼요.`);
    }catch(e){setMessage(e instanceof Error?e.message:"추가하지 못했어요.");}
    finally{lock.current=false;setBusy(false);}
  };
  // ✅ 버그 수정(인계 문서 — "동선이 처음으로 돌아감") — 예전엔 detourLocationId만
  //   세션에 써두고 전체 재최적화에 맡겨서 이미 정해둔 나머지 상품 순서가 매번 섞였음.
  //   이제 지금 route가 아는 순서를 유지한 채 시설만 앞에 끼워서 걷는 길만 다시 계산.
  const visitFacility = async () => {
    if (!facility || busy) return;
    setBusy(true); setMessage("");
    try {
      const session = sessionFor(groupId);
      const remainingIds = route.orderedSkuIds;
      const nextRoute = await planFacilityDetour(route, facility, remainingIds);
      const key = buildRequestKey({ groupId, skuIds: remainingIds, anchor: session.anchor, detourLocationId: facility, paid: session.paid });
      saveRouteProgress({ groupId, requestKey: key, route: nextRoute, step: 0 });
      writeShoppingSession({ ...session, detourLocationId: facility }, { preserveRoute: true });
      setMessage("그 시설까지 먼저 안내할게요. 이후 상품 순서는 그대로예요.");
      setFacility("");
    } catch {
      setMessage("경로를 다시 계산하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return <details className="border-t px-4 py-3" open>
    <summary className="cursor-pointer text-sm font-semibold">도중에 계획 바꾸기 · 현재 위치 확인</summary>
    {!route.paid && <div className="mt-3 flex gap-2"><input aria-label="추가할 상품 검색" className="min-w-0 flex-1 rounded border p-2 text-sm" placeholder="리스트에 없는 상품 찾기" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")search();}}/><button disabled={busy} onClick={search} className="rounded border px-3 text-sm">검색</button></div>}
    {results.map(p=><div key={p.skuId} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{p.name}</span><button disabled={busy||p.discontinued} className="shrink-0 rounded border px-2 py-1" onClick={()=>add(p)}>구매 계획에 추가</button></div>)}
    <div className="mt-3 flex gap-2"><select aria-label="들를 시설" value={facility} onChange={e=>setFacility(e.target.value)} className="min-w-0 flex-1 rounded border p-2 text-sm"><option value="">화장실·휴식 공간 선택</option>{route.facilities.map(f=><option key={f.locationId} value={f.locationId}>{f.label}</option>)}</select><button disabled={!facility||busy} className="rounded border px-3 text-sm" onClick={visitFacility}>먼저 들르기</button></div>
    <p className="mt-1 text-xs text-muted-foreground">시설까지 먼저 안내한 뒤 장보기를 이어가요. 도착하면 ‘여기 도착했어요’를 눌러 주세요.</p>
    <div className="mt-3 flex gap-2"><input aria-label="상품 바코드 또는 시설 코드" className="min-w-0 flex-1 rounded border p-2 text-sm" value={code} onChange={e=>setCode(e.target.value)} placeholder="상품 바코드 / 시설 위치 코드"/><button disabled={busy} className="rounded border px-3 text-sm" onClick={()=>scan(code)}>스캔 확인</button><button className="rounded border px-3 text-sm" onClick={()=>setCamera(v=>!v)}>{camera?"카메라 끄기":"카메라"}</button></div>
    <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={locateOnly||route.paid} disabled={route.paid} onChange={e=>setLocateOnly(e.target.checked)}/>상품을 담지 않고 현재 위치만 확인</label>
    {camera&&<video ref={videoRef} className="mt-2 max-h-48 w-full rounded bg-black" muted playsInline/>}
    {camera&&(permission==="denied"||permission==="insecure")&&<p role="alert" className="text-sm">카메라 권한과 HTTPS 연결을 확인해 주세요. 바코드를 직접 입력할 수도 있어요.</p>}
    {message&&<p role="status" className="mt-2 text-sm">{message}</p>}
  </details>;
}
