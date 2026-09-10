const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(name,api={}){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:id=>id==='./api-client'?api:{}});return module.exports;}
test('목록·주문 상세 링크만 허용하고 외부 주소·스크립트·경로 변조는 거절한다',()=>{
 const {chatDetailHref:f}=load('chat-detail-links');
 for(const x of ['/saved/12','/mypage/orders/45','/mypage/receipts/45'])assert.equal(f(x),x);
 for(const x of ['javascript:alert(1)','https://bad.test','//bad.test','/saved/1/../2','/saved/0','/saved/1?redirect=bad','/saved/1#bad'])assert.equal(f(x),null);
});
test('비회원 추천은 개인화 API나 가짜 상품으로 대체하지 않는다',async()=>{
 const h=load('home-data',{getAccessToken:()=>null,apiFetch:()=>assert.fail('no personal request')});
 const r=await h.fetchLivRecommendations();assert.equal(r.status,'login_required');assert.equal(r.items.length,0);
});
test('추천 서비스 실패를 일반 상품 검색 성공으로 위장하지 않는다',async()=>{
 const calls=[];const h=load('home-data',{getAccessToken:()=> 'a',apiFetch:async url=>{calls.push(url);throw Error('down');}});
 const r=await h.fetchLivRecommendations();assert.equal(r.status,'unavailable');assert.equal(r.items.length,0);assert.deepEqual(calls,['/api/ai/recommendations?limit=8']);
});
test('추천 응답 도중 계정 변경 시 이전 회원의 추천을 반환하지 않는다',async()=>{
 let token='a',release;const pending=new Promise(r=>release=r);
 const h=load('home-data',{getAccessToken:()=>token,apiFetch:()=>pending,resolveImageUrl:x=>x});
 const request=h.fetchLivRecommendations();token='b';release({items:[{skuId:11,name:'A 전용',priceKrw:3}],status:'ready',message:'ok'});
 assert.equal((await request).items.length,0);
});
