import { SubpageHeader } from "@/components/domain/subpage-header";

// TODO: 실제 등급 기준/혜택 확정 전 자리표시자 — 정해지면 이 배열만 교체
const tiers = [
  { name: "일반", requirement: "가입 시 기본 등급", benefit: "포인트 1% 적립" },
  { name: "실버", requirement: "최근 3개월 누적 30만원 이상", benefit: "포인트 1.5% 적립" },
  { name: "골드", requirement: "최근 3개월 누적 80만원 이상", benefit: "포인트 2% 적립 + 무료배송" },
];

export default function TierGuidePage() {
  return (
    <div className="mx-auto max-w-md p-4 md:max-w-3xl md:p-8">
      <SubpageHeader title="등급 안내" />
      <div className="space-y-3 md:grid md:grid-cols-3 md:gap-4 md:space-y-0">
        {tiers.map((t) => (
          <div key={t.name} className="rounded-sm border border-border p-4">
            <p className="text-base font-medium">{t.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.requirement}</p>
            <p className="mt-2 text-sm">{t.benefit}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
