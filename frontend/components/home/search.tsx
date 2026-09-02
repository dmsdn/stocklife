"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RiSearchLine } from "@remixicon/react";

import { readSearchHistory } from "@/lib/search-history";

type HomeSearchProps = {
  onClick: () => void;
};

export function HomeSearch({
  onClick,
}: HomeSearchProps) {
  // ✅ 홈 대시보드에 있던 "최근 검색어"를 검색바 바로 아래로 옮김(검색과 붙어 있는 게
  //   더 자연스러운 위치). localStorage는 서버에 없어 렌더 중 바로 읽으면 hydration
  //   mismatch가 나서, 마운트 후 useEffect에서만 채웁니다.
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    setRecentSearches(readSearchHistory().slice(0, 5));
  }, []);

  return (
    <section className="w-full px-4 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onClick}
        className="flex h-12 w-full items-center gap-3 rounded-xl bg-muted px-4 text-left sm:h-12"
      >
        <RiSearchLine
          size={24}
          className="shrink-0 text-muted-foreground"
        />

        <span className="truncate text-sm text-muted-foreground">
          찾고 싶은 상품을 검색해보세요
        </span>
      </button>

      {recentSearches.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">최근 검색</span>
          {recentSearches.map((word) => (
            <Link
              key={word}
              href={`/search?keyword=${encodeURIComponent(word)}`}
              className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
            >
              {word}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}