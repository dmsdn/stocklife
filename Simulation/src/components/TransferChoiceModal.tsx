import type { CSSProperties } from 'react';
import Modal from './Modal';
import type { TransferMethod } from '../game/trip';

interface Props {
  fromFloor: number;
  toFloor: number;
  escalatorAvailable: boolean;
  onChoose: (method: TransferMethod) => void;
  onCancel: () => void;
}

function label(f: number) {
  return f === 0 ? 'B1' : `${f}F`;
}

export default function TransferChoiceModal({ fromFloor, toFloor, escalatorAvailable, onChoose, onCancel }: Props) {
  return (
    <Modal title={`${label(fromFloor)} → ${label(toFloor)} 이동 방법 선택`} onClose={onCancel}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          disabled={!escalatorAvailable}
          onClick={() => onChoose('escalator')}
          style={btnStyle(escalatorAvailable)}
        >
          에스컬레이터로 이동 {!escalatorAvailable && '(이 구간은 불가)'}
        </button>
        <button onClick={() => onChoose('elevator')} style={btnStyle(true)}>
          엘리베이터로 이동
        </button>
        <button onClick={onCancel} style={{ ...btnStyle(true), background: 'transparent', color: '#9ca3af' }}>
          취소
        </button>
      </div>
    </Modal>
  );
}

function btnStyle(enabled: boolean): CSSProperties {
  return {
    padding: '10px 14px',
    borderRadius: 6,
    border: '1px solid #444',
    background: enabled ? '#3b82f6' : '#2a2d35',
    color: '#fff',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.5,
  };
}
