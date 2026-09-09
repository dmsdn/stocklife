const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
function load(env,browser) {
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/api-client.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,process:{env},window:browser?{location:{hostname:'demo.example'}}:undefined});return module.exports;
}
test('브라우저 기본 API·이미지는 HTTPS와 개발 프록시의 동일 origin을 사용한다',()=>{
 const api=load({},true);assert.equal(api.API_BASE_URL,'');assert.equal(api.resolveImageUrl('/img/a.webp'),'/img/a.webp');
 assert.equal(api.resolveImageUrl('https://cdn.example/a.webp'),'https://cdn.example/a.webp');
});
test('명시한 별도 API 서버와 SSR 백엔드 설정은 유지한다',()=>{
 assert.equal(load({NEXT_PUBLIC_API_BASE_URL:'https://api.example/'},true).API_BASE_URL,'https://api.example');
 assert.equal(load({BACKEND_BASE_URL:'http://127.0.0.1:8080'},false).API_BASE_URL,'http://127.0.0.1:8080');
});
