import { NextResponse } from "next/server";
import { bad, parseJson, hostGuard } from "@/lib/api";
import { liveView } from "@/lib/activities";
import { activeRound, currentRound, eligibleTargets, flowPhase, isFlow, liveRow, loadStage, missingSteps, rounds, type RoundState } from "@/lib/rounds";
import { actionSet, joinSet } from "@/lib/participants";
import { guessActionKey, onsiteKeyOf } from "@/lib/template-schema";
import { getStore } from "@/lib/store";
import { leftoverWorryLink, nextHostLink, scopeOf } from "@/lib/team-run";

export const dynamic = "force-dynamic";

// 진행자 전체화면이 2초마다 읽는 곳. 이름과 정답은 공개 단계가 되기 전에는 내려주지 않는다.
export async function GET(req: Request, ctx: { params: Promise<{ id: string; aid: string }> }) {
  const g = await hostGuard((await ctx.params).aid);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const st = await loadStage(id, aid);
  if (typeof st === "string") return bad(st, 404);

  // 조별 진행이면 ?team=조 id 의 차례·회원 화면(조 진행자는 맡은 조로 고정)
  const sc = await scopeOf(req, st.act, g);
  if (sc instanceof NextResponse) return sc;
  const s = await getStore();
  // 현장 맞히기 흐름이면 지금 차례 = 진행 중인 차례(없으면 마지막으로 바뀐 차례)
  const flowMode = isFlow(st.cfg);
  const list = flowMode ? await rounds(aid, sc.teamId) : [];
  const cur = flowMode ? activeRound(list) : await currentRound(aid, sc.teamId);
  const join = await joinSet(st.cfg, st.act, st.ev);
  const [members, profiles, tls, guesses, votes, live, all, pool] = await Promise.all([
    s.list("Members"), s.list("Profiles"), s.list("TruthLies"), s.list("Guesses"), s.list("Votes"),
    liveRow(aid, sc.teamId), rounds(aid, sc.on ? sc.teamId : undefined), eligibleTargets(aid, join, sc.inScope),
  ]);
  const nameOf = (mid: string) => members.find((m) => m.id === mid)?.name ?? "";
  // 현장 맞히기 흐름: 이 조의 차례 목록(이름은 공개된 것만)과 지금 단계
  const flow = !flowMode ? null : {
    phase: flowPhase(list),
    awards: live?.step === "awards",
    hasAwards: st.cfg.onsite.steps.some((x) => x.key === "awards"),
    rounds: list.map((r) => ({
      orderNo: Number(r.orderNo),
      targetId: r.nameRevealed === "true" ? r.targetMemberId : "",
      alias: profiles.find((p) => p.memberId === r.targetMemberId)?.alias ?? "",
      state: r.state,
      name: r.nameRevealed === "true" ? nameOf(r.targetMemberId) : "",
    })),
  };
  // 시상까지 마치면 다음 활동으로 바로(진행 화면 주소)
  const next = await nextHostLink(st.act, g.s, sc.team?.name ?? "");
  // 남은 활동이 없을 때: 아직 뽑지 않은 고민이 있으면 다시 나누기
  const leftover = next ? null : await leftoverWorryLink(st.act, g.s, sc.team?.name ?? "");
  const base = {
    flow,
    next,
    leftover,
    event: { id: st.ev.id, name: st.ev.name },
    activity: { id: aid, name: st.cfg.name, participants: st.cfg.participants },
    // 조별 진행: 지금 보는 조와 고를 수 있는 조(조 진행자는 맡은 조만)
    team: sc.team ? { id: sc.team.id, name: sc.team.name } : null,
    teams: sc.on ? (g.team ? sc.teams.filter((t) => t.id === g.team) : sc.teams).map((t) => ({ id: t.id, name: t.name })) : [],
    missingSteps: missingSteps(st.cfg),
    live: liveView(st.cfg, live),
    steps: st.cfg.onsite.steps.map((x) => ({ key: x.key, label: x.label, memberScreen: x.memberScreen, unlock: x.unlock })),
    playedCount: all.filter((r) => r.state === "answer").length,
    remaining: pool.length,
    // 순서를 지정할 때 고를 수 있는 사람(이름만). 누구의 별칭인지는 알려 주지 않는다.
    selectable: pool.map((m) => ({ id: m.id, name: m.name })),
  };
  if (!cur) return NextResponse.json({ ...base, round: null });

  const state = cur.state as RoundState;
  const target = cur.targetMemberId;
  const named = cur.nameRevealed === "true";
  const tl = tls.find((t) => t.memberId === target && t.eventActivityId === aid);
  const lie = tl?.lieIndex ? Number(tl.lieIndex) : 0;
  const rv = votes.filter((v) => v.roundId === cur.id);
  // 분모(투표 n / m명, 사전 추측 n / m명): 그 단계를 실제로 할 수 있는 사람만 센다.
  //  활동참여자(출석 체크로 고른 회원, 일정 대상 안) 중 이번 차례 당사자는 빼고,
  //  선택참여 회원은 선별 조건에 그 단계(거짓 투표·사전 맞히기)가 있는 사람만(서버 판정 canAct 와 같은 규칙).
  const [voteSet, guessSet] = await Promise.all([
    actionSet(st.cfg, st.act, st.ev, onsiteKeyOf(st.cfg, "vote")),
    actionSet(st.cfg, st.act, st.ev, guessActionKey(st.cfg)),
  ]);
  //  조별 진행이면 그 조 회원만 센다.
  const eligible = members.filter((m) => m.id !== target && voteSet.has(m.id) && sc.inScope(m.id));
  const guessEligible = members.filter((m) => m.id !== target && guessSet.has(m.id) && sc.inScope(m.id));

  // 사전 추측 결과: 누가 누구를 몇 표로 골랐는지(추측 결과 단계부터)
  let guessResults: { name: string; count: number }[] = [];
  if (state !== "intro" && state !== "guess" && state !== "guessed") {
    const counts = new Map<string, number>();
    for (const x of guesses) {
      if (x.eventActivityId === aid && x.targetMemberId === target && sc.inScope(x.guesserId)) counts.set(x.chosenMemberId, (counts.get(x.chosenMemberId) ?? 0) + 1);
    }
    guessResults = [...counts.entries()].map(([mid, count]) => ({ name: nameOf(mid), count })).sort((a, b) => b.count - a.count);
  }

  // 사전 추측 참여 인원(소개 단계부터, 숫자만). 누가 누구를 골랐는지는 결과 단계 전에는 알려 주지 않는다.
  const eligibleIds = new Set(guessEligible.map((m) => m.id));
  const guessers = new Set(
    guesses.filter((x) => x.eventActivityId === aid && x.targetMemberId === target && eligibleIds.has(x.guesserId)).map((x) => x.guesserId),
  );

  const showStatements = state === "voting" || state === "closed" || state === "answer";
  const counts = [0, 1, 2].map((i) => rv.filter((v) => Number(v.chosenIndex) === i).length);
  // 아직 투표하지 않은 분(진행자 화면에만, 투표 중·마감 단계에서만)
  const votedIds = new Set(rv.map((v) => v.voterId));
  const votedEligible = eligible.filter((m) => votedIds.has(m.id)).length;
  const notVoted = state === "voting" || state === "closed"
    ? eligible.filter((m) => !votedIds.has(m.id)).map((m) => m.name).sort((a, b) => a.localeCompare(b, "ko"))
    : [];
  return NextResponse.json({
    ...base,
    round: {
      id: cur.id,
      state,
      orderNo: Number(cur.orderNo),
      alias: profiles.find((p) => p.memberId === target)?.alias ?? "",
      introMd: profiles.find((p) => p.memberId === target)?.introMd ?? "",
      nameRevealed: named,
      name: named ? nameOf(target) : "",
      guessResults,
      guessTotal: guessResults.reduce((n, x) => n + x.count, 0),
      statements: showStatements ? parseJson<string[]>(tl?.statements, []) : [],
      guessJoined: guessers.size,
      guessEligible: guessEligible.length,
      // voted: 분모에 든 사람 중 투표한 수(n / m의 n), total: 모든 표 수(막대 비율)
      votes: { counts, voted: votedEligible, total: rv.length, eligible: eligible.length, notVoted },
      lieIndex: state === "answer" ? lie : -1,
      correctVoters: state === "answer" ? rv.filter((v) => Number(v.chosenIndex) === lie).map((v) => nameOf(v.voterId)) : [],
      correctGuessers: state === "answer" || (flowMode && named) ? guesses.filter((x) => x.eventActivityId === aid && x.targetMemberId === target && x.chosenMemberId === target && sc.inScope(x.guesserId)).map((x) => nameOf(x.guesserId)) : [],
    },
  });
}
