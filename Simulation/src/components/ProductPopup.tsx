import Modal from './Modal';
import type { LocationInfo, ProductInfo } from '../game/types';

interface Props {
  location: LocationInfo;
  products: ProductInfo[];
  onAddToCart: (product: ProductInfo) => void;
  onClose: () => void;
}

export default function ProductPopup({ location, products, onAddToCart, onClose }: Props) {
  return (
    <Modal title={`${location.locationId} 진열 상품`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 260 }}>
        {products.map((p) => (
          <div
            key={p.skuId}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 10px',
              background: '#12141a',
              borderRadius: 6,
            }}
          >
            <div>
              <div style={{ fontSize: 13 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                {p.price.toLocaleString()}원 · 재고 {p.stock}개
              </div>
            </div>
            <button
              onClick={() => onAddToCart(p)}
              disabled={p.stock === 0}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: 'none',
                background: p.stock === 0 ? '#374151' : '#3b82f6',
                color: '#fff',
                cursor: p.stock === 0 ? 'not-allowed' : 'pointer',
                fontSize: 12,
              }}
            >
              담기
            </button>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: '#6b7280', marginTop: 10 }}>
        * 실제 재고 데이터가 아니라 임시로 생성한 예시 상품입니다.
      </div>
    </Modal>
  );
}
