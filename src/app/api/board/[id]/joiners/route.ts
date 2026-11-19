import { NextResponse } from "next/server";
import { z } from "zod";
import { bad } from "@/lib/api";
import { getStore } from "@/lib/store";
import { canManage, managedOf } from "@/lib/published";
import { newJoiners } from "../../_lib/joiners";
import { audienceOf, canEdit, findPost, forbid, getMe } from "../../_lib/server";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ action: z.enum(["add", "dismiss"]) });

// 새로 가입한 회원 알림 처리(작성자·편집자)
//  add: 그 회원들을 공개 대상에 넣는다 / dismiss: 넣지 않고 알림만 끈다(이 뒤에 가입한 회원은 다시 알린다)
export async function POST(req: Request, ctx: Ctx) {
  const m = await getMe();
  if ("err" in m) return m.err;
  const p = await findPost((await ctx.params).id);
  if (!p) return bad("글을 찾을 수 없어요.", 404);
  const managed = managedOf(p);
  if (!canEdit(m.me, p) && !(managed && (await canManage(m.me.row, m.me.perms, managed)))) return forbid("작성자나 편집자만 바꿀 수 있어요.");
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const s = await getStore();
  const joiners = newJoiners(p, await s.list("Members"));
  const now = new Date().toISOString();
  if (parsed.data.action === "add" && joiners.length) {
    const aud = audienceOf(p);
    await s.update("Posts", p.id, { audience: JSON.stringify({ ...aud, memberIds: [...new Set([...aud.memberIds, ...joiners.map((j) => j.id)])] }), audSeenAt: now });
  } else {
    await s.update("Posts", p.id, { audSeenAt: now });
  }
  return NextResponse.json({ ok: true, added: parsed.data.action === "add" ? joiners.length : 0 });
}
