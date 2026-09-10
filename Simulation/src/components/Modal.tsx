import { useEffect, type ReactNode } from 'react';

interface Props {
    title: ReactNode;
    children: ReactNode;
    onClose?: () => void;
}

export default function Modal({ title, children, onClose }: Props) {
    // 1번(ESC로 닫기): 모든 팝업/모달이 이 컴포넌트 하나를 감싸서 쓰므로 여기 한 번만
    // 추가하면 장바구니/AI챗/쇼핑목록/상품팝업/층이동 선택 등 전부에 적용된다.
    useEffect(() => {
        if (!onClose) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2000,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: '#1a1d24',
                    color: '#e5e7eb',
                    borderRadius: 10,
                    padding: 20,
                    minWidth: 280,
                    border: '1px solid #333',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ fontWeight: 700, marginBottom: 12 }}>{title}</div>
                {children}
            </div>
        </div>
    );
}