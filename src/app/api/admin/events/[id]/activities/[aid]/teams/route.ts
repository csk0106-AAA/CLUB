import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, hostGuard, guardEv } from "@/lib/api";
import { capsuleRows, loadTeamActivity, makeTeams, saveTeamsState, teams, teamsState } from "@/lib/capsule";
import { isLimited, participantPool, rosterSet } from "@/lib/participants";
import { memberAgeGroup } from "@/lib/age-group";
import { getStore } from "@/lib/store";
import { readHosts } from "@/lib/hosts";
import { pruneTeamHosts } from "@/lib/team-run";
import type { Row } from "@/lib/store/types";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; aid: string }> };

// 팀 구성에 쓸 사람: 관리자 선택 회원 활동이면 선택한 회원, 전체 회원 활동이면 일정 참석 신청자(없으면 전체 회원).
const pool = participantPool;

const view = (m: Row) => ({ id: m.id, name: m.name, ageGroup: memberAgeGroup(m) });

// 이미 작성된 타임캡슐이 있으면 팀을 바꿀 수 없다(팀 약속이 팀에 묶여 있다).
async function locked(aid: string): Promise<boolean> {
  return (await capsuleRows(aid)).length > 0;
}

export async function GET(_req: Request, ctx: Ctx) {
  const g = await hostGuard((await ctx.params).aid);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const c = await loadTeamActivity(aid, id);
  if (typeof c === "string") return bad(c, 404);
  const [p, ts, state, lock] = await Promise.all([pool(c.cfg, c.act, c.ev), teams(aid), teamsState(aid), locked(aid)]);
  const byId = new Map(p.members.map((m) => [m.id, m]));
  const all = await (await getStore()).list("Members");
  const assigned = new Set(ts.flatMap((t) => t.memberIds));
  // 조 진행자: 팀 id → {memberId, code}(조마다 한 명), 조별 진행 스위치
  const teamHosts = Object.fromEntries(readHosts(c.act).filter((h) => h.teamId).map((h) => [h.teamId as string, { memberId: h.memberId, code: g.team ? "" : h.code }]));
  return NextResponse.json({
    poolKind: p.kind,
    teamHosts,
    teamRun: c.act.teamRun === "true",
    published: state.published,
    publishedAt: state.publishedAt,
    locked: lock,
    teams: ts.map((t) => ({ id: t.id, name: t.name, members: t.memberIds.map((mid) => view(byId.get(mid) ?? all.find((m) => m.id === mid) ?? { id: mid, name: "(삭제된 회원)", ageGroup: "" })) })),
    unassigned: p.members.filter((m) => !assigned.has(m.id)).map(view),
    participantCount: p.members.length,
  });
}

const gen = z.object({
  mode: z.enum(["random", "mix", "manual", "copy", "all"]), // all: 참여자 전체를 한 팀으로
  from: z.string().optional(), // copy: 가져올 일정 조편성 id
  count: z.number().int().min(1).max(30).optional(),
  size: z.number().int().min(2).max(20).optional(),
});

// 팀 저장: 같은 팀(id, 없으면 같은 이름)은 그 행을 고쳐서 팀 id 를 그대로 둔다(조 진행자·조별 진행 기록이 팀 id 에 묶여 있다).
async function replaceTeams(aid: string, list: { id?: string; name: string; memberIds: string[] }[]) {
  const s = await getStore();
  const cur = await teams(aid);
  const used = new Set<string>();
  for (const t of list) {
    const row = (t.id ? cur.find((x) => x.id === t.id && !used.has(x.id)) : undefined) ?? cur.find((x) => x.name === t.name && !used.has(x.id));
    const memberIds = JSON.stringify(t.memberIds);
    if (row) {
      used.add(row.id);
      if (row.name !== t.name || JSON.stringify(row.memberIds) !== memberIds) await s.update("Teams", row.id, { name: t.name, memberIds });
    } else await s.insert("Teams", { eventActivityId: aid, name: t.name, memberIds });
  }
  for (const x of cur) if (!used.has(x.id)) await s.remove("Teams", x.id);
  // 조에서 빠진 조 진행자는 지정을 푼다
  await pruneTeamHosts(aid);
  // 구성을 바꾸면 다시 '확인'을 눌러야 회원에게 배포된다.
  await saveTeamsState(aid, { published: false, publishedAt: "", by: "" });
}

