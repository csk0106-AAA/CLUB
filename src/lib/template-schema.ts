import { z } from "zod";

// 활동 템플릿 설정. 활동이 어떻게 반응할지는 코드가 아니라 이 설정이 정한다.
// 새 템플릿(AI가 만든 것 포함)은 이 스키마를 통과해야 저장된다.

// 회원 화면이 언제 켜지는지
//  host_click : 진행자/관리자가 버튼을 누르면 켜짐
//  immediate  : 단계가 시작되면 바로 켜짐
// (지정 일시에 켜지는 'scheduled'는 필요해질 때 추가한다.)
export const unlockSchema = z.enum(["host_click", "immediate"]);

export const memberScreenSchema = z.enum([
  "wait",        // 대기 화면
  "write",       // 작성 화면(타임캡슐, 고민 등)
  "vote",        // 투표 화면
  "iam_button",  // "저예요" 버튼
  "pick_person", // 명단에서 사람 고르기
  "view",        // 결과 보기
]);

export const stepSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  memberScreen: memberScreenSchema,
  unlock: unlockSchema,
  // 진행자 화면에 보이는 버튼 이름. 예: "투표", "타임캡슐 작성하기"
  hostButton: z.string().optional(),
});

// 사전 단계 기간(사전 작성, 사전 맞히기 등 활동 안의 사전 단계마다 하나): 일정 며칠 전 몇 시부터 며칠 전 몇 시까지.
//  opensTime/closesTime("HH:mm", 한국 시간)을 정하면 그날 그 시각, 정하지 않으면 예전처럼 일정 시작 시각 기준으로 N일 전.
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
// 기간만(일정 활동에서 정한다)
export const preWindowSchema = z.object({
  opensBeforeDays: z.number().int().min(0).max(365).optional(),
  closesBeforeDays: z.number().int().min(0).max(365).optional(),
  opensTime: z.string().regex(HM).optional(),
  closesTime: z.string().regex(HM).optional(),
});
export const preEventSchema = z.object({
  enabled: z.boolean(), // false면 일정 전 사전 작성 단계가 없다(현장에서만 진행)
  opensBeforeDays: z.number().int().min(0).optional(),
  closesBeforeDays: z.number().int().min(0).optional(),
  opensTime: z.string().regex(HM).optional(), // 시작 시각(예: "09:00")
  closesTime: z.string().regex(HM).optional(), // 마감 시각(예: "23:59")
  steps: z.array(z.string()).default([]),
});

