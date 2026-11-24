import { randomInt } from "node:crypto";
import { isWhoAmI, liveView, readConfig, type LiveView } from "./activities";
import { parseJson } from "./api";
import { actionSet, canJoin, joinSet, onsiteGate } from "./participants";
import { isGuest } from "./member-kind";
import { getStore } from "./store";
import type { Row } from "./store/types";
import { onsiteGuessKey, onsiteKeyOf, type TemplateConfig } from "./template-schema";

// 한 사람씩 진행하는 라운드의 순서. 각 단계는 템플릿의 현장 단계(intro/reveal/vote/result)와 연결된다.
//  intro   소개 열림(이름 비공개)      → 템플릿 'intro' 단계
//  results 사전 추측 결과 공개
//  reveal  "저예요" 버튼 열림           → 템플릿 'reveal' 단계 (당사자 휴대폰에 버튼)
//  voting  거짓 투표 중                 → 템플릿 'vote' 단계 (회원 휴대폰에 투표 화면)
//  closed  투표 마감
//  answer  정답 공개                    → 템플릿 'result' 단계
//  (현장 맞히기 흐름 — 아래 doFlow — 에서는 guess · guessed · reveal · named · voting · answer)
export type RoundState = "intro" | "results" | "reveal" | "voting" | "closed" | "answer" | "guess" | "guessed" | "named";
export const REQUIRED_STEPS = ["intro", "reveal", "vote", "result"] as const;
const FLOW_STEPS = ["reveal", "vote", "result"] as const;

export type Action = "open" | "results" | "ready" | "name" | "vote" | "close" | "answer" | "back";

const FROM: Record<Exclude<Action, "open" | "name" | "back">, RoundState[]> = {
  results: ["intro"],
  ready: ["intro", "results"],
  vote: ["intro", "results", "reveal"],
  close: ["voting"],
  answer: ["voting", "closed"],
};

export type StageCtx = { act: Row; ev: Row; cfg: TemplateConfig };

// 일정과 활동 확인. '내가 누구일까요?' 방식의 활동이어야 한다.
export async function loadStage(eventId: string, aid: string): Promise<StageCtx | string> {
  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid && a.eventId === eventId);
  const cfg = act ? readConfig(act.config) : null;
  const ev = (await s.list("Events")).find((e) => e.id === eventId);
  if (!act || !cfg || !ev) return "활동을 찾을 수 없어요.";
  if (!isWhoAmI(cfg)) return "소개 작성이 있는 활동이 아니에요.";
  return { act, ev, cfg };
}

export function missingSteps(cfg: TemplateConfig): string[] {
  const need: readonly string[] = onsiteGuessKey(cfg) ? FLOW_STEPS : REQUIRED_STEPS;
  return need.filter((k) => !cfg.onsite.steps.some((s) => s.key === k));
}

// teamId: 조별 진행(lib/team-run.ts)이면 그 조의 줄, "" 이면 활동 전체(예전 행·조별 진행이 꺼진 활동)
const tidOf = (r: Row) => r.teamId ?? "";

export async function liveRow(aid: string, teamId = ""): Promise<Row | undefined> {
  return (await (await getStore()).list("LiveState")).find((l) => l.eventActivityId === aid && tidOf(l) === teamId);
}

export async function setLive(aid: string, step: string | null, unlocked: boolean, payload?: Record<string, unknown>, teamId = ""): Promise<void> {
  const s = await getStore();
  const cur = await liveRow(aid, teamId);
  const patch: Record<string, string> = { memberUnlocked: String(unlocked), updatedAt: new Date().toISOString() };
  if (step !== null) patch.step = step;
  if (payload) patch.payload = JSON.stringify(payload);
  if (cur) await s.update("LiveState", cur.id, patch);
  else await s.insert("LiveState", { eventActivityId: aid, step: step ?? "", ...patch, teamId });
}

// teamId 를 주면 그 조의 차례만, 주지 않으면 활동의 모든 차례
export async function rounds(aid: string, teamId?: string): Promise<Row[]> {
  return (await (await getStore()).list("Rounds"))
    .filter((r) => r.eventActivityId === aid && (teamId === undefined || tidOf(r) === teamId))
    .sort((a, b) => Number(a.orderNo) - Number(b.orderNo));
}

