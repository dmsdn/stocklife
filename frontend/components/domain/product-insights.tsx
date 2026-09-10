"use client";
import {useEffect, useState} from "react";
import {apiFetch} from "@/lib/api-client";

export interface ProductInsight {skuId: number; repurchase?: string; availability?: string;}
/** 모델을 호출할 수 없는 상품은 배지를 만들지 않는다. 수치를 임의 평균/확률로 채우지 않는다. */
export function useProductInsights(ids: number[]) {
  const key = [...new Set(ids)].sort((a,b)=>a-b).join(",");
  const [items, setItems] = useState<Record<number, ProductInsight>>({});
  useEffect(()=>{
    let active = true;
    setItems({});
    if (!key) return;
    (async()=>{
      const skus = key.split(",").map(Number);
      const all: ProductInsight[] = [];
      for (let i=0; i<skus.length; i+=40) {
        const result = await apiFetch<{items: ProductInsight[]}>("/api/ai/list-insights", {method:"POST", body:JSON.stringify({skuIds:skus.slice(i,i+40)})});
        all.push(...result.items);
      }
      if (active) setItems(Object.fromEntries(all.map(x=>[x.skuId,x])));
    })().catch(()=>{if(active)setItems({});});
    return()=>{active=false;};
  },[key]);
  return items;
}
export function ProductInsights({item}: {item?: ProductInsight}) {
  if (!item?.repurchase && !item?.availability) return null;
  return <div className="mt-1 space-y-1 text-xs leading-5 text-teal-800">
    {item.repurchase && <p>{item.repurchase}</p>}
    {item.availability && <p>{item.availability}</p>}
  </div>;
}
