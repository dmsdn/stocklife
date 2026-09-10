const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function setup() {
  const values = new Map(), requests = [];
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
  const context = { window: {localStorage: storage, sessionStorage: storage}, localStorage: storage,
    Headers, atob, console, fetch: async (url,options) => {requests.push({url,options}); return new Response('{}');} };
  const cache = new Map();
  function load(file) {
    file = path.resolve(__dirname, '../src', file);
    if(cache.has(file)) return cache.get(file);
    const module={exports:{}};
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    vm.runInNewContext(code,{...context,module,exports:module.exports,require:id=>load(path.resolve(path.dirname(file),id+'.ts'))});
    cache.set(file,module.exports);return module.exports;
  }
  function token(exp, sub='1') {
    const value='e30.'+Buffer.from(JSON.stringify({exp,sub})).toString('base64url')+'.signature';
    storage.setItem('storeflow_access_token',value);return value;
  }
  return {context,storage,requests,load,token};
}
test('비로그인·만료 토큰은 장바구니 요청을 보내지 않는다', async()=>{
 const e=setup(),m=e.load('api/memberAuth.ts');
 await assert.rejects(m.memberFetch('/api/cart')); assert.equal(e.requests.length,0);
 e.token(1); await assert.rejects(m.memberFetch('/api/cart')); assert.equal(e.requests.length,0);
});
test('JWT 헤더만 신원으로 보내고 consumerId를 전송하지 않는다', async()=>{
 const e=setup();const token=e.token(Date.now()/1000+60);const cart=e.load('api/cart.ts');
 await cart.addItemToDbCart(200000,1,7);
 assert.equal(e.requests[0].url,'/api/cart/groups/7/items');
 assert.equal(e.requests[0].options.headers.get('Authorization'),'Bearer '+token);
 assert.deepEqual(JSON.parse(e.requests[0].options.body),{skuId:200000,quantity:1});
});
test('요청 도중 계정이 바뀌면 이전 회원 응답을 거부한다', async()=>{
 const e=setup();e.token(Date.now()/1000+60);
 e.context.fetch=async()=>{e.token(Date.now()/1000+60,'2');return new Response('{}');};
 const m=e.load('api/memberAuth.ts');await assert.rejects(m.memberFetch('/api/cart'),/로그인 상태/);
});
test('서버 권한 거부를 성공으로 처리하지 않는다',async()=>{
 const e=setup();e.token(Date.now()/1000+60);e.context.fetch=async()=>new Response('',{status:403});
 await assert.rejects(e.load('api/memberAuth.ts').memberFetch('/api/cart'),/접근 권한/);
});
