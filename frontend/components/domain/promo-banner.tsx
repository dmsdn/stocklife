// components/domain/promo-banner.tsx
// ✅ 배너 목업 원본(Group 388 / Group 368)에서 텍스트와 이미지를 분리해 반응형으로 재구성.
//   - 배경색은 CSS로 처리 (원본 PNG의 배경색을 그대로 hex로 추출: #F7AE93, #92ECBD)
//   - 텍스트는 실제 DOM 텍스트로 렌더링 (이미지에 박혀있지 않음) → 폰트 스케일링/줄바꿈/접근성 확보
//   - 그래픽(폰+QR, 로봇)만 배경을 투명 처리해서 별도 PNG로 추출, 컨테이너 오른쪽에 비율 기반으로 배치
//   - 컨테이너는 원본 캔버스 비율(360:141)을 aspect-[]로 유지 → 카드/캐러셀 폭이 달라져도 배너 비율 고정
//   - 폰트 크기는 clamp()로 컨테이너 폭에 비례해 스케일 (뷰포트 vw 기준, 카드 폭이 뷰포트에 비례하는 모바일 환경 가정)

import Image, { type StaticImageData } from "next/image";

interface PromoBannerProps {
  bgColor: string;
  title: string;
  subtitle: string;
  imageSrc: string | StaticImageData;
  /** 그래픽 영역이 배너 전체 폭에서 차지하는 비율 (0~1) */
  imageWidthRatio: number;
  /** 그래픽 영역이 배너 전체 높이에서 차지하는 비율 (0~1). 1이면 배너 상하 끝까지 꽉 채움 */
  imageHeightRatio?: number;
  className?: string;
}

export function PromoBanner({
  bgColor,
  title,
  subtitle,
  imageSrc,
  imageWidthRatio,
  imageHeightRatio = 1,
  className = "",
}: PromoBannerProps) {
  return (
    <div
      className={`relative flex aspect-[360/141] w-full items-center overflow-hidden rounded-[20px] ${className}`}
      style={{ backgroundColor: bgColor }}
    >
      {/* 텍스트 영역 — 이미지 폭만큼 자동으로 줄어드는 flex-1, 내용이 길어지면 1줄로 말줄임 */}
      <div className="flex h-full min-w-0 flex-1 flex-col justify-center gap-1 py-4 pl-5 pr-2">
        <p className="line-clamp-1 text-[clamp(13px,4.2vw,18px)] font-bold leading-snug text-black">
          {title}
        </p>
        <p className="line-clamp-1 text-[clamp(10px,3vw,13px)] leading-snug text-[#474747]">
          {subtitle}
        </p>
      </div>

      {/* 그래픽 영역 — 배너 폭 대비 비율로 크기 고정, 하단 정렬 */}
      <div
        className="relative h-full shrink-0 self-end"
        style={{ width: `${imageWidthRatio * 100}%`, height: `${imageHeightRatio * 100}%` }}
      >
        <Image src={imageSrc} alt="" fill className="object-contain object-bottom" sizes="(max-width: 768px) 40vw, 200px" />
      </div>
    </div>
  );
}
