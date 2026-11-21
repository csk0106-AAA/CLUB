import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { attendanceState, rosterLevels, rosterSet, saveAttendanceState } from "@/lib/participants";
import { canSelect } from "@/lib/template-schema";

// 전체참여 회원이 소개를 쓰는 활동인지(선택참여는 선별 조건에 따로)
const actionNeedsIntro = (cfg: { preEvent: { steps: string[] } }) => cfg.preEvent.steps.includes("ai_interview");
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

// 활동참여자선택(예전 출석 체크): 이 활동에 참여할 사람과 참여 방식(전체참여 / 선택참여)을 관리자가 정한다. 일정 참석 신청 여부는 참고용.
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const c = await load(id, aid);
  if (!c) return bad("활동을 찾을 수 없어요.", 404);
  const [members, selected, applies, state, profiles, interviews] = await Promise.all([
    c.s.list("Members"), rosterSet(c.act), c.s.list("EventApplies"), attendanceState(aid), c.s.list("Profiles", { omit: ["draftMd", "introMd", "readingMd"] }), c.s.list("Interviews", { omit: ["messages"] }),
  ]);
  // '내가 누구일까요?'(소개 작성 활동): 프로필 북에 실명 소개가 이미 공개된 회원(이 활동에서 쓴 소개가 아니면) — 선택참여만 된다(전체참여는 회원이 소개를 내린 뒤)
  const cfg = readConfig(c.act.config);
  const who = cfg ? isWhoAmI(cfg) : false;
  const levels = await rosterLevels(c.act);
  const bookBlocked = (mid: string) => who && profiles.find((p) => p.memberId === mid)?.introStatus === "approved" && !interviews.some((i) => i.memberId === mid && i.eventActivityId === aid && i.status !== "optout");
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
        return { id: m.id, name: m.name, answer: ap?.answer ?? "", days: ap?.days ?? "", selected: selected.has(m.id), published, level: levels.get(m.id) ?? "full", bookBlocked: bookBlocked(m.id) };
      }),
  });
}

const body = z.union([
  z.object({ selected: z.array(z.string()).max(500), partial: z.array(z.string()).max(500).optional() }), // 선택한 사람 전체(partial: 그중 선택참여)를 저장
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

  // 참여 방식: 선택참여는 템플릿이 "선택 참여 가능"일 때만. 나머지는 전체참여.
  const cfg = readConfig(c.act.config);
  const partial = new Set("partial" in parsed.data && cfg && canSelect(cfg) ? parsed.data.partial ?? [] : []);
  // '내가 누구일까요?': 프로필 북에 실명 소개가 공개된 회원(북공개)은 선택참여만 된다.
  //  전체참여(별칭으로 새 소개 + 2진실 1거짓 + 현장 차례)로 하려면 관리자가 회원과 이야기해, 회원이 프로필 북 소개를
  //  "승인 취소"로 내린 뒤 전체참여로 넣는다(그러면 활동에서 인터뷰부터 새로 한다).
  if (cfg && isWhoAmI(cfg) && actionNeedsIntro(cfg)) {
    const [profiles, interviews] = await Promise.all([c.s.list("Profiles", { omit: ["draftMd", "introMd", "readingMd"] }), c.s.list("Interviews", { omit: ["messages"] })]);
    const blocked = ids.filter((mid) => !partial.has(mid) && profiles.find((p) => p.memberId === mid)?.introStatus === "approved" && !interviews.some((i) => i.memberId === mid && i.eventActivityId === aid && i.status !== "optout"));
    if (blocked.length) {
      const names = blocked.map((mid) => members.find((m) => m.id === mid)?.name ?? "").filter(Boolean).join(", ");
      return bad(`북공개 회원(${names})은 선택참여로만 넣을 수 있어요. 전체참여로 하려면 회원이 프로필 북 소개를 “승인 취소”로 내린 뒤 다시 넣어 주세요.`);
    }
  }
  // 선택한 사람 전체로 바꾼다.
  for (const r of (await c.s.list("Attendance")).filter((r) => r.eventActivityId === aid)) await c.s.remove("Attendance", r.id);
  for (const mid of ids) await c.s.insert("Attendance", { eventActivityId: aid, memberId: mid, present: "true", level: partial.has(mid) ? "partial" : "full" });

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