export async function currentRound(aid: string, teamId = ""): Promise<Row | undefined> {
  const r = await rounds(aid, teamId);
  return r[r.length - 1];
}

// 진행 범위: 조별 진행이면 그 조(teamId)와 그 조 회원(inScope). 기본은 활동 전체.
export type RoundScope = { teamId: string; inScope: (memberId: string) => boolean };
export const WHOLE: RoundScope = { teamId: "", inScope: () => true };

// 진행할 수 있는 사람: 소개와 2진실 1거짓이 모두 승인된 회원 중 아직 진행하지 않은 사람.
// join 이 있으면(현장 참석자만 참여하는 활동) 그 안에 있는 사람만 나온다. inScope 를 주면 그 범위(조) 회원만.
// 이미 진행한 사람은 어느 조에서 했든 다시 나오지 않는다.
export async function eligibleTargets(aid: string, join: Set<string> | null = null, inScope: (memberId: string) => boolean = () => true): Promise<Row[]> {
  const s = await getStore();
  const [members, profiles, tls, played] = await Promise.all([
    s.list("Members"), s.list("Profiles"), s.list("TruthLies"), rounds(aid),
  ]);
  const done = new Set(played.map((r) => r.targetMemberId));
  return members.filter((m) => {
    const p = profiles.find((x) => x.memberId === m.id);
    const t = tls.find((x) => x.memberId === m.id && x.eventActivityId === aid);
    return p?.introStatus === "approved" && t?.status === "approved" && !done.has(m.id) && (!join || join.has(m.id)) && inScope(m.id);
  });
}

export type ActionResult = { ok: true } | { ok: false; error: string; status?: number };

