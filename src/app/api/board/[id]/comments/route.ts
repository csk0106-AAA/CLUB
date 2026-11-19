import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { pushTo } from "@/lib/push";
import { getStore } from "@/lib/store";
import { replyParent } from "@/lib/comments";
import { commentInput, talkOf, talkTarget } from "../../_lib/talk";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 반응·댓글 다시 읽기
export async function GET(_req: Request, ctx: Ctx) {
  const t = await talkTarget((await ctx.params).id);
  if ("err" in t) return t.err;
  return NextResponse.json(await talkOf(t.me, t.post.id));
}

// 댓글 쓰기: 글쓴이에게 종 알림(lib/unread.ts commentAlertsOf) + 내용 없는 휴대폰 알림. 내 글에 쓴 댓글은 알리지 않는다.
export async function POST(req: Request, ctx: Ctx) {
  const t = await talkTarget((await ctx.params).id);
  if ("err" in t) return t.err;
  const p = commentInput.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad(p.error.issues[0]?.message ?? "댓글 내용을 확인해 주세요.");
  const now = new Date().toISOString();
  const s = await getStore();
  const all = await s.list("PostComments");
  // 답글: 원댓글이 이 글의 댓글이어야 한다(답글의 답글은 원댓글 아래로)
  const parentId = replyParent(all, p.data.parentId, (c) => c.postId === t.post.id);
  if (parentId === false) return bad("답글을 달 댓글을 찾을 수 없어요.", 404);
  await s.insert("PostComments", { postId: t.post.id, memberId: t.me.row.id, body: p.data.body, createdAt: now, updatedAt: "", parentId: parentId ?? "", likes: "" });
  // 알림: 글쓴이 + (답글이면) 원댓글 쓴 사람. 나에게는 보내지 않는다
  const parentAuthor = parentId ? all.find((c) => c.id === parentId)?.memberId : undefined;
  const to = [...new Set([t.post.authorId, parentAuthor].filter((x): x is string => !!x && x !== t.me.row.id))];
  if (to.length) await pushTo(to, "alerts", t.me.row.id).catch((e) => console.error("[push] 댓글 알림 실패", e));
  return NextResponse.json(await talkOf(t.me, t.post.id));
}
