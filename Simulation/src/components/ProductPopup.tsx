import { useState } from 'react';
import Modal from './Modal';
import BarcodeModal from './BarcodeModal';
import type { LocationInfo, ProductInfo } from '../game/types';
import type { CartGroupOption } from '../api/cart';

interface LevelGroup {
    location: LocationInfo;
    level: number;
    products: ProductInfo[];
}

interface Props {
    baseLabel: string;
    groups: LevelGroup[];
    cartQtyByKey: Record<string, number>;

    /** 담을 리스트 선택 드롭다운용. 웹의 "어느 리스트를 불러올까요?"와 같은 목록. */
    cartGroups: CartGroupOption[];
    /** null이면 "리스트 없이 시작하기" — 담을 때 백엔드가 "빠른 장보기"를 자동으로 찾거나 만든다. */
    selectedGroupId: number | null;
    onSelectGroup: (groupId: number | null) => void;

    onAddToCart: (
        location: LocationInfo,
        product: ProductInfo
    ) => void;

    onRemoveFromCart: (
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
                                         cartGroups,
                                         selectedGroupId,
                                         onSelectGroup,
                                         onAddToCart,
                                         onRemoveFromCart,
                                         onRestock,
                                         onClose,
                                     }: Props) {

    const [restockingKey, setRestockingKey] =
        useState<string | null>(null);

    const [barcodeProduct, setBarcodeProduct] =
        useState<ProductInfo | null>(null);

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
        <>
            {!barcodeProduct && <Modal
                title={
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                        }}
                    >
                        <span>{baseLabel} 진열 상품</span>

                        {/* 담을 리스트 선택 — 웹의 "어느 리스트를 불러올까요?"와 동일한 개념.
                        기본값(빈 값)은 "리스트 없이 시작하기" — 백엔드가 "빠른 장보기"를
                        자동으로 찾거나 만들어준다(웹 lib/cart-storage.ts의
                        getOrCreateQuickCartGroup과 같은 로직이 서버의
                        CartService.getOrCreateQuickGroup에 이미 있음). */}
                        <select
                            value={selectedGroupId ?? ''}
                            onChange={(e) =>
                                onSelectGroup(
                                    e.target.value === ''
                                        ? null
                                        : Number(e.target.value)
                                )
                            }
                            style={{
                                padding: '4px 6px',
                                borderRadius: 6,
                                border: '1px solid #374151',
                                background: '#12141a',
                                color: '#e5e7eb',
                                fontSize: 11,
                                fontWeight: 400,
                                maxWidth: 160,
                            }}
                        >
                            <option value="">리스트 없이 시작하기</option>

                            {cartGroups
                                .filter((g) => g.status !== 'COMPLETED')
                                .map((g) => (
                                    <option
                                        key={g.cartGroupId}
                                        value={g.cartGroupId}
                                    >
                                        {g.title} ({g.itemCount}개)
                                    </option>
                                ))}
                        </select>
                    </div>
                }
                onClose={barcodeProduct ? undefined : onClose}
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
                                                        onRemoveFromCart(
                                                            group.location,
                                                            p
                                                        )
                                                    }
                                                    disabled={inCart <= 0}
                                                    style={{
                                                        padding: '4px 10px',
                                                        borderRadius: 6,
                                                        border: 'none',
                                                        background: inCart <= 0
                                                            ? '#374151'
                                                            : '#ef4444',
                                                        color: '#fff',
                                                        cursor: inCart <= 0
                                                            ? 'not-allowed'
                                                            : 'pointer',
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    빼기
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setBarcodeProduct(p)
                                                    }
                                                    disabled={!p.barcode}
                                                    title={p.barcode
                                                        ? `${p.barcode} 바코드 보기`
                                                        : '바코드 정보 없음'}
                                                    style={{
                                                        padding: '4px 10px',
                                                        borderRadius: 6,
                                                        border: 'none',
                                                        background: p.barcode
                                                            ? '#7c3aed'
                                                            : '#374151',
                                                        color: '#fff',
                                                        cursor: p.barcode
                                                            ? 'pointer'
                                                            : 'not-allowed',
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    바코드
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
            </Modal>}

            {barcodeProduct?.barcode && (
                <BarcodeModal
                    productName={barcodeProduct.name}
                    barcode={barcodeProduct.barcode}
                    onClose={() => setBarcodeProduct(null)}
                />
            )}
        </>
    );
}