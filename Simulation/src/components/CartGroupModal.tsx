import { useState } from 'react';
import Modal from './Modal';
import type { CartGroupOption } from '../api/cart';

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

    // 리스트 상세 화면
    if (openedGroup) {
        return (
            <Modal
                title=""
                onClose={onClose}
            >
                <div
                    style={{
                        width: 420,
                        maxWidth: '82vw',
                        maxHeight: '70vh',
                        color: '#f9fafb',
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
                                background: '#252a33',
                                color: '#f9fafb',
                                fontSize: 20,
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
                                {openedGroup.itemCount}개
                            </div>
                        </div>
                    </div>

                    {/* 현재 담을 리스트 지정 */}
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

                    {/* 상품 목록 */}
                    <div
                        style={{
                            maxHeight: 420,
                            overflowY: 'auto',
                            borderTop: '1px solid #343a46',
                        }}
                    >
                        {openedGroup.items?.length === 0 && (
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

                        {openedGroup.items?.map((item) => (
                            <div
                                key={item.cartItemId}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: '14px 4px',
                                    borderBottom:
                                        '1px solid #343a46',
                                }}
                            >
                                {/* 상품 이미지 자리 */}
                                <div
                                    style={{
                                        width: 58,
                                        height: 58,
                                        flexShrink: 0,
                                        borderRadius: 7,
                                        border:
                                            '1px solid #3a3f4b',
                                        background: '#242933',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent:
                                            'center',
                                        color: '#6b7280',
                                        fontSize: 18,
                                    }}
                                >
                                    🛒
                                </div>

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
                                        }}
                                    >
                                        상품 #{item.skuId}
                                    </div>

                                    <div
                                        style={{
                                            marginTop: 5,
                                            color: '#9ca3af',
                                            fontSize: 12,
                                        }}
                                    >
                                        수량 {item.quantity}개
                                    </div>
                                </div>

                                <div
                                    style={{
                                        fontSize: 11,
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
                        ))}
                    </div>
                </div>
            </Modal>
        );
    }

    // 저장 리스트 목록 화면
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
                {/* 제목 */}
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

                {/* 탭 */}
                <div
                    style={{
                        borderBottom: '1px solid #343a46',
                        marginBottom: 16,
                    }}
                >
                    <div
                        style={{
                            display: 'inline-block',
                            padding: '8px 10px',
                            borderBottom: '2px solid #ffffff',
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#ffffff',
                        }}
                    >
                        저장한 리스트
                    </div>
                </div>

                {/* 리스트 카드 */}
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
                                key={group.cartGroupId}
                                type="button"
                                onClick={() =>
                                    setOpenedGroup(group)
                                }
                                style={{
                                    minHeight: 125,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent:
                                        'space-between',
                                    textAlign: 'left',
                                    padding: 14,
                                    borderRadius: 8,
                                    border: selected
                                        ? '2px solid #3b82f6'
                                        : '1px solid #3a3f4b',
                                    background: selected
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
                                        {group.itemCount}개
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