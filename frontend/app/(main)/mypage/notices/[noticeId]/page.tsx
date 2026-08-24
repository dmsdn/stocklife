import { notices } from "../page";
import { SubpageHeader } from "@/components/domain/subpage-header";

export default function NoticeDetailPage({ params }: { params: { noticeId: string } }) {
  const notice = notices.find((n) => n.id === params.noticeId);

  return (
    <div className="mx-auto max-w-md p-4 md:max-w-2xl md:p-8">
      <SubpageHeader title="공지사항" />
      {!notice ? (
        <p className="py-10 text-center text-sm text-muted-foreground">공지를 찾을 수 없어요.</p>
      ) : (
        <div>
          <p className="text-lg font-medium">{notice.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{notice.date}</p>
          <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{notice.body}</p>
        </div>
      )}
    </div>
  );
}
