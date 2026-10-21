// lib/use-media-query.ts
"use client";

import { useEffect, useState } from "react";
import { getAppFrame, getAppFrameWidth } from "@/lib/app-frame";

// 가로폭 조건((min-width: Npx) / (max-width: Npx))은 브라우저 창이 아니라
// 모바일 화면 틀의 가로폭 기준으로 판단한다. PC에서 창을 넓혀도 틀은 모바일 폭이라
// "(min-width: 768px)" 같은 데스크톱 조건은 항상 false가 된다.
function matchesFrameWidth(query: string): boolean | null {
  const min = /\(\s*min-width:\s*(\d+)px\s*\)/.exec(query);
  const max = /\(\s*max-width:\s*(\d+)px\s*\)/.exec(query);
  if (!min && !max) return null; // 가로폭 조건이 아니면 브라우저 matchMedia로 처리

  const width = getAppFrameWidth();
  if (min && width < Number(min[1])) return false;
  if (max && width > Number(max[1])) return false;
  return true;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const frameResult = matchesFrameWidth(query);

    if (frameResult !== null) {
      const update = () => setMatches(matchesFrameWidth(query) ?? false);
      update();
      const frame = getAppFrame();
      if (!frame) {
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
      }
      const observer = new ResizeObserver(update);
      observer.observe(frame);
      return () => observer.disconnect();
    }

    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
