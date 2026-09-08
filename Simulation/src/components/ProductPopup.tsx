import { useState } from 'react';
import Modal from './Modal';
import type { LocationInfo, ProductInfo } from '../game/types';

interface LevelGroup {
    location: LocationInfo;
    level: number;
    products: ProductInfo[];
}

interface Props {
    baseLabel: string;
    groups: LevelGroup[];
    cartQtyByKey: Record<string, number>;

    onAddToCart: (
        location: LocationInfo,
        product: ProductInfo
    ) => void;

    onRestock: (
        location: LocationInfo,
        product: ProductInfo
    ) => Promise<void>;

    onClose: () => void;
}

export default function ProductPopup({
                                         baseLabel,
                                         groups,
                                         cartQtyByKey,
                                         onAddToCart,
                                         onRestock,
                                         onClose,
                                     }: Props) {

    const [restockingKey, setRestockingKey] =
        useState<string | null>(null);

    const handleRestock = async (
        location: LocationInfo,
        product: ProductInfo
    ) => {
        const key =
            `${location.locationId}::${product.skuId}`;

        if (restockingKey != null) {
            return;
        }

        try {
            setRestockingKey(key);

            await onRestock(
                location,
                product
            );

        } catch (error) {

            console.error(
                '재고 보충 실패:',
                error
            );

            alert(
                error instanceof Error
                    ? error.message
                    : '재고 보충에 실패했습니다.'
            );

        } finally {
            setRestockingKey(null);
        }
    };

    return (
        <Modal
            title={`${baseLabel} 진열 상품`}
            onClose={onClose}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    minWidth: 320,
                    maxHeight: '60vh',
                    overflowY: 'auto',
                }}
            >
                {groups.map((group) => (
                    <div
                        key={group.location.locationId}
                    >
                        <div
                            style={{
                                fontSize: 12,
                                color: '#9ca3af',
                                fontWeight: 700,
                                marginBottom: 6,
                            }}
                        >
                            {group.level > 0
                                ? `${group.level}단`
                                : group.location.locationId}
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                            }}
                        >
                            {group.products.map((p) => {

                                const key =
                                    `${group.location.locationId}::${p.skuId}`;

                                const inCart =
                                    cartQtyByKey[key] ?? 0;

                                const atCap =
                                    p.stock === 0 ||
                                    inCart >= p.stock;

                                const restocking =
                                    restockingKey === key;

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
                                            gap: 12,
                                        }}
                                    >
                                        <div>
                                            <div
                                                style={{
                                                    fontSize: 13,
                                                }}
                                            >
                                                {p.name}
                                            </div>

                                            <div
                                                style={{
                                                    fontSize: 11,
                                                    color: '#9ca3af',
                                                }}
                                            >
                                                {p.price.toLocaleString()}원
                                                {' · '}
                                                재고 {p.stock}개

                                                {inCart > 0
                                                    ? ` · 담음 ${inCart}개`
                                                    : ''}
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                display: 'flex',
                                                gap: 6,
                                            }}
                                        >
                                            <button
                                                onClick={() =>
                                                    onAddToCart(
                                                        group.location,
                                                        p
                                                    )
                                                }
                                                disabled={atCap}
                                                style={{
                                                    padding: '4px 10px',
                                                    borderRadius: 6,
                                                    border: 'none',
                                                    background: atCap
                                                        ? '#374151'
                                                        : '#3b82f6',
                                                    color: '#fff',
                                                    cursor: atCap
                                                        ? 'not-allowed'
                                                        : 'pointer',
                                                    fontSize: 12,
                                                }}
                                            >
                                                담기
                                            </button>

                                            <button
                                                onClick={() =>
                                                    handleRestock(
                                                        group.location,
                                                        p
                                                    )
                                                }
                                                disabled={restocking}
                                                style={{
                                                    padding: '4px 10px',
                                                    borderRadius: 6,
                                                    border: 'none',
                                                    background: restocking
                                                        ? '#374151'
                                                        : '#16a34a',
                                                    color: '#fff',
                                                    cursor: restocking
                                                        ? 'wait'
                                                        : 'pointer',
                                                    fontSize: 12,
                                                }}
                                            >
                                                {restocking
                                                    ? '채우는 중...'
                                                    : '재고 채우기 +5'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {groups.length === 0 && (
                    <div
                        style={{
                            fontSize: 13,
                            color: '#6b7280',
                        }}
                    >
                        진열된 상품이 없습니다.
                    </div>
                )}
            </div>
        </Modal>
    );
}