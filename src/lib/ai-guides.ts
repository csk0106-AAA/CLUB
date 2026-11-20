import { z } from "zod";
import { readConfig } from "./activities";
import { DEFAULT_GUIDELINES, getSetting, getStore } from "./store";
import type { Row } from "./store/types";
import type { TemplateConfig } from "./template-schema";

// AI가 개입하는 지점. 공통 지침(aiGuidelines)에 지점 지침을 덧붙여 AI에 전달한다.
// 지점 지침은 ① 활동 템플릿의 AI 지침(지점별) → ② 없으면 AI 설정 화면의 전체 지점 지침 순으로 쓴다.
export const AI_POINTS = [
  { key: "followup", label: "인터뷰 후속 질문", hint: "AI가 회원 답변을 보고 이어서 묻는 질문의 주제·말투·깊이" },
  { key: "draft", label: "소개 글 초안 작성", hint: "인터뷰 답변으로 별칭 소개 글을 쓸 때의 분량·문체·구성" },
  { key: "truthlies", label: "2진실 1거짓 문장 만들기", hint: "소개 글에 쓰지 않은 내용으로 만드는 문장의 난이도·종류" },
  { key: "revise", label: "소개 글 수정 요청 반영", hint: "회원의 수정 요청을 받아들이거나 거절하는 기준" },
  { key: "reading", label: "명리학 풀이 · 공개 성격·성향 글", hint: "내 소개 페이지 맨 끝에 다른 회원에게 공개되는 “명리학으로 본 성격과 성향”(5~8문장)의 말투·분량·금지 표현" },
  { key: "readingFull", label: "명리학 풀이 · 본인용 생애주기 풀이", hint: "본인만 보는 “생애주기 명리 풀이”(2~3페이지)의 말투·분량·다룰 항목·금지 표현" },
  { key: "worry", label: "고민 관점 제안 (진행 도우미)", hint: "고민에 대해 AI가 제시하는 관점의 톤과 금지 사항" },
] as const;
export type AiPoint = (typeof AI_POINTS)[number]["key"];

// 명리학 풀이 기본 지침(관리자가 AI 지침 화면에서 보고 고친다. 칸을 비우면 이 값을 쓴다)
export const DEFAULT_READING_PUB = [
  "5~8문장으로 쓴다.",
  "장점과 강점 중심으로 쓰고, 단점으로 읽힐 수 있는 표현은 최대한 피한다. 필요하면 “이런 면을 살리면 좋다” 식으로 긍정적으로 바꿔 쓴다.",
  "띠(동물), 태어난 연도·월·일, 나이, 간지 글자, 성별은 쓰지 않는다(신원을 짐작할 수 있다). 오행 이미지(예: 큰 나무, 따뜻한 햇살) 정도의 비유는 괜찮다.",
].join("\n");
export const DEFAULT_READING_FULL = [
  "마크다운으로 약 2~3페이지 분량으로 쓴다.",
  "첫머리에 사주 원국과 오행의 특징을 쉽게 설명한다.",
  "대운 흐름을 따라 생애주기(청년기, 중년기, 장년기, 노년기와 지금 시기)를 나누어 설명한다.",
  "건강, 재물, 직업, 성격, 성향, 연애, 결혼, 인간관계를 각각 소제목으로 다룬다.",
  "단정적인 예언, 불안을 키우는 표현, 특정 질병·사고 단정은 쓰지 않고 “경향”, “조심하면 좋은 점” 정도로 쓴다.",
  "마지막에 “명리학 풀이는 재미와 자기 성찰을 위한 참고용”이라는 한 줄을 붙인다.",
].join("\n");
const POINT_DEFAULT: Partial<Record<string, string>> = { reading: DEFAULT_READING_PUB, readingFull: DEFAULT_READING_FULL };

const keyOf = (p: AiPoint) => `aiGuide:${p}`;

// 이 활동 설정에서 AI가 쓰이는 지점
export function aiPointsFor(cfg: Pick<TemplateConfig, "preEvent">): AiPoint[] {
  if (cfg.preEvent.steps.includes("ai_interview")) return ["followup", "draft", "truthlies", "revise", "reading", "readingFull"];
  if (cfg.preEvent.steps.includes("worry_write")) return ["worry"];
  return [];
}

