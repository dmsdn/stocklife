const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
function load(file,imports={},window={}){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:k=>imports[k]??{},window,console,URL,Date,Map,Set});return module.exports;}
function storage(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
test('필터 적용·복수 카테고리·해제의 결과와 숫자는 같은 상품 집합이다',()=>{
 const {filterProducts}=load('product-filter.ts');const p=[{id:1,categoryL1:'식품',discontinued:false,finalPriceKrw:1000},{id:2,categoryL1:'생활',discontinued:false,finalPriceKrw:3000},{id:3,categoryL1:'식품',discontinued:true,finalPriceKrw:6000}];
 const f={categories:['식품'],statuses:[],priceRange:[0,500000]};assert.deepEqual(Array.from(filterProducts(p,f),x=>x.id),[1,3]);assert.equal(filterProducts(p,{...f,categories:[]}).length,3);assert.equal(filterProducts(p,{...f,categories:['식품','생활'],priceRange:[2000,4000]}).length,1);
});
test('비회원 상품 이미지를 실제 상품 조회로 보충하고 변경 중 회원 신원으로 쓰지 않는다',async()=>{
 const local=storage(),session=storage();local.setItem('storeflow_cart_groups',JSON.stringify([{id:1,title:'guest',products:[{id:20,name:'water',quantity:2}]}]));let token=null,calls=[];
 const api={isLoggedIn:()=>!!token,getAccessToken:()=>token,resolveImageUrl:x=>x,apiFetch:async url=>{calls.push(url);return [{skuId:20,imageUrl:'/water.jpg'}];}};
 const cart=load('cart-storage.ts',{'./api-client':api,'./simulation-bridge':{notifySimulationCartChanged(){}}},{localStorage:local,sessionStorage:session});
 assert.equal((await cart.loadCartGroups())[0].products[0].image,'/water.jpg');assert.equal(calls.some(x=>x.includes('migrate')),false);
 token='member';api.apiFetch=async url=>{calls.push(url);return []};await cart.loadCartGroups();assert.equal(calls.some(x=>x.includes('migrate')),false);assert.ok(local.getItem('storeflow_cart_groups'));
});
test('가입한 번호로 로그인할 때만 승계하고 일반 로그인은 승계하지 않는다',async()=>{
 const local=storage(),session=storage(),calls=[];let migrations=0;
 const auth=load('auth.ts',{'./api-client':{apiFetch:async(url)=>{calls.push(url);return url.includes('login')?{accessToken:'a',refreshToken:'r'}:{consumerId:1};},setTokens(){},clearTokens(){}},'./cart-storage':{clearMemberCartCache(){},resetCartMigrationAttempt(){},migrateGuestCartToAccount:async()=>migrations++}},{localStorage:local,sessionStorage:session,parent:{postMessage(){}},location:{origin:'https://demo'}});
 await auth.login('01011111111','pass');assert.equal(migrations,0);
 await auth.signup({phoneNumber:'01022222222'});await auth.login('01011111111','pass');assert.equal(migrations,0);
 await auth.login('01022222222','pass');assert.equal(migrations,1);await auth.login('01022222222','pass');assert.equal(migrations,1);
});
test('층을 떠났다가 돌아온 경로는 연결하지 않고 다음 시설까지 파란 구간에 포함한다',()=>{
 const {floorSegments,nextDestinationSteps}=load('route-display.ts');const p=f=>({floorNo:f,x:1,y:2});const steps=[{kind:'WALK',path:[p(1),p(2),p(1)]},{kind:'FACILITY',path:[p(1)]},{kind:'PRODUCT',path:[p(1)]}];assert.equal(floorSegments(steps,1).length,4);assert.equal(nextDestinationSteps(steps).length,2);
});
test('재고 대표 위치는 재고가 있는 PICK의 서버 격자이며 수동 핀 값으로 덮지 않는다',()=>{
 const {pickLocation}=load('product-location.ts');const live={locationId:'F2-D-R02-B04-L1',tierRole:'PICK',qty:23,floorNo:2,x:8,y:28};const out=pickLocation([{...live,qty:0,x:55},live]);assert.equal(out.x,8);assert.equal(out.y,28);
});
