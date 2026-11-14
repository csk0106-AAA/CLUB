import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { getLists, memberClubs } from "@/lib/lists";
import { checkPermChange, clubKey, getPermGroups, isAllNow, posKey, type PermGroups } from "@/lib/perms";
import { clubsJson } from "@/lib/schemas";
import { getStore, setSetting } from "@/lib/store";
import type { Row } from "@/lib/store/types";

export const dynamic = "force-dynamic";

const LISTS = ["memberKinds", "positions", "clubs", "clubRoles"] as const;
type ListName = (typeof LISTS)[number];
const NAMES: Record<ListName, string> = { memberKinds: "회원구분", positions: "직책", clubs: "소모임", clubRoles: "소모임 직책" };

function counts(members: Row[]) {
  const c: Record<ListName, Record<string, number>> = { memberKinds: {}, positions: {}, clubs: {}, clubRoles: {} };
  const add = (k: ListName, v: string) => { if (v) c[k][v] = (c[k][v] ?? 0) + 1; };
  for (const m of members) {
    add("memberKinds", (m.kind ?? "").trim());
    add("positions", (m.position ?? "").trim());
    const seats = memberClubs(m);
    seats.forEach((s) => add("clubs", s.name));
    [...new Set(seats.map((s) => s.role).filter(Boolean))].forEach((r) => add("clubRoles", r));
  }
  return c;
}

// 회원 구분 화면: 회원구분 / 직책 / 소모임 / 소모임 직책 목록과 목록 값별 회원 수
export async function GET() {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const s = await getStore();
  return NextResponse.json({ ...(await getLists()), counts: counts(await s.list("Members")) });
}

// 한 목록씩 저장한다. items[].from = 불러올 때의 이름(새 값은 비움).
//  이름이 바뀌면 회원 명단(과 권한 그룹 키)에 반영하고, 목록에서 빠진 값은 삭제로 본다.
const body = z.object({
  list: z.enum(LISTS),
  items: z.array(z.object({
    value: z.string().trim().max(30),
    definition: z.string().max(300).optional(),
    from: z.string().max(40).optional(),
  })).max(60),
});

export async function PUT(req: Request) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 이름은 30자까지예요.");
  const { list, items } = parsed.data;
  const label = NAMES[list];
  if (items.some((i) => !i.value)) return bad(`비어 있는 ${label} 이름이 있어요.`);
  const values = items.map((i) => i.value);
  const dup = values.find((v, i) => values.indexOf(v) !== i);
  if (dup) return bad(`“${dup}” ${label}이(가) 두 번 들어 있어요.`);

  const lists = await getLists();
  const old: string[] = list === "memberKinds" ? lists.memberKinds.map((k) => k.value) : lists[list];
  const renames = new Map<string, string>();
  for (const i of items) if (i.from && old.includes(i.from) && i.from !== i.value) renames.set(i.from, i.value);
  const kept = new Set(items.map((i) => i.from).filter(Boolean));
  const deleted = old.filter((v) => !kept.has(v));

  // 회원 명단 반영
  const s = await getStore();
  const members = await s.list("Members");
  const patches = new Map<string, Record<string, string>>();
  for (const m of members) {
    let p: Record<string, string> | null = null;
    if (list === "memberKinds" && renames.has(m.kind)) p = { kind: renames.get(m.kind)! };
    if (list === "positions" && renames.has(m.position)) p = { position: renames.get(m.position)! };
    if (list === "clubs" || list === "clubRoles") {
      const seats = memberClubs(m);
      const next = seats
        .filter((c) => !(list === "clubs" && deleted.includes(c.name)))
        .map((c) => list === "clubs"
          ? { ...c, name: renames.get(c.name) ?? c.name }
          : { ...c, role: c.role ? renames.get(c.role) ?? c.role : "" });
      const json = clubsJson(next);
      if (json !== (m.clubs ?? "")) p = { clubs: json };
    }
    if (p) patches.set(m.id, p);
  }

  // 권한 그룹 키 반영(직책·소모임 직책): 이름을 바꾸면 키도 바꾸고, 삭제하면 지운다.
  const groups = await getPermGroups();
  let nextGroups: PermGroups = groups;
  if (list === "positions" || list === "clubRoles") {
    const key = list === "positions" ? posKey : clubKey;
    nextGroups = { ...groups };
    for (const d of deleted) delete nextGroups[key(d)];
    for (const [from] of renames) delete nextGroups[key(from)];
    for (const [from, to] of renames) if (groups[key(from)]) nextGroups[key(to)] = groups[key(from)];
  }
  const after = members.map((m) => (patches.has(m.id) ? { ...m, ...patches.get(m.id) } : m));
  const err = checkPermChange(members, groups, after, nextGroups, await isAllNow(g.s.mid));
  if (err) return bad(err[0], err[1]);

  await setSetting(list, list === "memberKinds" ? items.map((i) => ({ value: i.value, definition: (i.definition ?? "").trim() })) : values);
  if (nextGroups !== groups) await setSetting("permGroups", nextGroups);
  for (const [id, p] of patches) await s.update("Members", id, p);
  return NextResponse.json({ ok: true, moved: patches.size, renamed: renames.size, deleted: deleted.length });
}
