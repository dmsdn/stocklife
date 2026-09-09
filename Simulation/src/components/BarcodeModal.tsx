import Modal from './Modal';

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

export default function BarcodeModal({ productName, barcode, onClose }: Props) {
  const bits = encodeEan13(barcode);
  const moduleWidth = 2;
  const quietZone = 10;
  const width = (95 + quietZone * 2) * moduleWidth;
  const height = 92;

  return (
    <Modal title="상품 바코드" onClose={onClose}>
      <div style={{ minWidth: 300, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
          {productName}
        </div>

        {bits ? (
          <div
            style={{
              display: 'inline-block',
              background: '#fff',
              padding: '12px 12px 8px',
              borderRadius: 8,
            }}
          >
            <svg
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={`${productName} EAN-13 바코드 ${barcode}`}
              style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
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
              borderRadius: 8,
              padding: '18px 16px',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{barcode}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              이 값은 유효한 EAN-13 형식이 아니라 바코드 그림을 만들 수 없습니다.
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 14,
            padding: '7px 18px',
            borderRadius: 6,
            border: '1px solid #4b5563',
            background: '#252a33',
            color: '#e5e7eb',
            cursor: 'pointer',
          }}
        >
          닫기
        </button>
      </div>
    </Modal>
  );
}
