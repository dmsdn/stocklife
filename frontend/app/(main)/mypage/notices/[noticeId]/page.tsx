"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { fetchNotice, type Notice } from "@/lib/notices";

export default function NoticeDetailPage() {
  const params = useParams();
  const [notice, setNotice] = useState<Notice | null | undefined>(undefined);

  useEffect(() => {
    fetchNotice(String(params.noticeId)).then(setNotice);
  }, [params.noticeId]);

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title="공지사항" />
      {notice === undefined && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}
      {notice === null && <p className="py-10 text-center text-sm text-muted-foreground">공지를 찾을 수 없어요.</p>}
      {notice && (
        <div>
          <p className="text-lg font-medium">{notice.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{notice.date}</p>
          <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{notice.body}</p>
        </div>
      )}
    </div>
  );
}
