"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { MemberTabs } from "@/components/MemberTabs";
import { api } from "@/lib/client";

type Me = { perms: string[]; clubOfficerOf?: string[] };

// 관리자 화면에서 처음 열 메뉴: 모임설정 → 회원관리 → 일정관리 → 소모임관리 → 활동템플릿 중 쓸 수 있는 첫 화면.
function firstMode(me: Me): string {
  const p = me.perms;
  const has = (...k: string[]) => p.includes("all") || k.some((x) => p.includes(x));
  if (has("group")) return "/admin/settings";
  if (has("members")) return "/admin/members";
  if (has("events")) return "/admin/events";
  if (has("clubs") || (me.clubOfficerOf ?? []).length) return "/admin/clubs";
  if (has("templates")) return "/admin/templates";
  // 일정 만들기 권한만 있으면 회원 일정 화면에서 만든다
  if (has("evMain", "evClub")) return "/events";
  return "/admin/members";
}

function Go({ me }: { me: Me }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(firstMode(me));
  }, [router, me]);
  return <p className="small">이동 중이에요…</p>;
}

// 관리자 입구. 관리자는 2차 비밀번호를 통과한 뒤 첫 메뉴로,
// 관리자 권한 없이 소모임 직책만 있으면 비밀번호 없이 바로 소모임관리로 간다.
export default function AdminHome() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<Me>("/api/me").then((r) => {
      if (!r.ok) return router.replace("/");
      if (r.data.perms.length === 0 && (r.data.clubOfficerOf ?? []).length > 0) return router.replace("/admin/clubs");
      setMe(r.data);
    });
  }, [router]);
  if (!me) return <main className="app admin with-tabs"><p className="small">불러오는 중이에요…</p><MemberTabs on="admin" /></main>;
  return <AdminGate><Go me={me} /></AdminGate>;
}
