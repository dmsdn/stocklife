import { forwardRef, useImperativeHandle, useRef } from 'react';

interface Props {
    /** frontend(Next.js) 개발 서버 주소. .env에서 VITE_FRONTEND_URL로 오버라이드 가능 */
    src?: string;
    width?: number;
}

/**
 * App.tsx가 이 패널을 통해 오른쪽 웹 화면(iframe)에 신호를 보낼 때 쓰는 창구.
 * 데이터는 실어 보내지 않고 "바뀌었다"는 사실만 알린다 — 받는 쪽이 DB에서 다시 읽으면
 * 양쪽 값이 어긋날 일이 없기 때문이다.
 */
export interface FrontendPanelHandle {
    /** 시뮬레이션 캐릭터가 장바구니를 건드렸을 때 오른쪽 웹 화면도 다시 읽게 한다. */
    notifyCartChanged: () => void;
}

// 시뮬레이션 화면 오른쪽에 frontend(Next.js) 웹 UI를 iframe으로 붙이는 패널.
// 양쪽 화면의 장바구니가 새로고침 없이 서로 따라오도록, 아래 두 방향의 알림을 주고받는다.
//   웹 화면 -> 시뮬레이션 : { source: 'storeflow-frontend',   type: 'CART_CHANGED' }  (App.tsx가 수신)
//   시뮬레이션 -> 웹 화면 : { source: 'storeflow-simulation', type: 'CART_CHANGED' }  (여기서 발신)
const FrontendPanel = forwardRef<FrontendPanelHandle, Props>(function FrontendPanel({
    src = import.meta.env.VITE_FRONTEND_URL ?? 'http://localhost:3000',
    width = 420,
}, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // targetOrigin에 iframe src를 그대로 넣는다. '*'로 열어두면 이 메시지가 어떤 창에서든
    // 읽힐 수 있으므로, 우리가 직접 지정한 프론트엔드 주소로만 가도록 좁혀둔다.
    const postToFrontend = (message: unknown) => {
        iframeRef.current?.contentWindow?.postMessage(message, src);
    };

    useImperativeHandle(ref, () => ({
        notifyCartChanged: () => {
            postToFrontend({ source: 'storeflow-simulation', type: 'CART_CHANGED' });
        },
    }));

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
                // 결제/스캔, AI 챗봇 음성입력(STT) 등에서 카메라와 마이크, 클립보드가 필요할 수 있어 넉넉히 허용.
                // ⚠ microphone이 빠져있으면 iframe 안(프론트엔드)에서 getUserMedia가 브라우저 프롬프트도
                //   뜨기 전에 Permissions Policy 단계에서 막혀서, 사이트 설정에 잡히지도 않은 채 "거부됨"처럼 보인다.
                allow="camera; microphone; clipboard-read; clipboard-write"
            />
        </div>
    );
});

export default FrontendPanel;
