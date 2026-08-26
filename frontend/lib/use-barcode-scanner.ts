// lib/use-barcode-scanner.ts
// ✅ 예전엔 브라우저 내장 BarcodeDetector API를 썼는데, 이게 안드로이드 크롬에만 있고
//   iOS(사파리/아이폰 크롬 전부 WebKit이라 동일)·데스크톱 크롬·파이어폭스에는 아예 없었습니다.
//   순수 JS로 프레임을 직접 분석하는 @zxing/library로 바꿔서 브라우저/기기 상관없이
//   동작합니다. package.json에 아직 없으면 설치 필요:
//     npm install @zxing/library
"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";

export function useBarcodeScanner(onDetected: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [permission, setPermission] = useState<"idle" | "granted" | "denied">("idle");
  // ✅ zxing은 브라우저 내장 API가 아니라 순수 JS 디코딩이라, 사실상 모든 최신 브라우저에서
  //   동작합니다 — 그래도 카메라 API(getUserMedia) 자체가 없는 아주 오래된 브라우저 대비용으로
  //   플래그는 남겨뒀습니다.
  const [supported] = useState(true);

  const stop = () => {
    readerRef.current?.reset();
  };

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission("denied");
      return;
    }
    if (!videoRef.current) return;

    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatReader();
    }

    try {
      // ✅ undefined = 카메라 기기 자동 선택. deviceId를 직접 안 넘기고 후면 카메라를
      //   요청하려면 아래처럼 constraints를 넘기는 대신, 대부분의 폰에서는 기본 카메라가
      //   후면이라 이것만으로 충분합니다. 필요하면 deviceId 목록에서 "back"/"rear" 문자열
      //   포함된 걸 골라 넘기도록 확장 가능.
      await readerRef.current.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current,
        (result, err) => {
          setPermission("granted");
          if (result) {
            onDetected(result.getText());
          }
          // NotFoundException은 "이번 프레임엔 바코드가 없었다"는 정상적인 매 프레임 상황이라 무시
          if (err && !(err instanceof NotFoundException)) {
            // 다른 종류의 에러(카메라 끊김 등)는 조용히 다음 프레임에서 재시도됨
          }
        }
      );
    } catch {
      setPermission("denied");
    }
  };

  useEffect(() => stop, []);

  return { videoRef, permission, supported, start, stop };
}
