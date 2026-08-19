import { Receipt } from "lucide-react";
import { SubpageHeader } from "@/components/domain/subpage-header";

// TODO: 백엔드 연동 전 목업 데이터
const receipts = [
  { id: "1", date: "2026.08.10", store: "코스트코 양재", total: 42800 },
  { id: "2", date: "2026.07.28", store: "코스트코 양재", total: 18500 },
];

export default function ReceiptsPage() {
  return (
    <div className="mx-auto max-w-md p-4 md:max-w-3xl md:p-8">
      <SubpageHeader title="전자 영수증" />
      <div className="divide-y divide-border md:grid md:grid-cols-2 md:gap-4 md:divide-y-0">
        {receipts.map((r) => (
          <button
            key={r.id}
            type="button"
            className="flex w-full items-center gap-3 py-4 text-left md:rounded-sm md:border md:border-border md:p-4"
          >
            <Receipt size={20} className="text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm">{r.store}</p>
              <p className="text-xs text-muted-foreground">{r.date}</p>
            </div>
            <span className="text-sm font-medium">{r.total.toLocaleString()}원</span>
          </button>
        ))}
      </div>
    </div>
  );
}
