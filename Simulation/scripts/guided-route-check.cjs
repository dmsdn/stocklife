const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/App.tsx'),'utf8').replace(/\r\n/g,'\n');
const start=source.indexOf('            async (',source.indexOf('    const runGuidedRoute ='));
const end=source.indexOf('\n            [\n',start);
const expression=source.slice(start,end).trim().replace(/,$/,'');
for(const replacePlan of [false,true]) test(`안내는 서버 목적지만 걷고 새 스캔 계획을 반영한다: ${replacePlan}`,async()=>{
 const moves=[],pendingGuidedPlan={current:null},guidedResumeRef={current:null};let paused=0;
 const canvas={walkTo:(p,done)=>{moves.push({...p});done(true)},getPlayerGrid:()=>({x:10,y:10}),setControlsEnabled(){}};
 const context={console,canvasRef:{current:canvas},pendingGuidedPlan,guidedResumeRef,playerFloorRef:{current:1},ENTRANCE:{floor:1,x:0,y:0},setBusy(){},setStatusMessage(){},setTimeout(){},setPlayerCell(){},getFloorData:async()=>({locations:[]}),openLocationPopupRef:{current:null},startTrip:async()=>{throw Error('unexpected floor trip')},setGuidedStop:(v)=>{if(v)queueMicrotask(()=>{if(replacePlan && paused++===0)pendingGuidedPlan.current={stops:[{skuId:3,name:'new',floor:1,x:30,y:10}]};guidedResumeRef.current?.();});}};
 const code=ts.transpileModule('const run='+expression+';globalThis.run=run;',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(code,context);
 await context.run([{skuId:1,name:'one',floor:1,x:10,y:10},{skuId:2,name:'old',floor:1,x:20,y:10}],false);
 assert.deepEqual(moves,[{x:10,y:10},{x:replacePlan?30:20,y:10}]);
});
