import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_PERMS, bad, guard, parseJson } from "@/lib/api";
import { checkPermChange, effectivePerms, getPermGroups, isAllNow } from "@/lib/perms";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

// 개인 권한 정하기.
//  { perms: [...] } → 이 목록만 쓴다(그룹 권한 무시, extra.permsCustom = true). 빈 목록이면 권한 없음.
//  { perms: [...], custom: false } → 개인 권한으로 저장하되 그룹 권한도 함께 쓴다(그룹 ∪ 개인).
//  { reset: true }  → 개인 권한을 지우고 그룹 권한으로 되돌린다.
const body = z.union([
  z.object({ perms: z.array(z.enum(ADMIN_PERMS)).max(ADMIN_PERMS.length), custom: z.boolean().default(true) }),
  z.object({ reset: z.literal(true) }),
]);

export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  if (!(await isAllNow(g.s.mid))) return bad("권한은 “모든 권한” 관리자만 바꿀 수 있어요.", 403);
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("권한을 확인해 주세요.");

  const s = await getStore();
  const all = await s.list("Members");
  const cur = all.find((m) => m.id === id);
  if (!cur) return bad("회원을 찾을 수 없어요.", 404);

  const extra = parseJson<Record<string, unknown>>(cur.extra, {});
  let patch: { perms: string; extra: string };
  if ("reset" in parsed.data) {
    delete extra.permsCustom;
    patch = { perms: "", extra: JSON.stringify(extra) };
  } else {
    const list = [...new Set(parsed.data.perms)];
    if (parsed.data.custom) extra.permsCustom = true;
    else delete extra.permsCustom;
    patch = { perms: (list.includes("all") ? ["all"] : list).join("|"), extra: JSON.stringify(extra) };
  }

  const groups = await getPermGroups();
  const after = all.map((m) => (m.id === id ? { ...m, ...patch } : m));
  const err = checkPermChange(all, groups, after, groups, true);
  if (err) return bad(err[0], err[1]);
  await s.update("Members", id, patch);
  return NextResponse.json({ ok: true, effective: effectivePerms({ ...cur, ...patch }, groups) });
}
