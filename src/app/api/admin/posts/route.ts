import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { postStatus } from "@/lib/post-period";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 관리자 › 게시글관리: 게시 기간이 지난 글·예정 글까지 모든 게시글(모든 권한·게시글 글쓰기 권한)
export async function GET() {
  const g = await guard(["all", "write"]);
  if ("err" in g) return g.err;
  const s = await getStore();
  const [posts, members] = await Promise.all([s.list("Posts"), s.list("Members")]);
  const nm = new Map(members.map((m) => [m.id, m.name]));
  return NextResponse.json({
    posts: posts
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .map((p) => ({
        id: p.id, form: p.form, title: p.title ?? "", authorName: nm.get(p.authorId) ?? "", createdAt: p.createdAt ?? "", updatedAt: p.updatedAt ?? "",
        notice: p.notice === "true", pinned: p.pinned === "true",
        postFrom: p.postFrom ?? "", postUntil: p.postUntil ?? "", status: postStatus(p), // live 게시 중 / before 게시 전 / ended 게시 종료
      })),
  });
}
