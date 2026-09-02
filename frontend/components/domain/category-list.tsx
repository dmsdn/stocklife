import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SubpageHeader } from "./subpage-header";

interface CategoryListItem {
  href: string;
  label: string;
}

export function CategoryList({ title, items }: { title: string; items: CategoryListItem[] }) {
  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title={title} />
      <div className="divide-y divide-border">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="flex items-center justify-between py-3 text-sm">
            {item.label}
            <ChevronRight size={24} className="text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
