import { floorLabel } from '../game/floorGraph';

interface Props {
  current: number;
  onChange: (floor: number) => void;
}

const FLOORS = [0, 1, 2, 3];

export default function FloorSwitcher({ current, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {FLOORS.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid #444',
            background: current === f ? '#3b82f6' : '#1e2128',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: current === f ? 700 : 400,
          }}
        >
          {floorLabel(f)}
        </button>
      ))}
    </div>
  );
}
