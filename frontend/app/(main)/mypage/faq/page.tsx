import { SubpageHeader } from "@/components/domain/subpage-header";

// TODO: 실제 FAQ 문항 확정 전 자리표시자
const faqs = [
  { q: "장바구니에 담은 상품은 얼마나 보관되나요?", a: "장바구니에 담은 상품은 별도로 삭제하기 전까지 계속 보관됩니다." },
  { q: "포인트는 언제 적립되나요?", a: "결제 완료 즉시 결제금액의 2%가 적립됩니다." },
  { q: "매장 방문 없이 주문만 할 수 있나요?", a: "현재는 매장 방문 구매를 기준으로 동작하는 서비스입니다." },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-md p-4 md:max-w-2xl md:p-8">
      <SubpageHeader title="FAQ" />
      <div className="divide-y divide-border">
        {faqs.map((item, i) => (
          <details key={i} className="py-4">
            <summary className="cursor-pointer text-sm">{item.q}</summary>
            <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
