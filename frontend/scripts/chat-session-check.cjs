// scripts/chat-session-check.cjs
// ✅ 신규 — "채팅 리스트·상세 링크·리브 추천" 인계 문서가 요구한 4개 회귀 검사.
//   lib/session.ts를 실제로 트랜스파일해서 돌려보고(가짜 window/apiFetch로), 오늘
//   고친 세션 격리 동작이 정말 그렇게 되는지 기계적으로 확인합니다.
//   package.json/scripts 폴더가 원래 이 zip엔 없어서, 기존 chat-session-check.cjs를
//   덮어쓰는 게 아니라 이 4개 검사만 담아 새로 만들었습니다.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const SESSION = "storeflow_active_session_id";

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

function transpile(name) {
  const src = fs.readFileSync(path.join(__dirname, "../lib", name + ".ts"), "utf8");
  return ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

/** @param respond (url, options) => Promise<[status, body]> */
function setup(respond) {
  const calls = [];
  const localStorage = makeLocalStorage();
  const window = { localStorage, dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} };

  const apiClientStub = {
    getAccessToken: () => null,
    ApiError: class ApiError extends Error {
      constructor(status, message) {
        super(message);
        this.status = status;
      }
    },
    apiFetch: async (url, options = {}) => {
      calls.push({ url, options });
      const [status, body] = await respond(url, options);
      if (status >= 400) {
        const { ApiError } = apiClientStub;
        throw new ApiError(status, typeof body === "string" ? body : "error");
      }
      return body;
    },
  };
  const clientIdStub = { getClientId: () => "guest-1" };

  const moduleObj = { exports: {} };
  vm.runInNewContext(transpile("session"), {
    module: moduleObj,
    exports: moduleObj.exports,
    window,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    require: (id) => {
      if (id === "./api-client") return apiClientStub;
      if (id === "./client-id") return clientIdStub;
      throw new Error("unexpected import: " + id);
    },
  });

  return { session: moduleObj.exports, window, calls };
}

test("다른 리스트에서 열면 기존 채팅을 재사용하지 않고 그 리스트로 생성한다", async () => {
  const e = setup(async (url, options) => {
    if (url.endsWith("/old")) return [200, { sessionId: "old", groupId: 11 }];
    if (options.method === "POST") return [200, { sessionId: "new" }];
    return [200, { sessionId: "new", groupId: 22 }];
  });
  e.window.localStorage.setItem(SESSION, "old");
  const id = await e.session.getOrCreateSessionId(22);
  assert.equal(id, "new");
  const createCall = e.calls.find((c) => c.options.method === "POST");
  assert.deepEqual(JSON.parse(createCall.options.body), { groupId: 22 });
});

test("같은 리스트에 연결된 기존 채팅은 유지한다", async () => {
  const e = setup(async () => [200, { sessionId: "old", groupId: 11 }]);
  e.window.localStorage.setItem(SESSION, "old");
  const id = await e.session.getOrCreateSessionId(11);
  assert.equal(id, "old");
  // 메타데이터 조회 1번만 — 새로 만들지 않았어야 함
  assert.equal(e.calls.length, 1);
});

test("다른 창이 전역 활성 ID를 바꿔도 고정된(boundSessionId) 세션으로 보낸다", async () => {
  const e = setup(async () => [200, {}]);
  e.window.localStorage.setItem(SESSION, "chat-b"); // 다른 창이 바꿔둔 값
  let sent;
  await e.session.withValidSession(11, async (id) => { sent = id; }, "chat-a");
  assert.equal(sent, "chat-a");
  // boundSessionId가 있으면 getOrCreateSessionId(전역 값 재확인)를 아예 안 타므로 네트워크 호출 없음
  assert.equal(e.calls.length, 0);
  // 전역 값은 안 건드렸어야 함(다른 창 것까지 이 화면이 바꾸면 안 됨)
  assert.equal(e.window.localStorage.getItem(SESSION), "chat-b");
});

test("고정된 대화가 삭제되면(404) 다른 대화로 조용히 넘기지 않고 그대로 실패한다", async () => {
  const e = setup(async () => [404, "gone"]);
  await assert.rejects(
    e.session.withValidSession(11, (id) => e.session.getSessionMetadata(id), "deleted")
  );
  // 404 났다고 다른 세션을 새로 만들어서 재시도하지 않았어야 함(호출 1번만)
  assert.equal(e.calls.length, 1);
});