// 사전 단계가 실제로 열리고 닫히는 시각(밀리초). 일정 날짜가 없으면 null. 화면(편집 미리 보기)과 서버(상태 계산)가 같이 쓴다.
export type PreWindow = { enabled: boolean; opensBeforeDays?: number; closesBeforeDays?: number; opensTime?: string; closesTime?: string };
const DAY_MS = 24 * 60 * 60 * 1000;
const kstDate = (t: number) => new Date(t + 9 * 3600_000).toISOString().slice(0, 10);
const minutes = (hm: string) => { const [h, m] = hm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export function preWindowTimes(win: PreWindow, startsAt: string): { opens: number; closes: number; timed: boolean } | null {
  if (!startsAt) return null;
  const start = Date.parse(startsAt.length <= 16 ? `${startsAt.length === 10 ? `${startsAt}T00:00` : startsAt}:00+09:00` : startsAt);
  if (Number.isNaN(start)) return null;
  const ob = win.opensBeforeDays ?? 14, cb = win.closesBeforeDays ?? 1;
  if (!win.opensTime && !win.closesTime) return { opens: start - ob * DAY_MS, closes: start - cb * DAY_MS, timed: false };
  const base = Date.parse(`${kstDate(start)}T00:00:00+09:00`); // 일정 날짜 0시(한국 시간)
  return {
    opens: base - ob * DAY_MS + minutes(win.opensTime ?? "00:00") * 60_000,
    closes: base - cb * DAY_MS + minutes(win.closesTime ?? "23:59") * 60_000 + 59_999,
    timed: true,
  };
}
// "2026/11/27 09:00" (한국 시간)
export const kstText = (t: number) => new Date(t + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ").replace(/-/g, "/");

export const templateConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().min(1),
  description: z.string().default(""),
  // 참여 대상(일정 활동마다 정한다): all(전체 회원) / selected(선택 회원 — 관리자가 활동 전에 출석 체크로 고르고 완료).
  // 템플릿에서는 일정에 넣을 때의 기본값.
  participants: z.enum(["all", "selected"]).default("all"),
  // 참여 범위(템플릿에서 정한다): true 면 일정에서 "선택 회원"을 고를 수 있다. false 면 늘 전체 회원.
  // 없으면 예전 값(participants 가 selected 이면 선택 가능)으로 본다 — canSelect().
  selectable: z.boolean().optional(),
  // 기능 블록(lib/blocks.ts): 이 활동에 넣은 블록 키(예: ["saju"])
  blocks: z.array(z.string()).optional(),
  // 사주풀이 블록을 여는 시점(활동 설정): interview(AI 인터뷰 뒤) / pre(사전 작성 기간) / event(일정 당일)
  sajuWhen: z.enum(["interview", "pre", "event"]).optional(),
  // 선택참여 회원이 하는 액션(템플릿의 선별 조건, activityActions 의 키). 전체참여 회원은 모든 액션을 한다.
  partialActions: z.array(z.string()).optional(),
  // 선별 조건(예전 글 설명, 지금은 partialActions 를 쓴다): 선택 회원으로 할 때 관리자가 회원을 고르는 기준. 출석 체크 화면에 보인다.
  selectRule: z.string().max(2000).optional(),
  preEvent: preEventSchema,
  guessPhase: preEventSchema.optional(),
  onsite: z.object({ steps: z.array(stepSchema).min(1) }),
  scoring: z
    .object({ enabled: z.boolean(), tieBreak: z.enum(["roulette", "none"]).default("roulette") })
    .optional(),
  // AI 지침(지점별). 키는 lib/ai-guides.ts 의 AI 지점(followup, draft, truthlies, revise, reading, worry).
  // 비어 있는 지점은 AI 설정 화면의 전체 지침을 쓴다.
  aiGuides: z.record(z.string(), z.string().max(4000)).optional(),
  // 이 활동의 AI 공통 지침(모든 지점에 들어감). 비어 있으면 AI 설정 화면의 기본 공통 지침.
  aiCommon: z.string().max(4000).optional(),
  // AI 인터뷰(소개 작성 활동): 필수 질문과 후속 질문 최대 개수. 비어 있으면 AI 설정 화면의 기본값.
  //  skippable: 질문마다 "답변안함"을 허용하는지(questions 와 같은 순서). 허용한 질문은 회원이 답하지 않고 넘어갈 수 있다.
  //  followUpSkip: AI 후속 질문도 "답변안함"을 허용하는지(값이 없으면 허용)
  interview: z.object({ questions: z.array(z.string().max(300)).max(30), followUpMax: z.number().int().min(0).max(12), skippable: z.array(z.boolean()).max(30).optional(), followUpSkip: z.boolean().optional() }).optional(),
  // 활동 방식: all(전체 활동) / team(팀 활동). 팀 배정은 템플릿에 넣지 않고 일정 > 활동에서 한다.
  // 비어 있으면 타임캡슐(현장 작성)은 팀, 나머지는 전체로 본다(lib/activities.ts activityMode).
  mode: z.enum(["all", "team"]).optional(),
  // 진행자: required 이면 이 활동은 진행자가 있어야 진행할 수 있다(일정 › 활동에서 진행자와 진행자 접속번호를 정한다).
  // note: 진행자에게 주는 안내(예: 프로젝터를 띄울 노트북 준비). 진행자 사람·번호는 일정마다 정하므로 템플릿에 넣지 않는다.
  host: z.object({ required: z.boolean(), note: z.string().max(500).optional() }).optional(),
  // 템플릿 버전(v2 이상)의 출처: derivedFrom 은 그 템플릿의 v1 id, sourceEvent 는 일정에서 고쳐 만든 버전이면 그 일정
  // 프로필 북 실명 공개 시점(소개 작성 활동). 참여 회원은 이 시점까지 프로필 북에 별칭으로만 보이고, 지나면 실명과 소개가 함께 보인다.
  //  end: 일정(활동)이 끝날 때 / after: 끝나고 hours 시간 뒤 / at: 정한 일시(한국 시간 YYYY-MM-DDTHH:mm)
  reveal: z.object({ mode: z.enum(["end", "after", "at"]).default("end"), hours: z.number().int().min(0).max(2000).optional(), at: z.string().max(20).optional() }).optional(),
  // 나의 고민은?(고민 엔진): 대화 타이머 기본 시간과 "+N분" 연장 단위(분). 비어 있으면 15분 / 5분
  worry: z.object({ talkMinutes: z.number().int().min(1).max(120).optional(), extendMinutes: z.number().int().min(1).max(60).optional() }).optional(),
  derivedFrom: z.string().optional(), // v1 템플릿 id
  // 프로필 북 전용(프로필 북 "소개 작성하기"에서만 쓰고 일정에는 넣지 않는다, lib/profile-book.ts)
  bookOnly: z.boolean().optional(),
  sourceEvent: z.object({ id: z.string(), name: z.string(), date: z.string() }).optional(),
});

