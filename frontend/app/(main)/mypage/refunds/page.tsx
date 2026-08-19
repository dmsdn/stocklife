// ⚠ 실제 결제 로직을 안 만들기로 결정되면서 이 화면은 스코프 밖이 되었습니다.
//   삭제하거나(권장), 남겨두더라도 마이페이지 메뉴에서는 링크를 빼야 합니다.
import { SubpageHeader } from "@/components/domain/subpage-header";

// TODO: 백엔드 연동 전 목업 데이터
const refunds = [
  { id: "1", date: "2026.08.05", name: "샴푸 세트", amount: 15900, status: "환불완료" },
  { id: "2", date: "2026.07.20", name: "채소 믹스", amount: 4900, status: "반품접수" },
];

export default function RefundsPage() {
  return (
    <div className="mx-auto max-w-md p-4 md:max-w-3xl md:p-8">
      <SubpageHeader title="취소 / 반품 / 환불 내역" />
      <div className="divide-y divide-border md:grid md:grid-cols-2 md:gap-4 md:divide-y-0">
        {refunds.map((r) => (
          <div key={r.id} className="py-4 md:rounded-sm md:border md:border-border md:p-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{r.date}</span>
              <span>{r.status}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm">{r.name}</span>
              <span className="text-base font-medium">{r.amount.toLocaleString()}원</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
