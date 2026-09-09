// components/domain/promo-banner.tsx
// ✅ 배너 목업 원본(Group 388 / Group 368)에서 텍스트와 이미지를 분리해 반응형으로 재구성.
//   - 배경색은 CSS로 처리 (원본 PNG의 배경색을 그대로 hex로 추출: #F7AE93, #92ECBD)
//   - 텍스트는 실제 DOM 텍스트로 렌더링 (이미지에 박혀있지 않음) → 폰트 스케일링/줄바꿈/접근성 확보
//   - 그래픽(폰+QR, 로봇)만 배경을 투명 처리해서 별도 PNG로 추출, 컨테이너 오른쪽에 비율 기반으로 배치
// ✅ 수정(요청 — "배너 높이 120으로 고정, 텍스트는 좌측 상단에서 20px로 고정") — 이전엔
//   원본 캔버스 비율(360:141)을 aspect-[]로 유지해서 카드 폭에 따라 높이가 같이 변했는데,
//   이제 높이를 120px로 고정하고, 텍스트도 세로 중앙 정렬 대신 좌상단에서 20px 띄운
//   고정 위치로 바꿨습니다. 폰트 크기는 카드 폭이 아니라 화면 폭(vw) 기준 그대로 둬서
//   높이가 고정돼도 글자가 이상하게 커지지 않게 함.

import Image, { type StaticImageData } from "next/image";

interface PromoBannerProps {
  bgColor: string;
  title: string;
  subtitle: string;
  imageSrc: string | StaticImageData;
  /** 그래픽 영역이 배너 전체 폭에서 차지하는 비율 (0~1). imageSize를 주면 무시됨. */
  imageWidthRatio?: number;
  /** 그래픽 영역이 배너 전체 높이에서 차지하는 비율 (0~1). imageSize를 주면 무시됨. */
  imageHeightRatio?: number;
  /** ✅ 신규(요청) — 배너 폭에 비례하는 대신 고정 px 크기(정사각형). 지정하면
   *  imageWidthRatio/imageHeightRatio보다 우선. */
  imageSize?: number;
  className?: string;
}

export function PromoBanner({
  bgColor,
  title,
  subtitle,
  imageSrc,
  imageWidthRatio,
  imageHeightRatio = 1,
  imageSize,
  className = "",
}: PromoBannerProps) {
  return (
    <div
      className={`relative flex h-[120px] w-full items-center overflow-hidden rounded-[20px] ${className}`}
      style={{ backgroundColor: bgColor }}
    >
      {/* ✅ 텍스트 영역 — 세로 중앙 정렬(justify-center) 대신 좌측 상단에서 20px 고정
          (absolute + top-5 left-5). 이미지 영역과 안 겹치게 오른쪽 여백만 확보. */}
      <div className="absolute left-5 top-5 flex min-w-0 flex-col gap-1 pr-2" style={{ right: imageSize ? `${imageSize}px` : undefined }}>
        <p className="line-clamp-1 text-[clamp(13px,4.2vw,18px)] font-bold leading-snug text-black">
          {title}
        </p>
        <p className="line-clamp-1 text-[clamp(10px,3vw,13px)] leading-snug text-[#474747]">
          {subtitle}
        </p>
      </div>

      {/* 그래픽 영역 — imageSize가 있으면 고정 px(정사각형), 없으면 예전처럼 배너 폭 대비 비율 */}
      <div
        className="relative h-full shrink-0 self-end ml-auto"
        style={
          imageSize != null
            ? { width: `${imageSize}px`, height: `${imageSize}px` }
            : { width: `${(imageWidthRatio ?? 0) * 100}%`, height: `${imageHeightRatio * 100}%` }
        }
      >
        <Image src={imageSrc} alt="" fill className="object-contain object-bottom" sizes="(max-width: 768px) 40vw, 200px" />
      </div>
    </div>
  );
}
