const assert=require('node:assert/strict'),{test}=require('node:test');
const ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 let token=null,resolve,reject;const pending=new Promise((a,b)=>{resolve=a;reject=b});
 const api={isLoggedIn:()=>!!token,getAccessToken:()=>token,resolveImageUrl:x=>x,apiFetch:()=>pending};
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/cart-storage.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,window:{localStorage:storage,sessionStorage:storage},console,require:id=>id==='./api-client'?api:{notifySimulationCartChanged(){}}});
 const save=products=>storage.setItem('storeflow_cart_groups',JSON.stringify([{id:9,title:'guest',products}]));
 save([{id:200000,name:'test',quantity:1}]);return {cart:module.exports,save,storage,resolve,reject,login:()=>token='member'};
}
test('비회원 누락 이미지를 보충하며 요청 중 수량 수정과 상품 삭제를 보존한다',async()=>{const e=setup();const result=e.cart.loadCartGroups();e.save([{id:200000,name:'test',quantity:3}]);e.resolve([{skuId:200000,imageUrl:'/img/200000.webp'}]);const groups=await result;assert.equal(groups[0].products[0].image,'/img/200000.webp');assert.equal(groups[0].products[0].quantity,3);
 const f=setup(),r=f.cart.loadCartGroups();f.save([]);f.resolve([{skuId:200000,imageUrl:'/img/200000.webp'}]);assert.equal((await r)[0].products.length,0);});
test('이미지 조회 실패에도 비회원 목록은 유지한다',async()=>{const e=setup(),r=e.cart.loadCartGroups();e.reject(new Error('offline'));assert.equal((await r)[0].products[0].id,200000);});
test('조회 도중 로그인하면 비회원 결과를 회원 캐시에 쓰지 않는다',async()=>{const e=setup(),r=e.cart.loadCartGroups();e.login();e.resolve([]);await assert.rejects(r,/로그인 상태가 변경/);assert.equal(e.storage.getItem('storeflow_member_cart_cache'),null);});
