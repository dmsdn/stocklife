import { useEffect } from 'react';

interface Props {
  productName: string;
  barcode: string;
  onClose: () => void;
}

const L: Record<string, string> = {
  '0': '0001101', '1': '0011001', '2': '0010011', '3': '0111101', '4': '0100011',
  '5': '0110001', '6': '0101111', '7': '0111011', '8': '0110111', '9': '0001011',
};
const G: Record<string, string> = {
  '0': '0100111', '1': '0110011', '2': '0011011', '3': '0100001', '4': '0011101',
  '5': '0111001', '6': '0000101', '7': '0010001', '8': '0001001', '9': '0010111',
};
const R: Record<string, string> = {
  '0': '1110010', '1': '1100110', '2': '1101100', '3': '1000010', '4': '1011100',
  '5': '1001110', '6': '1010000', '7': '1000100', '8': '1001000', '9': '1110100',
};
const PARITY: Record<string, string> = {
  '0': 'LLLLLL', '1': 'LLGLGG', '2': 'LLGGLG', '3': 'LLGGGL', '4': 'LGLLGG',
  '5': 'LGGLLG', '6': 'LGGGLL', '7': 'LGLGLG', '8': 'LGLGGL', '9': 'LGGLGL',
};

function isValidEan13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const sum = digits.slice(0, 12).reduce(
      (acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3),
      0
  );
  const check = (10 - (sum % 10)) % 10;
  return check === digits[12];
}

function encodeEan13(value: string): string | null {
  if (!isValidEan13(value)) return null;
  const parity = PARITY[value[0]];
  let bits = '101';
  for (let i = 1; i <= 6; i++) {
    bits += parity[i - 1] === 'L' ? L[value[i]] : G[value[i]];
  }
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[value[i]];
  bits += '101';
  return bits;
}

/**
 * 바코드 전용 비차단 플로팅 패널.
 *
 * 일반 Modal을 쓰지 않는 이유:
 * - Modal은 화면 전체를 덮는 backdrop이 pointer event를 잡아서
 *   오른쪽 Frontend iframe(카메라/스캔 UI)을 조작할 수 없다.
 * - 이 컴포넌트는 바깥 래퍼를 pointerEvents:none 으로 두고,
 *   카드 자체만 pointerEvents:auto 로 만들어 바코드가 떠 있는 동안에도
 *   웹 화면과 시뮬레이션의 나머지 영역을 계속 클릭할 수 있게 한다.
 */
export default function BarcodeModal({ productName, barcode, onClose }: Props) {
  const bits = encodeEan13(barcode);
  const moduleWidth = 2;
  const quietZone = 10;
  const width = (95 + quietZone * 2) * moduleWidth;
  const height = 92;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
      <div
          aria-live="polite"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2400,
            pointerEvents: 'none',
          }}
      >
        <section
            aria-label={`${productName} 바코드`}
            style={{
              position: 'absolute',
              top: 72,
              left: 24,
              width: 'min(330px, calc(100vw - 48px))',
              background: '#1a1d24',
              color: '#e5e7eb',
              border: '1px solid #3b4250',
              borderRadius: 12,
              boxShadow: '0 14px 32px rgba(0,0,0,0.35)',
              overflow: 'hidden',
              pointerEvents: 'auto',
            }}
        >
          <div
              style={{
                minHeight: 44,
                padding: '10px 10px 10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                borderBottom: '1px solid #303643',
                background: '#15181e',
              }}
          >
            <div style={{ fontSize: 14, fontWeight: 800 }}>
              상품 바코드
            </div>

            <button
                type="button"
                onClick={onClose}
                aria-label="바코드 닫기"
                title="닫기"
                style={{
                  width: 32,
                  height: 32,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  border: '1px solid #4b5563',
                  background: '#242933',
                  color: '#f3f4f6',
                  cursor: 'pointer',
                  fontSize: 20,
                  lineHeight: 1,
                  fontWeight: 700,
                }}
            >
              ×
            </button>
          </div>

          <div style={{ padding: '14px 16px 16px', textAlign: 'center' }}>
            <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 12,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={productName}
            >
              {productName}
            </div>

            {bits ? (
                <div
                    style={{
                      display: 'inline-block',
                      width: '100%',
                      background: '#fff',
                      padding: '12px 10px 8px',
                      borderRadius: 9,
                    }}
                >
                  <svg
                      width={width}
                      height={height}
                      viewBox={`0 0 ${width} ${height}`}
                      role="img"
                      aria-label={`${productName} EAN-13 바코드 ${barcode}`}
                      style={{
                        display: 'block',
                        width: '100%',
                        maxWidth: width,
                        height: 'auto',
                        margin: '0 auto',
                      }}
                  >
                    <rect width={width} height={height} fill="#ffffff" />
                    {bits.split('').map((bit, index) => {
                      if (bit !== '1') return null;
                      const moduleIndex = index + quietZone;
                      const guard =
                          index < 3 ||
                          (index >= 45 && index < 50) ||
                          index >= 92;
                      return (
                          <rect
                              key={index}
                              x={moduleIndex * moduleWidth}
                              y={0}
                              width={moduleWidth}
                              height={guard ? 68 : 60}
                              fill="#000000"
                          />
                      );
                    })}
                    <text
                        x={width / 2}
                        y={86}
                        textAnchor="middle"
                        fontFamily="monospace"
                        fontSize="15"
                        fill="#000000"
                        letterSpacing="2"
                    >
                      {barcode}
                    </text>
                  </svg>
                </div>
            ) : (
                <div
                    style={{
                      background: '#fff',
                      color: '#111827',
                      borderRadius: 9,
                      padding: '18px 16px',
                    }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{barcode}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    이 값은 유효한 EAN-13 형식이 아니라 바코드 그림을 만들 수 없습니다.
                  </div>
                </div>
            )}

            <div
                style={{
                  marginTop: 10,
                  fontSize: 11,
                  color: '#9ca3af',
                }}
            >
              바코드를 띄운 상태에서도 오른쪽 웹 화면을 조작할 수 있습니다.
            </div>
          </div>
        </section>
      </div>
  );
}