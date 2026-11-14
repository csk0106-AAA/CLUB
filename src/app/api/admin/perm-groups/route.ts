import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_PERMS, bad, guard } from "@/lib/api";
import { getLists } from "@/lib/lists";
import { checkPermChange, getPermGroups, isAllNow, type PermGroups } from "@/lib/perms";
import { getStore, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

// 그룹별 권한: { "pos:회장": ["all"], "club:회장": ["board"], … }
//  GET → { groups, positions, clubRoles, canEdit }
export async function GET() {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const { positions, clubRoles } = await getLists();
  return NextResponse.json({ groups: await getPermGroups(), positions, clubRoles, canEdit: await isAllNow(g.s.mid) });
}

const body = z.object({
  groups: z.record(z.string().regex(/^(pos|club):.{1,40}$/), z.array(z.enum(ADMIN_PERMS)).max(ADMIN_PERMS.length)),
});

// PUT { groups } — 보낸 내용으로 통째로 바꾼다. 모든 권한 관리자만, 바꾼 뒤에도 모든 권한 회원이 한 명 이상 있어야 한다.
export async function PUT(req: Request) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  if (!(await isAllNow(g.s.mid))) return bad("그룹 권한은 “모든 권한” 관리자만 바꿀 수 있어요.", 403);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("권한 내용을 확인해 주세요.");

  const next: PermGroups = {};
  for (const [k, v] of Object.entries(parsed.data.groups)) {
    const list = [...new Set(v)];
    if (list.length) next[k] = list.includes("all") ? ["all"] : list.sort();
  }
  const before = await getPermGroups();
  const members = await (await getStore()).list("Members");
  const err = checkPermChange(members, before, members, next, true);
  if (err) return bad(err[0], err[1]);
  await setSetting("permGroups", next);
  return NextResponse.json({ ok: true, groups: next });
}
