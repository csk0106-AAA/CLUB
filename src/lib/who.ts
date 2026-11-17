import { NextResponse } from "next/server";
import { guessStatus, isWhoAmI, periodText, preStatus, readConfig, type PreStatus } from "./activities";
import { getSetting, getStore, DEFAULT_GUIDELINES, DEFAULT_QUESTIONS } from "./store";
import type { Row } from "./store/types";
import type { TemplateConfig } from "./template-schema";
import { parseJson } from "./api";
import { activityAiConfig } from "./ai-guides";
import { inRoster, whoStateOf, type WhoState } from "./participants";
import { PROFILE_AID, whoV1 } from "./profile-book";

export type Scope = "intro" | "truthlie" | "none";
// skipped: 회원이 "답변안함"으로 넘긴 질문(소개 글·2진실 1거짓·후속 질문에 쓰지 않는다)
export type ChatMsg = { role: "ai" | "me"; text: string; scope?: Scope; skipped?: boolean };
export const SKIP_TEXT = "답변안함";

// book: 프로필 북의 "소개 작성하기"(일정 활동이 아님 — 템플릿 v1 지침, 2진실 1거짓 없음, 실명으로 공개)
export type WhoCtx = { ev: Row; act: Row; cfg: TemplateConfig; book?: boolean };

// 활동 id 로 일정과 설정을 찾는다. '내가 누굴까요?' 방식의 활동이 아니면 오류.
// aid 가 PROFILE_AID 면 프로필 북 작성(템플릿 v1)으로 본다.
export async function loadWho(aid: string): Promise<WhoCtx | NextResponse> {
  if (aid === PROFILE_AID) {
    const v1 = await whoV1();
    return { ev: { id: "", name: "프로필 북", startsAt: "", endsAt: "", published: "true" }, act: v1.row, cfg: v1.cfg, book: true };
  }
  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid);
  const cfg = act ? readConfig(act.config) : null;
  const ev = act ? (await s.list("Events")).find((e) => e.id === act.eventId && e.published === "true") : undefined;
  if (!act || !cfg || !ev) return NextResponse.json({ error: "활동을 찾을 수 없어요." }, { status: 404 });
  if (!isWhoAmI(cfg)) return NextResponse.json({ error: "소개 작성이 있는 활동이 아니에요." }, { status: 400 });
  return { ev, act, cfg };
}

const WHY: Record<string, string> = {
  none: "이 활동에는 사전 작성이 없어요.",
  unknown: "일정 날짜가 정해지면 작성 기간이 열려요.",
  before: "아직 작성 기간이 아니에요.",
  closed: "작성 기간이 끝났어요.",
};

// 사전 작성 기간(작성)이 열려 있어야 쓸 수 있다.
export function writeClosed(ctx: WhoCtx): NextResponse | null {
  if (ctx.book) return null; // 프로필 북 작성은 기간 없이 언제나
  const p = preStatus(ctx.cfg, ctx.ev.startsAt);
  if (p.status === "open") return null;
  return NextResponse.json({ error: `${WHY[p.status]}${periodText(p)}` }, { status: 403 });
}

// 사전 추측 기간
export function guessClosed(ctx: WhoCtx): NextResponse | null {
  const p = guessStatus(ctx.cfg, ctx.ev.startsAt);
  if (p.status === "open") return null;
  return NextResponse.json({ error: `${WHY[p.status]}${periodText(p)}` }, { status: 403 });
}

export function windows(ctx: WhoCtx): { pre: PreStatus; guess: PreStatus } {
  if (ctx.book) return { pre: { enabled: true, status: "open", opensAt: "", closesAt: "" }, guess: { enabled: false, status: "none", opensAt: "", closesAt: "" } };
  return { pre: preStatus(ctx.cfg, ctx.ev.startsAt), guess: guessStatus(ctx.cfg, ctx.ev.startsAt) };
}

