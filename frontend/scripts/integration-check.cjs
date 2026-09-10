// 통합 결제 화면의 실제 클릭 핸들러와 저장소 계약을 검증한다. 네트워크/DB 호출은 대역이다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
function storage() {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
}
function environment(browser = true, mocks = {}) {
  const window = browser ? { localStorage: storage(), sessionStorage: storage(), dispatchEvent() {} } : undefined;
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, window, Event, URL, URLSearchParams, console, process: {env:{}},
      document: {referrer: 'https://simulation.example/simulation/'},
      require: id => id in mocks ? mocks[id] : id.startsWith('@/') ? load(id.slice(2) + '.ts') : id.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(file), id + '.ts'))) : require(id),
    }, { filename: file });
    cache.set(file, module.exports);
    return module.exports;
  }
  return { window, load };
}
test('SSR에서 스캔 선택/세션 저장은 안전하게 비어 있다', () => {
  const s = environment(false).load('lib/shopping-session.ts');
  assert.equal(s.readActiveScanGroupId(), null);
  assert.equal(s.readShoppingSession(), null);
  s.writeActiveScanGroupId(4);
});
test('스캔 선택 유지, 세션 상품 정제, 다른 그룹의 신원 분리', () => {
  const e = environment(); const s = e.load('lib/shopping-session.ts');
  s.writeActiveScanGroupId(7); assert.equal(s.readActiveScanGroupId(), 7);
  s.writeActiveScanGroupId(null); assert.equal(s.readActiveScanGroupId(), null);
  e.window.sessionStorage.setItem('storeflow_shopping_session', JSON.stringify({groupId: 7, scannedSkuIds: [200000, 200000, -1, 'bad']}));
  assert.equal(JSON.stringify(s.readShoppingSession().scannedSkuIds), '[200000]');
  assert.equal(s.readShoppingSession().anchor.skuId, 200000);
  assert.equal(s.sessionFor(8).scannedSkuIds.length, 0);
  e.window.sessionStorage.setItem('storeflow_shopping_session', '{');
  assert.equal(s.readShoppingSession(), null);
});
test('결제 요청은 스캔 품목을 명시하고 빈 목록/잘못된 포인트를 거부한다', () => {
  const { buildCheckoutUrl } = environment().load('lib/checkout-draft.ts');
  const query = new URL(buildCheckoutUrl(7, [200000, 200001, 200000], 100), 'http://test').searchParams;
  assert.deepEqual(query.getAll('skuIds'), ['200000', '200001']);
  assert.equal(query.get('pointsToUse'), '100');
  for (const args of [[7, [], 0], [7, [0], 0], [0, [1], 0], [7, [1], -1], [7, [1], 0.5]]) {
    assert.throws(() => buildCheckoutUrl(...args));
  }
});
test('상품 핀은 높이 레벨을 공유하며 미등록 좌표는 서버 좌표를 보존한다', () => {
  const p = environment().load('lib/location-pins.ts');
  assert.equal(p.toRackBayKey('F1-G-R01-B01-L6'), 'F1-G-R01-B01');
  const fallback = { floorNo: 2, x: 3, y: 4 };
  assert.equal(p.resolvePinCoord('F2-G-R01-B01-L1', fallback), fallback);
});
test('위치 모달은 앱 지도와 시뮬레이션에 같은 상품 좌표를 보낸다', () => {
  const sent = [];
  const e = environment(true, {
    react: {useEffect: f => f()},
    '@/components/ui/dialog': {}, './store-map': {},
    '@/lib/simulation-location': {notifySimulationLocation: value => sent.push(value)},
  });
  const {LocationMapDialog} = e.load('components/domain/location-map-dialog.tsx');
  LocationMapDialog({open:true, onClose() {}, skuId:200000, productName:'상품', price:1000, floorNo:3, x:12, y:20});
  assert.equal(JSON.stringify(sent), JSON.stringify([{skuId:200000,name:'상품',floorNo:3,x:12,y:20}]));
});
test('상품 위치 메시지는 실제 부모 origin에만 전달한다', () => {
  const sent = [], e = environment();
  e.window.parent = {postMessage: (message, origin) => sent.push({message,origin})};
  e.window.location = {origin:'https://app.example'};
  e.load('lib/simulation-location.ts').notifySimulationLocation({skuId:1,name:'상품',floorNo:2,x:3,y:4});
  assert.equal(sent[0].origin, 'https://simulation.example');
  assert.equal(sent[0].message.type, 'LOCATE_PRODUCT');
});
test('소비 분석은 동일 상품 여러 개 구매 시 품목 줄 수가 아닌 총수량으로 평균을 낸다', () => {
  const { computeSpendingMetrics } = environment().load('lib/spending-metrics.ts');
  const result = computeSpendingMetrics([{orderId: 1, totalAmount: 3000, status: 'PAID',
    items: [{skuId: 200000, productName: '상품', priceKrw: 1000, quantity: 3}],
    orderedAt: '2026-09-09T12:00:00+09:00', pointsUsed: 0, pointsEarned: 30}], [], 7);
  assert.equal(result.totalQty, 3);
  assert.equal(result.avgPricePerItem, 1000);
  assert.equal(result.totalOrders, 1);
  assert.equal(result.pointsEarned, 30);
  assert.equal(computeSpendingMetrics([], [], 7).avgPricePerItem, 0);
});
function findPayButton(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'button' && node.props.children?.includes?.('결제하기')) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = findPayButton(child); if (result) return result;
  }
  return null;
}
for (const status of ['ACTIVE', 'COMPLETED', 'REFRESH_ERROR']) {
  test(`실제 결제 클릭: 스캔 상품만 요청, 완료/퇴장 상태 연동 (${status})`, async () => {
    const requested = [], completed = [], navigated = [];
    let stateIndex = 0;
    const group = { id: 7, products: [
      { id: 200000, name: 'scanned', price: 1000, quantity: 1 },
      { id: 200001, name: 'not scanned', price: 2000, quantity: 1 },
    ] };
    const e = environment(true, {
      react: { useEffect() {}, useMemo: f => f(), useState: init => [stateIndex++ === 0 ? group : init, () => {}], Suspense: 'suspense' },
      'next/navigation': { useRouter: () => ({ push: url => navigated.push(url), back() {} }), useSearchParams: () => new URLSearchParams('group=7') },
      '@remixicon/react': {},
      '@/lib/api-client': { apiFetch: async url => { requested.push(url); return {orderId: 99}; }, resolveImageUrl: x => x },
      '@/lib/cart-storage': { loadCartGroups: async () => { if (status === 'REFRESH_ERROR') throw Error('offline'); return [{id: 7, status}]; } },
      '@/lib/coupons-mock': {},
      '@/lib/completed-groups': { markGroupCompleted: id => completed.push(id) },
      '@/lib/consumer-events': { trackConsumerEvent: async () => {} },
      '@/components/layout/bottom-bar-visibility-context': { useBottomBarVisibility: () => ({setHidden() {}}) },
    });
    const draft = e.load('lib/checkout-draft.ts');
    draft.writeCheckoutDraft({groupId: 7, scannedSkuIds: [200000], createdAt: '2026-09-09'});
    const session = e.load('lib/shopping-session.ts');
    session.writeShoppingSession({groupId: 7, scannedSkuIds: [200000], anchor: {skuId: 200000}});
    session.writeActiveScanGroupId(7);
    const page = e.load('app/(main)/checkout/page.tsx').default();
    const button = findPayButton(page.props.children.type());
    assert.ok(button, '결제 버튼이 렌더링되어야 함');
    await button.props.onClick();
    assert.equal(requested.length, 1);
    assert.deepEqual(new URL(requested[0], 'http://test').searchParams.getAll('skuIds'), ['200000']);
    assert.deepEqual(completed, status === 'COMPLETED' ? [7] : []);
    assert.equal(session.readActiveScanGroupId(), status === 'COMPLETED' ? null : 7);
    assert.equal(session.readShoppingSession().orderId, 99);
    assert.equal(session.readShoppingSession().paid, true);
    assert.equal(session.readShoppingSession().anchor.skuId, 200000);
    assert.equal(draft.readCheckoutDraft(), null);
    assert.deepEqual(navigated, ['/checkout-complete?orderId=99']);
  });
}