export type TemplateConfig = z.infer<typeof templateConfigSchema>;
export type TemplateStep = z.infer<typeof stepSchema>;

// 기본 템플릿 3종 (사용자 요청 활동)
export const DEFAULT_TEMPLATES: TemplateConfig[] = [
  {
    id: "who-am-i",
    name: "내가 누구일까요?",
    blocks: ["saju"],
    sajuWhen: "interview",
    selectable: true,
    partialActions: ["guess", "onsite:vote"], // 선택참여: 맞히기와 거짓 투표만
    selectRule: "프로필 북에 실명 소개가 아직 공개되지 않은 회원을 고르세요. 익명(별칭) 소개를 보고 누구인지 맞히는 활동이에요.\n이미 실명 소개가 공개된 회원(북공개)을 고르면, 그 회원은 ‘북 초기화’(소개를 지우고 별칭으로 새로 작성, 맞히기 대상) 또는 ‘일부활동참여’(소개 그대로, 맞히기 대상에서만 빠지고 맞히기·투표 참여) 중 하나를 정해야 해요.",
    version: 1,
    participants: "selected", // 기본: 관리자가 선택한 회원만 참여(활동 전에 출석 체크)
    description: "AI 인터뷰로 별칭 소개글을 만들고, 누구인지 맞히고, 2진실 1거짓을 즐깁니다.",
    preEvent: {
      enabled: true,
      opensBeforeDays: 14,
      closesBeforeDays: 7,
      steps: ["alias", "ai_interview", "truth_lies", "approve"],
    },
    guessPhase: { enabled: true, opensBeforeDays: 7, closesBeforeDays: 1, steps: ["guess"] },
    onsite: {
      steps: [
        { key: "intro", label: "소개 페이지 열기", memberScreen: "wait", unlock: "host_click", hostButton: "소개 열기" },
        { key: "reveal", label: "저예요", memberScreen: "iam_button", unlock: "host_click", hostButton: "“저예요” 열기" },
        { key: "vote", label: "거짓 투표", memberScreen: "vote", unlock: "host_click", hostButton: "투표" },
        { key: "result", label: "정답 공개", memberScreen: "view", unlock: "host_click", hostButton: "정답 공개" },
      ],
    },
    scoring: { enabled: true, tieBreak: "roulette" },
    host: { required: true },
  },
  {
    id: "worry-draw",
    name: "나의 고민은?",
    version: 1,
    participants: "selected", // 기본: 관리자가 선택한 회원만 참여(활동 전에 출석 체크)
    selectable: false,
    description: "고민을 미리 적어 두고, 현장에서 뽑아 15분씩 대화합니다.",
    preEvent: { enabled: true, opensBeforeDays: 14, closesBeforeDays: 1, steps: ["worry_write"] },
    onsite: {
      steps: [
        { key: "draw", label: "고민 뽑기", memberScreen: "wait", unlock: "host_click", hostButton: "고민 뽑기" },
        { key: "talk", label: "대화 타이머", memberScreen: "view", unlock: "immediate" },
        { key: "reveal", label: "이름 오픈", memberScreen: "view", unlock: "host_click", hostButton: "이름 오픈" },
      ],
    },
    host: { required: true },
  },
  {
    id: "time-capsule",
    name: "타임캡슐",
    version: 1,
    participants: "selected", // 기본: 관리자가 선택한 회원만 참여(활동 전에 출석 체크)
    selectable: false,
    description: "1년 뒤 목표와 팀 약속을 현장에서 쓰고 봉인합니다.",
    preEvent: { enabled: false, steps: [] }, // 사전 작성 없음: 현장에서 작성
    onsite: {
      steps: [
        { key: "write", label: "작성", memberScreen: "write", unlock: "host_click", hostButton: "타임캡슐 작성하기" },
        { key: "seal", label: "봉인", memberScreen: "wait", unlock: "host_click", hostButton: "봉인하기" },
      ],
    },
    host: { required: true },
  },
];

