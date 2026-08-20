"use client";

import { Search } from "lucide-react";

type HomeSearchProps = {
  onClick: () => void;
};

export function HomeSearch({
  onClick,
}: HomeSearchProps) {
  return (
    <section className="w-full px-4 pt-4 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onClick}
        className="flex h-11 w-full items-center gap-3 rounded-sm bg-muted/70 px-3.5 text-left sm:h-12"
      >
        <Search
          size={18}
          className="shrink-0 text-muted-foreground"
        />

        <span className="truncate text-sm text-muted-foreground">
          찾고 싶은 상품을 검색해보세요
        </span>
      </button>
    </section>
  );
}