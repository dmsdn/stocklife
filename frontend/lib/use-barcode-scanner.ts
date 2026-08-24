"use client";

import { useEffect, useRef, useState } from "react";

// BarcodeDetector 타입 (표준 미포함 브라우저 대비)
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats: string[] }) => BarcodeDetectorLike;
  }
}

export function useBarcodeScanner(onDetected: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permission, setPermission] = useState<"idle" | "granted" | "denied">("idle");
  const [supported, setSupported] = useState(true);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission("denied");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setPermission("granted");
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setPermission("denied");
    }
  };

  useEffect(() => {
    if (permission !== "granted") return;
    if (!window.BarcodeDetector) {
      setSupported(false);
      return;
    }
    const detector = new window.BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
    });
    let cancelled = false;

    const tick = async () => {
      if (cancelled || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes[0]?.rawValue) {
          onDetected(codes[0].rawValue);
        }
      } catch {
        // 프레임 디코딩 실패는 무시하고 계속 시도
      }
      if (!cancelled) requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission]);

  useEffect(() => stop, []);

  return { videoRef, permission, supported, start, stop };
}
