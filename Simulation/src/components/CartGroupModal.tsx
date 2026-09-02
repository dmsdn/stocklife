import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import type {
    CartGroupOption,
    CartGroupItem,
} from '../api/cart';

interface Props {
    groups: CartGroupOption[];
    selectedGroupId: number | null;
    onSelectGroup: (groupId: number | null) => void;
    onClose: () => void;
}

interface ProductDetail {
    skuId: number;
    name: string;
    price: number;
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

    const [loadingProducts, setLoadingProducts] =
        useState(false);

    const [productError, setProductError] =
        useState<string | null>(null);

    useEffect(() => {
        if (!openedGroup) {
            setProducts({});
            setProductError(null);
            return;
        }

        const items = openedGroup.items ?? [];

        const skuIds = [
            ...new Set(items.map((item) => item.skuId)),
        ];

        if (skuIds.length === 0) {
            setProducts({});
            setProductError(null);
            return;
        }

        let cancelled = false;

        const loadProducts = async () => {
            setLoadingProducts(true);
            setProductError(null);

            try {
                const query = skuIds
                    .map(
                        (skuId) =>
                            `skuIds=${encodeURIComponent(
                                skuId
                            )}`
                    )
                    .join('&');

                const response = await fetch(
                    `/api/products/by-skus?${query}`
                );

                if (!response.ok) {
                    const text = await response
                        .text()
                        .catch(() => '');

                    throw new Error(
                        `상품 조회 실패 (${response.status}) ${text}`
                    );
                }

                const data: Array<{
                    skuId: number;
                    name: string;
                    priceKrw?: number;
                    price?: number;
                }> = await response.json();

                if (cancelled) {
                    return;
                }

                const nextProducts: Record<
                    number,
                    ProductDetail
                > = {};

                data.forEach((product) => {
                    nextProducts[product.skuId] = {
                        skuId: product.skuId,
                        name: product.name,
                        price:
                            product.priceKrw ??
                            product.price ??
                            0,
                    };
                });

                setProducts(nextProducts);
            } catch (error) {
                console.error(
                    '[CartGroupModal] 상품 조회 실패',
                    error
                );

                if (!cancelled) {
                    setProducts({});
                    setProductError(
                        '상품 정보를 불러오지 못했습니다.'
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoadingProducts(false);
                }
            }
        };

        void loadProducts();

        return () => {
            cancelled = true;
        };
    }, [openedGroup]);

    const totalAmount = useMemo(() => {
        if (!openedGroup) {
            return 0;
        }

        return (openedGroup.items ?? []).reduce(
            (sum, item) => {
                const product =
                    products[item.skuId];

                if (!product) {
                    return sum;
                }

                return (
                    sum +
                    product.price * item.quantity
                );
            },
            0
        );
    }, [openedGroup, products]);

    /*
     * 리스트 상세 화면
     */
    if (openedGroup) {
        const items = openedGroup.items ?? [];

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
                    {/* 상단 */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 16,
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
                                border:
                                    '1px solid #3a3f4b',
                                borderRadius: 7,
                                background: '#252a33',
                                color: '#f9fafb',
                                fontSize: 18,
                                cursor: 'pointer',
                            }}
                        >
                            ←
                        </button>

                        <div
                            style={{
                                flex: 1,
                                minWidth: 0,
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 17,
                                    fontWeight: 700,
                                    color: '#f9fafb',
                                }}
                            >
                                {openedGroup.title}
                            </div>

                            <div
                                style={{
                                    marginTop: 4,
                                    fontSize: 12,
                                    color: '#9ca3af',
                                }}
                            >
                                {items.length}개
                                {totalAmount > 0 &&
                                    ` · ${totalAmount.toLocaleString()}원`}
                            </div>
                        </div>
                    </div>

                    {/* 현재 담을 리스트 설정 */}
                    <button
                        type="button"
                        onClick={() =>
                            onSelectGroup(
                                openedGroup.cartGroupId
                            )
                        }
                        style={{
                            width: '100%',
                            padding: '11px 12px',
                            marginBottom: 14,
                            borderRadius: 7,
                            border:
                                selectedGroupId ===
                                openedGroup.cartGroupId
                                    ? '1px solid #3b82f6'
                                    : '1px solid #3a3f4b',
                            background:
                                selectedGroupId ===
                                openedGroup.cartGroupId
                                    ? '#1d4ed8'
                                    : '#252a33',
                            color: '#ffffff',
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        {selectedGroupId ===
                        openedGroup.cartGroupId
                            ? '✓ 현재 이 리스트에 담는 중'
                            : '이 리스트에 상품 담기'}
                    </button>

                    {/* 에러 */}
                    {productError && (
                        <div
                            style={{
                                marginBottom: 12,
                                padding: '10px 12px',
                                borderRadius: 7,
                                background: '#3a2024',
                                color: '#fca5a5',
                                fontSize: 12,
                            }}
                        >
                            {productError}
                        </div>
                    )}

                    {/* 상품 리스트 */}
                    <div
                        style={{
                            maxHeight: 430,
                            overflowY: 'auto',
                            borderTop:
                                '1px solid #343a46',
                        }}
                    >
                        {items.length === 0 && (
                            <div
                                style={{
                                    padding: '42px 10px',
                                    textAlign: 'center',
                                    color: '#9ca3af',
                                    fontSize: 13,
                                }}
                            >
                                아직 담긴 상품이 없습니다.
                            </div>
                        )}

                        {loadingProducts &&
                            items.length > 0 && (
                                <div
                                    style={{
                                        padding: 30,
                                        textAlign:
                                            'center',
                                        color: '#9ca3af',
                                        fontSize: 13,
                                    }}
                                >
                                    상품 정보 불러오는 중...
                                </div>
                            )}

                        {!loadingProducts &&
                            items.map(
                                (
                                    item: CartGroupItem
                                ) => {
                                    const product =
                                        products[
                                            item.skuId
                                            ];

                                    const itemTotal =
                                        product
                                            ? product.price *
                                            item.quantity
                                            : 0;

                                    return (
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
                                            {/* 이미지 자리 */}
                                            <div
                                                style={{
                                                    width: 58,
                                                    height: 58,
                                                    flexShrink: 0,
                                                    borderRadius: 7,
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
                                                🛒
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
                                                    {product?.name ??
                                                        `상품 #${item.skuId}`}
                                                </div>

                                                <div
                                                    style={{
                                                        marginTop: 5,
                                                        color: '#d1d5db',
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    {product
                                                        ? `${product.price.toLocaleString()}원`
                                                        : '가격 정보 없음'}
                                                </div>

                                                <div
                                                    style={{
                                                        marginTop: 5,
                                                        color: '#9ca3af',
                                                        fontSize: 11,
                                                    }}
                                                >
                                                    수량{' '}
                                                    {
                                                        item.quantity
                                                    }
                                                    개
                                                </div>
                                            </div>

                                            {/* 우측 합계 */}
                                            <div
                                                style={{
                                                    textAlign:
                                                        'right',
                                                    minWidth: 85,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        color: '#f9fafb',
                                                        fontSize: 13,
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {itemTotal >
                                                    0
                                                        ? `${itemTotal.toLocaleString()}원`
                                                        : '-'}
                                                </div>

                                                <div
                                                    style={{
                                                        marginTop: 6,
                                                        fontSize: 10,
                                                        color: item.checked
                                                            ? '#60a5fa'
                                                            : '#6b7280',
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {item.checked
                                                        ? '결제 선택'
                                                        : '미선택'}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                            )}
                    </div>

                    {/* 하단 합계 */}
                    {items.length > 0 && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent:
                                    'space-between',
                                paddingTop: 16,
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 12,
                                    color: '#9ca3af',
                                }}
                            >
                                리스트 합계
                            </span>

                            <strong
                                style={{
                                    color: '#ffffff',
                                    fontSize: 18,
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

    /*
     * 저장 리스트 목록
     */
    return (
        <Modal
            title=""
            onClose={onClose}
        >
            <div
                style={{
                    width: 470,
                    maxWidth: '82vw',
                    color: '#f9fafb',
                }}
            >
                <div
                    style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: '#f9fafb',
                        marginBottom: 16,
                    }}
                >
                    저장
                </div>

                <div
                    style={{
                        borderBottom:
                            '1px solid #343a46',
                        marginBottom: 16,
                    }}
                >
                    <div
                        style={{
                            display: 'inline-block',
                            padding: '8px 10px',
                            borderBottom:
                                '2px solid #ffffff',
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#ffffff',
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
                    {groups.map((group) => {
                        const selected =
                            selectedGroupId ===
                            group.cartGroupId;

                        return (
                            <button
                                key={
                                    group.cartGroupId
                                }
                                type="button"
                                onClick={() =>
                                    setOpenedGroup(
                                        group
                                    )
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
                                    borderRadius: 8,
                                    border: selected
                                        ? '2px solid #3b82f6'
                                        : '1px solid #3a3f4b',
                                    background:
                                        selected
                                            ? '#252d3d'
                                            : '#20242d',
                                    color: '#f9fafb',
                                    cursor: 'pointer',
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 700,
                                        color: '#f9fafb',
                                    }}
                                >
                                    {group.title}
                                </div>

                                <div>
                                    <div
                                        style={{
                                            color: '#9ca3af',
                                            fontSize: 11,
                                        }}
                                    >
                                        {group.itemCount}
                                        개
                                    </div>

                                    {selected && (
                                        <div
                                            style={{
                                                marginTop: 6,
                                                color: '#60a5fa',
                                                fontSize: 11,
                                                fontWeight: 700,
                                            }}
                                        >
                                            현재 담을 리스트
                                        </div>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {groups.length === 0 && (
                    <div
                        style={{
                            padding: 40,
                            textAlign: 'center',
                            color: '#9ca3af',
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