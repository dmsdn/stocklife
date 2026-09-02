import { useEffect, useMemo, useState } from 'react';

import Modal from './Modal';

import {
    fetchCheckoutCart,
    type CheckoutCartItem,
} from '../api/cart';

interface Props {
    consumerId: number;
    onClose: () => void;
}

export default function CheckoutCartModal({
                                              consumerId,
                                              onClose,
                                          }: Props) {
    const [items, setItems] =
        useState<CheckoutCartItem[]>([]);

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                const cart =
                    await fetchCheckoutCart(
                        consumerId
                    );

                if (!cancelled) {
                    setItems(cart.items);
                }
            } catch (err) {
                console.error(
                    '[결제 장바구니] 조회 실패',
                    err
                );

                if (!cancelled) {
                    setError(
                        '장바구니를 불러오지 못했습니다.'
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, [consumerId]);

    const checkedItems = useMemo(
        () =>
            items.filter(
                (item) => item.checked
            ),
        [items]
    );

    const checkedTotal = useMemo(
        () =>
            checkedItems.reduce(
                (sum, item) =>
                    sum + item.subtotal,
                0
            ),
        [checkedItems]
    );

    return (
        <Modal
            title="결제 장바구니"
            onClose={onClose}
        >
            <div
                style={{
                    width: 390,
                    maxWidth: '82vw',
                    color: '#f9fafb',
                }}
            >
                {loading && (
                    <div
                        style={{
                            padding: 30,
                            textAlign: 'center',
                            color: '#9ca3af',
                            fontSize: 13,
                        }}
                    >
                        장바구니 불러오는 중...
                    </div>
                )}

                {error && (
                    <div
                        style={{
                            padding: 20,
                            color: '#f87171',
                        }}
                    >
                        {error}
                    </div>
                )}

                {!loading &&
                    !error &&
                    items.length === 0 && (
                        <div
                            style={{
                                padding: 30,
                                textAlign:
                                    'center',
                                color: '#9ca3af',
                                fontSize: 13,
                            }}
                        >
                            장바구니에 담긴
                            상품이 없습니다.
                        </div>
                    )}

                {!loading &&
                    items.map((item) => (
                        <div
                            key={item.cartItemId}
                            style={{
                                display: 'flex',
                                gap: 12,
                                padding:
                                    '12px 0',
                                borderBottom:
                                    '1px solid #2f3540',
                            }}
                        >
                            <div
                                style={{
                                    width: 18,
                                    paddingTop: 2,
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={
                                        item.checked
                                    }
                                    readOnly
                                />
                            </div>

                            <div
                                style={{
                                    flex: 1,
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: '#f9fafb',
                                    }}
                                >
                                    {item.name}
                                </div>

                                <div
                                    style={{
                                        marginTop: 4,
                                        color: '#9ca3af',
                                        fontSize: 11,
                                    }}
                                >
                                    {item.price.toLocaleString()}
                                    원 ×{' '}
                                    {item.qty}개
                                </div>
                            </div>

                            <div
                                style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    whiteSpace:
                                        'nowrap',
                                }}
                            >
                                {item.subtotal.toLocaleString()}
                                원
                            </div>
                        </div>
                    ))}

                {!loading &&
                    items.length > 0 && (
                        <>
                            <div
                                style={{
                                    display:
                                        'flex',
                                    justifyContent:
                                        'space-between',
                                    alignItems:
                                        'center',
                                    padding:
                                        '16px 0 8px',
                                }}
                            >
                                <span
                                    style={{
                                        color: '#9ca3af',
                                        fontSize: 12,
                                    }}
                                >
                                    결제 선택{' '}
                                    {
                                        checkedItems.length
                                    }
                                    개
                                </span>

                                <strong
                                    style={{
                                        fontSize: 17,
                                    }}
                                >
                                    {checkedTotal.toLocaleString()}
                                    원
                                </strong>
                            </div>

                            <button
                                type="button"
                                disabled={
                                    checkedItems.length ===
                                    0
                                }
                                style={{
                                    width: '100%',
                                    padding:
                                        '11px 0',
                                    marginTop: 8,
                                    border: 'none',
                                    borderRadius: 7,

                                    background:
                                        checkedItems.length >
                                        0
                                            ? '#2563eb'
                                            : '#374151',

                                    color: '#fff',
                                    fontWeight: 700,

                                    cursor:
                                        checkedItems.length >
                                        0
                                            ? 'pointer'
                                            : 'not-allowed',
                                }}
                            >
                                {checkedTotal.toLocaleString()}
                                원 결제하기
                            </button>
                        </>
                    )}
            </div>
        </Modal>
    );
}