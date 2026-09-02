import Modal from './Modal';
import type { LocationInfo, ProductInfo } from '../game/types';

interface LevelGroup {
    location: LocationInfo;
    level: number; // locationId의 "-L숫자" — 매대의 몇 번째 단인지. 못 읽으면 0.
    products: ProductInfo[];
}

interface Props {
    baseLabel: string; // 단 번호를 뗀 rack/bay 기준 라벨, 예: 'F1-E-R01-B04'
    groups: LevelGroup[];
    // 같은 skuId라도 단(locationId)이 다르면 별개 재고이므로 `${locationId}::${skuId}`로 구분한다.
    cartQtyByKey: Record<string, number>;
    onAddToCart: (location: LocationInfo, product: ProductInfo) => void;
    onClose: () => void;
}

export default function ProductPopup({ baseLabel, groups, cartQtyByKey, onAddToCart, onClose }: Props) {
    return (
        <Modal title={`${baseLabel} 진열 상품`} onClose={onClose}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 280, maxHeight: '60vh', overflowY: 'auto' }}>
                {groups.map((group) => (
                    <div key={group.location.locationId}>
                        <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 700, marginBottom: 6 }}>
                            {group.level > 0 ? `${group.level}단` : group.location.locationId}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {group.products.map((p) => {
                                const key = `${group.location.locationId}::${p.skuId}`;
                                const inCart = cartQtyByKey[key] ?? 0;
                                const atCap = p.stock === 0 || inCart >= p.stock;
                                return (
                                    <div
                                        key={key}
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
                                            onClick={() => onAddToCart(group.location, p)}
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
                    </div>
                ))}

                {groups.length === 0 && (
                    <div style={{ fontSize: 13, color: '#6b7280' }}>진열된 상품이 없습니다.</div>
                )}
            </div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 10 }}>
                * 실제 재고 데이터가 아니라 임시로 생성한 예시 상품입니다.
            </div>
        </Modal>
    );
}