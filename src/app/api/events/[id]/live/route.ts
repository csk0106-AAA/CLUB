import { NextResponse } from "next/server";
import { lockedFor } from "@/lib/event-visibility";
import { memberGuide } from "@/lib/template-schema";
import { bad, guard } from "@/lib/api";
import { activityKind, guessStatus, liveView, preStatus, readConfig, windowBase } from "@/lib/activities";
import { canJoin, isLimited, stepAllowed } from "@/lib/participants";
import { memberWorry } from "@/lib/worry";
import { flowAwards, memberRound } from "@/lib/rounds";
import { eventJoinable, eventVisible } from "@/lib/audience";
import { getStore } from "@/lib/store";
import { hostTeamOf } from "@/lib/hosts";
import { hostScreen, liveOf, teamIdIn, teamRunInfo } from "@/lib/team-run";

export const dynamic = "force-dynamic";

// 회원 화면이 2초마다 부르는 곳: 활동별 사전 작성 상태와 현장 진행 상태.
// 이 응답에는 활동 내용(소개글, 정답 등)을 넣지 않는다. 어떤 화면을 켤지만 알려준다.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, acts, lives, members] = await Promise.all([s.list("Events"), s.list("EventActivities"), s.list("LiveState"), s.list("Members")]);
  const me = members.find((m) => m.id === g.s.mid);
  const ev = events.find((e) => e.id === id && eventVisible(e, me ?? g.s.mid));
  if (!ev) return bad("일정을 찾을 수 없어요.", 404);
  // 다른 클럽 일정은 개요만 읽을 수 있고 활동에는 들어갈 수 없다.
  if (!eventJoinable(ev, me ?? g.s.mid)) return bad("이 클럽 회원만 활동에 참여할 수 있어요.", 403);

  // 미응답·불참 회원에게 주요 활동이 닫혀 있으면 보내지 않는다(lib/event-visibility.ts)
  const going = (await s.list("EventApplies")).some((x) => x.eventId === id && x.memberId === g.s.mid && x.answer === "참석");
  if (lockedFor(ev, going).includes("activities")) return NextResponse.json({ activities: [], locked: true });
  const mine = acts
    .filter((a) => a.eventId === id)
    .sort((a, b) => Number(a.order) - Number(b.order))
    .flatMap((a) => {
      const cfg = readConfig(a.config);
      return cfg ? [{ a, cfg }] : [];
    });
  // 활동참여자 참여 방식(전체참여·선택참여)은 출석 체크 표에서 한 번만 읽는다
  const attendance = (await s.list("Attendance")).filter((r) => r.memberId === g.s.mid && r.present === "true");
  const levelOf = (aid: string) => {
    const r = attendance.find((x) => x.eventActivityId === aid);
    return r ? (r.level === "partial" ? "partial" as const : "full" as const) : undefined;
  };
  const activities = await Promise.all(
    mine.map(async ({ a, cfg }) => {
      // 조별 진행이면 내가 속한 조의 회원 화면·차례를 따른다(조에 없으면 활동 전체)
      const run = await teamRunInfo(a);
      const team = teamIdIn(run, g.s.mid);
      const live = liveView(cfg, liveOf(lives, a.id, team));
      // 내가 이 활동의 조 진행자면 "○조 진행하기" 버튼(조별 진행이 켜져 있을 때만)
      const hostTeam = run.on ? run.teams.find((t) => t.id === hostTeamOf(a, g.s.mid)) : undefined;
      const kind = activityKind(cfg);
      return {
        id: a.id,
        name: cfg.name,
        description: cfg.description,
        guide: memberGuide(cfg), // 회원에게 보이는 활동 안내(목록)
        pre: preStatus(cfg, windowBase(a, ev)),
        guess: guessStatus(cfg, windowBase(a, ev)),
        kind,
        participants: isLimited(cfg) ? "selected" : "all",
        canJoin: await canJoin(cfg, a, ev, g.s.mid),
        startsAt: a.startsAt, // 활동 날짜와 진행 시간(안내용)
        endsAt: a.endsAt,
        live,
        liveAt: liveOf(lives, a.id, team)?.updatedAt ?? "", // 이 활동 진행 화면이 마지막으로 바뀐 시각(가장 최근 활동만 알림 줄에)
        // 지금 열린 현장 단계를 내가 할 수 있는지(선택참여 회원은 선별 조건에 있는 단계만). false 면 회원 화면에 기다림 안내를 보인다.
        stepAllowed: stepAllowed(cfg, levelOf(a.id), live.stepKey),
        // 현장 진행 중인 사람(라운드): 내가 보는 화면만. 정답은 공개 단계 전에는 포함하지 않는다.
        round: kind === "who" ? await memberRound(a, ev, g.s.mid, cfg, team) : null,
        worry: kind === "worry" ? await memberWorry(a, ev, g.s.mid, cfg, team) : null,
        // 현장 맞히기 흐름의 시상(진행자가 시상 발표를 열었을 때): 내 조의 추측왕·직감왕
        awards: kind === "who" && live.stepKey === "awards" ? await flowAwards(a.id, run.on ? (() => { const t = run.teams.find((x) => x.id === team); return t ? { teamId: t.id, inScope: (m: string) => t.memberIds.includes(m) } : undefined; })() : undefined) : null,
        teamName: team ? run.teams.find((t) => t.id === team)?.name ?? "" : "",
        teamHost: hostTeam ? { name: hostTeam.name, href: `${hostScreen(kind, id, a.id)}?team=${encodeURIComponent(hostTeam.id)}` } : null,
      };
    }),
  );
  return NextResponse.json({ activities });
}