// 진행자 버튼. 규칙(순서)을 서버가 지키고, 회원 화면은 LiveState 로 켜고 끈다.
export async function doAction(ctx: StageCtx, action: Action, targetMemberId?: string, scope: RoundScope = WHOLE): Promise<ActionResult> {
  const s = await getStore();
  const aid = ctx.act.id;
  const team = scope.teamId;
  // 이 범위(조)의 회원 화면만 바꾼다
  const live = (step: string | null, unlocked: boolean) => setLive(aid, step, unlocked, undefined, team);
  const miss = missingSteps(ctx.cfg);
  if (miss.length) return { ok: false, error: `이 활동의 템플릿에 필요한 단계가 없어요: ${miss.join(", ")}` };
  // 관리자 선택 회원 활동은 활동 전에 출석 체크를 완료해야 시작할 수 있다.
  if (action === "open") {
    const gate = await onsiteGate(ctx.cfg, ctx.act);
    if (gate) return { ok: false, error: gate, status: 409 };
  }

  const cur = await currentRound(aid, team);
  const now = new Date().toISOString();

  if (action === "open") {
    if (cur && cur.state !== "answer") return { ok: false, error: "진행 중인 사람이 있어요. 정답 공개까지 마친 뒤 다음 사람으로 넘어가요.", status: 409 };
    const pool = await eligibleTargets(aid, await joinSet(ctx.cfg, ctx.act, ctx.ev), scope.inScope);
    if (pool.length === 0) {
      if (team) return { ok: false, error: "이 조에서 진행할 사람이 더 없어요. 소개와 2진실 1거짓을 승인한 조원이 필요해요.", status: 409 };
      return { ok: false, error: ctx.cfg.participants === "selected" ? "진행할 사람이 더 없어요. 관리자가 선택한 회원 중 소개와 2진실 1거짓을 승인한 회원이 필요해요." : "진행할 사람이 더 없어요. 소개와 2진실 1거짓을 승인한 회원이 필요해요.", status: 409 };
    }
    let target = pool[randomInt(pool.length)];
    if (targetMemberId) {
      const pick = pool.find((m) => m.id === targetMemberId);
      if (!pick) return { ok: false, error: "이 사람은 지금 진행할 수 없어요(승인 전이거나 이미 진행했어요)." };
      target = pick;
    }
    const orderNo = String((cur ? Number(cur.orderNo) : 0) + 1);
    await s.insert("Rounds", { eventActivityId: aid, targetMemberId: target.id, state: "intro", orderNo, nameRevealed: "false", updatedAt: now, teamId: team });
    await live("intro", true);
    return { ok: true };
  }

  if (!cur) return { ok: false, error: "먼저 소개를 열어 주세요.", status: 409 };
  const state = cur.state as RoundState;

  if (action === "name") {
    if (state === "intro") return { ok: false, error: "추측 결과를 보여 준 뒤에 이름을 공개할 수 있어요.", status: 409 };
    await s.update("Rounds", cur.id, { nameRevealed: "true", updatedAt: now });
    return { ok: true };
  }

  // 한 단계 되돌리기. 기록(투표, 점수)이 남지 않은 경우에만 허용한다.
  //  intro            → 이 소개를 취소하고 이전 사람(정답 공개 화면)으로. 이 사람은 다시 순서에 들어간다.
  //  results, reveal  → 소개 화면으로
  //  voting, closed   → 아직 아무도 투표하지 않았으면 "저예요" 단계로
  //  answer           → 되돌릴 수 없음(점수에 반영됨)
  if (action === "back") {
    if (state === "intro") {
      const hasVotes = (await s.list("Votes")).some((v) => v.roundId === cur.id);
      if (hasVotes) return { ok: false, error: "이미 기록이 있어서 되돌릴 수 없어요.", status: 409 };
      await s.remove("Rounds", cur.id);
      const prev = await currentRound(aid, team);
      if (prev) await live("result", true);
      else await live("", false);
      return { ok: true };
    }
    if (state === "results" || state === "reveal") {
      await s.update("Rounds", cur.id, { state: "intro", updatedAt: now });
      await live("intro", true);
      return { ok: true };
    }
    if (state === "voting" || state === "closed") {
      const hasVotes = (await s.list("Votes")).some((v) => v.roundId === cur.id);
      if (hasVotes) return { ok: false, error: "이미 투표한 분이 있어서 되돌릴 수 없어요. 투표를 마감하고 정답을 공개해 주세요.", status: 409 };
      await s.update("Rounds", cur.id, { state: "reveal", updatedAt: now });
      await live("reveal", true);
      return { ok: true };
    }
    return { ok: false, error: "정답을 공개한 뒤에는 되돌릴 수 없어요.", status: 409 };
  }

  if (!FROM[action].includes(state)) return { ok: false, error: "지금 단계에서는 누를 수 없는 버튼이에요.", status: 409 };

  if (action === "results") {
    await s.update("Rounds", cur.id, { state: "results", updatedAt: now });
  } else if (action === "ready") {
    await s.update("Rounds", cur.id, { state: "reveal", updatedAt: now });
    await live("reveal", true);
  } else if (action === "vote") {
    await s.update("Rounds", cur.id, { state: "voting", updatedAt: now });
    await live("vote", true);
  } else if (action === "close") {
    await s.update("Rounds", cur.id, { state: "closed", updatedAt: now });
    await live(null, false);
  } else if (action === "answer") {
    await s.update("Rounds", cur.id, { state: "answer", nameRevealed: "true", updatedAt: now });
    await live("result", true);
  }
  return { ok: true };
}

/* ───── 회원에게 보이는 라운드 정보 ───── */

export type MemberRound = {
  id: string;
  canJoin: boolean; // 현장 참여 대상인지(참석자만 참여하는 활동에서 참석 신청을 안 했으면 false)
  state: RoundState;
  alias: string;
  isTarget: boolean;
  screen: LiveView["memberScreen"];
  nameRevealed: boolean;
  name: string;
  statements: string[];
  voted: boolean;
  myVote: number;
  lieIndex: number; // 정답 공개 전에는 -1
  correct: boolean | null;
  // 현장 맞히기 흐름에서만
  flow?: boolean;
  profileId?: string;
  introMd?: string;
  candidates?: { id: string; name: string }[]; // 맞히기 후보(같은 조원, 나 빼고)
  myGuess?: string; // 내가 고른 회원 이름
  myGuessId?: string;
  guessRight?: boolean | null; // 이름 공개 뒤: 내가 맞혔는지(고르지 않았으면 null)
  guessOpen?: boolean; // 지금 고를 수 있는지(진행자가 맞히기를 열어 둠)
};

