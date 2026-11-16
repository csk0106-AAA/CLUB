import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { MAX_EDITORS, readEditors } from "@/lib/editors";
import { isGuest } from "@/lib/member-kind";
import { creatableTypes } from "@/lib/perm-keys";
import { effectivePerms, getPermGroups } from "@/lib/perms";
import { getStore } from "@/lib/store";
import type { Row } from "@/lib/store/types";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 편집자로 고를 수 있는 회원: 이 일정 종류를 만들 권한(일정_일정만들기·소모임관리)이 있는 회원.
// 일정관리·모든권한은 이미 모든 일정을 고칠 수 있어서 넣지 않는다. 만든 사람도 뺀다.
async function candidates(ev: Row) {
  const s = await getStore();
  const groups = await getPermGroups();
  return (await s.list("Members"))
    .filter((m) => {
      if (m.id === ev.createdBy || isGuest(m.kind)) return false;
      const types = creatableTypes(effectivePerms(m, groups));
      return !!types && types.includes(ev.type);
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"))
    .map((m) => ({ id: m.id, name: m.name }));
}

// 편집자를 바꿀 수 있는지: 일정관리·모든권한, 또는 이 일정을 만든 사람
const canOwn = (perms: string[], mid: string, ev: Row) => perms.includes("all") || perms.includes("events") || ev.createdBy === mid;

async function load(ctx: Ctx) {
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, members] = await Promise.all([s.list("Events"), s.list("Members")]);
  return { ev: events.find((e) => e.id === id), members };
}

export async function GET(_req: Request, ctx: Ctx) {
  const g = await guardEv(ctx);
  if ("err" in g) return g.err;
  const { ev, members } = await load(ctx);
  if (!ev) return bad("일정을 찾을 수 없어요.", 404);
  const nm = (id: string) => members.find((m) => m.id === id)?.name ?? "(지운 회원)";
  const own = canOwn(g.s.perms, g.s.mid, ev);
  return NextResponse.json({
    editors: readEditors(ev.editors).map((id) => ({ id, name: nm(id) })),
    createdBy: ev.createdBy ? nm(ev.createdBy) : "",
    canManage: own,
    candidates: own ? await candidates(ev) : [],
  });
}

const body = z.object({ editors: z.array(z.string().min(1).max(64)).max(MAX_EDITORS) });

export async function PUT(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx);
  if ("err" in g) return g.err;
  const { ev } = await load(ctx);
  if (!ev) return bad("일정을 찾을 수 없어요.", 404);
  if (!canOwn(g.s.perms, g.s.mid, ev)) return bad("편집자는 일정을 만든 사람만 정할 수 있어요.", 403);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(`편집자는 ${MAX_EDITORS}명까지 정할 수 있어요.`);
  const ok = new Set((await candidates(ev)).map((c) => c.id));
  const ids = [...new Set(parsed.data.editors)];
  if (ids.some((id) => !ok.has(id))) return bad(`${ev.type} 일정을 만들 권한이 있는 회원만 편집자로 추가할 수 있어요.`);
  await (await getStore()).update("Events", ev.id, { editors: ids.length ? JSON.stringify(ids) : "" });
  return NextResponse.json({ editors: ids });
}
