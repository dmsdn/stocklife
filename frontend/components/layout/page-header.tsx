// ⚠ 홈/AI 화면이 HomeAiHeader로 다시 짜이면서, 이 컴포넌트는 더 이상 어디서도 import되지
//   않습니다. 안 쓰면 삭제해도 되는 파일입니다.
import { Bell } from "lucide-react";

export function PageHeader() {
  return (
    <header className="flex items-center justify-between px-4 py-3 md:justify-end md:gap-4 md:px-8">
      {/* TODO: 로고 자리 — 데스크톱은 사이드바 로고와 중복이라 숨김 */}
      <span className="text-lg font-semibold md:hidden">쇼핑</span>
      <div className="flex items-center gap-3">
        <span className="rounded-full border border-border px-3 py-1 text-xs">AI이름 on</span>
        <Bell size={18} />
      </div>
    </header>
  );
}
