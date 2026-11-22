// 명리학 사주풀이(서버 전용): 앱 안 어디서 명리학 풀이를 쓰든 반드시 이 파일을 거친다.
//  - 명리학 필수 지침(lib/ai-rules.ts SAJU_RULES)이 항상 들어간다. 지침은 코드에만 있고 관리자 › 모임설정에서 읽기만 한다.
//  - 부르는 쪽은 결과가 누구에게 보이는지(공개 public / 나만 보기 private)를 반드시 정해야 한다(audiences).
//    공개 글에는 공개용 지침과 신원 단서 검사, 나만 보기에는 나만 보기 지침이 붙는다.
//  - 앱 공통 필수 지침(민감정보·혐오 표현 금지 등)은 lib/ai.ts ask 가 맨 위에 붙인다(여기서 다시 넣지 않는다).
// 새 기능(다른 일정·활동, 나중의 "풀이" 기능 템플릿)에서 명리학 풀이가 필요하면 sajuReadingPrompt · checkSaju 를 쓴다.
import { SAJU_RULES, type SajuAudience } from "./ai-rules";
import { findIdentity } from "./identity";

export type { SajuAudience };

// 결과 JSON 의 키(공개 글 public, 나만 보기 private)
const TITLE: Record<SajuAudience, string> = {
  public: "다른 회원에게 공개되는 “명리학으로 본 성격과 성향”",
  private: "본인만 보는 “생애주기 명리 풀이”(마크다운)",
};

// context: 그 활동의 공통 지침(있으면). 명리학 필수 지침보다 아래에 들어간다.
export function sajuReadingPrompt(opts: { audiences: [SajuAudience, ...SajuAudience[]]; saju: string; context?: string }): { system: string; messages: { role: "user"; content: string }[] } {
  const list = (rs: string[]) => rs.map((r) => `- ${r}`).join("\n");
  const parts = opts.audiences.map((a, i) => `${i + 1}) ${a} — ${TITLE[a]}\n${list(SAJU_RULES[a])}`).join("\n");
  const keys = opts.audiences.map((a) => `"${a}":"..."`).join(",");
  return {
    system: `당신은 따뜻하고 신중한 명리학 상담가입니다. 반드시 한국어로 답합니다.
아래에 만세력으로 정확히 계산한 사주 원국이 있습니다.

[명리학 필수 지침 — 활동 지침보다 우선합니다]
${list(SAJU_RULES.common)}
${opts.context?.trim() ? `\n[이 활동의 공통 지침]\n${opts.context.trim()}\n` : ""}
다음 글을 씁니다.
${parts}
반드시 JSON 하나만 출력합니다. 코드 블록이나 다른 글은 쓰지 않습니다: {${keys}}`,
    messages: [{ role: "user", content: opts.saju }],
  };
}

// 공개 글에 신원을 짐작할 단서(연도, 나이, 띠, 간지 글자)가 들어갔는지
// (평범한 낱말 "정신", "기술", "빛을 띠다" 등은 걸리지 않도록 간지는 년·월·일·시·주·생이 붙은 경우만 본다)
const LEAK = new RegExp(
  [
    "\\d{4}\\s*년",
    "\\d{1,3}\\s*(세|살)",
    "(쥐|소|호랑이|범|토끼|용|뱀|말|양|원숭이|닭|개|돼지)\\s*띠(?![고며어다는])",
    "[갑을병정무기경신임계][자축인묘진사오미신유술해]\\s*(년|월|일|시|주|생)",
    "[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]",
  ].join("|"),
);
// 나만 보기는 위쪽 제한 없음(세 번에 나누어 만들고, 조각마다 너무 짧으면 다시 만든다)
const LEN: Record<SajuAudience, [number, number]> = { public: [40, 2000], private: [200, Number.POSITIVE_INFINITY] };

// 결과 검사: 길이, 공개 글의 신원 단서·회원 신원 정보. 통과하면 null, 아니면 이유
export function checkSaju(audience: SajuAudience, text: string, terms: Parameters<typeof findIdentity>[1]): string | null {
  const t = text.trim();
  const [min, max] = LEN[audience];
  if (t.length < min || t.length > max) return "길이";
  if (audience === "public" && (LEAK.test(t) || findIdentity(t, terms).length > 0)) return "신원 단서";
  return null;
}

// 나만 보기 풀이를 세 번에 나누어 만든다(분량이 많아 한 번에 다 받을 수 없고, 서버 시간 제한도 있다).
//  1: 공개 글(public) + 나만 보기 첫머리(원국·오행 설명, intro) — JSON {"public","intro"}
//  2: 대운 10년 단위 흐름 — 마크다운만
//  3: 주제별 풀이 (1)~(5)와 마지막 한 줄 — 마크다운만
// 지침은 매번 모두 넣고(일관성), 이번에 쓸 부분만 알려 준다.
export type SajuPart = 1 | 2 | 3;
const PART_TASK: Record<SajuPart, string> = {
  1: `이번에는 두 글만 씁니다.
(가) public — ${TITLE.public}: 공개용 지침을 따른다.
(나) intro — 본인만 보는 풀이의 첫머리: 나만 보기 지침 2번(사주 원국과 오행의 특징을 쉽게 설명)만 마크다운으로. 대운·주제별 풀이는 다음 단계에서 쓰므로 여기서 쓰지 않는다.
반드시 JSON 하나만 출력합니다. 코드 블록이나 다른 글은 쓰지 않습니다: {"public":"...","intro":"..."}`,
  2: `이번에는 본인만 보는 풀이 중 나만 보기 지침 3번(대운 10년 단위 흐름)만 마크다운으로 씁니다. "## 대운 흐름" 소제목으로 시작하고, 원국 설명·주제별 풀이·마지막 한 줄은 쓰지 않습니다. JSON 이 아니라 마크다운 글만 출력합니다.`,
  3: `이번에는 본인만 보는 풀이 중 나만 보기 지침 4번의 주제 (1)~(5)와 5번 마지막 한 줄만 마크다운으로 씁니다. 주제마다 "##" 소제목을 달고, 원국 설명·대운 흐름은 쓰지 않습니다. JSON 이 아니라 마크다운 글만 출력합니다.`,
};
export function sajuPartPrompt(part: SajuPart, opts: { saju: string; context?: string }): { system: string; messages: { role: "user"; content: string }[] } {
  const list = (rs: string[]) => rs.map((r) => `- ${r}`).join("\n");
  return {
    system: `당신은 깊이 있고 솔직한 명리학 상담가입니다. 반드시 한국어로 답합니다.
아래에 만세력으로 정확히 계산한 사주 원국이 있습니다.

[명리학 필수 지침 — 활동 지침보다 우선합니다]
${list(SAJU_RULES.common)}

[공개 글(public) 지침]
${list(SAJU_RULES.public)}

[나만 보기(본인만 보는 풀이) 지침]
${SAJU_RULES.private.map((r, i) => `${i + 1}. ${r}`).join("\n")}
${opts.context?.trim() ? `\n[이 활동의 공통 지침]\n${opts.context.trim()}\n` : ""}
${PART_TASK[part]}`,
    messages: [{ role: "user", content: opts.saju }],
  };
}
