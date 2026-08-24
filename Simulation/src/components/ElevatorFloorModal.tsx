import Modal from './Modal';
import { ELEVATOR_FLOORS, floorLabel } from '../game/floorGraph';

interface Props {
  currentFloor: number;
  onChoose: (floor: number) => void;
  onCancel: () => void;
}

export default function ElevatorFloorModal({ currentFloor, onChoose, onCancel }: Props) {
  return (
    <Modal title="이동할 층을 선택하세요" onClose={onCancel}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ELEVATOR_FLOORS.filter((f) => f !== currentFloor).map((f) => (
          <button
            key={f}
            onClick={() => onChoose(f)}
            style={{
              padding: '10px 14px',
              borderRadius: 6,
              border: '1px solid #444',
              background: '#3b82f6',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            {floorLabel(f)}
          </button>
        ))}
        <button
          onClick={onCancel}
          style={{ padding: '10px 14px', borderRadius: 6, border: '1px solid #444', background: 'transparent', color: '#9ca3af' }}
        >
          취소
        </button>
      </div>
    </Modal>
  );
}
