"use client";
import { CategoryList } from "@/components/domain/category-list";

export default function BenefitsPage() {
  return (
    <CategoryList
      title="혜택"
      items={[
        { href: "/mypage/tier-guide", label: "등급 안내" },
        { href: "/mypage/points", label: "포인트" },
        { href: "/mypage/coupons", label: "쿠폰" },
      ]}
    />
  );
}