// 이 템플릿(활동)이 "선택 회원"으로 진행할 수 있는지(참여 범위)
export const canSelect = (c: Pick<TemplateConfig, "selectable" | "participants">): boolean => c.selectable === true;

// 활동 설명(자동): 템플릿 설정(사전 단계·현장 단계·방식 등)에서 만든다. 직접 고치지 않고, 활동을 바꾸면(AI에게 개발 요청 등) 따라 바뀐다.
// lib/activities.ts readConfig 가 읽을 때마다 이 값으로 채운다.
const PRE_LABEL: Record<string, string> = {
  alias: "별칭 정하기", ai_interview: "AI 인터뷰로 소개 글 작성", truth_lies: "2진실 1거짓 문장 만들기",
  approve: "본인 승인 후 공개", worry_write: "고민 미리 적기", guess: "누구인지 맞히기",
};
export function describeTemplate(c: Pick<TemplateConfig, "preEvent" | "guessPhase" | "onsite" | "mode" | "host" | "bookOnly" | "reveal" | "blocks" | "sajuWhen">): string {
  const out: string[] = [];
  // 사주풀이(예전에는 사전 단계 reading_optional)는 기능 블록 줄에 쓴다
  const pre = c.preEvent.enabled ? c.preEvent.steps.filter((k) => k !== "reading_optional").map((k) => PRE_LABEL[k] ?? k) : [];
  const saju = (c.blocks ?? []).includes("saju") || c.preEvent.steps.includes("reading_optional");
  const when = c.sajuWhen ?? (c.preEvent.steps.includes("ai_interview") ? "interview" : c.preEvent.enabled ? "pre" : "event");
  const blockLine = saju ? `기능 블록: 명리학 사주풀이(${when === "interview" ? "AI 인터뷰를 마친 뒤" : when === "pre" ? "사전 작성 기간" : "일정 당일"}, 선택).` : "";
  if (c.bookOnly) {
    out.push("프로필 북 “소개 작성하기”에서 쓰는 활동이에요(일정에는 넣지 않아요).");
    if (pre.length) out.push(`진행: ${pre.join(" → ")}.`);
    if (blockLine) out.push(blockLine);
    out.push("실명으로 소개가 공개돼요.");
    return out.join(" ");
  }
  if (pre.length) out.push(`사전: ${pre.join(" → ")}.`);
  else out.push("사전 작성 없이 현장에서 진행해요.");
  if (c.guessPhase?.enabled) out.push("사전 맞히기: 별칭 소개를 보고 누구인지 맞혀요.");
  if (c.onsite.steps.length) out.push(`현장: ${c.onsite.steps.map((x) => x.label).join(" → ")}.`);
  if (c.preEvent.steps.includes("ai_interview") && c.preEvent.steps.includes("alias")) {
    const r = c.reveal;
    out.push(`실명 공개: ${!r || r.mode === "end" ? "일정이 끝날 때" : r.mode === "after" ? `일정이 끝나고 ${r.hours ?? 0}시간 뒤` : `${(r.at ?? "").replace("T", " ")}`}.`);
  }
  const mode = c.mode ?? (!c.preEvent.steps.includes("ai_interview") && !c.preEvent.steps.includes("worry_write") && c.onsite.steps.some((x) => x.memberScreen === "write") ? "team" : "all");
  if (blockLine) out.push(blockLine);
  if (mode === "team") out.push("팀별로 진행해요.");
  if (c.host?.required) out.push("진행자가 필요해요.");
  return out.join(" ");
}

// 사전 작성·사전 맞히기 기간(며칠 전·시각)은 일정 활동마다 정한다(템플릿은 있는지 여부만).
// 템플릿을 고쳐 일정 활동에 반영할 때 그 활동이 정한 기간을 지킨다(own: 그 활동의 예전 설정).
const WIN_KEYS = ["opensBeforeDays", "closesBeforeDays", "opensTime", "closesTime"] as const;
type WinLike = Partial<Record<(typeof WIN_KEYS)[number], number | string>>;
const pickWin = (w?: WinLike) => Object.fromEntries(WIN_KEYS.filter((k) => w?.[k] !== undefined).map((k) => [k, w![k]]));
const dropWin = <W extends object>(w: W): W => { const o = { ...w } as Record<string, unknown>; for (const k of WIN_KEYS) delete o[k]; return o as W; };
export function withEventWindows<C extends Pick<TemplateConfig, "preEvent" | "guessPhase">>(next: C, own?: Pick<TemplateConfig, "preEvent" | "guessPhase"> | null): C {
  if (!own) return next;
  return {
    ...next,
    preEvent: { ...dropWin(next.preEvent), ...pickWin(own.preEvent) },
    ...(next.guessPhase ? { guessPhase: { ...dropWin(next.guessPhase), ...pickWin(own.guessPhase ?? next.guessPhase) } } : {}),
  };
}