export async function pointGuides(): Promise<Record<AiPoint, string>> {
  const out = {} as Record<AiPoint, string>;
  for (const p of AI_POINTS) out[p.key] = await getSetting<string>(keyOf(p.key), "");
  return out;
}

// 이 일정 활동이 따르는 설정: 템플릿(일정에 넣은 뒤 템플릿에서 고쳐도 바로 반영되도록 다시 읽는다) → 없으면 활동에 복사된 설정
export async function activityAiConfig(act?: Row): Promise<TemplateConfig | null> {
  if (!act) return null;
  if (act.templateId) {
    const t = (await (await getStore()).list("ActivityTemplates")).find((x) => x.id === act.templateId);
    const c = readConfig(t?.config);
    if (c) return c;
  }
  return readConfig(act.config);
}

// 공통 지침(활동 템플릿 → 기본) + 이 지점의 지침(활동 템플릿 → 기본)
export async function guidelinesFor(point: AiPoint, act?: Row): Promise<string> {
  const cfg = await activityAiConfig(act);
  const common = cfg?.aiCommon?.trim() || (await getSetting<string>("aiGuidelines", DEFAULT_GUIDELINES));
  const extra = cfg?.aiGuides?.[point]?.trim() || (await getSetting<string>(keyOf(point), "")).trim();
  return extra ? `${common}\n\n[${AI_POINTS.find((p) => p.key === point)?.label} 단계 추가 지침]\n${extra}` : common;
}

export { keyOf as pointKey };

// 공통 지침만(활동 템플릿 → 기본) / 이 지점의 추가 지침만(활동 템플릿 → 기본). 명리학 풀이처럼 한 번에 두 글을 쓸 때 나눠 넣는다.
export async function commonGuide(act?: Row): Promise<string> {
  const cfg = await activityAiConfig(act);
  return cfg?.aiCommon?.trim() || (await getSetting<string>("aiGuidelines", DEFAULT_GUIDELINES));
}
export async function pointGuide(point: AiPoint, act?: Row): Promise<string> {
  const cfg = await activityAiConfig(act);
  // 활동 템플릿 → AI 설정 화면 → 기본값(명리학 풀이)
  return cfg?.aiGuides?.[point]?.trim() || (await getSetting<string>(keyOf(point), "")).trim() || (POINT_DEFAULT[point] ?? "");
}

// 템플릿 AI 설정 저장 입력(지점별 지침, 활동 공통 지침, 인터뷰 질문)
export const aiSettingsInput = z.object({
  aiGuides: z.record(z.string(), z.string().max(4000)),
  aiCommon: z.string().max(4000).optional(),
  interview: z.object({ questions: z.array(z.string().max(300)).max(30), followUpMax: z.number().int().min(0).max(12), skippable: z.array(z.boolean()).max(30).optional() }).optional(),
});

// 이 활동에 맞게 정리: 쓰이지 않는 지점·빈 값은 빼고, 인터뷰는 AI 인터뷰 활동에만 둔다.
export function cleanAiSettings(cfg: TemplateConfig, input: z.infer<typeof aiSettingsInput>): Pick<TemplateConfig, "aiGuides" | "aiCommon" | "interview"> {
  const allowed = new Set(aiPointsFor(cfg) as string[]);
  const keys = AI_POINTS.map((p) => p.key) as string[];
  const aiGuides = Object.fromEntries(
    Object.entries(input.aiGuides).map(([k, v]) => [k, v.trim()]).filter(([k, v]) => keys.includes(k) && allowed.has(k) && v),
  );
  const aiCommon = input.aiCommon?.trim() || undefined;
  // 빈 질문은 빼고, "답변안함" 허용 여부는 같은 질문에 붙여 둔다
  const pairs = (input.interview?.questions ?? []).map((q, i) => ({ q: q.trim(), skip: input.interview?.skippable?.[i] === true })).filter((p) => p.q);
  const questions = pairs.map((p) => p.q);
  const interview = cfg.preEvent.steps.includes("ai_interview") && input.interview && questions.length
    ? { questions, followUpMax: input.interview.followUpMax, ...(pairs.some((p) => p.skip) ? { skippable: pairs.map((p) => p.skip) } : {}) }
    : cfg.interview;
  return { aiGuides, aiCommon, interview };
}