// teamId: 이 회원이 따르는 조(조별 진행이 아니면 "")
export async function memberRound(act: Row, ev: Row, memberId: string, cfg: TemplateConfig, teamId = ""): Promise<MemberRound | null> {
  if (onsiteGuessKey(cfg)) return memberFlowRound(act, ev, memberId, cfg, teamId);
  const aid = act.id;
  const s = await getStore();
  const cur = await currentRound(aid, teamId);
  if (!cur) return null;
  const [profiles, tls, votes, members, live] = await Promise.all([
    s.list("Profiles"), s.list("TruthLies"), s.list("Votes"), s.list("Members"), liveRow(aid, teamId),
  ]);
  const view = liveView(cfg, live);
  // 활동을 마쳤으면(회원 화면 진행이 꺼짐) 마지막 소개를 진행 중으로 보이지 않는다
  if (!view.active) return null;
  const target = cur.targetMemberId;
  const state = cur.state as RoundState;
  const tl = tls.find((t) => t.memberId === target && t.eventActivityId === aid);
  const mine = votes.find((v) => v.roundId === cur.id && v.voterId === memberId);
  const showStatements = state === "voting" || state === "closed" || state === "answer";
  const answered = state === "answer";
  const lieIndex = tl?.lieIndex ? Number(tl.lieIndex) : 0;
  const named = cur.nameRevealed === "true";
  return {
    id: cur.id,
    canJoin: await canJoin(cfg, act, ev, memberId),
    state,
    alias: profiles.find((p) => p.memberId === target)?.alias ?? "",
    isTarget: target === memberId,
    screen: view.memberScreen,
    nameRevealed: named,
    name: named ? members.find((m) => m.id === target)?.name ?? "" : "",
    statements: showStatements ? parseJson<string[]>(tl?.statements, []) : [],
    voted: Boolean(mine),
    myVote: mine ? Number(mine.chosenIndex) : -1,
    lieIndex: answered ? lieIndex : -1,
    correct: answered && mine ? Number(mine.chosenIndex) === lieIndex : null,
  };
}

/* ───── 점수 ───── */

export type Score = { memberId: string; name: string; score: number };

// A) 누구인지 가장 많이 맞힌 사람(사전 추측), B) 거짓을 가장 많이 맞힌 사람(현장 투표).
// 정답이 공개된 라운드만 센다. scope 를 주면(조별 진행) 그 조의 차례와 그 조 회원만 센다.
export async function computeScores(aid: string, scope?: RoundScope): Promise<{ A: Score[]; B: Score[]; played: number }> {
  const s = await getStore();
  const [rs, guesses, votes, tls, members] = await Promise.all([
    rounds(aid, scope?.teamId), s.list("Guesses"), s.list("Votes"), s.list("TruthLies"), s.list("Members"),
  ]);
  const answered = rs.filter((r) => r.state === "answer");
  // 누구인지 맞히기(A): 정답이 공개된 차례 — 현장 맞히기 흐름은 “저예요”로 이름이 공개된 차례부터(named·voting·answer)
  const named = rs.filter((r) => r.state === "answer" || r.state === "named" || r.state === "voting");
  const a = new Map<string, number>();
  const b = new Map<string, number>();
  for (const r of named) {
    for (const g of guesses) {
      if (g.eventActivityId === aid && g.targetMemberId === r.targetMemberId && g.chosenMemberId === r.targetMemberId) {
        a.set(g.guesserId, (a.get(g.guesserId) ?? 0) + 1);
      }
    }
  }
  for (const r of answered) {
    const tl = tls.find((t) => t.memberId === r.targetMemberId && t.eventActivityId === aid);
    const lie = tl?.lieIndex ? Number(tl.lieIndex) : 0;
    for (const v of votes) {
      if (v.roundId === r.id && Number(v.chosenIndex) === lie) b.set(v.voterId, (b.get(v.voterId) ?? 0) + 1);
    }
  }
  const list = (m: Map<string, number>): Score[] =>
    members
      .filter((x) => !isGuest(x.kind) && (!scope || scope.inScope(x.id)))
      .map((x) => ({ memberId: x.id, name: x.name, score: m.get(x.id) ?? 0 }))
      .sort((p, q) => q.score - p.score || p.name.localeCompare(q.name, "ko"));
  return { A: list(a), B: list(b), played: answered.length };
}

// 1위 점수와 동점자 목록(점수가 0이면 아무도 없음)
export function topOf(list: Score[]): { score: number; tied: Score[] } {
  const score = list[0]?.score ?? 0;
  return { score, tied: score > 0 ? list.filter((x) => x.score === score) : [] };
}

