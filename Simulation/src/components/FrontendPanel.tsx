import { useRef } from 'react';

interface Props {
    /** frontend(Next.js) 개발 서버 주소. .env에서 VITE_FRONTEND_URL로 오버라이드 가능 */
    src?: string;
    width?: number;
}

// 시뮬레이션 화면 오른쪽에 frontend(Next.js) 웹 UI를 iframe으로 붙이는 패널.
// - 상태 동기화(장바구니/주문/경로)는 이 iframe과 직접 하지 않고, 백엔드 API + SSE를 통해서 한다.
// - 여기서는 "화면 클릭 → frontend 라우팅 이동" 같은 순수 UI 트리거만 postMessage로 보낸다.
export default function FrontendPanel({
                                          src = import.meta.env.VITE_FRONTEND_URL ?? 'http://localhost:3000',
                                          width = 420,
                                      }: Props) {
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // 나중에 App.tsx에서 이 함수를 밖으로 꺼내 쓸 수 있게, ref를 통해 postMessage를 보내는
    // 헬퍼는 여기서는 최소한만 두고, 실제 이벤트 브리지는 다음 단계(2번)에서 붙인다.
    const postToFrontend = (message: unknown) => {
        iframeRef.current?.contentWindow?.postMessage(message, src);
    };

    // 개발 중 확인용: 필요 없으면 지워도 됨.
    void postToFrontend;

    return (
        <div
            style={{
                width,
                height: '100%',
                flexShrink: 0,
                borderLeft: '1px solid #2a2f3a',
                background: '#0b0d12',
            }}
        >
            <iframe
                ref={iframeRef}
                title="frontend"
                src={src}
                style={{ width: '100%', height: '100%', border: 'none' }}
                // 결제/스캔 등에서 카메라·클립보드가 필요할 수 있어 넉넉히 허용.
                allow="camera; clipboard-read; clipboard-write"
            />
        </div>
    );
}