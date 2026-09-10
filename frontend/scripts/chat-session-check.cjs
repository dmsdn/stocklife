const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
function setup(handler) {
  const storage = () => { const d = new Map(); return {getItem:k=>d.get(k)??null,setItem:(k,v)=>d.set(k,String(v)),removeItem:k=>d.delete(k)}; };
  const window = new EventTarget();
  window.localStorage=storage(); window.sessionStorage=storage();
  const calls=[], modules={};
  const context=vm.createContext({window,Event,CustomEvent,console,process:{env:{}},crypto:require('node:crypto').webcrypto,
    FormData,fetch:async(url,options)=>{calls.push({url,options});const [status,body]=await handler(url,options);return new Response(body===undefined?null:JSON.stringify(body),{status});}});
  function load(name) {
    if (modules[name]) return modules[name].exports;
    const module={exports:{}}; modules[name]=module;
    const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    vm.runInContext(`(function(require,module,exports){${code}\n})`,context)(id=>load(id.replace('./','')),module,module.exports);
    return module.exports;
  }
  return {session:load('session'),api:load('api-client'),window,calls};
}
const SESSION='storeflow_active_session_id';
test('기존 소유 세션은 유지하고 동시 조회는 합친다',async()=>{
  const e=setup(async()=>[200,{sessionId:'owned'}]);e.window.localStorage.setItem(SESSION,'owned');
  assert.deepEqual(await Promise.all([e.session.getOrCreateSessionId(),e.session.getOrCreateSessionId()]),['owned','owned']);
  assert.equal(e.calls.length,1);
});
for(const status of [403,404]) test(`구버전 저장 세션 조회 ${status}는 새 소유 세션에서만 메시지를 전송한다`,async()=>{
  const e=setup(async(url,opts)=>url.endsWith('/old')?[status,'denied']:url.endsWith('/sessions')?[200,{sessionId:'fresh'}]:[200,{reply:'ok'}]);
  e.window.localStorage.setItem(SESSION,'old');
  const result=await e.session.withValidSession(null,id=>e.api.apiFetch('/api/chat',{method:'POST',body:JSON.stringify({sessionId:id})}));
  assert.equal(result.reply,'ok'); assert.equal(e.window.localStorage.getItem(SESSION),'fresh');
  assert.equal(JSON.parse(e.calls.at(-1).options.body).sessionId,'fresh');
});
for(const status of [401,500]) test(`소유권 조회 ${status}는 세션 교체 없이 오류를 반환한다`,async()=>{
  const e=setup(async()=>[status,'error']);e.window.localStorage.setItem(SESSION,'old');
  await assert.rejects(e.session.withValidSession(null,()=>assert.fail('must not send')),x=>x.status===status);
  assert.equal(e.calls.length,1); assert.equal(e.window.localStorage.getItem(SESSION),'old');
});
test('실제 행동의 403은 재전송하거나 권한을 우회하지 않는다',async()=>{
  const e=setup(async(url)=>url.endsWith('/owned')?[200,{}]:[403,'denied']);e.window.localStorage.setItem(SESSION,'owned');
  await assert.rejects(e.session.withValidSession(null,()=>e.api.apiFetch('/api/chat',{method:'POST'})),x=>x.status===403);
  assert.equal(e.calls.length,2);
});
test('로그인·계정 변경·로그아웃은 기존 활성 세션을 지운다',()=>{
  const e=setup(async()=>[200,{}]);
  for(const action of [()=>e.api.setTokens('member-a','r'),()=>e.api.setTokens('member-b','r'),()=>e.api.clearTokens()]){
    e.window.localStorage.setItem(SESSION,'old');action();assert.equal(e.session.getSessionId(),null);
  }
});
test('계정 변경 중 생성된 이전 세션의 늦은 응답을 저장하지 않는다',async()=>{
  let release;const response=new Promise(r=>release=r);const e=setup(()=>response);
  const p=e.session.startNewSession();e.api.setTokens('member-b','r');release([200,{sessionId:'old'}]);
  await assert.rejects(p,/로그인 상태/);assert.equal(e.session.getSessionId(),null);
});
test('계정 변경 중 조회한 이전 세션에서 메시지를 시작하지 않는다',async()=>{
  let release;const response=new Promise(r=>release=r);const e=setup(()=>response);e.window.localStorage.setItem(SESSION,'old');
  const p=e.session.withValidSession(null,()=>assert.fail('must not send'));e.api.setTokens('member-b','r');release([200,{}]);
  await assert.rejects(p,/로그인 상태/);
});
test('계정 변경 전에 보낸 메시지의 늦은 답변을 반환하지 않는다',async()=>{
  let release, started;const gate=new Promise(r=>started=r),response=new Promise(r=>release=r);
  const e=setup(async(url)=>{if(url.endsWith('/old'))return[200,{}];started();return response;});e.window.localStorage.setItem(SESSION,'old');
  const p=e.session.withValidSession(null,()=>e.api.apiFetch('/api/chat',{method:'POST'}));await gate;
  e.api.clearTokens();release([200,{reply:'old reply'}]);await assert.rejects(p,/로그인 상태/);
});
test('다른 탭의 로그인 변경도 활성 대화를 초기화한다',()=>{
  const e=setup(async()=>[200,{}]);e.window.localStorage.setItem(SESSION,'old');
  const event=new Event('storage');event.key='storeflow_access_token';e.window.dispatchEvent(event);
  assert.equal(e.session.getSessionId(),null);
});
test('계정 변경 시 열린 패널의 리스트·과거 대화·배지도 함께 초기화한다',()=>{
  const state=[], effects=[], window=new EventTarget();
  const react={createContext:()=>({Provider:'provider'}),useContext:()=>null,
    useState:v=>{const i=state.length;state.push(v);return[v,x=>state[i]=typeof x==='function'?x(state[i]):x];},useEffect:fn=>effects.push(fn)};
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../components/layout/ai-panel-context.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,window,require:id=>id==='react'?react:id==='react/jsx-runtime'?{jsx:(type,props)=>({type,props})}:{AUTH_CHANGED_EVENT:'storeflow:auth-changed',readProactiveNotifications:()=>[{read:false}],getSessionId:()=>null,SESSION_CHANGED_EVENT:'storeflow:session-changed'}});
  const tree=module.exports.AiPanelProvider({children:null});effects.forEach(fn=>fn());
  tree.props.value.open('old question',55);tree.props.value.openSession('old-session',7);assert.equal(state[5],1);
  window.dispatchEvent(new Event('storeflow:auth-changed'));
  assert.deepEqual(state,[false,'',null,null,null,0]);
});