// 인터뷰 필수 질문: 활동 템플릿에 있으면 그것, 없으면 AI 설정 화면의 기본값
export async function questions(act?: Row): Promise<string[]> {
  const t = (await activityAiConfig(act))?.interview?.questions?.filter((q) => q.trim());
  if (t && t.length) return t;
  const q = await getSetting<string[]>("interviewQuestions", DEFAULT_QUESTIONS);
  return q.length ? q : DEFAULT_QUESTIONS;
}
export const guidelines = () => getSetting<string>("aiGuidelines", DEFAULT_GUIDELINES);
// 질문마다 "답변안함" 허용 여부(활동 템플릿의 질문을 쓸 때만. 기본 질문은 모두 답해야 한다)
export async function skippable(act?: Row): Promise<boolean[]> {
  const iv = (await activityAiConfig(act))?.interview;
  if (!iv?.questions?.some((q) => q.trim())) return [];
  // questions() 와 같게 빈 질문은 빼고 순서를 맞춘다
  return iv.questions.map((q, i) => ({ q: q.trim(), skip: iv.skippable?.[i] === true })).filter((p) => p.q).map((p) => p.skip);
}

// 후속 질문 최대 개수: 활동 템플릿에 있으면 그것, 없으면 기본값
export async function followUpMax(act?: Row): Promise<number> {
  const t = (await activityAiConfig(act))?.interview?.followUpMax;
  return typeof t === "number" ? t : getSetting<number>("followUpMax", 6);
}

export async function myProfile(memberId: string): Promise<Row | undefined> {
  return (await (await getStore()).list("Profiles")).find((p) => p.memberId === memberId);
}

export async function myInterview(memberId: string, aid: string): Promise<{ row?: Row; messages: ChatMsg[] }> {
  const row = (await (await getStore()).list("Interviews")).find((i) => i.memberId === memberId && i.eventActivityId === aid);
  return { row, messages: parseJson<ChatMsg[]>(row?.messages, []) };
}

export async function myTruthLies(memberId: string, aid: string): Promise<Row | undefined> {
  return (await (await getStore()).list("TruthLies")).find((t) => t.memberId === memberId && t.eventActivityId === aid);
}

export const normAlias = (s: string) => s.replace(/\s+/g, "").toLowerCase();

// 이 회원의 참여 상태(프로필 북 작성은 늘 none — 게임 밖)
export async function whoState(ctx: WhoCtx, memberId: string): Promise<WhoState> {
  if (ctx.book) return "none";
  const s = await getStore();
  const [interviews, profiles] = await Promise.all([s.list("Interviews"), s.list("Profiles")]);
  return whoStateOf(ctx.act.id, memberId, await inRoster(ctx.cfg, ctx.act, ctx.ev, memberId), interviews, profiles);
}
// 게임에 들어가는지(별칭·2진실 1거짓·신원 정보 검사)
export const inGame = async (ctx: WhoCtx, memberId: string) => (await whoState(ctx, memberId)) === "in";

// 소개를 쓸 수 있는 곳인지
//  - 활동: 참여 상태가 in 인 회원만(참여 대상이 아니면 프로필 북에서 쓴다)
//  - 프로필 북: 실명 공개 전인 '내가 누굴까요?' 활동에 참여 중이면 그 활동에서 쓴다(별칭으로 가려져 있으므로)
export async function writeGate(ctx: WhoCtx, memberId: string): Promise<NextResponse | null> {
  if (ctx.book) {
    const { maskedMembers } = await import("./profile-book");
    if ((await maskedMembers()).has(memberId)) {
      return NextResponse.json({ error: "지금 참여 중인 ‘내가 누굴까요?’ 활동이 있어요. 그 활동 화면에서 소개를 작성해 주세요." }, { status: 409 });
    }
    return null;
  }
  const st = await whoState(ctx, memberId);
  if (st === "in") return null;
  const msg = st === "none"
    ? "이 활동의 참여 대상이 아니에요. 프로필 북에서 ‘소개 작성하기’로 소개를 쓸 수 있어요."
    : st === "optout" ? "이미 실명과 내 소개가 공개된 회원이라 이 활동에는 참여하지 않아요."
      : "먼저 ‘내 소개 업데이트’를 할지 골라 주세요.";
  return NextResponse.json({ error: msg }, { status: 403 });
}

// canSkip: 지금 묻는 질문이 "답변안함"을 허용하는 필수 질문인지
export function interviewView(messages: ChatMsg[], status: string, required: number, skips: boolean[] = []) {
  const answered = messages.filter((m) => m.role === "me").length;
  const waiting = (status || "active") !== "done" && messages[messages.length - 1]?.role === "ai";
  return { messages, status: status || "active", answered, required, canSkip: waiting && answered < required && skips[answered] === true };
}

// 답한 것만("답변안함" 뺀 것) — 소개 글·후속 질문·2진실 1거짓에 쓴다
export const answeredOnly = (messages: ChatMsg[]) => messages.filter((m) => !(m.role === "me" && m.skipped));
