import { forwardRef, useImperativeHandle, useRef } from 'react';

interface Props {
    /**
     * 오른쪽 웹 화면 주소. 기본값 '/' 는 "지금 이 페이지와 같은 주소의 최상위"라는 뜻이다.
     * 배포(EC2)는 프론트가 /, 시뮬레이션이 /simulation/ 이고, 개발 서버도 vite.config.ts의
     * 프록시로 같은 구조를 만들어 뒀으므로 양쪽 다 이 값으로 맞는다.
     * 같은 origin이어야 memberAuth.ts가 프론트의 로그인 토큰(localStorage)을 읽을 수 있다.
     * 굳이 다른 주소를 쓰려면 .env에서 VITE_FRONTEND_URL로 덮어쓴다.
     */
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
    /**
     * 오른쪽 웹 화면을 바코드 스캔 페이지(/scan)로 이동시킨다 — '지금 위치에서부터
     * 길찾기'(09-09)가 쓴다. 프론트에 새 API를 요구하지 않으려고 iframe 주소만 바꾼다.
     * 브라우저 정책상 카메라는 사용자가 화면에서 한 번 눌러야 켜질 수 있다.
     */
    openScanner: () => void;
}

// 시뮬레이션 화면 오른쪽에 frontend(Next.js) 웹 UI를 iframe으로 붙이는 패널.
// 양쪽 화면의 장바구니가 새로고침 없이 서로 따라오도록, 아래 두 방향의 알림을 주고받는다.
//   웹 화면 -> 시뮬레이션 : { source: 'storeflow-frontend',   type: 'CART_CHANGED' }  (App.tsx가 수신)
//   시뮬레이션 -> 웹 화면 : { source: 'storeflow-simulation', type: 'CART_CHANGED' }  (여기서 발신)
const FrontendPanel = forwardRef<FrontendPanelHandle, Props>(function FrontendPanel({
    src = import.meta.env.VITE_FRONTEND_URL ?? '/',
    width = 420,
}, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // targetOrigin에는 완전한 origin(http://호스트:포트)만 넣을 수 있다. src가 '/' 같은
    // 상대경로일 수 있으므로 지금 페이지 주소를 기준으로 풀어서 origin만 뽑는다.
    // '*'로 열어두면 이 메시지가 어떤 창에서든 읽힐 수 있어서 그렇게 하지 않는다.
    const targetOrigin = new URL(src, window.location.href).origin;
    const postToFrontend = (message: unknown) => {
        iframeRef.current?.contentWindow?.postMessage(message, targetOrigin);
    };

    useImperativeHandle(ref, () => ({
        notifyCartChanged: () => {
            postToFrontend({ source: 'storeflow-simulation', type: 'CART_CHANGED' });
        },
        openScanner: () => {
            const iframe = iframeRef.current;
            if (!iframe) return;
            const target = new URL('/scan', window.location.href).href;
            // 이미 스캔 화면이면 다시 로드해서 카메라를 껐다 켜는 일이 없게 한다.
            if (iframe.src === target) return;
            iframe.src = target;
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
