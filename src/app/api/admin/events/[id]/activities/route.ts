import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { liveView, preStatus, readConfig, windowBase } from "@/lib/activities";
import { attendanceState, rosterSet } from "@/lib/participants";
import { readHosts } from "@/lib/hosts";
import { getStore } from "@/lib/store";
import { liveOf, teamRunInfo } from "@/lib/team-run";
import { teams } from "@/lib/capsule";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 일정에 들어간 활동 + 현재 사전 작성 상태 + 현장 진행 상태
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, acts, lives] = await Promise.all([s.list("Events"), s.list("EventActivities"), s.list("LiveState")]);
  const ev = events.find((e) => e.id === id);
  if (!ev) return bad("일정을 찾을 수 없어요.", 404);

  const mine = acts.filter((a) => a.eventId === id).sort((a, b) => Number(a.order) - Number(b.order));
  const rosterCounts = await Promise.all(mine.map(async (a) => (await rosterSet(a)).size));
  const states = await Promise.all(mine.map((a) => attendanceState(a.id)));
  const runs = await Promise.all(mine.map((a) => teamRunInfo(a)));
  // 조 진행자 이름표(○조)에 쓸 팀 이름: 조 진행자가 있는 활동만 읽는다
  const teamLists = await Promise.all(mine.map((a) => (readHosts(a).some((h) => h.teamId) ? teams(a.id) : Promise.resolve([]))));
  const activities = mine.flatMap((a, i) => {
    const config = readConfig(a.config);
    if (!config) return [];
    const live = liveOf(lives, a.id);
    const hs = readHosts(a);
    return [{
      id: a.id,
      templateId: a.templateId,
      templateVersion: Number(a.templateVersion) || 1,
      config,
      pre: preStatus(config, windowBase(a, ev)),
      live: liveView(config, live),
      // 활동의 날짜와 진행 시간은 안내용 정보다(참여 대상 판정과 연결하지 않는다).
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      rosterCount: rosterCounts[i],
      attendanceConfirmed: states[i].confirmed,
      // 진행자 여러 명 [{memberId, code, teamId?, teamName?}] — teamId 가 있으면 조 진행자
      hosts: hs.map((h) => (h.teamId ? { ...h, teamName: teamLists[i].find((t) => t.id === h.teamId)?.name ?? "" } : h)),
      // 조별 진행: teamRun 스위치(저장된 값), teamRunOn 실제로 켜졌는지(팀 배포됨), teams 조마다 회원 화면 상태·조 진행자
      teamRun: a.teamRun === "true",
      teamRunOn: runs[i].on,
      teams: runs[i].teams.map((t) => ({ id: t.id, name: t.name, live: liveView(config, liveOf(lives, a.id, t.id)), hostId: hs.find((h) => h.teamId === t.id)?.memberId ?? "" })),
    }];
  });
  return NextResponse.json({ activities });
}

// 활동 순서 바꾸기: { order: [활동 id …] } 이 일정의 활동 전부를 새 순서대로. 회원 화면(주요 활동·활동 길·바로가기·조편성)도 이 순서를 따른다.
const orderBody = z.object({ order: z.array(z.string().min(1)).min(1).max(50) });
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = orderBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("순서를 확인해 주세요.");
  const s = await getStore();
  const mine = (await s.list("EventActivities", { fresh: true })).filter((a) => a.eventId === id);
  const want = parsed.data.order;
  // 화면이 오래돼서 그사이 활동이 더해지거나 빠졌으면 다시 불러오게 한다
  if (want.length !== mine.length || new Set(want).size !== want.length || !want.every((x) => mine.some((a) => a.id === x))) {
    return bad("그사이 활동이 바뀌었어요. 화면을 새로 고친 뒤 다시 해 주세요.", 409);
  }
  for (const [i, aid] of want.entries()) {
    const a = mine.find((x) => x.id === aid)!;
    if (a.order !== String(i + 1)) await s.update("EventActivities", aid, { order: String(i + 1) });
  }
  return NextResponse.json({ ok: true });
}

const addBody = z.object({ templateId: z.string().min(1), participants: z.enum(["all", "selected"]).optional() });

// 템플릿에서 활동을 골라 일정에 넣는다. 설정은 그 시점 것을 복사해 일정별로 따로 수정할 수 있다.
export async function POST(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = addBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("템플릿을 골라 주세요.");
  const s = await getStore();
  if (!(await s.list("Events")).some((e) => e.id === id)) return bad("일정을 찾을 수 없어요.", 404);
  const tpl = (await s.list("ActivityTemplates")).find((t) => t.id === parsed.data.templateId);
  const tcfg = readConfig(tpl?.config);
  if (!tpl || !tcfg) return bad("템플릿을 찾을 수 없어요.", 404);
  // 참여 대상은 이 일정에서 정한다(고르지 않으면 템플릿 값)
  const part = "selected"; // 모든 활동은 일정에서 활동참여자선택으로 참여자를 고른다

  const acts = (await s.list("EventActivities")).filter((a) => a.eventId === id);
  const order = acts.reduce((n, a) => Math.max(n, Number(a.order) || 0), 0) + 1;
  const row = await s.insert("EventActivities", {
    eventId: id,
    templateId: tpl.id,
    templateVersion: tpl.version,
    config: part === tcfg.participants ? tpl.config : JSON.stringify({ ...tcfg, participants: part }),
    state: "ready",
    order: String(order),
  });
  return NextResponse.json({ activity: { id: row.id } });
}
