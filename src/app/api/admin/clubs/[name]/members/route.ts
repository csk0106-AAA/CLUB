import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { clubParam } from "@/lib/clubs";
import { getLists, memberClubs } from "@/lib/lists";
import { checkPermChange, getPermGroups, isAllNow } from "@/lib/perms";
import { clubsJson } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

// 소모임 회원 명단 전체를 저장한다. 빠진 회원은 이 소모임에서 빠지고, 새 회원은 들어온다.
// role: 소모임 직책(“회원 구분”의 소모임 직책 목록) 또는 ""(일반 소모임 회원)
const body = z.object({
  seats: z.array(z.object({ memberId: z.string().min(1).max(64), role: z.string().trim().max(40).default("") })).max(1000),
});

export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const name = clubParam((await ctx.params).name);
  const lists = await getLists();
  if (!lists.clubs.includes(name)) return bad("소모임을 찾을 수 없어요.", 404);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const seats = new Map(parsed.data.seats.map((x) => [x.memberId, x.role]));
  const badRole = [...seats.values()].find((r) => r && !lists.clubRoles.includes(r));
  if (badRole) return bad(`“${badRole}”은(는) 소모임 직책 목록에 없어요. 회원 구분 화면에서 먼저 더해 주세요.`);

  const s = await getStore();
  const members = await s.list("Members");
  const ids = new Set(members.map((m) => m.id));
  if ([...seats.keys()].some((id) => !ids.has(id))) return bad("명단에 없는 회원이 있어요. 새로고침 후 다시 해 주세요.");

  const patches = new Map<string, string>();
  for (const m of members) {
    const cur = memberClubs(m);
    const has = cur.some((c) => c.name === name);
    let next = cur;
    if (seats.has(m.id)) {
      const role = seats.get(m.id) ?? "";
      next = has ? cur.map((c) => (c.name === name ? { ...c, role } : c)) : [...cur, { name, role }];
    } else if (has) {
      next = cur.filter((c) => c.name !== name);
    }
    const json = clubsJson(next);
    if (json !== (m.clubs ?? "")) patches.set(m.id, json);
  }

  // 소모임 직책은 권한 그룹(club:<직책>)에 영향을 준다: 최종 권한이 바뀌면 "모든 권한" 관리자만.
  const groups = await getPermGroups();
  const after = members.map((m) => (patches.has(m.id) ? { ...m, clubs: patches.get(m.id)! } : m));
  const err = checkPermChange(members, groups, after, groups, await isAllNow(g.s.mid));
  if (err) return bad(err[0], err[1]);

  for (const [id, clubs] of patches) await s.update("Members", id, { clubs });
  return NextResponse.json({ ok: true, changed: patches.size });
}
