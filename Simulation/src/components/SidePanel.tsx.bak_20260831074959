import type { LocationInfo } from '../game/types';

interface Props {
  selectedLocation: LocationInfo | null;
}

// 장바구니/AI챗은 상단 헤더 버튼에서 팝업으로 뜨는 별도 화면으로 옮겨감 (CartModal, AIChatModal).
export default function SidePanel({ selectedLocation }: Props) {
  return (
    <div
      style={{
        width: 280,
        padding: 16,
        background: '#1a1d24',
        color: '#e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        overflowY: 'auto',
      }}
    >
      <section>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#9ca3af' }}>선택한 위치</h3>
        {selectedLocation ? (
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <div>location_id: {selectedLocation.locationId}</div>
            <div>zone: {selectedLocation.zoneId}</div>
            <div>rack/bay: R{selectedLocation.rack} / B{selectedLocation.bay}</div>
            <div>grid: ({selectedLocation.x}, {selectedLocation.y})</div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#6b7280' }}>매대 칸을 클릭해보세요.</div>
        )}
      </section>

      <section style={{ fontSize: 11, color: '#4b5563', marginTop: 'auto' }}>
        조작: 방향키(꾹 누르면 계속 이동) · 매대 클릭 시 자동경로 · 매대 옆에서 스페이스바 = 진열 상품
        보기 · 시설물 위에서 스페이스바 = 이용 · 우클릭 드래그로 화면 이동 · 휠로 줌
      </section>
    </div>
  );
}
