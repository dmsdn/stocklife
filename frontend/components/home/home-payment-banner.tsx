// components/home/home-payment-banner.tsx
// ✅ 참고 이미지(Frame 123/136) "앱으로 결제하면 포인트 두 배" 배너.
//   이미 있던 components/domain/promo-banner.tsx + public/banners/promo-points.png
//   (배경 투명 처리된 폰+QR 그래픽, 원본 배경색 #F7AE93)를 그대로 사용 — 새로 안 만듦.
//   실제 결제수단 연동 기능은 없어서 클릭 동작 없는 정적 배너로만 둠.
import { PromoBanner } from "@/components/domain/promo-banner";

export function HomePaymentBanner() {
  return (
    <section className="w-full px-4 sm:px-6 lg:px-8">
      <PromoBanner
        bgColor="#F7AE93"
        title="앱으로 결제하면 포인트 두 배"
        subtitle="포인트를 적립할수록 더 많은 혜택이 있어요!"
        imageSrc="/banners/promo-points.png"
        imageWidthRatio={110 / 360}
        imageHeightRatio={1}
      />
    </section>
  );
}
