import Modal from './Modal';
import type { LocationInfo, ProductInfo } from '../game/types';

interface Props {
  location: LocationInfo;
  products: ProductInfo[];
  // 이 매대에서 이미 장바구니에 담긴 skuId별 수량 — 재고보다 더 담지 못하게 버튼을
  // 비활성화하는 데 쓴다(담기를 계속 눌러도 재고 이상 쌓이던 버그 수정).
  cartQtyBySku: Record<number, number>;
  onAddToCart: (product: ProductInfo) => void;
  onClose: () => void;
}

export default function ProductPopup({ location, products, cartQtyBySku, onAddToCart, onClose }: Props) {
  return (
    <Modal title={`${location.locationId} 진열 상품`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 260 }}>
        {products.map((p) => {
          const inCart = cartQtyBySku[p.skuId] ?? 0;
          const atCap = p.stock === 0 || inCart >= p.stock;
          return (
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
                  {inCart > 0 ? ` · 담음 ${inCart}개` : ''}
                </div>
              </div>
              <button
                onClick={() => onAddToCart(p)}
                disabled={atCap}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: atCap ? '#374151' : '#3b82f6',
                  color: '#fff',
                  cursor: atCap ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                }}
              >
                담기
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: '#6b7280', marginTop: 10 }}>
        * 실제 재고 데이터가 아니라 임시로 생성한 예시 상품입니다.
      </div>
    </Modal>
  );
}
