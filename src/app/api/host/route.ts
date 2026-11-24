import { NextResponse } from "next/server";
import { getSession, can } from "@/lib/auth";
import { activityKind, activityMode, liveView, readConfig } from "@/lib/activities";
import { hostTeamOf, isHost } from "@/lib/hosts";
import { getStore } from "@/lib/store";
import { hostScreen, liveOf, teamRunInfo } from "@/lib/team-run";

export const dynamic = "force-dynamic";

// 진행자 첫 화면: 진행자 접속번호로 들어온 회원이 진행할 활동 목록.
// 관리자가 열면 mode "admin" 만 알려 준다(진행자 화면의 "돌아가기" 버튼을 고르는 데 쓴다).
// 조 진행자는 맡은 조의 진행 화면(?team=조 id)과 그 조의 회원 화면 상태가 보인다.
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  if (!s.host) {
    const admin = can(s, "templates") || can(s, "events");
    return NextResponse.json({ mode: admin ? "admin" : "member", name: s.name, items: [] });
  }

  const st = await getStore();
  const [events, acts, lives] = await Promise.all([st.list("Events"), st.list("EventActivities"), st.list("LiveState")]);
  const mine = acts.filter((a) => s.host!.includes(a.id) && isHost(a, s.mid)); // 지정이 풀렸거나 다른 사람으로 바뀌면 바로 목록에서 빠진다.
  const items = (await Promise.all(mine.map(async (a) => {
    const cfg = readConfig(a.config);
    const ev = events.find((e) => e.id === a.eventId);
    if (!cfg || !ev) return [];
    const kind = activityKind(cfg);
    const run = await teamRunInfo(a);
    const teamId = hostTeamOf(a, s.mid);
    const team = teamId ? run.teams.find((t) => t.id === teamId) : undefined;
    let screen =
      kind === "who" ? `/host/${ev.id}/${a.id}`
      : kind === "worry" ? `/host/worry/${ev.id}/${a.id}`
      : activityMode(cfg) === "team" ? `/host/teams/${ev.id}/${a.id}`
      : "";
    // 조 진행자: 맡은 조의 진행 화면(조별 진행이 꺼져 있으면 열지 않는다)
    if (teamId) screen = team ? `${hostScreen(kind, ev.id, a.id)}?team=${encodeURIComponent(team.id)}` : "";
    return [{
      eventId: ev.id,
      eventName: ev.name,
      id: a.id,
      name: cfg.name,
      startsAt: a.startsAt || ev.startsAt,
      endsAt: a.endsAt,
      screen,
      steps: cfg.onsite.steps.filter((x) => x.hostButton).map((x) => ({ key: x.key, label: x.hostButton })),
      live: liveView(cfg, liveOf(lives, a.id, team ? team.id : "")),
      // 조 진행자: 맡은 조 이름, teamOff = 조별 진행이 꺼져 있어 아직 진행할 수 없음
      teamHost: teamId ? { name: team?.name ?? "", teamOff: !team } : null,
      // 활동 전체 진행자: 조별 진행이 켜져 있으면 단계 버튼을 모든 조에 같이 적용한다
      teamRun: run.on,
    }];
  }))).flat().sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  return NextResponse.json({ mode: "host", name: s.name, items });
}
