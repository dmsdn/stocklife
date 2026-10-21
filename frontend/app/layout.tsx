// app/layout.tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { EventQueueFlusher } from "@/components/domain/event-queue-flusher";

const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "45 920",  // 가변폰트 굵기 범위 — 없으면 WebKit 브라우저에서 렌더링 깨짐
});

export const metadata: Metadata = {
  title: "STOCKLIFE",
  description: "창고형 마트 AI 쇼핑 도우미",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${pretendard.variable} h-full antialiased`}>
      {/* 모바일 화면 고정 — 가로폭을 모바일 크기로 고정한 화면 틀 안에 앱을 그린다.
          스타일은 globals.css의 "모바일 화면 고정" 구역 참고 */}
      <body className="app-stage">
        <div id="app-frame" className="app-frame">
          <div id="app-scroll" className="app-scroll">
            <EventQueueFlusher />
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}