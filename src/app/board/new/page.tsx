"use client";

import Link from "next/link";
import { MemberTabs } from "@/components/MemberTabs";
import { PostEditor } from "@/components/board/PostEditor";

export default function NewPostPage() {
  return (
    <main className="app with-tabs">
      <Link href="/board" className="mini" style={{ alignSelf: "flex-start", textDecoration: "none" }}>‹ 홈</Link>
      <h1 className="title">글쓰기</h1>
      <PostEditor />
      <MemberTabs on="board" />
    </main>
  );
}
