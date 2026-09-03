import Link from "next/link";

interface FooterProps {
  /** ✅ 신규 — 페이지마다 본문 좌우 padding이 달라서(홈 px-3, 마이페이지 px-5) 푸터
   *  텍스트가 본문과 다른 위치에서 시작되는 것처럼 보였음. 페이지가 자기 본문과 같은
   *  값을 넘기면 정렬이 맞음. 안 넘기면 기존 기본값(px-4) 그대로. */
  paddingClassName?: string;
}

// ✅ 하단 플로팅 탭바가 항상 화면 아래 떠 있어서(AppShell이 main에 pb 여백을 이미 확보해둠),
//   푸터가 그 여백 바로 위에서 끝나면 배경색이 다른 여백이 살짝 보였음. 푸터 전체를 위로
//   옮기는 대신, 배경(-mb로 그 여백까지 그대로 채움)만 아래까지 늘리고 텍스트는 그 여백만큼
//   더 위쪽에 오도록 안쪽 padding을 키워서 "글자만 탭바 위, 배경은 끝까지" 되게 함.
export function Footer({ paddingClassName = "px-4 md:px-8" }: FooterProps) {
  return (
    <footer className={`-mb-[calc(4rem+env(safe-area-inset-bottom))] space-y-4 bg-muted ${paddingClassName} pb-[calc(4rem+env(safe-area-inset-bottom)+2rem)] pt-8 text-xs text-muted-foreground md:mb-0 md:pb-8`}>
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
