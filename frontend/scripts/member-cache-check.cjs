const assert = require('node:assert/strict');
const {test} = require('node:test');
const ts = require('typescript'), fs = require('node:fs'), vm = require('node:vm');
function setup() {
 const data = new Map();
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 let token='member-a', release;
 const pending=new Promise(resolve=>release=resolve);
 const api={isLoggedIn:()=>!!token,getAccessToken:()=>token,resolveImageUrl:x=>x,apiFetch:()=>pending};
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../lib/cart-storage.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,window:{localStorage:storage,sessionStorage:storage},console,require:id=>id==='./api-client'?api:{notifySimulationCartChanged(){}}});
 return {cart:module.exports,storage,change:v=>token=v,release:()=>release([{cartGroupId:7,title:'A list',items:[]}])};
}
test('회원 응답 대기 중 로그아웃·계정 변경 시 캐시 재생성을 막는다',async()=>{
 for(const identity of [null,'member-b']) {
  const e=setup();const response=e.cart.loadCartGroups();e.cart.clearMemberCartCache();e.change(identity);e.release();
  await assert.rejects(response,/로그인 상태가 변경/);
  assert.equal(e.storage.getItem('storeflow_member_cart_cache'),null);
 }
});
test('같은 회원의 정상 응답은 리스트를 반환하고 캐시에 보관한다',async()=>{
 const e=setup();const response=e.cart.loadCartGroups();e.release();
 assert.equal((await response)[0].id,7);
 assert.equal(JSON.parse(e.storage.getItem('storeflow_member_cart_cache'))[0].id,7);
});
