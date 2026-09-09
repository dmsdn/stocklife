import type { NextConfig } from "next";

// ✅ 신규(2026-09) — "모바일에서 리브도 안 눌리고 화면도 그대로"의 진짜 원인: 코드 문제가
//   아니라 개발 서버 설정이었습니다. 터미널 로그에 이 줄이 반복해서 찍혀 있었어요:
//     "Blocked cross-origin request to Next.js dev resource ... from 192.168.45.214"
//   Next.js 15+는 보안을 위해 PC 말고 다른 IP(핸드폰)에서 개발 서버로 접속하면 기본적으로
//   /_next/static/*.js 같은 실제 JS 번들 파일 요청을 막습니다. 페이지 HTML 자체는
//   내려가서 화면은 보이지만(그래서 "화면은 뜨는데"), 정작 자바스크립트 번들이 하나도
//   안 실행되니 리액트가 hydrate를 못 해서 버튼 클릭이든 뭐든 어떤 상호작용도 전혀 안
//   먹힙니다 — 리브 버튼만의 문제가 아니라 "다른 화면도 그대로"였던 것과 정확히 일치.
//   allowedDevOrigins에 핸드폰이 접속하는 IP를 등록해주면 해결됩니다.
//   ⚠ 와이파이가 바뀌거나 공유기가 새 IP를 주면 이 주소가 달라질 수 있어요 — 그러면
//   터미널에 또 같은 경고가 뜨는데, 그때는 여기 배열에 새 IP를 추가하고 개발 서버를
//   재시작(Ctrl+C 후 다시 npm run dev)하면 됩니다.
const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.45.46", "192.168.0.80"],
};

export default nextConfig;
