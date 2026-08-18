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
  title: "StoreFlow AI",
  description: "창고형 마트 AI 쇼핑 도우미",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${pretendard.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <EventQueueFlusher />
        {children}
      </body>
    </html>
  );
}