test('다른 리스트에서 열면 기존 채팅을 재사용하지 않고 그 리스트로 생성한다', async()=>{
  const e=setup(async(url,options)=>url.endsWith('/old')?[200,{sessionId:'old',groupId:11}]:[200,{sessionId:'new',groupId:22}]);
  e.window.localStorage.setItem(SESSION,'old');
  assert.equal(await e.session.getOrCreateSessionId(22),'new');
  assert.deepEqual(JSON.parse(e.calls.at(-1).options.body),{groupId:22});
});
test('같은 리스트에 연결된 기존 채팅은 유지한다', async()=>{
  const e=setup(async()=>[200,{sessionId:'old',groupId:11}]);e.window.localStorage.setItem(SESSION,'old');
  assert.equal(await e.session.getOrCreateSessionId(11),'old');assert.equal(e.calls.length,1);
});
test('다른 창이 전역 활성 ID를 바꿔도 열린 창의 메시지는 고정된 세션으로 간다', async()=>{
  const e=setup(async()=>[200,{}]);e.window.localStorage.setItem(SESSION,'chat-b');
  let sent;
  await e.session.withValidSession(11,async id=>{sent=id;},'chat-a');
  assert.equal(sent,'chat-a');assert.ok(e.calls[0].url.endsWith('/chat-a'));
  assert.equal(e.window.localStorage.getItem(SESSION),'chat-b');
});
test('고정된 대화가 삭제되면 다른 대화로 행동을 재전송하지 않는다', async()=>{
  const e=setup(async()=>[404,'gone']);
  await assert.rejects(e.session.withValidSession(11,()=>assert.fail('must not send'),'deleted'));
  assert.equal(e.calls.length,1);
});
