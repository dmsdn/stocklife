import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 백엔드의 /internal/** 은 X-Internal-Service-Key가 있어야 하고, 이 키는 절대
// 브라우저(프론트 번들)에 노출되면 안 된다. vite dev 서버(Node 쪽)는 브라우저가 아니므로,
// 여기서 서버 대 서버로 헤더를 대신 붙여준다 — 프론트 코드는 키를 전혀 모른다.
// 백엔드 application.yml의 internal.service-key와 반드시 같은 값으로 맞춰야 한다.
// Node 타입(@types/node) 없이도 vite.config.ts가 컴파일되도록 process.env 대신
// globalThis로 안전하게 접근한다. env 변수가 없으면 백엔드 internal.service-key 기본값을 쓴다.
const INTERNAL_SERVICE_KEY =
    (globalThis as any).process?.env?.INTERNAL_SERVICE_KEY ?? 'change-this-shared-secret-before-deploy';

const BACKEND = 'http://localhost:8080';

// 오른쪽 웹 화면(Next.js) 개발 서버. 아래 프록시가 이 주소를 5173 밑으로 끌어온다.
const FRONTEND =
    (globalThis as any).process?.env?.FRONTEND_DEV_URL ?? 'http://localhost:3000';

// ============================================================================
// 09-09: 개발 서버를 배포와 같은 구조로 맞춘다.
//
// [무엇이 문제였나]
//   배포용 회원 인증(src/api/memberAuth.ts)은 localStorage에서 JWT를 읽는다. 그런데
//   localStorage는 origin마다 완전히 분리돼 있다. 프론트가 localhost:3000, 시뮬레이션이
//   localhost:5173이면 서로 다른 origin이라 시뮬레이션은 그 토큰을 영원히 못 읽는다.
//   그래서 로컬에서는 로그인을 해도 getMemberToken()이 항상 null이었고, 장바구니 담기가
//   전부 "오른쪽 앱에서 회원 로그인을 먼저 해주세요"로 막혔다.
//   memberAuth.ts 첫 줄에 적힌 "같은 origin에 배포할 때"가 바로 이 전제다.
//
// [어떻게 고쳤나]
//   배포(EC2)는 프론트가 /, 시뮬레이션이 /simulation/ 으로 한 주소 아래 있다. 개발 서버도
//   똑같이 만든다. base를 /simulation/ 으로 두고, 그 밖의 모든 경로는 Next 개발 서버로
//   넘긴다. 그러면 두 화면이 같은 origin(localhost:5173)이 되어 토큰이 그대로 공유된다.
//
// [그래서 바뀌는 것]
//   개발 중 열어야 할 주소가 바뀐다.
//     시뮬레이션  http://localhost:5173/simulation/
//     프론트 단독  http://localhost:5173/           (또는 예전처럼 :3000 직접도 가능)
//   npm run dev 는 그대로고, Next(:3000)도 그대로 따로 띄워둬야 한다.
// ============================================================================

export default defineConfig({
  plugins: [react()],
  // 배포 빌드가 쓰던 --base=/simulation/ 과 같은 값이다. 개발도 같은 경로를 쓰게 해서
  // "로컬에선 됐는데 배포에선 안 되네"가 생기지 않게 한다.
  base: '/simulation/',
  server: {
    port: 5173,
    proxy: {
      // ── 백엔드 ──────────────────────────────────────────────────────────
      // 아래 두 규칙이 먼저 있어야 한다. 프록시는 위에서부터 먼저 맞는 것이 이긴다.
      '/api': {
        target: BACKEND,
        changeOrigin: true,
      },
      // 시뮬레이션 캐릭터의 장바구니 담기 → 실제 cart_item 테이블 반영용.
      '/internal': {
        target: BACKEND,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('X-Internal-Service-Key', INTERNAL_SERVICE_KEY);
          });
        },
      },

      // ── 오른쪽 웹 화면(Next.js) ─────────────────────────────────────────
      // Next의 정적 파일과 자체 HMR 소켓. ws를 켜야 프론트 화면이 자동 갱신된다.
      '/_next': {
        target: FRONTEND,
        changeOrigin: true,
        ws: true,
      },
      // 나머지 전부. /simulation 으로 시작하지 않는 경로는 Next가 처리한다
      // (/, /search, /cart, /auth/login, /favicon.ico ...).
      // ⚠ 여기에는 ws를 켜지 않는다 — 켜면 시뮬레이션 자신의 HMR 소켓까지 Next로
      //   넘어가서 시뮬레이션 쪽 자동 갱신이 죽는다.
      '^(?!/simulation)': {
        target: FRONTEND,
        changeOrigin: true,
      },
    },
  },
});