/* ───── 현장 맞히기 흐름(템플릿에 “사람 고르기” 현장 단계가 있는 활동, 조마다) ─────
 ① 한 명씩 소개 열기 → 조원이 누구인지 고르기 → 마감 … (이름은 아직 비공개, 결과도 비공개)
 ② 한 명씩 “저예요”(당사자가 누르거나 진행자가 대신) → 이름 공개와 맞힌 사람
 ③ 한 명씩 2진실 1거짓: 당사자 빼고 모두 투표하면 저절로 결과 발표(진행자가 먼저 마감할 수도 있다)
 ④ 시상: 조별 추측왕(누구인지 가장 많이 맞힘)·직감왕(거짓을 가장 많이 맞힘), 동점이면 룰렛
 차례(Rounds) 상태: guess → guessed → reveal → named → voting → answer */
export type FlowPhase = "guess" | "reveal" | "tl" | "done";
export type FlowAction = "open" | "gclose" | "reveal" | "name" | "vote" | "answer" | "awards" | "back";
export const isFlow = (cfg: TemplateConfig) => !!onsiteGuessKey(cfg);

// 지금 차례: 진행 중인(맞히는 중·저예요 대기·투표 중) 차례, 없으면 마지막으로 바뀐 차례
export function activeRound(list: Row[]): Row | undefined {
  const on = list.find((r) => r.state === "guess" || r.state === "reveal" || r.state === "voting");
  if (on) return on;
  return [...list].sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "") || Number(a.orderNo) - Number(b.orderNo)).pop();
}
export function flowPhase(list: Row[]): FlowPhase {
  if (list.some((r) => r.state === "voting" || r.state === "answer")) return list.every((r) => r.state === "answer") ? "done" : "tl";
  if (list.some((r) => r.state === "reveal" || r.state === "named")) return "reveal";
  return "guess";
}

