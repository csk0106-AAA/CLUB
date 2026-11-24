import { NextResponse } from "next/server";
import { teams, teamsState, type Team } from "./capsule";
import { readHosts } from "./hosts";
import { getStore } from "./store";
import type { Row } from "./store/types";

// 조별 진행: 활동의 "조별로 따로 진행"(EventActivities.teamRun)을 켜면 조마다 회원 화면(LiveState)·차례(Rounds)·고민 뽑기를 따로 둔다.
//  팀이 있고 배포됐을 때만 실제로 켜진다(초안으로 되돌리면 다시 배포할 때까지 활동 전체로 진행).
//  LiveState.teamId / Rounds.teamId 가 비어 있으면 활동 전체(예전 행, 조별 진행이 꺼진 활동).
export type TeamRun = { on: boolean; stored: boolean; teams: Team[] };

export async function teamRunInfo(act: Row | undefined): Promise<TeamRun> {
  if (!act || act.teamRun !== "true") return { on: false, stored: false, teams: [] };
  const [ts, st] = await Promise.all([teams(act.id), teamsState(act.id)]);
  const on = st.published && ts.length > 0;
  return { on, stored: true, teams: on ? ts : [] };
}

const tid = (r: Row) => r.teamId ?? "";
// 이 활동의 회원 화면 상태 한 줄(teamId "" = 활동 전체)
export const liveOf = (lives: Row[], aid: string, teamId = ""): Row | undefined =>
  lives.find((l) => l.eventActivityId === aid && tid(l) === teamId);
// 이 활동의 회원 화면 상태 모두(활동 전체 + 조별)
export const livesOf = (lives: Row[], aid: string): Row[] => lives.filter((l) => l.eventActivityId === aid);

// 회원이 따를 조: 조별 진행이 켜져 있고 그 회원이 조에 있으면 그 조 id, 아니면 ""(활동 전체)
export const teamIdIn = (run: TeamRun, memberId: string): string =>
  run.on ? run.teams.find((t) => t.memberIds.includes(memberId))?.id ?? "" : "";
export async function memberTeamId(act: Row | undefined, memberId: string): Promise<string> {
  return teamIdIn(await teamRunInfo(act), memberId);
}

// 진행자 API 가 다룰 범위.
//  teamId: 다룰 조("" = 활동 전체), all: 모든 조에 같이 적용(단계 열기·잠그기·처음으로만),
//  inScope: 이 범위에 드는 회원인지(차례 대상·투표 분모·고민 뽑기에 쓴다)
export type Scope = {
  on: boolean;
  teamId: string;
  all: boolean;
  team: Team | null;
  teams: Team[];
  inScope: (memberId: string) => boolean;
};

const deny = (error: string, status = 403) => NextResponse.json({ error }, { status });

// 주소의 ?team= 으로 범위를 고른다. 조 진행자(g.team)는 늘 맡은 조로 고정되고, 다른 조를 부르면 403.
//  조별 진행이 꺼져 있으면 예전처럼 활동 전체(조 진행자는 진행할 수 없다).
export async function scopeOf(req: Request, act: Row, g: { team: string }, opts: { allowAll?: boolean } = {}): Promise<Scope | NextResponse> {
  const run = await teamRunInfo(act);
  const want = (new URL(req.url).searchParams.get("team") ?? "").trim();
  if (!run.on) {
    if (g.team) return deny("조별 진행이 꺼져 있어요. 관리자가 팀 구성에서 “조별로 따로 진행”을 켜면 진행할 수 있어요.", 409);
    return { on: false, teamId: "", all: false, team: null, teams: [], inScope: () => true };
  }
  const inTeams = new Set(run.teams.flatMap((t) => t.memberIds));
  const one = (team: Team): Scope => ({ on: true, teamId: team.id, all: false, team, teams: run.teams, inScope: (m) => team.memberIds.includes(m) });
  if (g.team) {
    if (want && want !== g.team) return deny("맡은 조만 진행할 수 있어요.");
    const team = run.teams.find((t) => t.id === g.team);
    if (!team) return deny("맡은 조를 찾을 수 없어요. 관리자에게 확인해 주세요.");
    return one(team);
  }
  if (want === "all") {
    if (!opts.allowAll) return deny("진행할 조를 골라 주세요.", 400);
    return { on: true, teamId: "", all: true, team: null, teams: run.teams, inScope: () => true };
  }
  if (want) {
    const team = run.teams.find((t) => t.id === want);
    if (!team) return deny("없는 조예요. 화면을 새로 고쳐 주세요.", 400);
    return one(team);
  }
  // 조를 고르지 않으면 활동 전체(조에 없는 사람만)
  return { on: true, teamId: "", all: false, team: null, teams: run.teams, inScope: (m) => !inTeams.has(m) };
}

// 진행 화면 주소: 내가 누구일까요? / 나의 고민은? 은 그 진행 화면, 그 밖에는 팀 화면(단계 버튼이 있다)
export function hostScreen(kind: string, eventId: string, aid: string): string {
  return kind === "who" ? `/host/${eventId}/${aid}` : kind === "worry" ? `/host/worry/${eventId}/${aid}` : `/host/teams/${eventId}/${aid}`;
}

// 팀 구성이 바뀐 뒤: 조 진행자가 그 조에 더 이상 없거나 조가 없어졌으면 조 진행자 지정을 푼다(활동 전체 진행자는 그대로).
//  돌려주는 값: 지정이 풀린 회원 id
export async function pruneTeamHosts(aid: string): Promise<string[]> {
  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid);
  if (!act) return [];
  const hs = readHosts(act);
  const ts = await teams(aid);
  const keep = hs.filter((h) => !h.teamId || ts.some((t) => t.id === h.teamId && t.memberIds.includes(h.memberId)));
  if (keep.length === hs.length) return [];
  await s.update("EventActivities", aid, { hosts: JSON.stringify(keep) });
  return hs.filter((h) => !keep.includes(h)).map((h) => h.memberId);
}
