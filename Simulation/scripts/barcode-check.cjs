const assert=require('node:assert/strict'),{test}=require('node:test');
const ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('바코드 패널을 열면 상품 backdrop이 사라지고 닫으면 상품 목록이 복원된다',()=>{
 let slots=[],index=0;
 const react={useState:initial=>{const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=v];}};
 const jsx=(type,props)=>({type,props});
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/components/ProductPopup.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,console,require:id=>id==='react'?react:id==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'fragment'}:{default:id}});
 const render=()=>{index=0;return module.exports.default({baseLabel:'매대',groups:[],cartQtyByKey:{},onClose(){}}).props.children;};
 let nodes=render();assert.equal(nodes[0].type,'./Modal');
 slots[1]={name:'상품',barcode:'8801234567893'};nodes=render();assert.equal(nodes[0],false);assert.equal(nodes[1].type,'./BarcodeModal');
 nodes[1].props.onClose();nodes=render();assert.equal(nodes[0].type,'./Modal');assert.ok(!nodes[1]);
});
