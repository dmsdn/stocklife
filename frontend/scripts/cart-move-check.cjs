const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),ts=require('typescript');
for(const denied of [false,true])test(`new target quantity transfer: rejected=${denied}`,async()=>{
 const db=[{cartGroupId:1,title:'source',items:[{cartItemId:11,skuId:200000,quantity:3}]},{cartGroupId:2,title:'target',items:[]}];
 const data=new Map();const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 class ApiError extends Error{constructor(){super('현재 남은 수량은 1개');this.status=409;}}
 const api={ApiError,isLoggedIn:()=>true,getAccessToken:()=> 'same',resolveImageUrl:x=>x,apiFetch:async(url,opt={})=>{
  if(url==='/api/cart/groups')return structuredClone(db);
  if(url.startsWith('/api/products/by-skus'))return [{skuId:200000,name:'sample',priceKrw:100}];
  if(opt.method==='POST'){db[1].items.push({cartItemId:22,skuId:200000,quantity:1});return;}
  const id=Number(url.split('/').pop());
  if(opt.method==='PATCH'){if(denied)throw new ApiError();db.flatMap(g=>g.items).find(i=>i.cartItemId===id).quantity=JSON.parse(opt.body).quantity;return;}
  if(opt.method==='DELETE'){for(const g of db)g.items=g.items.filter(i=>i.cartItemId!==id);return;}
  throw Error(url);
 }};
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../lib/cart-storage.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,window:{localStorage:storage,sessionStorage:storage},console,require:id=>id==='./api-client'?api:{notifySimulationCartChanged(){}}});
 const c=module.exports;await c.loadCartGroups();const result=await c.moveProductsBetweenGroups(1,2,[200000]);
 assert.equal(db.flatMap(g=>g.items).reduce((sum,i)=>sum+i.quantity,0),3);
 assert.equal(db[denied?0:1].items[0].quantity,3);assert.equal(result.warnings.length,denied?1:0);assert.equal(result.movedSkuIds.length,denied?0:1);
});
