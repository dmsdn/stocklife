import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SimpleMarkdown } from "@/components/domain/simple-markdown";
import { legalDocs, allTermsOrder } from "@/lib/legal-content";

export default function TermsFullPage() {
  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/mypage">
          <ChevronLeft size={20} />
        </Link>
        <p className="text-base">이용약관</p>
      </div>

      <div className="space-y-8">
        {allTermsOrder.map((id) => (
          <section key={id} className="space-y-3 border-b border-border pb-8 last:border-none">
            <p className="text-lg font-medium">{legalDocs[id].title}</p>
            <SimpleMarkdown content={legalDocs[id].body} />
          </section>
        ))}
      </div>
    </div>
  );
}
