const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/game/displayedPath.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports});const pick=m.exports.displayedPath;
const P=(x,y)=>({x,y}), route=[P(0,0),P(0,1),P(0,2),P(1,2),P(2,2),P(2,1),P(2,0)];
test('직선 지름길 대신 표시된 우회 좌표를 순서대로 걷는다',()=>{const got=pick([route],P(0,0),P(2,0),()=>true,()=>{throw Error('replanning');});assert.equal(JSON.stringify(got),JSON.stringify(route));});
test('다른 층에서 끊긴 선은 건너뛰지 않고 잘못된 대각선·벽 경로를 거절',()=>{assert.equal(pick([[P(0,0),P(8,8)]],P(0,0),P(8,8),()=>true,()=>[]),null);assert.equal(pick([route],P(0,0),P(2,0),p=>p.y!==2,()=>[]),null);});
test('안내선 밖에서는 가까운 선에 합류한 뒤 표시된 구간을 걷는다',()=>{const got=pick([route],P(-1,0),P(2,0),()=>true,(a,b)=>[a,b]);assert.equal(JSON.stringify(got),JSON.stringify([P(-1,0),...route]));});
test('같은 구간의 이전 매대는 표시된 선을 역방향으로 따라간다',()=>{assert.equal(JSON.stringify(pick([route],P(2,0),P(0,0),()=>true,()=>[])),JSON.stringify([...route].reverse()));});
