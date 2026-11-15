import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { notifyPost } from "@/lib/notify";
import { canManage, managedOf } from "@/lib/published";
import { getStore } from "@/lib/store";
import { detail, parsePost } from "../_lib/posts";
import { canEdit, canSee, ensureBoard, findPost, forbid, getMe, readFiles } from "../_lib/server";
import { removeTalk } from "../_lib/talk";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const notFound = () => bad("글을 찾을 수 없어요.", 404);

export async function GET(_req: Request, ctx: Ctx) {
  const m = await getMe();
  if ("err" in m) return m.err;
  await ensureBoard();
  const p = await findPost((await ctx.params).id);
  if (!p || !canSee(m.me, p)) return notFound();
  return NextResponse.json(await detail(m.me, p));
}

// 수정: 작성자나 관리자(all/board). 양식은 바꾸지 않는다.
// 회칙·회비·소모임 회비 글은 게시판에서 고치지 않고 관리 화면에서 다시 올린다.
export async function PATCH(req: Request, ctx: Ctx) {
  const m = await getMe();
  if ("err" in m) return m.err;
  const p = await findPost((await ctx.params).id);
  if (!p || !canSee(m.me, p)) return notFound();
  const managed = managedOf(p);
  if (managed) {
    const where = managed.kind === "rules" ? "관리자 › 회원관리 › 회칙" : managed.kind === "dues" ? "관리자 › 회비관리" : `${managed.club} 소모임 회비 관리`;
    return forbid(`이 글은 ${where} 화면에서 고쳐서 다시 올려 주세요.`);
  }
  if (!canEdit(m.me, p)) return forbid("작성자나 관리자만 수정할 수 있어요.");
  const parsed = await parsePost(await req.json().catch(() => null), m.me, p.form);
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  await (await getStore()).update("Posts", p.id, { ...parsed.v, updatedAt: new Date().toISOString() });
  await notifyPost(p.id, "update").catch(() => undefined);
  return NextResponse.json({ id: p.id });
}

// 게시글 삭제: 첨부 파일·응답·반응·댓글도 함께 지운다.
// 일반 글은 작성자나 관리자(all/board), 회칙·회비 글은 그 관리 화면을 쓸 수 있는 사람만.
export async function DELETE(_req: Request, ctx: Ctx) {
  const m = await getMe();
  if ("err" in m) return m.err;
  const p = await findPost((await ctx.params).id);
  if (!p || !canSee(m.me, p)) return notFound();
  const managed = managedOf(p);
  const ok = managed ? await canManage(m.me.row, m.me.perms, managed) : canEdit(m.me, p);
  if (!ok) return forbid(managed ? "이 글은 담당 관리자만 삭제할 수 있어요." : "작성자나 관리자만 삭제할 수 있어요.");
  const s = await getStore();
  for (const f of readFiles(p)) await s.remove("PostFiles", f.id);
  for (const r of (await s.list("PostResponses")).filter((r) => r.postId === p.id)) await s.remove("PostResponses", r.id);
  await removeTalk(p.id);
  await s.remove("Posts", p.id);
  return NextResponse.json({ ok: true });
}
