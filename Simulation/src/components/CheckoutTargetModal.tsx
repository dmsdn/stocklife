import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { fetchCheckoutCart } from '../api/cart';
import { getCurrentConsumerId } from '../state/currentConsumer';

interface CheckoutItem {
    cartItemId: number;
    skuId: number;
    name: string;
    price: number;
    qty: number;
    checked: boolean;
    subtotal: number;
}

interface Props {
    onClose: () => void;
}

export default function CheckoutTargetModal({
                                                onClose,
                                            }: Props) {
    const [items, setItems] =
        useState<CheckoutItem[]>([]);

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
                const consumerId =
                    getCurrentConsumerId();

                const cart =
                    await fetchCheckoutCart(
                        consumerId
                    );

                if (cancelled) {
                    return;
                }

                /*
                 * 실제 결제 대상만 표시
                 *
                 * cart_item.is_checked = true
                 */
                const checkedItems =
                    cart.items.filter(
                        (item) =>
                            item.checked === true
                    );

                setItems(checkedItems);
            } catch (err) {
                console.error(
                    '[결제 대상 목록] 조회 실패:',
                    err
                );

                if (!cancelled) {
                    setError(
                        '결제 대상 상품을 불러오지 못했습니다.'
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
    }, []);

    const totalQuantity = useMemo(
        () =>
            items.reduce(
                (sum, item) =>
                    sum + item.qty,
                0
            ),
        [items]
    );

    const totalAmount = useMemo(
        () =>
            items.reduce(
                (sum, item) =>
                    sum + item.subtotal,
                0
            ),
        [items]
    );

    return (
        <Modal
            title=""
            onClose={onClose}
        >
            <div
                style={{
                    width: 440,
                    maxWidth: '82vw',
                    maxHeight: '72vh',
                    color: '#f9fafb',
                }}
            >
                {/* 제목 */}
                <div
                    style={{
                        marginBottom: 16,
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}
                    >
                        <span
                            style={{
                                fontSize: 20,
                            }}
                        >
                            🧾
                        </span>

                        <span
                            style={{
                                fontSize: 18,
                                fontWeight: 700,
                                color: '#ffffff',
                            }}
                        >
                            결제 대상 목록
                        </span>
                    </div>

                    <div
                        style={{
                            marginTop: 6,
                            color: '#9ca3af',
                            fontSize: 12,
                        }}
                    >
                        현재 결제 대상으로 선택된 상품만 표시합니다.
                    </div>
                </div>

                {/* 요약 */}
                {!loading &&
                    !error &&
                    items.length > 0 && (
                        <div
                            style={{
                                display: 'flex',
                                justifyContent:
                                    'space-between',
                                alignItems:
                                    'center',
                                padding:
                                    '10px 12px',
                                marginBottom: 12,
                                borderRadius: 8,
                                background:
                                    '#20242d',
                                border:
                                    '1px solid #343a46',
                            }}
                        >
                            <span
                                style={{
                                    color: '#9ca3af',
                                    fontSize: 12,
                                }}
                            >
                                총 {totalQuantity}개
                            </span>

                            <strong
                                style={{
                                    color: '#f9fafb',
                                    fontSize: 15,
                                }}
                            >
                                {totalAmount.toLocaleString()}
                                원
                            </strong>
                        </div>
                    )}

                {/* 로딩 */}
                {loading && (
                    <div
                        style={{
                            padding: '45px 10px',
                            textAlign: 'center',
                            color: '#9ca3af',
                            fontSize: 13,
                        }}
                    >
                        결제 대상 상품을 불러오는 중...
                    </div>
                )}

                {/* 에러 */}
                {!loading && error && (
                    <div
                        style={{
                            padding: '30px 10px',
                            textAlign: 'center',
                            color: '#f87171',
                            fontSize: 13,
                        }}
                    >
                        {error}
                    </div>
                )}

                {/* 결제 대상 없음 */}
                {!loading &&
                    !error &&
                    items.length === 0 && (
                        <div
                            style={{
                                padding:
                                    '45px 10px',
                                textAlign:
                                    'center',
                                color: '#9ca3af',
                                fontSize: 13,
                            }}
                        >
                            현재 결제 대상으로 선택된 상품이 없습니다.
                        </div>
                    )}

                {/* 결제 대상 상품 */}
                {!loading &&
                    !error &&
                    items.length > 0 && (
                        <div
                            style={{
                                maxHeight: 430,
                                overflowY: 'auto',
                                borderTop:
                                    '1px solid #343a46',
                            }}
                        >
                            {items.map(
                                (item) => (
                                    <div
                                        key={
                                            item.cartItemId
                                        }
                                        style={{
                                            display:
                                                'flex',
                                            alignItems:
                                                'center',
                                            gap: 12,
                                            padding:
                                                '14px 4px',
                                            borderBottom:
                                                '1px solid #343a46',
                                        }}
                                    >
                                        {/* 아이콘 */}
                                        <div
                                            style={{
                                                width: 54,
                                                height: 54,
                                                flexShrink: 0,
                                                borderRadius: 8,
                                                border:
                                                    '1px solid #3a3f4b',
                                                background:
                                                    '#242933',
                                                display:
                                                    'flex',
                                                alignItems:
                                                    'center',
                                                justifyContent:
                                                    'center',
                                                fontSize: 20,
                                            }}
                                        >
                                            ✅
                                        </div>

                                        {/* 상품 정보 */}
                                        <div
                                            style={{
                                                flex: 1,
                                                minWidth: 0,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    color: '#f9fafb',
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    lineHeight:
                                                        1.4,
                                                }}
                                            >
                                                {
                                                    item.name
                                                }
                                            </div>

                                            <div
                                                style={{
                                                    marginTop: 5,
                                                    color: '#9ca3af',
                                                    fontSize: 11,
                                                }}
                                            >
                                                {item.price.toLocaleString()}
                                                원 ×{' '}
                                                {item.qty}개
                                            </div>

                                            <div
                                                style={{
                                                    marginTop: 5,
                                                    color: '#60a5fa',
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                }}
                                            >
                                                결제 선택됨
                                            </div>
                                        </div>

                                        {/* 소계 */}
                                        <div
                                            style={{
                                                minWidth: 85,
                                                textAlign:
                                                    'right',
                                                color: '#ffffff',
                                                fontSize: 13,
                                                fontWeight: 700,
                                            }}
                                        >
                                            {item.subtotal.toLocaleString()}
                                            원
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    )}

                {/* 하단 합계 */}
                {!loading &&
                    !error &&
                    items.length > 0 && (
                        <div
                            style={{
                                display: 'flex',
                                justifyContent:
                                    'space-between',
                                alignItems:
                                    'center',
                                paddingTop: 16,
                            }}
                        >
                            <span
                                style={{
                                    color: '#9ca3af',
                                    fontSize: 12,
                                }}
                            >
                                결제 예정 금액
                            </span>

                            <strong
                                style={{
                                    color: '#ffffff',
                                    fontSize: 19,
                                }}
                            >
                                {totalAmount.toLocaleString()}
                                원
                            </strong>
                        </div>
                    )}
            </div>
        </Modal>
    );
}