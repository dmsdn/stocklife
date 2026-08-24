import Link from "next/link";
import { SubpageHeader } from "@/components/domain/subpage-header";

// TODO: 백엔드에 공지사항 API 없음 — 목업 데이터
export const notices = [
  { id: "1", title: "정기 점검 안내", date: "2026.08.09", body: "8월 12일(수) 새벽 2시~4시 서비스 정기 점검이 진행됩니다. 점검 시간 동안 앱 이용이 일시적으로 제한될 수 있어요." },
  { id: "2", title: "여름 휴무일 안내", date: "2026.07.30", body: "광복절(8월 15일)은 매장 휴무일입니다. 온라인 리스트 저장과 AI 채팅은 정상 이용 가능해요." },
  { id: "3", title: "동선 안내 기능 업데이트", date: "2026.07.20", body: "매장 내 실시간 동선 안내 기능이 새롭게 추가됐습니다. 저장한 리스트에서 '동선 보기'를 눌러보세요." },
];

export default function NoticesPage() {
  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title="공지사항" />
      <div className="divide-y divide-border">
        {notices.map((n) => (
          <Link key={n.id} href={`/mypage/notices/${n.id}`} className="block w-full py-4 text-left">
            <p className="text-sm">{n.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{n.date}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
