// components/domain/receipt-dialog.tsx
// ✅ 전자 영수증을 별도 페이지 대신 모달로 표시.
// ✅ 수정(2026-09) — 요청 반영:
//   1) 바코드 — 예전엔 높이가 들쭉날쭉해서 "경사진" 것처럼 보였음(막대 높이를 랜덤하게
//      바꾸는 방식). 실제 바코드처럼 높이는 전부 똑같고 "너비"만 다르게 바꿈, 주문번호
//      자릿수 기반으로 결정론적으로 생성(같은 주문은 항상 같은 바코드).
//   2) 카드/할인 — 백엔드 OrderResponse가 이미 결제수단(paymentMethod)은 orderId 기반으로
//      고정 목업을 내려주고 있음(진짜 PG 연동 전이라). 카드 브랜드·끝 4자리·할인 금액도
//      같은 방식(orderId를 시드로 고정 선택)으로 프론트에서 만들어서 붙임 — 새로고침해도
//      같은 주문이면 항상 같은 값.
//   3) 포인트 — pointsUsed/pointsEarned는 실제 백엔드 값(진짜 데이터). 가용 포인트는
//      로그인 상태면 실제 GET /api/consumers/me의 pointBalance를 그대로 보여주고,
//      실패하면(비로그인 등) orderId 기반 고정 목업으로 대체.
//   4) 교환/환불 안내를 영수증 맨 아래에 추가.
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getMyProfile } from "@/lib/consumer-api";

interface OrderItem {
  skuId: number;
  productName: string;
  priceKrw: number;
  quantity: number;
}
interface Order {
  orderId: number;
  totalAmount: number;
  status: string;
  items: OrderItem[];
  orderedAt?: string;
  paymentMethod?: string;
  /** 실제 사용 포인트(백엔드 값). 없으면(더미 데이터 등) 0으로 취급. */
  pointsUsed?: number;
  /** 실제 적립 포인트(백엔드 값). 없으면 결제금액의 2%로 추정 표시. */
  pointsEarned?: number;
}

// 고객센터 전화번호 — 실제로 존재하지 않는 번호(한국 대표번호 국번 1234는 실제로 배정된
// 적 없음)로 고정. 마이페이지 > 고객센터 화면과 반드시 같은 번호를 씁니다.
export const FAKE_SUPPORT_PHONE = "1234-5678";

const FAKE_CARD_BRANDS = ["신한카드", "국민카드", "삼성카드", "우리카드", "하나카드", "현대카드"];

// orderId를 시드로 "그 주문만의" 고정 값을 뽑는다 — 랜덤이 아니라서 새로고침해도 안 바뀜.
function seededPick<T>(seed: number, list: T[]): T {
  return list[Math.abs(seed) % list.length];
}

function seededDiscount(seed: number, totalAmount: number): number {
  // 0~4천원 사이, 500원 단위로 고정 — 결제 금액의 30%를 넘지 않게.
  const raw = (Math.abs(seed) % 9) * 500;
  return Math.min(raw, Math.floor(totalAmount * 0.3));
}

// ✅ 실제 바코드처럼 "높이는 전부 같고, 너비만 다른" 세로 막대를 주문번호로 결정론적으로
//   생성. 이전 버전은 막대 높이를 (i*37)%20으로 들쭉날쭉하게 만들어서 "경사진" 모양처럼
//   보였던 게 문제였음 — 높이는 고정하고, 자릿수마다 너비 패턴만 다르게.
function buildBarcodeWidths(value: number): number[] {
  const digits = String(Math.abs(value)).padStart(6, "0").split("").map(Number);
  const widths: number[] = [];
  // 시작 가드바(바코드 왼쪽 끝에 있는 얇은-굵은-얇은 패턴)
  widths.push(2, 1, 2);
  for (const d of digits) {
    // 숫자 하나당 얇은/굵은 막대 4개 패턴(값에 따라 두께가 달라짐) — 실제 바코드 인코딩은
    // 아니지만, 같은 숫자는 항상 같은 패턴이라 "그럴듯한" 바코드처럼 보임.
    widths.push(1 + (d % 3), 1, 1 + ((d + 2) % 3), 1);
  }
  // 종료 가드바
  widths.push(2, 1, 2);
  return widths;
}

function Barcode({ value }: { value: number }) {
  const widths = buildBarcodeWidths(value);
  return (
    <div className="mt-4">
      <div className="flex h-12 items-stretch justify-center gap-[1.5px]">
        {widths.map((w, i) => (
          <span
            key={i}
            className={i % 2 === 0 ? "bg-foreground" : "bg-transparent"}
            style={{ width: `${w * 2}px` }}
          />
        ))}
      </div>
      <p className="mt-1 text-center text-[11px] tracking-[0.3em] text-muted-foreground">
        {String(Math.abs(value)).padStart(6, "0")}
      </p>
    </div>
  );
}

