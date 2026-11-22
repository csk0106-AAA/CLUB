import { NextResponse } from "next/server";
import { z } from "zod";
import { bad } from "@/lib/api";
import { avatarView } from "@/lib/avatar";
import { COMMENT_MAX } from "@/lib/board";
import { likesOf, replyParent, threadOrder, toggleLike } from "@/lib/comments";
import { photoAccess } from "@/lib/event-photos";
import { pushTo } from "@/lib/push";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; pid: string }> };

// 사진 댓글: 사진첩을 볼 수 있는 회원(참석 대상·관리자)이 읽고 쓴다. 게시글 댓글과 같은 모양(좋아요·답글·고치기).
// 고치기는 쓴 사람, 지우기는 쓴 사람·관리자. 원댓글을 지우면 답글도 함께 지운다.
async function photoOf(ctx: Ctx) {
  const a = await photoAccess(ctx);
  if ("err" in a) return a;
  const { pid } = await ctx.params;
  const store = await getStore();
  const p = await store.get("EventPhotos", pid);
  if (!p || p.eventId !== a.e.id) return { err: bad("사진을 찾을 수 없어요.", 404) };
  return { ...a, p, store };
}

async function listOf(store: Awaited<ReturnType<typeof getStore>>, pid: string, me: string, manager: boolean) {
  const [rows, members] = await Promise.all([store.list("PhotoComments"), store.list("Members")]);
  const byId = new Map(members.map((m) => [m.id, m]));
  return threadOrder(rows.filter((c) => c.photoId === pid)).map((c) => {
    const m = byId.get(c.memberId);
    const own = c.memberId === me;
    return {
      id: c.id, name: m?.name ?? "(지운 회원)", avatar: m ? avatarView(m) : null, body: c.body ?? "",
      createdAt: c.createdAt ?? "", edited: !!c.updatedAt && c.updatedAt !== c.createdAt,
      canEdit: own, canDelete: own || manager,
      likes: likesOf(c).length, liked: likesOf(c).includes(me), parentId: c.parentId ?? "",
    };
  });
}

export async function GET(_req: Request, ctx: Ctx) {
  const r = await photoOf(ctx);
  if ("err" in r) return r.err;
  return NextResponse.json({ comments: await listOf(r.store, r.p.id, r.s.mid, r.manager) });
}

const input = z.object({
  body: z.string().trim().min(1, "댓글 내용을 적어 주세요.").max(COMMENT_MAX, `댓글은 ${COMMENT_MAX}자까지 쓸 수 있어요.`),
  parentId: z.string().max(80).optional(),
});

// 쓰기(답글이면 parentId). 사진 올린 사람·원댓글 쓴 사람에게 휴대폰 알림(나에게는 안 보냄)
export async function POST(req: Request, ctx: Ctx) {
  const r = await photoOf(ctx);
  if ("err" in r) return r.err;
  // 사진첩을 볼 수 있는 회원(참석 대상)은 모두 댓글을 쓸 수 있다(올리기만 참석자)
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "댓글 내용을 확인해 주세요.");
  const all = await r.store.list("PhotoComments");
  const parentId = replyParent(all, parsed.data.parentId, (c) => c.photoId === r.p.id);
  if (parentId === false) return bad("답글을 달 댓글을 찾을 수 없어요.", 404);
  const now = new Date().toISOString();
  await r.store.insert("PhotoComments", { eventId: r.e.id, photoId: r.p.id, memberId: r.s.mid, body: parsed.data.body, createdAt: now, updatedAt: "", parentId: parentId ?? "", likes: "" });
  const parentAuthor = parentId ? all.find((c) => c.id === parentId)?.memberId : undefined;
  const to = [...new Set([r.p.memberId, parentAuthor].filter((x): x is string => !!x && x !== r.s.mid))];
  if (to.length) await pushTo(to, "alerts", r.s.mid).catch((e) => console.error("[push] 사진 댓글 알림 실패", e));
  return NextResponse.json({ comments: await listOf(r.store, r.p.id, r.s.mid, r.manager) });
}

// 고치기({ body }, 쓴 사람) · 좋아요({ like }, 누구나): ?cid=댓글 id
export async function PATCH(req: Request, ctx: Ctx) {
  const r = await photoOf(ctx);
  if ("err" in r) return r.err;
  const cid = new URL(req.url).searchParams.get("cid") ?? "";
  const c = await r.store.get("PhotoComments", cid);
  if (!c || c.photoId !== r.p.id) return bad("댓글을 찾을 수 없어요.", 404);
  const raw = (await req.json().catch(() => null)) as { like?: unknown; body?: unknown } | null;
  if (raw && typeof raw.like === "boolean") {
    await r.store.update("PhotoComments", c.id, { likes: JSON.stringify(toggleLike(c, r.s.mid, raw.like)) });
  } else {
    if (c.memberId !== r.s.mid) return bad("내가 쓴 댓글만 고칠 수 있어요.", 403);
    const parsed = input.pick({ body: true }).safeParse(raw);
    if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "댓글 내용을 확인해 주세요.");
    if (parsed.data.body !== c.body) await r.store.update("PhotoComments", c.id, { body: parsed.data.body, updatedAt: new Date().toISOString() });
  }
  return NextResponse.json({ comments: await listOf(r.store, r.p.id, r.s.mid, r.manager) });
}

// 지우기: ?cid=댓글 id (원댓글이면 답글도 함께)
export async function DELETE(req: Request, ctx: Ctx) {
  const r = await photoOf(ctx);
  if ("err" in r) return r.err;
  const cid = new URL(req.url).searchParams.get("cid") ?? "";
  const c = await r.store.get("PhotoComments", cid);
  if (!c || c.photoId !== r.p.id) return bad("댓글을 찾을 수 없어요.", 404);
  if (c.memberId !== r.s.mid && !r.manager) return bad("쓴 사람만 지울 수 있어요.", 403);
  for (const x of (await r.store.list("PhotoComments")).filter((x) => x.parentId === c.id)) await r.store.remove("PhotoComments", x.id);
  await r.store.remove("PhotoComments", cid);
  return NextResponse.json({ comments: await listOf(r.store, r.p.id, r.s.mid, r.manager) });
}
