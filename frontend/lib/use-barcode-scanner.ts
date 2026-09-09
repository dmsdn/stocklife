// lib/use-barcode-scanner.ts
// ✅ 예전엔 브라우저 내장 BarcodeDetector API를 썼는데, 이게 안드로이드 크롬에만 있고
//   iOS(사파리/아이폰 크롬 전부 WebKit이라 동일)·데스크톱 크롬·파이어폭스에는 아예 없었습니다.
//   순수 JS로 프레임을 직접 분석하는 @zxing/library로 바꿔서 브라우저/기기 상관없이
//   동작합니다. package.json에 아직 없으면 설치 필요:
//     npm install @zxing/library
// ✅ 수정(2026-09) — "모바일 크롬에서 카메라 권한이 열려있음에도 카메라가 안 열리는" 원인 두 가지를
//   찾아서 고쳤습니다.
//   1) getUserMedia는 "보안 컨텍스트"(https 또는 localhost)에서만 동작합니다. 개발 중
//      http://192.168.x.x:3000처럼 같은 와이파이의 IP로 접속하면(이 프로젝트 CORS 설정에
//      실제로 이런 주소가 등록돼 있음) 모바일 크롬은 브라우저 자체 카메라 권한 설정에서
//      "허용"으로 보여도 API 호출 자체가 안 됩니다(desktop 크롬은 http://localhost는
//      예외로 봐주지만 IP 주소는 봐주지 않음, 모바일은 더 엄격). 이걸 "권한 거부"와
//      구분되는 별도 상태(insecure)로 감지해서, 진짜 원인(https 필요)을 안내하도록 함.
//   2) facingMode: "environment"를 문자열 그대로(=exact 취급될 수 있음) 넘기면, 일부
//      안드로이드 기기·브라우저 조합에서 요청한 카메라를 정확히 못 찾아
//      OverconstrainedError로 조용히 실패합니다(권한 프롬프트는 이미 통과한 뒤라
//      "권한은 있는데 안 열림"처럼 보임). ideal로 완화하고, 그래도 실패하면 제약 없이
//      (아무 카메라나) 한 번 더 시도하는 폴백을 추가했습니다.
"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";

export function useBarcodeScanner(onDetected: (code: string) => void) {
  const detectedRef = useRef(onDetected);
  detectedRef.current = onDetected;
  const lastCodeRef = useRef("");
  const lastSeenRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [permission, setPermission] = useState<"idle" | "granted" | "denied" | "insecure">("idle");
  // ✅ zxing은 브라우저 내장 API가 아니라 순수 JS 디코딩이라, 사실상 모든 최신 브라우저에서
  //   동작합니다 — 그래도 카메라 API(getUserMedia) 자체가 없는 아주 오래된 브라우저 대비용으로
  //   플래그는 남겨뒀습니다.
  const [supported] = useState(true);
  // ✅ console.warn을 잠깐 바꿔치기했다가 스캐너가 꺼지면 원래대로 되돌리기 위한 참조.
  const originalWarnRef = useRef<typeof console.warn | null>(null);

  const stop = () => {
    readerRef.current?.reset();
    if (originalWarnRef.current) {
      console.warn = originalWarnRef.current;
      originalWarnRef.current = null;
    }
  };

  const start = async () => {
    // ✅ 보안 컨텍스트가 아니면 getUserMedia 자체가 없거나(대부분) 있어도 항상 실패합니다.
    //   이 경우는 "권한 거부"가 아니라 "https 또는 localhost가 필요함"이라 별도로 표시.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setPermission("insecure");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission("denied");
      return;
    }
    if (!videoRef.current) return;

    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatReader();
    }

    const onFrame = (result: { getText(): string } | undefined, err: unknown) => {
      setPermission("granted");
      if (result) {
        const code = result.getText();
        lastSeenRef.current = Date.now();
        if (lastCodeRef.current !== code) {
          lastCodeRef.current = code;
          detectedRef.current(code);
        }
      }
      // 같은 바코드를 계속 비추면 한 번만 담고, 800ms 이상 화면에서 사라진 뒤 다시 인식합니다.
      if (!result && Date.now() - lastSeenRef.current > 800) lastCodeRef.current = "";
      // NotFoundException은 "이번 프레임엔 바코드가 없었다"는 정상적인 매 프레임 상황이라 무시
      if (err && !(err instanceof NotFoundException)) {
        // 다른 종류의 에러(카메라 끊김 등)는 조용히 다음 프레임에서 재시도됨
      }
    };

    // ✅ 신규 — "카메라 열면 콘솔에 ChecksumException 경고가 계속 뜸" 원인: @zxing/library
    //   내부(MultiFormatReader.decodeInternal)가 바코드 일부만 보이거나 흔들려서 체크섬이
    //   안 맞는(=아주 흔한, 정상적인) 프레임마다 console.warn을 직접 호출합니다. 이 경고를
    //   끄는 옵션이 라이브러리에 따로 없어서, 스캐너가 켜져 있는 동안만 이 특정 문구의
    //   console.warn을 걸러내고(그 외 경고는 그대로), stop()에서 원래 console.warn으로
    //   되돌립니다. 실제 동작(카메라 자체)엔 원래도 영향이 없었던 경고고, "요청 실패
    //   500"으로 보였던 건 이거랑은 별개로 바코드 조회 API 쪽 문제라 거긴 따로
    //   고쳤습니다(lookupByCode의 에러 메시지를 그대로 보여주도록).
    if (!originalWarnRef.current) {
      originalWarnRef.current = console.warn;
      console.warn = (...args: unknown[]) => {
        if (typeof args[0] === "string" && args[0].includes("MultiFormatReader: non-ReaderException")) {
          return;
        }
        originalWarnRef.current?.(...args);
      };
    }

    try {
      // ✅ undefined = 카메라 기기 자동 선택. deviceId를 직접 안 넘기고 후면 카메라를
      //   요청하려면 아래처럼 constraints를 넘기는 대신, 대부분의 폰에서는 기본 카메라가
      //   후면이라 이것만으로 충분합니다. ideal로 줘서 후면 카메라가 없거나 정확히
      //   매칭이 안 돼도 OverconstrainedError 없이 아무 카메라로 폴백되게 함.
      await readerRef.current.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        onFrame
      );
    } catch {
      // ✅ 위가 실패하면(그래도 남아있는 극히 일부 기기별 제약 충돌 대비) 카메라 제약을
      //   아예 없애고 한 번 더 시도 — 그래도 실패하면 그때 진짜 "denied"로 표시.
      try {
        await readerRef.current.decodeFromConstraints({ video: true }, videoRef.current, onFrame);
      } catch {
        setPermission("denied");
        stop();
      }
    }
  };

  useEffect(() => stop, []);

  return { videoRef, permission, supported, start, stop };
}
