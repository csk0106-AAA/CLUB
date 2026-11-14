import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { notifyPost } from "@/lib/notify";
import { getStore } from "@/lib/store";
import { detail, parsePost } from "../_lib/posts";
import { canEdit, canSee, ensureBoard, findPost, forbid, getMe, readFiles } from "../_lib/server";

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

// 고치기: 작성자나 관리자(all/board). 회칙 글은 전체 관리자만. 양식은 바꾸지 않는다.
export async function PATCH(req: Request, ctx: Ctx) {
  const m = await getMe();
  if ("err" in m) return m.err;
  const p = await findPost((await ctx.params).id);
  if (!p || !canSee(m.me, p)) return notFound();
  if (!canEdit(m.me, p)) return forbid(p.form === "rules" ? "회칙 글은 전체 관리자만 고칠 수 있어요." : "작성자나 관리자만 고칠 수 있어요.");
  const parsed = await parsePost(await req.json().catch(() => null), m.me, p.form);
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  await (await getStore()).update("Posts", p.id, { ...parsed.v, updatedAt: new Date().toISOString() });
  await notifyPost(p.id, "update").catch(() => undefined);
  return NextResponse.json({ id: p.id });
}

// 지우기: 첨부 파일과 응답도 함께 지운다.
export async function DELETE(_req: Request, ctx: Ctx) {
  const m = await getMe();
  if ("err" in m) return m.err;
  const p = await findPost((await ctx.params).id);
  if (!p || !canSee(m.me, p)) return notFound();
  if (!canEdit(m.me, p)) return forbid(p.form === "rules" ? "회칙 글은 전체 관리자만 지울 수 있어요." : "작성자나 관리자만 지울 수 있어요.");
  const s = await getStore();
  for (const f of readFiles(p)) await s.remove("PostFiles", f.id);
  for (const r of (await s.list("PostResponses")).filter((r) => r.postId === p.id)) await s.remove("PostResponses", r.id);
  await s.remove("Posts", p.id);
  return NextResponse.json({ ok: true });
}
