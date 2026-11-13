import { z } from "zod";
import { ask, extractJson, isAiEnabled, truthLiesPrompt } from "./ai";
import { guidelinesFor } from "./ai-guides";
import { findIdentity, generalize, type IdentityTerms } from "./identity";
import type { ChatMsg } from "./who";

const shape = z.object({
  statements: z.array(z.string().trim().min(2).max(200)).length(3),
  lieIndex: z.number().int().min(0).max(2),
});

// 인터뷰 대화를 "질문-답" 쌍으로 바꾼다(모든 답을 쓴다). 신원이 드러나는 말은 일반화한다.
export function qaPairs(messages: ChatMsg[], terms: IdentityTerms): { q: string; a: string }[] {
  const out: { q: string; a: string }[] = [];
  messages.forEach((m, i) => {
    if (m.role !== "me") return;
    const q = messages.slice(0, i).reverse().find((x) => x.role === "ai")?.text ?? "";
    out.push({ q, a: generalize(m.text, terms) });
  });
  return out;
}

// 2진실 1거짓 문장에서 소개 글에 나오면 안 되는 핵심 단어를 뽑는다(3자 이상, 조사·서술어 제외).
// 예: "망기스타우 사막에서 별을 보며 밤을 새웠다" → ["망기스타우"]
const PARTICLE = /(에서|으로|에게|까지|부터|처럼|이라|라는|하고|이나|이고|이며|을|를|이|가|은|는|에|의|와|과|로|도|만)$/;
const COMMON = new Set(["있었다", "적이", "있다", "했다", "한다", "이다", "번이나", "사람", "처음", "가장", "직접", "함께", "매일", "모두"]);
export function keyWords(statements: string[]): string[] {
  const out = new Set<string>();
  for (const s of statements) {
    for (const raw of s.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)) {
      const w = raw.replace(PARTICLE, "");
      if (w.length >= 3 && !/다$/.test(w) && !COMMON.has(w)) out.add(w);
    }
  }
  return [...out];
}

// AI로 2진실 1거짓을 만든다. 형식이 틀리거나 신원이 드러나면 한 번 더 시도하고, 그래도 안 되면 null.
export async function generateTruthLies(intro: string, qa: { q: string; a: string }[], terms: IdentityTerms): Promise<{ statements: string[]; lieIndex: number } | null> {
  if (!isAiEnabled() || qa.length === 0) return null;
  const p = truthLiesPrompt(await guidelinesFor("truthlies"), intro, qa);
  const messages = [...p.messages];
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await ask(p.system, messages, 3000);
    if (!text) {
      console.warn("[truthlies] AI 응답 없음");
      return null;
    }
    const parsed = shape.safeParse(extractJson(text));
    if (parsed.success) {
      const statements = parsed.data.statements.map((x) => generalize(x, terms));
      const hits = findIdentity(statements.join(" "), terms);
      if (hits.length === 0) return { statements, lieIndex: parsed.data.lieIndex };
      console.warn("[truthlies] 신원 표현 포함:", hits.join(", "));
    } else {
      console.warn("[truthlies] 형식 오류:", text.slice(0, 300));
    }
    messages.push(
      { role: "assistant", content: text },
      { role: "user", content: "형식이 맞지 않거나 신원이 드러나는 말이 있어요. 규칙대로 JSON 하나만 다시 출력해 주세요." },
    );
  }
  return null;
}