export async function doFlow(ctx: StageCtx, action: FlowAction, targetMemberId: string | undefined, scope: RoundScope): Promise<ActionResult> {
  const s = await getStore();
  const aid = ctx.act.id;
  const team = scope.teamId;
  const gk = onsiteGuessKey(ctx.cfg);
  const live = (step: string | null, unlocked: boolean) => setLive(aid, step, unlocked, undefined, team);
  const miss = missingSteps(ctx.cfg);
  if (miss.length) return { ok: false, error: `이 활동의 템플릿에 필요한 단계가 없어요: ${miss.join(", ")}` };
  if (action === "open") {
    const gate = await onsiteGate(ctx.cfg, ctx.act);
    if (gate) return { ok: false, error: gate, status: 409 };
  }
  const list = await rounds(aid, team);
  const phase = flowPhase(list);
  const by = (st: RoundState) => list.filter((r) => r.state === st);
  const pick = (st: RoundState) => (targetMemberId ? by(st).find((r) => r.targetMemberId === targetMemberId) : by(st)[0]);
  const now = new Date().toISOString();
  const set = (r: Row, patch: Record<string, string>) => s.update("Rounds", r.id, { ...patch, updatedAt: now });
  const no = (error: string): ActionResult => ({ ok: false, error, status: 409 });

  if (action === "open") {
    if (phase !== "guess") return no("이미 “저예요” 단계로 넘어가서 소개를 더 열 수 없어요.");
    if (by("guess").length) return no("지금 맞히는 소개를 먼저 마감해 주세요.");
    const pool = await eligibleTargets(aid, await joinSet(ctx.cfg, ctx.act, ctx.ev), scope.inScope);
    if (pool.length === 0) return no(team ? "이 조에서 소개를 열 사람이 더 없어요. 소개와 2진실 1거짓을 승인한 조원이 필요해요." : "소개를 열 사람이 더 없어요.");
    let target = pool[randomInt(pool.length)];
    if (targetMemberId) {
      const p = pool.find((m) => m.id === targetMemberId);
      if (!p) return { ok: false, error: "이 사람은 지금 열 수 없어요(승인 전이거나 이미 열었어요)." };
      target = p;
    }
    const orderNo = String(list.reduce((n, r) => Math.max(n, Number(r.orderNo) || 0), 0) + 1);
    await s.insert("Rounds", { eventActivityId: aid, targetMemberId: target.id, state: "guess", orderNo, nameRevealed: "false", updatedAt: now, teamId: team });
    await live(gk, true);
    return { ok: true };
  }
  if (action === "gclose") {
    const r = by("guess")[0];
    if (!r) return no("지금 맞히는 소개가 없어요.");
    await set(r, { state: "guessed" });
    await live(gk, false);
    return { ok: true };
  }
  if (action === "reveal") {
    if (phase === "tl" || phase === "done") return no("이미 진실과 거짓을 시작했어요.");
    if (by("guess").length) return no("지금 맞히는 소개를 먼저 마감해 주세요.");
    if (by("reveal").length) return no("지금 차례의 이름을 먼저 공개해 주세요.");
    const r = pick("guessed");
    if (!r) return no("이름을 공개할 사람이 더 없어요.");
    await set(r, { state: "reveal" });
    await live("reveal", true);
    return { ok: true };
  }
  if (action === "name") {
    const r = by("reveal")[0];
    if (!r) return no("“저예요”를 기다리는 사람이 없어요.");
    await set(r, { state: "named", nameRevealed: "true" });
    return { ok: true };
  }
  if (action === "vote") {
    if (by("guess").length || by("guessed").length || by("reveal").length) return no("모두 “저예요”로 이름을 공개한 뒤에 진실과 거짓을 시작해요.");
    if (by("voting").length) return no("지금 투표를 먼저 마쳐 주세요.");
    const r = pick("named");
    if (!r) return no("진실과 거짓을 할 사람이 더 없어요.");
    await set(r, { state: "voting" });
    await live("vote", true);
    return { ok: true };
  }
  if (action === "answer") {
    const r = by("voting")[0];
    if (!r) return no("지금 투표 중인 사람이 없어요.");
    await set(r, { state: "answer" });
    await live("result", true);
    return { ok: true };
  }
  if (action === "awards") {
    if (!ctx.cfg.onsite.steps.some((x) => x.key === "awards")) return no("이 활동의 템플릿에 시상 단계가 없어요.");
    if (!list.length) return no("아직 진행한 차례가 없어요.");
    if (by("voting").length) return no("지금 투표를 먼저 마쳐 주세요.");
    await live("awards", true);
    return { ok: true };
  }
  // 한 단계 되돌리기(기록이 없을 때만)
  const cur = activeRound(list);
  if (!cur) return no("되돌릴 차례가 없어요.");
  if (cur.state === "guess") {
    const has = (await s.list("Guesses")).some((x) => x.eventActivityId === aid && x.targetMemberId === cur.targetMemberId && scope.inScope(x.guesserId));
    if (has) return no("이미 고른 분이 있어서 취소할 수 없어요. 마감해 주세요.");
    await s.remove("Rounds", cur.id);
    if (list.length > 1) await live(gk, false);
    else await live("", false);
    return { ok: true };
  }
  if (cur.state === "reveal") {
    await set(cur, { state: "guessed" });
    await live("reveal", false);
    return { ok: true };
  }
  if (cur.state === "voting") {
    if ((await s.list("Votes")).some((v) => v.roundId === cur.id)) return no("이미 투표한 분이 있어서 되돌릴 수 없어요.");
    await set(cur, { state: "named" });
    await live("vote", false);
    return { ok: true };
  }
  return no("지금은 되돌릴 수 없어요.");
}

// 투표가 들어올 때: 당사자 빼고 투표할 수 있는 조원이 모두 투표했으면 저절로 결과 발표
export async function flowAutoAnswer(ctx: StageCtx, round: Row, teamId: string, inScope: (m: string) => boolean): Promise<boolean> {
  const s = await getStore();
  const [voters, members, votes] = await Promise.all([actionSet(ctx.cfg, ctx.act, ctx.ev, onsiteKeyOf(ctx.cfg, "vote")), s.list("Members"), s.list("Votes")]);
  const eligible = members.filter((m) => m.id !== round.targetMemberId && voters.has(m.id) && inScope(m.id));
  const voted = new Set(votes.filter((v) => v.roundId === round.id).map((v) => v.voterId));
  if (!eligible.length || !eligible.every((m) => voted.has(m.id))) return false;
  await s.update("Rounds", round.id, { state: "answer", updatedAt: new Date().toISOString() });
  await setLive(ctx.act.id, "result", true, undefined, teamId);
  return true;
}

