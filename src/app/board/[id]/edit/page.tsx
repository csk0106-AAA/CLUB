"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MemberTabs } from "@/components/MemberTabs";
import { PostEditor } from "@/components/board/PostEditor";
import type { PostDetail } from "@/components/board/types";
import { api } from "@/lib/client";

export default function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [d, setD] = useState<PostDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<PostDetail>(`/api/board/${encodeURIComponent(id)}`).then((r) => {
      if (r.ok) {
        // 회칙·회비 글은 관리 화면에서 고친다
        if (r.data.manageHref) return router.replace(r.data.manageHref);
        setD(r.data);
      } else if (r.status === 401) router.replace("/");
      else setError(r.error);
    });
  }, [id, router]);

  const managed = d && (d.post.form === "fee" || d.post.form === "rules");
  return (
    <main className="app with-tabs">
      <Link href={`/board/${id}`} className="mini" style={{ alignSelf: "flex-start", textDecoration: "none" }}>‹ 글로 돌아가기</Link>
      <h1 className="title">게시글 수정</h1>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!d && !error && <p className="small">불러오는 중이에요…</p>}
      {d && !d.canEdit && (
        <div className="msg bad" role="alert">
          {managed ? "회칙·회비 글은 담당 관리자(소모임 회비는 소모임 회장)만 관리 화면에서 고칠 수 있어요." : "작성자나 관리자만 수정할 수 있어요."}
        </div>
      )}
      {d && d.canEdit && <PostEditor initial={d.post} />}
      <MemberTabs on="board" />
    </main>
  );
}
