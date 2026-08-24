import { SubpageHeader } from "@/components/domain/subpage-header";

// TODO: 백엔드 연동 전 목업 데이터
const recentItems = [
  { id: "1", name: "상품 이름", price: 10000 },
  { id: "2", name: "상품 이름", price: 10000 },
  { id: "3", name: "상품 이름", price: 10000 },
  { id: "4", name: "상품 이름", price: 10000 },
];

export default function RecentPage() {
  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-3xl md:p-8">
      <SubpageHeader title="최근 본" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {recentItems.map((item) => (
          <div key={item.id}>
            {/* TODO: 상품 이미지 자리 */}
            <div className="mb-2 aspect-square rounded-sm border border-border bg-muted" />
            <p className="text-sm">{item.name}</p>
            <p className="text-sm font-medium">{item.price.toLocaleString()}원</p>
          </div>
        ))}
      </div>
    </div>
  );
}