// 활동 안의 액션(활동 흐름 순서). 템플릿의 선별 조건에서 선택참여 회원이 할 액션을 고를 때 쓴다.
//  pre:ai_interview / pre:worry_write / block:saju / guess / onsite:<현장 단계 키>(회원이 직접 하는 단계만)
export type ActivityAction = { key: string; label: string };
const ACT_SCREENS = ["write", "vote", "iam_button", "pick_person"];
export function activityActions(c: Pick<TemplateConfig, "preEvent" | "guessPhase" | "onsite" | "blocks" | "sajuWhen">): ActivityAction[] {
  const out: ActivityAction[] = [];
  const pre = c.preEvent.enabled ? c.preEvent.steps : [];
  if (pre.includes("ai_interview")) out.push({ key: "pre:ai_interview", label: "(사전) AI 인터뷰로 소개 작성" });
  if (pre.includes("worry_write")) out.push({ key: "pre:worry_write", label: "(사전) 고민 미리 적기" });
  const saju = (c.blocks ?? []).includes("saju") || c.preEvent.steps.includes("reading_optional");
  const sajuEvent = c.sajuWhen === "event" || (!c.sajuWhen && !pre.length);
  if (saju && !sajuEvent) out.push({ key: "block:saju", label: "(사전) 명리학 사주풀이" });
  if (c.preEvent.enabled && c.guessPhase?.enabled) out.push({ key: "guess", label: "(사전) 소개 보고 누구인지 맞히기" });
  if (saju && sajuEvent) out.push({ key: "block:saju", label: "(현장) 명리학 사주풀이" });
  for (const st of c.onsite.steps) if (ACT_SCREENS.includes(st.memberScreen)) out.push({ key: `onsite:${st.key}`, label: `(현장) ${st.label}` });
  return out;
}
// 이 회원(전체참여 full / 선택참여 partial)이 이 액션을 하는지
export function actionAllowed(c: Pick<TemplateConfig, "selectable" | "participants" | "partialActions">, level: "full" | "partial" | undefined, key: string): boolean {
  if (level !== "partial") return true;
  return canSelect(c) && (c.partialActions ?? []).includes(key);
}
// 회원 화면 종류로 현장 단계의 액션 키(예: 투표 → onsite:vote)
export const onsiteKeyOf = (c: Pick<TemplateConfig, "onsite">, screen: string): string => {
  const st = c.onsite.steps.find((x) => x.memberScreen === screen);
  return st ? `onsite:${st.key}` : "";
};

// 활동 종류(lib/activities.ts activityKind 와 같은 규칙, 화면에서도 쓰려고 여기 둔다)
export function kindOfConfig(c: Pick<TemplateConfig, "preEvent" | "onsite">): "who" | "worry" | "capsule" | "" {
  if (c.preEvent.steps.includes("ai_interview")) return "who";
  if (c.preEvent.steps.includes("worry_write")) return "worry";
  if (c.onsite.steps.some((x) => x.memberScreen === "write")) return "capsule";
  return "";
}
// 현장 단계의 "회원 휴대폰에 보이는 화면": 그 활동에 실제로 만들어진 화면만 고른다(다른 활동의 화면을 가져오지 않는다).
//  who(내가 누구일까요? 방식): 대기 · “저예요” 버튼 · 투표 · 결과 보기
//  worry(나의 고민은? 방식)  : 대기 · 결과 보기(뽑힌 고민·타이머·이름)
//  capsule(타임캡슐 방식)·그 밖: 대기 · 작성 화면 · 결과 보기 (작성 화면을 넣으면 타임캡슐 방식이 된다)
//  pick_person(명단에서 사람 고르기)은 아직 만들어진 화면이 없어 고르지 않는다.
export function screensFor(c: Pick<TemplateConfig, "preEvent" | "onsite">): string[] {
  const k = kindOfConfig(c);
  if (k === "who") return ["wait", "iam_button", "vote", "view"];
  if (k === "worry") return ["wait", "view"];
  return ["wait", "write", "view"];
}
