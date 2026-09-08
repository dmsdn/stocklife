// components/home/home-login-banner.tsx
// ✅ 참고 이미지(Frame 137) "장보기 리스트, 간편하게 만들어보세요" 민트 배너.
//   이미 있던 components/domain/promo-banner.tsx + public/banners/promo-list.png
//   (배경 투명 처리된 리브 로봇 그래픽, 원본 배경색 #92ECBD)를 그대로 사용 — 새로 안 만듦.
//   비로그인 상태에서만 노출, 누르면 로그인 화면으로 이동.
import Link from "next/link";
import { PromoBanner } from "@/components/domain/promo-banner";

export function HomeLoginBanner() {
  return (
    <section className="w-full px-4 sm:px-6 lg:px-8">
      <Link href="/auth/login" className="block">
        <PromoBanner
          bgColor="#92ECBD"
          title="장보기 리스트, 간편하게 만들어보세요"
          subtitle="리브에게 물어보고 3초 만에 리스트 완성!"
          imageSrc="/banners/promo-list.png"
          imageSize={100}
        />
      </Link>
    </section>
  );
}