// 팀 만들기: 관리자 배정(빈 팀), 연령대 섞기, 랜덤 배정. 결과는 초안이고, 확인을 눌러야 배포된다.
export async function POST(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const c = await loadTeamActivity(aid, id);
  if (typeof c === "string") return bad(c, 404);
  const parsed = gen.safeParse(await req.json().catch(() => null));
  if (await locked(aid)) return bad("이미 작성된 타임캡슐이 있어서 팀을 다시 만들 수 없어요.", 409);
  // 일정 조편성에서 가져오기: 조 이름·조원을 그대로(이 활동에 참여하지 않는 사람은 뺀다). 초안이라 확인을 눌러야 배포된다.
  if (parsed.success && parsed.data.mode === "copy") {
    const src = (await (await getStore()).list("Groupings")).find((x) => x.id === parsed.data.from && x.eventId === id);
    if (!src) return bad("가져올 조편성을 찾을 수 없어요.", 404);
    const p = await pool(c.cfg, c.act, c.ev);
    const ok = new Set(p.members.map((m) => m.id));
    let dropped = 0;
    const list = (JSON.parse(src.teams || "[]") as { name: string; memberIds: string[] }[]).map((t) => {
      const ids = t.memberIds.filter((mid) => ok.has(mid));
      dropped += t.memberIds.length - ids.length;
      return { name: t.name.slice(0, 20), memberIds: ids };
    });
    if (list.length === 0) return bad("그 조편성에는 아직 짜인 조가 없어요.");
    await replaceTeams(aid, list);
    return NextResponse.json({ ok: true, teams: list.length, dropped });
  }
  // 전체참여자: 이 활동 참여자 모두를 한 팀으로(모두 함께 하는 활동과 같다). 초안이라 확인을 눌러야 배포된다.
  if (parsed.success && parsed.data.mode === "all") {
    const p = await pool(c.cfg, c.act, c.ev);
    if (p.members.length === 0) return bad("팀에 넣을 참여자가 없어요. 활동에 참여할 회원을 먼저 선택해 주세요.");
    await replaceTeams(aid, [{ name: "전체", memberIds: p.members.map((m) => m.id) }]);
    return NextResponse.json({ ok: true, teams: 1, mode: "all", poolKind: p.kind });
  }
  if (!parsed.success || (!parsed.data.count && !parsed.data.size)) return bad("방식을 고르고 팀 수나 팀당 인원 중 하나를 입력해 주세요.");

  const p = await pool(c.cfg, c.act, c.ev);
  if (p.members.length < 2) return bad("팀을 만들 회원이 부족해요. 활동에 참여할 회원을 먼저 선택해 주세요.");
  const count = Math.min(p.members.length, parsed.data.count ?? Math.ceil(p.members.length / (parsed.data.size as number)));
  const made = makeTeams(p.members, count, parsed.data.mode as "random" | "mix" | "manual"); // copy 는 위에서 처리했다
  await replaceTeams(aid, made.map((ms, i) => ({ name: `${i + 1}팀`, memberIds: ms.map((m) => m.id) })));
  return NextResponse.json({ ok: true, teams: count, mode: parsed.data.mode, poolKind: p.kind });
}

const manual = z.object({
  teams: z.array(z.object({ id: z.string().max(64).optional(), name: z.string().trim().min(1).max(20), memberIds: z.array(z.string()).max(30) })).max(30),
});

// 드래그로 옮긴 결과 저장(초안). 빈 팀도 그대로 둔다. 이름이 같은 팀은 만들 수 없다.
export async function PUT(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const c = await loadTeamActivity(aid, id);
  if (typeof c === "string") return bad(c, 404);
  const parsed = manual.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("팀 이름과 구성원을 확인해 주세요.");
  if (await locked(aid)) return bad("이미 작성된 타임캡슐이 있어서 팀을 바꿀 수 없어요.", 409);

  const all = await (await getStore()).list("Members");
  const att = isLimited(c.cfg) ? await rosterSet(c.act) : null;
  const names = new Set<string>();
  const seen = new Set<string>();
  for (const t of parsed.data.teams) {
    if (names.has(t.name)) return bad("같은 이름의 팀이 있어요.");
    names.add(t.name);
    for (const mid of t.memberIds) {
      if (!all.some((m) => m.id === mid)) return bad("명단에 없는 회원이 있어요.");
      if (seen.has(mid)) return bad("한 사람이 두 팀에 들어갈 수 없어요.");
      if (att && !att.has(mid)) return bad("이 활동은 관리자가 선택한 회원만 팀에 넣을 수 있어요.");
      seen.add(mid);
    }
  }
  await replaceTeams(aid, parsed.data.teams);
  return NextResponse.json({ ok: true });
}

const runBody = z.object({ teamRun: z.boolean() });

// 조별로 따로 진행 켜기·끄기. 켜려면 팀이 있고 회원에게 배포돼 있어야 한다. 끄면 예전처럼 활동 전체를 한 번에 진행한다.
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const c = await loadTeamActivity(aid, id);
  if (typeof c === "string") return bad(c, 404);
  const parsed = runBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  if (parsed.data.teamRun) {
    const [ts, st] = await Promise.all([teams(aid), teamsState(aid)]);
    if (ts.length === 0) return bad("먼저 팀을 만들어 주세요.", 409);
    if (!st.published) return bad("팀 구성을 회원에게 배포한 뒤에 켤 수 있어요.", 409);
  }
  await (await getStore()).update("EventActivities", aid, { teamRun: parsed.data.teamRun ? "true" : "" });
  return NextResponse.json({ ok: true, teamRun: parsed.data.teamRun });
}