// 회원 휴대폰(흐름): 지금 차례와 맞히기 후보
async function memberFlowRound(act: Row, ev: Row, memberId: string, cfg: TemplateConfig, teamId: string): Promise<MemberRound | null> {
  const aid = act.id;
  const s = await getStore();
  const list = await rounds(aid, teamId);
  const cur = activeRound(list);
  if (!cur) return null;
  const [profiles, tls, votes, members, live, guesses] = await Promise.all([
    s.list("Profiles"), s.list("TruthLies"), s.list("Votes"), s.list("Members"), liveRow(aid, teamId), s.list("Guesses"),
  ]);
  const view = liveView(cfg, live);
  if (!view.active || view.stepKey === "awards") return null;
  const target = cur.targetMemberId;
  const state = cur.state as RoundState;
  const tl = tls.find((t) => t.memberId === target && t.eventActivityId === aid);
  const mine = votes.find((v) => v.roundId === cur.id && v.voterId === memberId);
  const lieIndex = tl?.lieIndex ? Number(tl.lieIndex) : 0;
  const named = cur.nameRevealed === "true";
  const prof = profiles.find((p) => p.memberId === target);
  // 후보: 같은 조원(조별 진행이 아니면 활동 참석자), 나 빼고
  const { teamRunInfo } = await import("./team-run");
  const run = await teamRunInfo(act);
  const team = run.teams.find((t) => t.id === teamId);
  const join = await joinSet(cfg, act, ev);
  const candidates = members
    .filter((m) => !isGuest(m.kind) && m.id !== memberId && (team ? team.memberIds.includes(m.id) : !join || join.has(m.id)))
    .map((m) => ({ id: m.id, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const g = guesses.find((x) => x.eventActivityId === aid && x.guesserId === memberId && x.targetMemberId === target);
  const show = state === "voting" || state === "answer";
  return {
    id: cur.id,
    canJoin: await canJoin(cfg, act, ev, memberId),
    state,
    alias: prof?.alias ?? "",
    isTarget: target === memberId,
    screen: view.memberScreen,
    nameRevealed: named,
    name: named ? members.find((m) => m.id === target)?.name ?? "" : "",
    statements: show ? parseJson<string[]>(tl?.statements, []) : [],
    voted: Boolean(mine),
    myVote: mine ? Number(mine.chosenIndex) : -1,
    lieIndex: state === "answer" ? lieIndex : -1,
    correct: state === "answer" && mine ? Number(mine.chosenIndex) === lieIndex : null,
    flow: true,
    profileId: prof?.id ?? "",
    introMd: prof?.introMd ?? "",
    candidates: state === "guess" ? candidates : [],
    myGuess: g ? members.find((m) => m.id === g.chosenMemberId)?.name ?? "" : "",
    myGuessId: g?.chosenMemberId ?? "",
    guessRight: named && g ? g.chosenMemberId === target : null,
    guessOpen: state === "guess" && view.unlocked && view.memberScreen === "pick_person",
  };
}

// 시상(흐름 ④): 이 조의 추측왕(A)·직감왕(B). 동점이면 룰렛 결과(진행자가 돌린 것), 아직이면 동점자 이름
export type Award = { score: number; winner: string; winnerId: string; tied: string[] };
export async function flowAwards(aid: string, scope: RoundScope | undefined): Promise<{ A: Award; B: Award }> {
  const sc = await computeScores(aid, scope);
  const payload = parseJson<{ lottery?: { A?: { winnerId: string }; B?: { winnerId: string } } }>((await liveRow(aid, scope?.teamId ?? ""))?.payload, {});
  const one = (k: "A" | "B"): Award => {
    const top = topOf(sc[k]);
    const lot = payload.lottery?.[k];
    const win = top.tied.length === 1 ? top.tied[0] : lot ? sc[k].find((x) => x.memberId === lot.winnerId) : undefined;
    return { score: top.score, winner: win?.name ?? "", winnerId: win?.memberId ?? "", tied: top.tied.length > 1 && !lot ? top.tied.map((x) => x.name) : [] };
  };
  return { A: one("A"), B: one("B") };
}
