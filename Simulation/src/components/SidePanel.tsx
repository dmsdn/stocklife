import type { LocationInfo } from '../game/types';

interface Props {
    selectedLocation: LocationInfo | null;
}

// 장바구니/AI챗은 상단 헤더 버튼에서 팝업으로 뜨는 별도 화면으로 옮겨감 (CartModal, AIChatModal).
// 원래는 게임 캔버스 옆에 세로 사이드바로 붙어있었는데, 상단 네비게이션 바처럼 보이도록
// 화면 하단에 가로(row)로 눕힌 바 형태로 변경함.
export default function SidePanel({ selectedLocation }: Props) {
    return (
        <div
            style={{
                width: '100%',
                flexShrink: 0,
                padding: '10px 16px',
                background: '#12141a',
                borderTop: '1px solid #2a2d35',
                color: '#e5e7eb',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                boxSizing: 'border-box',
                overflowX: 'auto',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 700 }}>선택한 위치</span>
                {selectedLocation ? (
                    <span style={{ fontSize: 13, lineHeight: 1.6 }}>
            {selectedLocation.locationId} · zone {selectedLocation.zoneId} · R{selectedLocation.rack}/B{selectedLocation.bay} · ({selectedLocation.x}, {selectedLocation.y})
          </span>
                ) : (
                    <span style={{ fontSize: 13, color: '#6b7280' }}>매대 칸을 클릭해보세요.</span>
                )}
            </div>

            <span style={{ fontSize: 11, color: '#4b5563', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
        조작: 방향키(꾹 누르면 계속 이동) · 매대 클릭 시 자동경로 · 매대 옆에서 스페이스바 = 진열 상품
        보기 · 시설물 위에서 스페이스바 = 이용 · 우클릭 드래그로 화면 이동 · 휠로 줌
      </span>
        </div>
    );
}