import Link from "next/link";

export function Footer() {
  return (
    <footer className="space-y-4 bg-muted px-4 py-8 text-xs text-muted-foreground md:px-8">
      <img src="/icons/logo-mart.svg" alt="로고" className="h-6" />

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
