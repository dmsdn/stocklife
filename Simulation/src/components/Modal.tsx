import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  onClose?: () => void;
}

export default function Modal({ title, children, onClose }: Props) {
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
