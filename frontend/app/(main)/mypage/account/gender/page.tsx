import { SubpageHeader } from "@/components/domain/subpage-header";

// ⚠ 회원가입 시 한 번만 저장되고, 가입 후 수정하는 API가 백엔드에 없습니다.
export default function AccountGenderPage() {
  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title="성별" />
      <p className="py-10 text-center text-sm text-muted-foreground">
        성별 수정 기능은 준비 중이에요.
      </p>
    </div>
  );
}
