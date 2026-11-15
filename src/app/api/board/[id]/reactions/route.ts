import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { isReaction } from "@/lib/board";
import { getStore } from "@/lib/store";
import { talkOf, talkTarget } from "../../_lib/talk";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 반응 누르기: 같은 종류를 다시 누르면 취소된다(회원당 종류별 하나). 바뀐 반응·댓글을 돌려준다.
export async function POST(req: Request, ctx: Ctx) {
  const t = await talkTarget((await ctx.params).id);
  if ("err" in t) return t.err;
  const type = ((await req.json().catch(() => null)) as { type?: unknown } | null)?.type;
  if (!isReaction(type)) return bad("반응 종류를 골라 주세요.");
  const s = await getStore();
  const mine = (await s.list("PostReactions")).filter((r) => r.postId === t.post.id && r.memberId === t.me.row.id && r.type === type);
  if (mine.length) for (const r of mine) await s.remove("PostReactions", r.id);
  else await s.insert("PostReactions", { postId: t.post.id, memberId: t.me.row.id, type, createdAt: new Date().toISOString() });
  return NextResponse.json({ on: mine.length === 0, ...(await talkOf(t.me, t.post.id)) });
}
