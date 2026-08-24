"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { fetchNotices, type Notice } from "@/lib/notices";

export default function NoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    fetchNotices().then(setNotices);
  }, []);

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
