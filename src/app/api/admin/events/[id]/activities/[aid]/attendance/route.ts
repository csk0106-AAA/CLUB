import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { attendanceState, rosterSet, saveAttendanceState } from "@/lib/participants";
import { getStore } from "@/lib/store";
import { isGuest } from "@/lib/member-kind";
import { isWhoAmI, readConfig } from "@/lib/activities";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; aid: string }> };

async function load(id: string, aid: string) {
  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid && a.eventId === id);
  return act ? { s, act } : null;
}

// 출석 체크: 이 활동에 참여할 사람(관리자가 선택). 일정 참석 신청 여부는 참고용으로만 보여 준다.
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const c = await load(id, aid);
  if (!c) return bad("활동을 찾을 수 없어요.", 404);
  const [members, selected, applies, state, profiles, interviews] = await Promise.all([
    c.s.list("Members"), rosterSet(c.act), c.s.list("EventApplies"), attendanceState(aid), c.s.list("Profiles", { omit: ["draftMd", "introMd", "readingMd"] }), c.s.list("Interviews", { omit: ["messages"] }),
  ]);
  // '내가 누구일까요?'(프로필 북 익명 게임)면 회원마다 내 소개 공개 여부와 참여 상태를 함께 보여 준다
  const who = isWhoAmI(readConfig(c.act.config) ?? ({} as never));
  const whoOf = (mid: string) => {
    if (!who) return undefined;
    const iv = interviews.find((i) => i.memberId === mid && i.eventActivityId === aid);
    const published = profiles.find((p) => p.memberId === mid)?.introStatus === "approved";
    // in: 이 활동에서 소개 작성(맞히기 대상) / partial: 일부활동참여 / undecided: 소개가 공개돼 있어 아직 안 고름 / new: 공개된 소개 없음(선택하면 바로 대상)
    const st = iv?.status === "optout" ? "partial" : iv ? "in" : published ? "undecided" : "new";
    return { published, state: st };
  };
  return NextResponse.json({
    confirmed: state.confirmed,
    confirmedAt: state.confirmedAt,
    by: state.by,
    selectedCount: selected.size,
    members: members
      .filter((m) => (!isGuest(m.kind) || applies.some((a) => a.eventId === id && a.memberId === m.id && a.answer === "참석")))
      .map((m) => {
        const ap = applies.find((a) => a.eventId === id && a.memberId === m.id);
        // published: 프로필 북에 실명 소개가 공개됨(북공개) — 어떤 활동이든 참고용으로 보여 준다
        const published = profiles.find((p) => p.memberId === m.id)?.introStatus === "approved";
        return { id: m.id, name: m.name, answer: ap?.answer ?? "", days: ap?.days ?? "", selected: selected.has(m.id), published, who: whoOf(m.id) };
      }),
  });
}

const body = z.union([
  z.object({ selected: z.array(z.string()).max(500) }), // 선택한 사람 전체를 저장
  z.object({ preset: z.literal("applicants") }), // 편의: 일정 참석 신청자로 채우기(한 번 채우는 것일 뿐, 이후 자동 연동은 없다)
]);

export async function PUT(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const c = await load(id, aid);
  if (!c) return bad("활동을 찾을 수 없어요.", 404);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");

  const applies = await c.s.list("EventApplies");
  const members = (await c.s.list("Members")).filter((m) => (!isGuest(m.kind) || applies.some((a) => a.eventId === id && a.memberId === m.id && a.answer === "참석")));
  let ids: string[];
  if ("preset" in parsed.data) {
    ids = members.filter((m) => applies.some((a) => a.eventId === id && a.memberId === m.id && a.answer === "참석")).map((m) => m.id);
  } else {
    ids = [...new Set(parsed.data.selected)];
    if (ids.some((x) => !members.some((m) => m.id === x))) return bad("명단에 없는 회원이 있어요.");
  }

  // 선택한 사람 전체로 바꾼다.
  for (const r of (await c.s.list("Attendance")).filter((r) => r.eventActivityId === aid)) await c.s.remove("Attendance", r.id);
  for (const mid of ids) await c.s.insert("Attendance", { eventActivityId: aid, memberId: mid, present: "true" });
  return NextResponse.json({ ok: true, selectedCount: ids.length });
}

const confirmBody = z.object({ confirmed: z.boolean() });

// 출석 체크 완료/해제. 완료해야 진행자가 현장 진행(소개 열기, 고민 뽑기, 작성 열기)을 시작할 수 있다.
export async function POST(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const c = await load(id, aid);
  if (!c) return bad("활동을 찾을 수 없어요.", 404);
  const parsed = confirmBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  if (parsed.data.confirmed && (await rosterSet(c.act)).size === 0) return bad("참여할 사람을 한 명 이상 선택해 주세요.", 409);
  await saveAttendanceState(aid, parsed.data.confirmed ? { confirmed: true, confirmedAt: new Date().toISOString(), by: g.s.name } : { confirmed: false, confirmedAt: "", by: "" });
  return NextResponse.json({ ok: true });
}
