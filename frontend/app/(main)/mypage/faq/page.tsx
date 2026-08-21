// app/(main)/mypage/faq/page.tsx
// ⚠ 백엔드에 FAQ API가 없어서 목업입니다. 카테고리별로 나눠서 내용을 보강했습니다.
"use client";

import { SubpageHeader } from "@/components/domain/subpage-header";

const faqGroups = [
  {
    category: "주문 / 결제",
    items: [
      { q: "장바구니에 담은 상품은 얼마나 보관되나요?", a: "따로 삭제하지 않는 한 계속 보관됩니다. 리스트별로 나눠 담을 수도 있어요." },
      { q: "결제 수단은 무엇을 지원하나요?", a: "매장 방문 후 카운터에서 결제하는 방식이라, 앱 안에서 별도 결제 수단 등록은 필요하지 않아요." },
      { q: "주문을 취소하고 싶어요.", a: "결제 전이라면 리스트에서 상품을 빼면 됩니다. 결제 후 취소/반품은 마이페이지 > 취소/반품/환불 내역에서 신청할 수 있어요." },
    ],
  },
  {
    category: "장보기 / 동선",
    items: [
      { q: "동선 보기는 어떻게 계산되나요?", a: "지금 리스트에 담긴 상품 중 아직 스캔하지 않은 상품들의 매장 내 위치를 기준으로 최단 동선을 계산해서 지도에 표시해요." },
      { q: "바코드를 스캔했는데 상품을 못 찾아요.", a: "스캔 화면 상단의 리스트 선택이 맞는지 확인해주세요. 그래도 안 되면 바코드가 흐릿하거나 손상됐을 수 있어요." },
      { q: "AI에게 장보기를 맡길 수 있나요?", a: "네, AI 채팅에서 필요한 걸 말씀하시면 리스트를 짜드리고, 매장 안에서는 실시간으로 동선도 안내해드려요." },
    ],
  },
  {
    category: "회원 / 등급",
    items: [
      { q: "회원 등급은 어떻게 정해지나요?", a: "이번 달 누적 결제금액 기준으로 베이직/브론즈/실버/골드 4단계로 나뉘고, 매달 초기화돼요." },
      { q: "비회원도 이용할 수 있나요?", a: "검색, AI 채팅, 스캔 기능은 비회원도 이용할 수 있어요. 구매내역 조회나 등급 혜택은 회원가입 후 이용 가능해요." },
      { q: "비밀번호를 잊어버렸어요.", a: "로그인 화면의 '비밀번호 재설정'에서 가입한 전화번호로 인증 후 새 비밀번호를 설정할 수 있어요." },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title="FAQ" />

      <div className="space-y-6">
        {faqGroups.map((group) => (
          <div key={group.category}>
            <p className="mb-2 text-sm font-semibold text-muted-foreground">{group.category}</p>
            <div className="divide-y divide-border">
              {group.items.map((item, i) => (
                <details key={i} className="py-4">
                  <summary className="cursor-pointer text-sm">{item.q}</summary>
                  <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
