import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { pushTo } from "@/lib/push";
import { getStore } from "@/lib/store";
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
  await (await getStore()).insert("PostComments", { postId: t.post.id, memberId: t.me.row.id, body: p.data.body, createdAt: now, updatedAt: "" });
  if (t.post.authorId && t.post.authorId !== t.me.row.id) {
    await pushTo([t.post.authorId], "alerts", t.me.row.id).catch((e) => console.error("[push] 댓글 알림 실패", e));
  }
  return NextResponse.json(await talkOf(t.me, t.post.id));
}
