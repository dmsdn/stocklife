import { useState } from 'react';
import { floorLabel } from '../game/floorGraph';

interface Props {
    current: number;
    onChange: (floor: number) => void;
}

const FLOORS = [3, 2, 1]; // 위층부터 보여주는 게 자연스러움 (지하 창고 제거)

export default function FloorDropdown({ current, onChange }: Props) {
    const [open, setOpen] = useState(false);

    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={() => setOpen((v) => !v)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid #3a3f4b',
                    background: '#1e2128',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 700,
                }}
            >
                🏠 {floorLabel(current)} <span style={{ fontSize: 10 }}>▾</span>
            </button>
            {open && (
                <>
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                        onClick={() => setOpen(false)}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            top: '110%',
                            left: 0,
                            background: '#1a1d24',
                            border: '1px solid #333',
                            borderRadius: 8,
                            overflow: 'hidden',
                            zIndex: 1000,
                            minWidth: 100,
                        }}
                    >
                        {FLOORS.map((f) => (
                            <div
                                key={f}
                                onClick={() => {
                                    onChange(f);
                                    setOpen(false);
                                }}
                                style={{
                                    padding: '8px 14px',
                                    color: f === current ? '#3b82f6' : '#e5e7eb',
                                    fontWeight: f === current ? 700 : 400,
                                    cursor: 'pointer',
                                    background: f === current ? '#111318' : 'transparent',
                                }}
                            >
                                {floorLabel(f)}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}