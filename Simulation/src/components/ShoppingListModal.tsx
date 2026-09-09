import { useState } from 'react';
import Modal from './Modal';
import { floorLabel } from '../game/floorGraph';
import { searchProducts, type ProductSearchResult, type ShoppingListItem } from '../api/shoppingList';

interface Props {
  items: ShoppingListItem[];
  navigatingIndex: number | null; // 지금 몇 번째 항목으로 이동 중인지(없으면 null)
  onAdd: (product: ProductSearchResult) => void;
  // 09-08 검색 결과에서 "위치" 를 누르면 지도에 핀만 꽂는다(목록에 담지는 않는다).
  // 오른쪽 웹 화면이 같은 신호를 보내주지만, 프론트 수정 없이도 시연할 수 있도록
  // 시뮬레이션 자체 검색에도 같은 진입점을 둔다.
  onLocate: (product: ProductSearchResult) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onNavigate: () => void;
  onClose: () => void;
}

export default function ShoppingListModal({
  items,
  navigatingIndex,
  onAdd,
  onLocate,
  onRemove,
  onMove,
  onNavigate,
  onClose,
}: Props) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const runSearch = async () => {
    if (!keyword.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      setResults(await searchProducts(keyword));
    } catch {
      setSearchError('검색에 실패했습니다.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <Modal title="쇼핑목록" onClose={onClose}>
      <div style={{ width: 340 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder="상품 이름으로 검색 (예: 우유)"
            style={{
              flex: 1,
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid #3a3f4b',
              background: '#111318',
              color: '#e5e7eb',
              fontSize: 13,
            }}
          />
          <button
            onClick={runSearch}
            disabled={searching}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              background: '#3b82f6',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            검색
          </button>
        </div>

        {searchError && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{searchError}</div>}

        {results.length > 0 && (
          <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto', border: '1px solid #2a2d35', borderRadius: 6 }}>
            {results.map((p) => (
              <div
                key={p.skuId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 8px',
                  borderBottom: '1px solid #2a2d35',
                  fontSize: 12,
                }}
              >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                  {p.name} <span style={{ color: '#9ca3af' }}>· {p.price.toLocaleString()}원</span>
                </div>
                <button
                  onClick={() => onLocate(p)}
                  title="지도에 이 상품 위치를 표시합니다"
                  style={{
                    flexShrink: 0,
                    border: '1px solid #3a3f4b',
                    background: '#12141a',
                    color: '#fca5a5',
                    borderRadius: 4,
                    padding: '3px 8px',
                    cursor: 'pointer',
                    fontSize: 11,
                    marginRight: 4,
                  }}
                >
                  📍 위치
                </button>
                <button
                  onClick={() => onAdd(p)}
                  style={{
                    flexShrink: 0,
                    border: 'none',
                    background: '#22c55e',
                    color: '#fff',
                    borderRadius: 4,
                    padding: '3px 8px',
                    cursor: 'pointer',
                    fontSize: 11,
                  }}
                >
                  담기
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: '#9ca3af' }}>
          목록 ({items.length})
        </div>
        <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 6 }}>
          {items.length === 0 && (
            <div style={{ color: '#6b7280', fontSize: 12 }}>담긴 상품이 없습니다. 위에서 검색해서 담아보세요.</div>
          )}
          {items.map((it, i) => (
            <div
              key={`${it.skuId}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 0',
                borderBottom: '1px solid #2a2d35',
                background: navigatingIndex === i ? '#1f2937' : 'transparent',
              }}
            >
              <div style={{ width: 18, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: navigatingIndex === i ? '#facc15' : '#e5e7eb',
                  }}
                >
                  {navigatingIndex === i ? '🚶 ' : ''}
                  {it.name}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  {floorLabel(it.floorNo)} · {it.zoneId} · {it.price.toLocaleString()}원
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button
                  onClick={() => onMove(i, -1)}
                  disabled={i === 0}
                  style={arrowBtnStyle(i === 0)}
                  title="위로"
                >
                  ▲
                </button>
                <button
                  onClick={() => onMove(i, 1)}
                  disabled={i === items.length - 1}
                  style={arrowBtnStyle(i === items.length - 1)}
                  title="아래로"
                >
                  ▼
                </button>
              </div>
              <button
                onClick={() => onRemove(i)}
                style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <button
            onClick={onNavigate}
            disabled={navigatingIndex !== null}
            style={{
              marginTop: 10,
              width: '100%',
              padding: '8px 0',
              borderRadius: 6,
              border: 'none',
              background: navigatingIndex !== null ? '#374151' : '#3b82f6',
              color: '#fff',
              fontWeight: 700,
              cursor: navigatingIndex !== null ? 'not-allowed' : 'pointer',
            }}
          >
            {navigatingIndex !== null
              ? `이동 중... (${navigatingIndex + 1}/${items.length})`
              : '순서대로 안내 시작'}
          </button>
        )}
      </div>
    </Modal>
  );
}

function arrowBtnStyle(disabled: boolean) {
  return {
    border: 'none',
    background: 'transparent',
    color: disabled ? '#374151' : '#9ca3af',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 11,
    lineHeight: 1,
    padding: '1px 4px',
  } as const;
}
