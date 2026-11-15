import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { getStore } from "@/lib/store";
import { forbid } from "../../../_lib/server";
import { commentInput, talkOf, talkTarget } from "../../../_lib/talk";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; cid: string }> };

async function findComment(postId: string, cid: string) {
  return (await (await getStore()).list("PostComments")).find((c) => c.id === cid && c.postId === postId) ?? null;
}

// 댓글 고치기: 쓴 사람만
export async function PATCH(req: Request, ctx: Ctx) {
  const { id, cid } = await ctx.params;
  const t = await talkTarget(id);
  if ("err" in t) return t.err;
  const c = await findComment(t.post.id, cid);
  if (!c) return bad("댓글을 찾을 수 없어요.", 404);
  if (c.memberId !== t.me.row.id) return forbid("내가 쓴 댓글만 고칠 수 있어요.");
  const p = commentInput.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad(p.error.issues[0]?.message ?? "댓글 내용을 확인해 주세요.");
  if (p.data.body !== c.body) await (await getStore()).update("PostComments", c.id, { body: p.data.body, updatedAt: new Date().toISOString() });
  return NextResponse.json(await talkOf(t.me, t.post.id));
}

// 댓글 지우기: 쓴 사람이나 관리자(all/board). 답글이 없어서 행을 그대로 지운다.
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, cid } = await ctx.params;
  const t = await talkTarget(id);
  if ("err" in t) return t.err;
  const c = await findComment(t.post.id, cid);
  if (!c) return bad("댓글을 찾을 수 없어요.", 404);
  if (c.memberId !== t.me.row.id && !t.me.manage) return forbid("내가 쓴 댓글만 지울 수 있어요.");
  await (await getStore()).remove("PostComments", c.id);
  return NextResponse.json(await talkOf(t.me, t.post.id));
}
