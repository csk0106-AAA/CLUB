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
  { key: "reading", label: "명리학 풀이", hint: "사주 풀이의 말투·분량, 소개 페이지에 싣는 성격·성향 글의 기준, 금지 표현" },
  { key: "worry", label: "고민 관점 제안 (진행 도우미)", hint: "고민에 대해 AI가 제시하는 관점의 톤과 금지 사항" },
] as const;
export type AiPoint = (typeof AI_POINTS)[number]["key"];

const keyOf = (p: AiPoint) => `aiGuide:${p}`;

// 이 활동 설정에서 AI가 쓰이는 지점
export function aiPointsFor(cfg: Pick<TemplateConfig, "preEvent">): AiPoint[] {
  if (cfg.preEvent.steps.includes("ai_interview")) return ["followup", "draft", "truthlies", "revise", "reading"];
  if (cfg.preEvent.steps.includes("worry_write")) return ["worry"];
  return [];
}

export async function pointGuides(): Promise<Record<AiPoint, string>> {
  const out = {} as Record<AiPoint, string>;
  for (const p of AI_POINTS) out[p.key] = await getSetting<string>(keyOf(p.key), "");
  return out;
}

// 이 행사 활동의 템플릿에 적힌 지점 지침(행사에 넣은 뒤 템플릿에서 고쳐도 바로 반영되도록 템플릿을 다시 읽는다).
async function templateGuide(point: AiPoint, act?: Row): Promise<string> {
  if (!act) return "";
  const own = readConfig(act.config)?.aiGuides?.[point]?.trim();
  if (act.templateId) {
    const t = (await (await getStore()).list("ActivityTemplates")).find((x) => x.id === act.templateId);
    const fromTemplate = readConfig(t?.config)?.aiGuides?.[point]?.trim();
    if (fromTemplate) return fromTemplate;
  }
  return own ?? "";
}

// 공통 지침 + 이 지점의 지침(활동 템플릿 지침이 있으면 그것, 없으면 전체 지점 지침)
export async function guidelinesFor(point: AiPoint, act?: Row): Promise<string> {
  const common = await getSetting<string>("aiGuidelines", DEFAULT_GUIDELINES);
  const extra = (await templateGuide(point, act)) || (await getSetting<string>(keyOf(point), "")).trim();
  return extra ? `${common}\n\n[${AI_POINTS.find((p) => p.key === point)?.label} 단계 추가 지침]\n${extra}` : common;
}

export { keyOf as pointKey };
