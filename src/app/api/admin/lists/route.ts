import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { getLists, memberClubs } from "@/lib/lists";
import { checkPermChange, clubKey, getPermGroups, isAllNow, posKey, type PermGroups } from "@/lib/perms";
import { clubsJson } from "@/lib/schemas";
import { getSetting, getStore, setSetting } from "@/lib/store";
import type { Row } from "@/lib/store/types";

export const dynamic = "force-dynamic";

const LISTS = ["memberKinds", "positions", "clubs", "clubRoles"] as const;
type ListName = (typeof LISTS)[number];
const NAMES: Record<ListName, string> = { memberKinds: "회원구분", positions: "직책", clubs: "클럽", clubRoles: "클럽 직책" };

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

// 회원 구분 화면: 회원구분 / 직책 / 클럽 / 클럽 직책 목록과 목록 값별 회원 수
export async function GET() {
  const g = await guard(["members", "clubs", "group", "events"]);
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
  const g = await guard(["members", "clubs", "group", "events"]);
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

  // 권한 그룹 키 반영(직책·클럽 직책): 이름을 바꾸면 키도 바꾸고, 삭제하면 지운다.
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

  // 클럽: 기본 정보(Settings "clubInfo") 키와 클럽 일정(Events.club)도 이름을 따라 바꾸고, 삭제하면 기본 정보를 지운다.
  // (삭제된 클럽의 일정은 club 값을 그대로 둔다: 전체 회원에게 갑자기 보이지 않도록. 참관자만 계속 볼 수 있다.)
  if (list === "clubs" && (renames.size || deleted.length)) {
    const info = await getSetting<Record<string, unknown>>("clubInfo", {});
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(info ?? {})) {
      if (deleted.includes(k)) continue;
      next[renames.get(k) ?? k] = v;
    }
    if (JSON.stringify(next) !== JSON.stringify(info ?? {})) await setSetting("clubInfo", next);
    // 클럽 회비(Settings "clubDues")도 같은 방식으로
    const cd = await getSetting<Record<string, unknown>>("clubDues", {});
    const nextCd: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cd ?? {})) {
      if (deleted.includes(k)) continue;
      nextCd[renames.get(k) ?? k] = v;
    }
    if (JSON.stringify(nextCd) !== JSON.stringify(cd ?? {})) await setSetting("clubDues", nextCd);
    if (renames.size) {
      for (const e of await s.list("Events")) {
        const to = e.club ? renames.get(e.club) : undefined;
        if (to) await s.update("Events", e.id, { club: to });
      }
      // 신청내역도 새 이름으로(처리 내역이 그 클럽 화면에 그대로 남게)
      for (const r of await s.list("ClubRequests")) {
        const to = r.club ? renames.get(r.club) : undefined;
        if (to) await s.update("ClubRequests", r.id, { club: to });
      }
    }
  }
  // 클럽 직책 이름이 바뀌면 클럽 회비의 직책 조건 줄도 따라 바꾼다.
  if (list === "clubRoles" && renames.size) {
    const cd = await getSetting<Record<string, { rules?: { position: string }[] }>>("clubDues", {});
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cd ?? {})) {
      if (v && Array.isArray(v.rules) && v.rules.some((r) => renames.has(r.position))) {
        next[k] = { ...v, rules: v.rules.map((r) => ({ ...r, position: renames.get(r.position) ?? r.position })) };
        changed = true;
      } else next[k] = v;
    }
    if (changed) await setSetting("clubDues", next);
  }
  // 직책 이름이 바뀌면 모임회비(Settings "dues")의 직책별 회비 줄도 따라 바꾼다.
  if (list === "positions" && renames.size) {
    const dues = await getSetting<{ rules?: { position: string; amount: string }[] } | null>("dues", null);
    if (dues && Array.isArray(dues.rules) && dues.rules.some((r) => renames.has(r.position))) {
      await setSetting("dues", { ...dues, rules: dues.rules.map((r) => ({ ...r, position: renames.get(r.position) ?? r.position })) });
    }
  }
  return NextResponse.json({ ok: true, moved: patches.size, renamed: renames.size, deleted: deleted.length });
}
