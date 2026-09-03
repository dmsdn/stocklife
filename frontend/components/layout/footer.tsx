import Link from "next/link";

interface FooterProps {
  /** ✅ 신규 — 페이지마다 본문 좌우 padding이 달라서(홈 px-3, 마이페이지 px-5) 푸터
   *  텍스트가 본문과 다른 위치에서 시작되는 것처럼 보였음. 페이지가 자기 본문과 같은
   *  값을 넘기면 정렬이 맞음. 안 넘기면 기존 기본값(px-4) 그대로. */
  paddingClassName?: string;
}

// ✅ 수정(2026-09) — 예전엔 main의 하단탭바 예약 padding(pb-16) 영역까지 배경을 끌어오려고
//   음수 마진(-mb) 트릭을 썼는데, margin은 부모의 padding 영역엔 절대 끼어들지 않아서
//   (padding은 margin 상쇄 대상이 아님) 실제로는 안 먹히고 계속 색이 다른 여백이 남아
//   보이는 원인이었음. 이제 이 트릭 자체를 없앴습니다 — 대신 Footer를 쓰는 페이지가
//   useBottomBarVisibility().setNoReserve(true)를 호출해서 main이 그 padding을 아예 안
//   만들게 하고, Footer는 평범하게 자기 padding-bottom으로 탭바 높이만큼만 확보합니다.
//   그래서 그 영역은 항상 Footer 자신의 배경색(bg-muted)으로, 다른 트릭 없이 그냥 정상적인
//   박스 모델로 칠해집니다.
export function Footer({ paddingClassName = "px-4 md:px-8" }: FooterProps) {
  return (
    <footer
      className={`space-y-4 bg-muted ${paddingClassName} pb-[calc(4rem+env(safe-area-inset-bottom)+2rem)] pt-8 text-xs text-muted-foreground md:pb-8`}
    >
      <img src="/icons/logo-shopping.svg" alt="로고" className="h-6" />

      <div className="flex items-center gap-2">
        <Link href="/mypage/terms">약관</Link>
        <span>|</span>
        <Link href="/mypage/support">고객센터</Link>
        <span>|</span>
        <span>PC버전</span>
      </div>

      <div className="space-y-1">
        {/* TODO: 실제 사업자 정보로 교체 */}
        <p>애지중지</p>
        <p>서울특별시 강남구 테헤란로 5길 20</p>
        <p>대표 이메일 | 기타 연락처</p>
      </div>

      <p>Copyright © 애지중지 All rights Reserved.</p>
    </footer>
  );
}
