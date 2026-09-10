// tests/shopping-route-progress.test.mjs
// ✅ 신규 — "동선 안내가 처음으로 돌아가는 오류" 인계 문서가 요구한 회귀 검사를,
//   scan/page.tsx의 "동선 한 번에 표시" 구조에 맞게 다시 짠 lib/shopping-route-progress.ts
//   기준으로 작성했습니다. 인계 문서의 step/confirmedThrough 개념은 이 UI엔 없어서
//   그 부분 테스트는 안 옮겼고, 핵심 원칙(순서 유지, requestKey 캐시, 마무리 단계
//   보존)만 검증합니다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB_DIR = path.join(__dirname, "../lib");

function transpile(name) {
  const src = fs.readFileSync(path.join(LIB_DIR, name + ".ts"), "utf8");
  return ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

/** ./navigation, ./shopping-session처럼 서로 물고 있는 로컬 모듈들을 재귀적으로
 *  트랜스파일+실행. ./api-client만 바깥에서 주는 목업으로 바꿔치기합니다. */
function makeLoader(apiClientStub) {
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const moduleObj = { exports: {} };
    cache.set(name, moduleObj.exports); // 순환 참조 대비 먼저 등록
    vm.runInNewContext(transpile(name), {
      module: moduleObj,
      exports: moduleObj.exports,
      require: (id) => {
        if (id === "./api-client") return apiClientStub;
        const dep = id.replace(/^\.\//, "");
        return load(dep);
      },
    });
    cache.set(name, moduleObj.exports);
    return moduleObj.exports;
  }
  return load;
}

/** @param routeResponses  url -> {legs, totalDistance} 또는 함수(stops) => 그 값 */
function setup(routeResponse) {
  const calls = [];
  const apiClientStub = {
    apiFetch: async (url, options = {}) => {
      calls.push({ url, body: options.body ? JSON.parse(options.body) : undefined });
      if (url === "/api/navigation/route") {
        const body = calls.at(-1).body;
        return typeof routeResponse === "function" ? routeResponse(body.stops) : routeResponse;
      }
      throw new Error("getOptimizedRoute는 이 테스트들에서 호출되면 안 됩니다: " + url);
    },
  };
  const load = makeLoader(apiClientStub);
  return { progress: load("shopping-route-progress"), calls };
}

function fakeRoute(overrides = {}) {
  return {
    legs: [],
    totalDistance: 0,
    orderedSkuIds: [1, 2, 3],
    floorOrder: [1],
    start: { floorNo: 1, x: 0, y: 0, label: "시작" },
    originalDistance: null,
    savedDistance: null,
    excluded: [],
    optimizationSource: "optimized",
    journeySteps: [
      { stepIndex: 0, kind: "PRODUCT", label: "상품1", path: [{ floorNo: 1, x: 1, y: 1 }], distance: 1, skuId: 1 },
      { stepIndex: 1, kind: "PRODUCT", label: "상품2", path: [{ floorNo: 1, x: 2, y: 2 }], distance: 1, skuId: 2 },
      { stepIndex: 2, kind: "PRODUCT", label: "상품3", path: [{ floorNo: 1, x: 3, y: 3 }], distance: 1, skuId: 3 },
      { stepIndex: 3, kind: "CHECKOUT", label: "계산대", path: [{ floorNo: 1, x: 4, y: 4 }], distance: 1 },
      { stepIndex: 4, kind: "EXIT", label: "출구", path: [{ floorNo: 1, x: 5, y: 5 }], distance: 1 },
    ],
    optimal: true,
    methodLabel: "optimized",
    paid: false,
    facilities: [{ floorNo: 1, x: 9, y: 9, locationId: "F1-X-RESTROOM-1", label: "화장실" }],
    ...overrides,
  };
}

test("buildRequestKey — 같은 조건이면 상품 순서와 무관하게 같은 키를 만든다", () => {
  const { progress } = setup(fakeRoute());
  const a = progress.buildRequestKey({ groupId: 1, skuIds: [3, 1, 2], anchor: { skuId: 1 }, detourLocationId: undefined, paid: false });
  const b = progress.buildRequestKey({ groupId: 1, skuIds: [1, 2, 3], anchor: { skuId: 1 }, detourLocationId: undefined, paid: false });
  assert.equal(a, b);
});

test("buildRequestKey — 남은 상품 집합이 다르면 다른 키를 만든다(실제 스캔은 재최적화돼야 함)", () => {
  const { progress } = setup(fakeRoute());
  const a = progress.buildRequestKey({ groupId: 1, skuIds: [1, 2, 3], anchor: undefined, detourLocationId: undefined, paid: false });
  const b = progress.buildRequestKey({ groupId: 1, skuIds: [1, 2], anchor: undefined, detourLocationId: undefined, paid: false });
  assert.notEqual(a, b);
});

test("planFacilityDetour — 시설을 맨 앞에 넣되 나머지 상품 순서는 그대로 유지한다", async () => {
  const { progress, calls } = setup((stops) => ({
    legs: stops.map((s, i) => ({ stopIndex: i, label: null, skuId: s.skuId ?? null, locationId: s.locationId ?? null, zoneId: null, status: "OK", path: [{ floorNo: 1, x: i, y: i }], distance: 1 })),
    totalDistance: 3,
  }));
  const route = fakeRoute();
  const next = await progress.planFacilityDetour(route, "F1-X-RESTROOM-1", [1, 2, 3]);

  // 상품 순서(orderedSkuIds) 자체는 안 바뀌어야 함
  assert.equal(JSON.stringify(next.orderedSkuIds), JSON.stringify([1, 2, 3]));
  // 실제 API에 보낸 stops 순서도 시설이 맨 앞, 그다음은 기존 순서
  assert.deepEqual(calls[0].body.stops, [{ locationId: "F1-X-RESTROOM-1" }, { skuId: 1 }, { skuId: 2 }, { skuId: 3 }]);
});

test("planFacilityDetour — CHECKOUT/EXIT처럼 위치가 안 바뀌는 마무리 단계는 다시 계산하지 않고 그대로 이어붙인다", async () => {
  const { progress } = setup((stops) => ({
    legs: stops.map((s, i) => ({ stopIndex: i, label: null, skuId: s.skuId ?? null, locationId: s.locationId ?? null, zoneId: null, status: "OK", path: [{ floorNo: 1, x: i, y: i }], distance: 1 })),
    totalDistance: 3,
  }));
  const route = fakeRoute();
  const next = await progress.planFacilityDetour(route, "F1-X-RESTROOM-1", [1, 2, 3]);

  const kinds = next.journeySteps.map((s) => s.kind);
  assert.equal(JSON.stringify(kinds), JSON.stringify(["FACILITY", "PRODUCT", "PRODUCT", "PRODUCT", "CHECKOUT", "EXIT"]));
  // CHECKOUT/EXIT는 원래 route의 것과 같은 좌표(다시 계산 안 했다는 뜻)
  const checkoutStep = next.journeySteps.find((s) => s.kind === "CHECKOUT");
  assert.equal(JSON.stringify(checkoutStep.path), JSON.stringify(route.journeySteps.find((s) => s.kind === "CHECKOUT").path));
});

test("rebaseRouteFrom — 새 위치에서부터지만 남은 상품 순서는 그대로 유지한다", async () => {
  const { progress, calls } = setup((stops) => ({
    legs: stops.map((s, i) => ({ stopIndex: i, label: null, skuId: s.skuId ?? null, locationId: null, zoneId: null, status: "OK", path: [{ floorNo: 1, x: i, y: i }], distance: 1 })),
    totalDistance: 2,
  }));
  const route = fakeRoute();
  const newAnchor = { floorNo: 1, x: 7, y: 7 };
  const next = await progress.rebaseRouteFrom(route, newAnchor, [2, 3]); // 1번은 이미 스캔해서 제외됐다고 가정

  assert.equal(JSON.stringify(next.orderedSkuIds), JSON.stringify([2, 3]));
  assert.equal(JSON.stringify(next.start), JSON.stringify({ ...newAnchor, label: "현재 위치" }));
  // API에 보낸 startFloor/X/Y가 새 anchor와 일치
  assert.equal(calls[0].body.startFloor, 1);
  assert.equal(calls[0].body.startX, 7);
  assert.equal(calls[0].body.startY, 7);
});

test("rebaseRouteFrom — 남은 상품이 하나도 없으면(전부 스캔 완료) API를 새로 안 부르고 마무리 단계만 남긴다", async () => {
  const { progress, calls } = setup(fakeRoute());
  const route = fakeRoute();
  const next = await progress.rebaseRouteFrom(route, { floorNo: 1, x: 5, y: 5 }, []);

  assert.equal(calls.length, 0); // getRoute를 아예 안 불렀어야 함
  assert.equal(JSON.stringify(next.orderedSkuIds), JSON.stringify([]));
  assert.equal(JSON.stringify(next.journeySteps.map((s) => s.kind)), JSON.stringify(["CHECKOUT", "EXIT"]));
});