export function ReceiptDialog({
  order,
  onClose,
}: {
  order: Order | null;
  onClose: () => void;
}) {
  // ✅ 가용 포인트 — 로그인돼있으면 실제 값(GET /api/consumers/me), 아니면 주문번호
  //   기반 고정 목업으로 대체.
  const [availablePoints, setAvailablePoints] = useState<number | null>(null);

  useEffect(() => {
    if (!order) return;
    getMyProfile()
      .then((p) => setAvailablePoints(p.pointBalance))
      .catch(() => setAvailablePoints(null));
  }, [order]);

  if (!order) {
    return (
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent />
      </Dialog>
    );
  }

  const orderIdAbs = Math.abs(order.orderId);
  const cardBrand = seededPick(orderIdAbs, FAKE_CARD_BRANDS);
  const cardLast4 = String(orderIdAbs).padStart(4, "0").slice(-4);
  const discount = seededDiscount(orderIdAbs, order.totalAmount);
  const originalAmount = order.totalAmount + discount;
  const pointsUsed = order.pointsUsed ?? 0;
  const pointsEarned = order.pointsEarned ?? Math.floor(order.totalAmount * 0.02);
  const pointsEligibleAmount = Math.max(0, order.totalAmount - pointsUsed);
  const shownAvailablePoints = availablePoints ?? pointsEarned + ((orderIdAbs % 12) * 350);

  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="p-0" style={{ width: "90%", maxWidth: 420 }}>
        <div className="mx-auto max-h-[80vh] w-full overflow-y-auto rounded-sm bg-card p-5 font-mono text-xs leading-relaxed">
          <div className="text-center">
            <p className="text-sm font-bold">STOCKLIFE MART</p>
            <p className="mt-1 text-muted-foreground">서울시 강남구 테헤란로 5길 20</p>
            <p className="text-muted-foreground">TEL. {FAKE_SUPPORT_PHONE}</p>
          </div>

          <div className="my-3 border-t border-dashed border-border" />

          <div className="flex justify-between text-muted-foreground">
            <span>주문번호</span>
            <span>#{orderIdAbs}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>결제상태</span>
            <span>{order.status === "PAID" ? "결제완료" : order.status}</span>
          </div>
          {order.orderedAt && (
            <div className="flex justify-between text-muted-foreground">
              <span>주문일시</span>
              <span>
                {new Date(order.orderedAt).toLocaleString("ko-KR", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}
          {order.paymentMethod && (
            <div className="flex justify-between text-muted-foreground">
              <span>결제수단</span>
              <span>
                {order.paymentMethod}
                {order.paymentMethod.includes("카드") ? ` ${cardBrand} ****-${cardLast4}` : ""}
              </span>
            </div>
          )}

          <div className="my-3 border-t border-dashed border-border" />

          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.skuId}>
                <p className="truncate">{item.productName}</p>
                <div className="flex justify-between text-muted-foreground">
                  <span>{item.priceKrw.toLocaleString()} × {item.quantity}</span>
                  <span className="text-foreground">{(item.priceKrw * item.quantity).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="my-3 border-t border-dashed border-border" />

          <div className="flex justify-between text-muted-foreground">
            <span>상품 금액</span>
            <span>{originalAmount.toLocaleString()}원</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>즉시할인</span>
              <span>-{discount.toLocaleString()}원</span>
            </div>
          )}
          <div className="mt-1 flex justify-between text-sm font-bold">
            <span>결제 금액</span>
            <span>{order.totalAmount.toLocaleString()}원</span>
          </div>

          <div className="my-3 border-t border-dashed border-border" />

          {/* ✅ 신규(요청) — 포인트 상세 */}
          <p className="mb-1 font-bold">포인트 안내</p>
          <div className="flex justify-between text-muted-foreground">
            <span>적립대상 결제 금액</span>
            <span>{pointsEligibleAmount.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>사용 포인트</span>
            <span>{pointsUsed.toLocaleString()}P</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>적립 포인트</span>
            <span>+{pointsEarned.toLocaleString()}P</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>가용 포인트</span>
            <span>{shownAvailablePoints.toLocaleString()}P</span>
          </div>
          <p className="mt-2 text-[11px] leading-[16px] text-muted-foreground">
            포인트는 결제 금액의 2%가 적립되며, 적립일로부터 1년간 사용할 수 있어요. 1,000P
            이상부터 결제 시 100P 단위로 사용할 수 있습니다. 포인트 관련 문의는 고객센터
            {FAKE_SUPPORT_PHONE}로 연락해주세요.
          </p>

          <div className="my-3 border-t border-dashed border-border" />

          <p className="text-center text-md text-muted-foreground">이용해 주셔서 감사합니다</p>

          <Barcode value={order.orderId} />

          <div className="my-3 border-t border-dashed border-border" />

          {/* ✅ 신규(요청) — 교환/환불 안내를 영수증 맨 아래에 */}
          <p className="mb-1 font-bold">교환 · 반품 · 환불 안내</p>
          <p className="text-[11px] leading-[16px] text-muted-foreground">
            상품 수령일로부터 7일 이내, 마이페이지 &gt; 교환/반품/환불 내역에서 신청할 수
            있어요. 신선·냉동식품 등 일부 상품은 단순 변심 교환·반품이 제한될 수 있습니다.
            문의: 고객센터 {FAKE_SUPPORT_PHONE}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
