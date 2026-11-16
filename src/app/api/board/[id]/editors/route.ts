import { NextResponse } from "next/server";
import { z } from "zod";
import { bad } from "@/lib/api";
import { MAX_EDITORS, readEditors } from "@/lib/editors";
import { isGuest } from "@/lib/member-kind";
import { canWritePosts, getPermGroups } from "@/lib/perms";
import { getStore } from "@/lib/store";
import { canOwn, canSee, findPost, forbid, getMe } from "../../_lib/server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 이 글의 편집자로 고를 수 있는 회원: 게시글을 쓸 권한(게시글_글쓰기·모든권한·소모임 직책자)이 있는 회원(작성자 제외)
async function candidates(authorId: string) {
  const s = await getStore();
  const groups = await getPermGroups();
  return (await s.list("Members"))
    .filter((m) => m.id !== authorId && !isGuest(m.kind) && canWritePosts(m, groups))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"))
    .map((m) => ({ id: m.id, name: m.name }));
}

// 편집자 목록과 고를 수 있는 회원(작성자·모든권한만)
export async function GET(_req: Request, ctx: Ctx) {
  const m = await getMe();
  if ("err" in m) return m.err;
  const p = await findPost((await ctx.params).id);
  if (!p || !canSee(m.me, p)) return bad("글을 찾을 수 없어요.", 404);
  if (!canOwn(m.me, p)) return forbid("편집자는 작성자만 정할 수 있어요.");
  const names = new Map((await (await getStore()).list("Members")).map((x) => [x.id, x.name]));
  return NextResponse.json({
    editors: readEditors(p.editors).map((id) => ({ id, name: names.get(id) ?? "(지운 회원)" })),
    canManage: true,
    candidates: await candidates(p.authorId),
  });
}

const body = z.object({ editors: z.array(z.string().min(1).max(64)).max(MAX_EDITORS) });

// 편집자 저장(작성자·모든권한). 권한 없는 회원은 넣을 수 없다.
export async function PUT(req: Request, ctx: Ctx) {
  const m = await getMe();
  if ("err" in m) return m.err;
  const p = await findPost((await ctx.params).id);
  if (!p || !canSee(m.me, p)) return bad("글을 찾을 수 없어요.", 404);
  if (!canOwn(m.me, p)) return forbid("편집자는 작성자만 정할 수 있어요.");
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(`편집자는 ${MAX_EDITORS}명까지 정할 수 있어요.`);
  const ok = new Set((await candidates(p.authorId)).map((c) => c.id));
  const ids = [...new Set(parsed.data.editors)];
  if (ids.some((id) => !ok.has(id))) return bad("게시글_글쓰기 권한이 있는 회원만 편집자로 추가할 수 있어요.");
  await (await getStore()).update("Posts", p.id, { editors: ids.length ? JSON.stringify(ids) : "" });
  return NextResponse.json({ editors: ids });
}
