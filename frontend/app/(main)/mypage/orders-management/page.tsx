"use client";
import { CategoryList } from "@/components/domain/category-list";

export default function OrdersManagementPage() {
  return (
    <CategoryList
      title="주문 관리"
      items={[
        { href: "/mypage/receipts", label: "전자 영수증" },
        { href: "/mypage/refunds", label: "취소/반품/환불" },
      ]}
    />
  );
}
