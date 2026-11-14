import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { notifyPost } from "@/lib/notify";
import { getStore } from "@/lib/store";
import { parsePost, sortPosts, summaries } from "./_lib/posts";
import { canSee, ensureBoard, forbid, getMe } from "./_lib/server";

export const dynamic = "force-dynamic";

// 게시글 목록: 나에게 공개된 글만, 고정 글 먼저 그다음 최신순.
export async function GET() {
  const m = await getMe();
  if ("err" in m) return m.err;
  await ensureBoard();
  const { me } = m;
  const posts = (await (await getStore()).list("Posts")).filter((p) => canSee(me, p)).sort(sortPosts);
  return NextResponse.json({
    posts: await summaries(me, posts),
    me: { canWrite: me.canWrite, manage: me.manage, isAll: me.isAll, tplAdmin: me.tplAdmin },
  });
}

// 글쓰기: 관리자(all/board)와 소모임 직책자. 회칙 글은 전체 관리자만.
export async function POST(req: Request) {
  const m = await getMe();
  if ("err" in m) return m.err;
  const { me } = m;
  if (!me.canWrite) return forbid("글은 관리자와 소모임 직책자만 쓸 수 있어요.");
  const parsed = await parsePost(await req.json().catch(() => null), me);
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  const now = new Date().toISOString();
  const row = await (await getStore()).insert("Posts", { ...parsed.v, files: "[]", authorId: me.row.id, createdAt: now, updatedAt: now });
  await notifyPost(row.id, "new").catch(() => undefined);
  return NextResponse.json({ id: row.id });
}
