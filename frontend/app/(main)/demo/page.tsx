"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {apiFetch} from "@/lib/api-client";
import {setActiveSessionId} from "@/lib/session";
import {AiChatBody} from "@/components/ai/ai-chat-body";

type Group={cartGroupId:number;title:string;status:string;items:{skuId:number}[]};
type State={name:string;demoDate:string;products:{skuId:number;name:string}[];groups:Group[];orders:unknown[];notifications:unknown[]};
export default function DemoPage(){
 const [state,setState]=useState<State|null>(null),[message,setMessage]=useState("준비 상태를 확인하고 있어요."),[busy,setBusy]=useState(false);
 const [sid,setSid]=useState<string>(),[gid,setGid]=useState<number>(),[ready,setReady]=useState(false);
 const load=()=>apiFetch<State>("/api/demo").then(setState);
 useEffect(()=>{load().then(()=>setMessage("장면을 선택해 시연을 시작하세요.")).catch(()=>setMessage("골든 시연 계정으로 로그인해 주세요."));},[]);
 async function run(action:string,extra:Record<string,unknown>={}){
  setBusy(true);try{const r=await apiFetch<{message?:string;sessionId?:string}>("/api/demo/"+action,{method:"POST",body:JSON.stringify({groupId:gid,sessionId:sid,...extra})});setMessage(r.message??"완료했습니다.");await load();return r;}catch(e){setMessage(e instanceof Error?e.message:"실행하지 못했어요.");}finally{setBusy(false);}
 }
 async function open(group:Group){setReady(false);setGid(group.cartGroupId);const r=await run("session",{groupId:group.cartGroupId});if(r?.sessionId){setActiveSessionId(r.sessionId);setSid(r.sessionId);setMessage(group.title+" 대화를 열었습니다.");}}
 const selected=state?.groups.find(g=>g.cartGroupId===gid);
 const button=(action:string,label:string,disabled=false)=><button key={action} disabled={busy||disabled} onClick={()=>run(action)} className="rounded-xl border border-orange-200 bg-white px-4 py-3 text-sm disabled:opacity-40">{label}</button>;
 return <main className="mx-auto max-w-3xl px-5 py-6 pb-28"><h1 className="text-2xl font-bold">골든 시연</h1><p className="mt-2 text-sm text-neutral-500">장면별로 새 대화를 열고, 실제 변화를 확인해 보세요. 결제가 끝나면 “시연 목록 준비”로 다음 목록을 만들 수 있어요.</p>
 <nav className="my-5 flex flex-wrap gap-4 text-sm underline"><Link href="/mypage/orders">구매내역</Link><Link href="/notifications">알림함</Link><Link href="/saved">장보기 리스트</Link><Link href="/">홈 추천</Link></nav>
 <p role="status" className="my-4 rounded-xl bg-orange-50 p-4 text-sm">{message}</p>
 {state&&<><p className="my-3 font-semibold">배정 시연일: {state.demoDate} (한국시간)</p><details className="my-4"><summary>시연 품목 10개 확인</summary><ul className="list-disc pl-5">{state.products.map(p=><li key={p.skuId}>{p.name}</li>)}</ul><p className="mt-2 text-sm">소비주기용 6개는 구매하지 말고, 결제 장면에서는 한우 등심만 사용하세요.</p></details><p className="mb-4 text-sm">구매내역 {state.orders.length}건 · 알림 {state.notifications.length}건</p>
 <div className="flex flex-wrap gap-2">{button("prepare","시연 목록 준비")}{button("repurchase","소비주기 알림 확인")}{button("promotion","예정 행사 알림 받기")}</div>
 <section className="my-6"><h2 className="font-bold">1. 장면 선택</h2><div className="mt-3 grid grid-cols-2 gap-2">{state.groups.filter(g=>g.title.startsWith("골든 · ")&&g.status==="ACTIVE").map(g=><button key={g.cartGroupId} disabled={busy} onClick={()=>open(g)} className={"rounded-xl border p-3 text-left text-sm "+(g.cartGroupId===gid?"border-orange-500 bg-orange-50":"")}>{g.title.replace("골든 · ","")}</button>)}</div></section>
 {sid&&<><section className="my-5"><h2 className="mb-3 font-bold">2. 장면 실행</h2><div className="flex flex-wrap gap-2">
 {selected?.title.includes("소비주기")&&button("entry","첫 상품 스캔",!ready)}
 {selected?.title.includes("재입고")&&<>{button("stockout","품절 상태 준비",!ready)}{button("restock","상품 보충",!ready)}</>}
 {selected?.title.includes("위치 이동")&&button("move","새 매대로 이동",!ready)}
 {selected?.title.includes("결제")&&button("checkout","가상 결제 (최대 100P 사용)",!ready)}
 {button("hesitation","두 상품 둘러보기",!ready)}</div>
 <p className="mt-3 text-sm text-neutral-500">재입고는 품절 준비 후 “순수생활 3겹 화장지 12롤 재고 알려줘”라고 물어보고 보충하세요. 위치 이동은 먼저 “골든 · 위치 이동 리스트와 온정식품 감자칩 위치 보여줘”라고 말한 후 실행하세요. 둘러보기 후에는 12초 이상 기다려 주세요.</p></section>
 <section className="flex h-[620px] flex-col overflow-hidden rounded-2xl border bg-white"><AiChatBody key={sid} sessionIdOverride={sid} onSessionReady={()=>setReady(true)}/></section></>}
 </>}
 </main>;
}
