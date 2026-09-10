const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');

test('로그인 신원이 바뀌면 이전 자발형 알림을 지우고 다음 회원의 알림만 보관한다', () => {
  const storage = new Map(), events = new EventTarget();
  const window = {
    localStorage: {getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k)},
    addEventListener: events.addEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
  };
  const module = {exports: {}};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/proactive-notifications.ts'), 'utf8'),
    {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code, {module, exports: module.exports, window, Event, require: () => ({AUTH_CHANGED_EVENT: 'storeflow:auth-changed'})});
  const api = module.exports;
  api.saveProactiveNotification({messageId: 7, content: '회원 A의 알림'});
  api.saveProactiveNotification({messageId: 7, content: '중복 수신'});
  assert.equal(api.readProactiveNotifications().length, 1);
  api.saveProactiveNotification({messageId:7,content:'회원 A의 알림'}, true);
  assert.equal(api.readProactiveNotifications()[0].read,true);
  api.saveProactiveNotification({messageId:7,content:'재연결 수신'});
  assert.equal(api.readProactiveNotifications()[0].read,true);
  let changed = 0;
  events.addEventListener('storeflow:proactive-notifications-changed', () => changed++);
  events.dispatchEvent(new Event('storeflow:auth-changed'));
  assert.equal(api.readProactiveNotifications().length, 0);
  assert.equal(changed, 1);
  api.saveProactiveNotification({messageId: 8, content: '회원 B의 알림'});
  assert.equal(api.readProactiveNotifications()[0].content, '회원 B의 알림');
  assert.equal(api.readProactiveNotifications().length, 1);
});
