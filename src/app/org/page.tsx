"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { MemberTabs } from "@/components/MemberTabs";
import { OrgView } from "@/components/OrgView";

// 조직도(읽기 전용). 하단 탭에서는 빠졌고 홈 화면 "조직도" 아이콘으로 연다. 이 주소로 바로 들어와도 보인다.
export default function OrgPage() {
  const router = useRouter();
  const toLogin = useCallback(() => router.replace("/"), [router]);
  return (
    <main className="app with-tabs">
      <h1 className="title">조직도</h1>
      <OrgView onUnauthorized={toLogin} />
      <MemberTabs on="board" />
    </main>
  );
}
