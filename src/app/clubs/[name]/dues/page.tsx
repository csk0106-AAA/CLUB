"use client";

import Link from "next/link";
import { use } from "react";
import { ClubDuesEditor } from "@/components/ClubDuesEditor";
import { MemberTabs } from "@/components/MemberTabs";

// 클럽 회비(회원 화면): 클럽 회장(대표)이 회비를 정하고 게시글로 올린다. 관리자도 열 수 있다.
// 권한은 API(/api/clubs/[이름]/dues)가 확인한다.
export default function ClubDuesPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  let club = name;
  try {
    club = decodeURIComponent(name);
  } catch {
    /* 그대로 */
  }
  return (
    <main className="app with-tabs">
      <Link href="/settings" className="mini" style={{ alignSelf: "flex-start", textDecoration: "none" }}>‹ 설정</Link>
      <h1 className="title">클럽 회비</h1>
      <ClubDuesEditor club={club} />
      <MemberTabs on="settings" />
    </main>
  );
}
