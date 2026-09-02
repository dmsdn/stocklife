import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import type {
    CartGroupOption,
    CartGroupItem,
} from '../api/cart';

interface ProductDetail {
    skuId: number;
    name: string;
    price: number;
}

interface Props {
    groups: CartGroupOption[];
    selectedGroupId: number | null;

    onSelectGroup: (groupId: number | null) => void;
    onClose: () => void;
}

export default function CartGroupModal({
                                           groups,
                                           selectedGroupId,
                                           onSelectGroup,
                                           onClose,
                                       }: Props) {
    const [openedGroup, setOpenedGroup] =
        useState<CartGroupOption | null>(null);

    const [products, setProducts] =
        useState<Record<number, ProductDetail>>({});

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!openedGroup) {
            setProducts({});
            return;
        }

        const skuIds = [
            ...new Set(
                openedGroup.items.map((item) => item.skuId)
            ),
        ];

        if (skuIds.length === 0) {
            setProducts({});
            return;
        }

        let cancelled = false;

        const loadProducts = async () => {
            setLoading(true);

            try {
                const query = skuIds
                    .map((id) => `skuIds=${id}`)
                    .join('&');

                const res = await fetch(
                    `/api/products/by-skus?${query}`
                );

                if (!res.ok) {
                    throw new Error(
                        `상품 조회 실패 (${res.status})`
                    );
                }

                const data: Array<{
                    skuId: number;
                    name: string;
                    priceKrw?: number;
                    price?: number;
                }> = await res.json();

                if (cancelled) return;

                const next: Record<
                    number,
                    ProductDetail
                > = {};

                data.forEach((product) => {
                    next[product.skuId] = {
                        skuId: product.skuId,
                        name: product.name,
                        price:
                            product.priceKrw ??
                            product.price ??
                            0,
                    };
                });

                setProducts(next);
            } catch (err) {
                console.error(
                    '[장바구니 팝업] 상품 조회 실패:',
                    err
                );

                if (!cancelled) {
                    setProducts({});
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadProducts();

        return () => {
            cancelled = true;
        };
    }, [openedGroup]);

    const total = useMemo(() => {
        if (!openedGroup) return 0;

        return openedGroup.items.reduce(
            (sum, item) => {
                const product = products[item.skuId];

                return (
                    sum +
                    (product?.price ?? 0) *
                    item.quantity
                );
            },
            0
        );
    }, [openedGroup, products]);

    /*
     * 리스트 상세 화면
     *
     * "이번 주 장보기" 같은 리스트를 누른 뒤
     * 해당 리스트에 들어있는 실제 상품들을 보여준다.
     */
    if (openedGroup) {
        return (
            <Modal
                title=""
                onClose={onClose}
            >
                <div
                    style={{
                        width: 420,
                        maxWidth: '80vw',
                        maxHeight: '70vh',
                        color: '#111827',
                    }}
                >
                    {/* 상단 */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 18,
                        }}
                    >
                        <button
                            type="button"
                            onClick={() =>
                                setOpenedGroup(null)
                            }
                            style={{
                                width: 32,
                                height: 32,
                                border: 'none',
                                borderRadius: '50%',
                                background: 'transparent',
                                fontSize: 22,
                                cursor: 'pointer',
                                color: '#111827',
                            }}
                        >
                            ‹
                        </button>

                        <div
                            style={{
                                flex: 1,
                                minWidth: 0,
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 16,
                                    fontWeight: 600,
                                }}
                            >
                                {openedGroup.title}
                            </div>

                            <div
                                style={{
                                    marginTop: 3,
                                    fontSize: 12,
                                    color: '#6b7280',
                                }}
                            >
                                {
                                    openedGroup
                                        .items.length
                                }
                                개
                                {total > 0 &&
                                    ` · ${total.toLocaleString()}원`}
                            </div>
                        </div>
                    </div>

                    {/* 이 리스트를 현재 담을 리스트로 지정 */}
                    <button
                        type="button"
                        onClick={() =>
                            onSelectGroup(
                                openedGroup.cartGroupId
                            )
                        }
                        style={{
                            width: '100%',
                            marginBottom: 12,
                            padding: '11px 12px',
                            borderRadius: 6,
                            border:
                                selectedGroupId ===
                                openedGroup.cartGroupId
                                    ? '1px solid #111827'
                                    : '1px solid #d1d5db',
                            background:
                                selectedGroupId ===
                                openedGroup.cartGroupId
                                    ? '#111827'
                                    : '#ffffff',
                            color:
                                selectedGroupId ===
                                openedGroup.cartGroupId
                                    ? '#ffffff'
                                    : '#111827',
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        {selectedGroupId ===
                        openedGroup.cartGroupId
                            ? '✓ 현재 이 리스트에 담는 중'
                            : '이 리스트에 상품 담기'}
                    </button>

                    {/* 상품 */}
                    <div
                        style={{
                            maxHeight: 420,
                            overflowY: 'auto',
                            borderTop:
                                '1px solid #e5e7eb',
                        }}
                    >
                        {openedGroup.items.length ===
                            0 && (
                                <div
                                    style={{
                                        padding: '40px 10px',
                                        textAlign:
                                            'center',
                                        color: '#6b7280',
                                        fontSize: 13,
                                    }}
                                >
                                    아직 담긴 상품이
                                    없어요.
                                </div>
                            )}

                        {loading && (
                            <div
                                style={{
                                    padding: 30,
                                    textAlign:
                                        'center',
                                    color: '#6b7280',
                                }}
                            >
                                불러오는 중...
                            </div>
                        )}

                        {!loading &&
                            openedGroup.items.map(
                                (
                                    item: CartGroupItem
                                ) => {
                                    const product =
                                        products[
                                            item.skuId
                                            ];

                                    const itemTotal =
                                        (product?.price ??
                                            0) *
                                        item.quantity;

                                    return (
                                        <div
                                            key={
                                                item.cartItemId
                                            }
                                            style={{
                                                display:
                                                    'flex',
                                                gap: 12,
                                                padding:
                                                    '14px 0',
                                                borderBottom:
                                                    '1px solid #e5e7eb',
                                            }}
                                        >
                                            {/* 상품 이미지 자리 */}
                                            <div
                                                style={{
                                                    width: 64,
                                                    height: 64,
                                                    flexShrink: 0,
                                                    border:
                                                        '1px solid #e5e7eb',
                                                    borderRadius: 5,
                                                    background:
                                                        '#f3f4f6',
                                                }}
                                            />

                                            <div
                                                style={{
                                                    flex: 1,
                                                    minWidth: 0,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        fontSize: 13,
                                                        lineHeight:
                                                            1.4,
                                                        fontWeight: 500,
                                                    }}
                                                >
                                                    {product?.name ??
                                                        `상품 #${item.skuId}`}
                                                </div>

                                                <div
                                                    style={{
                                                        marginTop: 5,
                                                        fontSize: 15,
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {product
                                                        ? `${product.price.toLocaleString()}원`
                                                        : ''}
                                                </div>

                                                <div
                                                    style={{
                                                        marginTop: 6,
                                                        display:
                                                            'flex',
                                                        justifyContent:
                                                            'space-between',
                                                        fontSize: 12,
                                                        color: '#6b7280',
                                                    }}
                                                >
                                                    <span>
                                                        수량{' '}
                                                        {
                                                            item.quantity
                                                        }
                                                        개
                                                    </span>

                                                    {itemTotal >
                                                        0 && (
                                                            <span
                                                                style={{
                                                                    color: '#111827',
                                                                    fontWeight: 600,
                                                                }}
                                                            >
                                                            {itemTotal.toLocaleString()}
                                                                원
                                                        </span>
                                                        )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                            )}
                    </div>
                </div>
            </Modal>
        );
    }

    /*
     * 리스트 목록 화면
     *
     * 웹 /saved 화면처럼 카드 형태로 보여준다.
     */
    return (
        <Modal title="" onClose={onClose}>
            <div
                style={{
                    width: 470,
                    maxWidth: '82vw',
                    color: '#111827',
                }}
            >
                <div
                    style={{
                        fontSize: 16,
                        marginBottom: 14,
                    }}
                >
                    저장
                </div>

                <div
                    style={{
                        borderBottom:
                            '1px solid #e5e7eb',
                        marginBottom: 16,
                    }}
                >
                    <div
                        style={{
                            display: 'inline-block',
                            borderBottom:
                                '2px solid #111827',
                            padding:
                                '8px 12px',
                            fontSize: 14,
                            fontWeight: 500,
                        }}
                    >
                        저장한 리스트
                    </div>
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns:
                            'repeat(2, minmax(0, 1fr))',
                        gap: 12,
                    }}
                >
                    {groups.map((group) => (
                        <button
                            key={
                                group.cartGroupId
                            }
                            type="button"
                            onClick={() =>
                                setOpenedGroup(group)
                            }
                            style={{
                                minHeight: 125,
                                display: 'flex',
                                flexDirection:
                                    'column',
                                justifyContent:
                                    'space-between',
                                textAlign: 'left',
                                padding: 14,
                                borderRadius: 6,
                                border:
                                    selectedGroupId ===
                                    group.cartGroupId
                                        ? '2px solid #111827'
                                        : '1px solid #d1d5db',
                                background:
                                    '#ffffff',
                                color: '#111827',
                                cursor: 'pointer',
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                }}
                            >
                                {group.title}
                            </div>

                            <div>
                                <div
                                    style={{
                                        color: '#6b7280',
                                        fontSize: 11,
                                    }}
                                >
                                    {
                                        group.itemCount
                                    }
                                    개
                                </div>

                                {selectedGroupId ===
                                    group.cartGroupId && (
                                        <div
                                            style={{
                                                marginTop: 5,
                                                fontSize: 11,
                                                color: '#2563eb',
                                                fontWeight: 600,
                                            }}
                                        >
                                            현재 담을 리스트
                                        </div>
                                    )}
                            </div>
                        </button>
                    ))}
                </div>

                {groups.length === 0 && (
                    <div
                        style={{
                            padding: 40,
                            textAlign: 'center',
                            color: '#6b7280',
                            fontSize: 13,
                        }}
                    >
                        저장된 리스트가 없습니다.
                    </div>
                )}
            </div>
        </Modal>
    );
}