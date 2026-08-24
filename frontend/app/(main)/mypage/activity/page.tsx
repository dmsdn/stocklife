"use client";
import { CategoryList } from "@/components/domain/category-list";

export default function ActivityPage() {
  return (
    <CategoryList
      title="활동"
      items={[
        { href: "/saved", label: "저장한 리스트" },
        { href: "/mypage/recent", label: "최근 본 상품" },
        { href: "/mypage/notifications", label: "알림 설정" },
      ]}
    />
  );
}
