// components/home/home-greeting.tsx
// ✅ 신규 — Hero Card 위에 오는 짧은 개인화 인사. 기존 lib/consumer-api.ts의
//   getMyProfile()(이미 HomeTop 등에서 쓰던 실제 GET /api/consumers/me)을 재사용합니다.
//   비로그인이거나 실패하면 이름 없이 일반 인사만 보여줍니다.
"use client";

import { useEffect, useState } from "react";
import { getMyProfile } from "@/lib/consumer-api";
import { isLoggedIn } from "@/lib/api-client";

export function HomeGreeting() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) return;
    getMyProfile()
      .then((p) => setName(p.name))
      .catch(() => setName(null));
  }, []);

  return (
    <section className="w-full px-4 sm:px-6 lg:px-8">
      <p className="text-xl font-bold leading-tight">
        {name ? `${name}님, 안녕하세요` : "안녕하세요"}
      </p>
    </section>
  );
}
