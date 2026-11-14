"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AdminGate } from "@/components/AdminGate";
import { api } from "@/lib/client";

// 관리자 입구: 2차 비밀번호를 통과하면 회원관리 화면으로 간다.
// 회원관리 권한이 없으면 활동 템플릿(활동·일정 권한), 그것도 없으면 일정 페이지(일정 관리는 일정에서 한다).
function Go() {
  const router = useRouter();
  useEffect(() => {
    api<{ perms: string[] }>("/api/me").then((r) => {
      const p = r.ok ? r.data.perms : [];
      const has = (...k: string[]) => p.includes("all") || k.some((x) => p.includes(x));
      router.replace(has("members") ? "/admin/members" : has("activities", "events") ? "/admin/templates" : "/events");
    });
  }, [router]);
  return <p className="small">이동 중이에요…</p>;
}

export default function AdminHome() {
  return <AdminGate><Go /></AdminGate>;
}
