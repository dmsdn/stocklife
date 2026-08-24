"use client";
import { CategoryList } from "@/components/domain/category-list";

export default function InfoPage() {
  return (
    <CategoryList
      title="정보"
      items={[
        { href: "/mypage/account", label: "내 정보" },
        { href: "/mypage/notices", label: "공지사항" },
        { href: "/mypage/terms", label: "이용약관" },
      ]}
    />
  );
}
