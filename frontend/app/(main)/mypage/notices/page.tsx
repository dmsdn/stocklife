import { SubpageHeader } from "@/components/domain/subpage-header";

// TODO: 백엔드 연동 전 목업 데이터
const notices = [
  { id: "1", title: "정기 점검 안내", date: "2026.08.09" },
  { id: "2", title: "여름 휴무일 안내", date: "2026.07.30" },
];

export default function NoticesPage() {
  return (
    <div className="mx-auto max-w-md p-4 md:max-w-2xl md:p-8">
      <SubpageHeader title="공지사항" />
      <div className="divide-y divide-border">
        {notices.map((n) => (
          <button key={n.id} type="button" className="block w-full py-4 text-left">
            <p className="text-sm">{n.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{n.date}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
