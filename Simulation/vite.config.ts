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

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 백엔드(storeflow-backend, 기본 8080)로 그대로 넘긴다 — 같은 오리진처럼 보이게 해서
      // CORS 설정 없이 개발 서버에서 바로 연동 테스트할 수 있게 하기 위함.
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // 시뮬레이션 캐릭터의 장바구니 담기 → 실제 cart_item 테이블 반영용.
      '/internal': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('X-Internal-Service-Key', INTERNAL_SERVICE_KEY);
          });
        },
      },
    },
  },
});