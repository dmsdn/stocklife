import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
    },
  },
});
