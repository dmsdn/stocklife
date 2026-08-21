import Modal from './Modal';
import type { CartItem } from '../game/types';

interface Props {
  items: CartItem[];
  purchased: CartItem[];
  cash: number;
  onRemove: (index: number) => void;
  onCheckout: () => void;
  onRefund: (index: number) => void;
  onClose: () => void;
}

export default function CartModal({ items, purchased, cash, onRemove, onCheckout, onRefund, onClose }: Props) {
  const total = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const canCheckout = items.length > 0 && total <= cash;

  return (
    <Modal title="장바구니" onClose={onClose}>
      <div style={{ width: 300 }}>
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          {items.length === 0 && (
            <div style={{ color: '#9ca3af', fontSize: 13 }}>담긴 상품이 없습니다.</div>
          )}
          {items.map((it, i) => (
            <div
              key={`${it.locationId}-${it.skuId}-${i}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid #2a2d35',
              }}
            >
              <div>
                <div style={{ fontSize: 13 }}>{it.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  {it.locationId} · {it.price.toLocaleString()}원 x {it.qty}
                </div>
              </div>
              <button
                onClick={() => onRemove(i)}
                style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <>
            <div style={{ marginTop: 10, textAlign: 'right', fontWeight: 700 }}>
              합계 {total.toLocaleString()}원
            </div>
            <button
              onClick={onCheckout}
              disabled={!canCheckout}
              style={{
                marginTop: 8,
                width: '100%',
                padding: '8px 0',
                borderRadius: 6,
                border: 'none',
                background: canCheckout ? '#22c55e' : '#374151',
                color: '#fff',
                fontWeight: 700,
                cursor: canCheckout ? 'pointer' : 'not-allowed',
              }}
            >
              {total > cash ? '잔액 부족' : '구매하기'}
            </button>
          </>
        )}

        {purchased.length > 0 && (
          <>
            <div style={{ marginTop: 18, marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#9ca3af' }}>
              구매 내역
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {purchased.map((it, i) => (
                <div
                  key={`${it.locationId}-${it.skuId}-${i}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: '1px solid #2a2d35',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13 }}>{it.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>
                      {it.locationId} · {it.price.toLocaleString()}원 x {it.qty}
                    </div>
                  </div>
                  <button
                    onClick={() => onRefund(i)}
                    style={{
                      border: '1px solid #3a3f4b',
                      background: 'transparent',
                      color: '#facc15',
                      cursor: 'pointer',
                      fontSize: 11,
                      padding: '4px 8px',
                      borderRadius: 6,
                    }}
                  >
                    환불하기
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
