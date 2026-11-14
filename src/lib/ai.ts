// AI 호출(Anthropic Messages API). 서버에서만 쓴다.
// ANTHROPIC_API_KEY 가 없거나 호출이 두 번 실패하면 호출하는 쪽이 수동 입력 모드로 넘어간다.
// 주의: 이 파일의 API 호출 부분은 아직 실제 키로 시험하지 못했다.

export function isAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

type Msg = { role: "user" | "assistant"; content: string };

async function callOnce(system: string, messages: Msg[], maxTokens: number): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
  const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
  if (!text) console.warn(`[ai] 빈 응답 (stop_reason=${data.stop_reason}, 블록=${(data.content ?? []).map((c) => c.type).join(",")})`);
  return text;
}

// 재시도 1회. 그래도 실패하면 null 을 돌려주고, 호출한 쪽이 수동 모드로 바꾼다.
export async function ask(system: string, messages: Msg[], maxTokens = 1500): Promise<string | null> {
  if (!isAiEnabled()) return null;
  for (let i = 0; i < 2; i++) {
    try {
      const out = await callOnce(system, messages, maxTokens);
      if (out) return out;
    } catch (e) {
      // 다시 시도. 원인은 서버 기록에 남긴다(키 값은 남기지 않는다).
      console.warn("[ai] 호출 실패:", e instanceof Error ? e.message : String(e));
    }
  }
  return null;
}

const BASE = (guidelines: string) =>
  `당신은 원우회 회원의 소개 글을 돕는 편집자입니다. 반드시 한국어로 답하세요.\n\n[관리자 지침]\n${guidelines}`;

export function followUpPrompt(guidelines: string, qa: { q: string; a: string }[]): { system: string; messages: Msg[] } {
  return {
    system: `${BASE(guidelines)}\n\n지금까지의 질문과 답을 보고, 더 알고 싶은 후속 질문을 한 문장으로만 하세요. 신원이 드러나는 것은 묻지 마세요. 더 물을 것이 없으면 정확히 "없음"이라고만 답하세요.`,
    messages: [{ role: "user", content: qa.map((x) => `질문: ${x.q}\n답: ${x.a}`).join("\n\n") }],
  };
}

// 소개 글과 별칭을 함께 만든다. alias 가 있으면 그 별칭을 그대로 쓰고, 없으면 인터뷰 내용으로 별칭을 제안한다.
// 소개 글 첫 줄 제목에 같은 별칭을 넣어 둘이 어긋나지 않게 한다.
// avoid: 소개 글에 쓰면 안 되는 내용(2진실 1거짓 문장). banned: 쓰면 안 되는 단어(검사에서 걸린 것).
export function introAliasPrompt(
  guidelines: string, answers: string[], alias: string, taken: string[], avoid: string[] = [], banned: string[] = [],
): { system: string; messages: Msg[] } {
  const avoidRule = avoid.length
    ? `\n- 아래 문장들은 일정에서 '2진실 1거짓' 게임에 씁니다. 소개 글을 읽고 정답을 알 수 없도록, 이 문장들에 나온 사실·장소·사물·경험은 소개 글에 전혀 쓰지 않습니다(돌려 말하거나 암시하지도 않습니다):\n${avoid.map((x) => `  · ${x}`).join("\n")}`
    : "";
  const bannedRule = banned.length ? `\n- 다음 단어는 소개 글에 절대 쓰지 않습니다: ${banned.join(", ")}` : "";
  const aliasRule = alias
    ? `별칭은 반드시 "${alias}" 를 그대로 씁니다.`
    : `인터뷰 내용에서 이 사람을 잘 드러내는 별칭을 지어 주세요(2~12자, 이름·회사명·직함·업종을 짐작할 수 없게). 이미 쓰는 별칭과 겹치면 안 됩니다: ${taken.length ? taken.join(", ") : "(없음)"}`;
  return {
    system: `${BASE(guidelines)}

아래 인터뷰 답변으로 별칭 소개 글(약 2페이지)을 쓰세요.
- ${aliasRule}
- 소개 글 첫 줄은 마크다운 제목으로 "# {이 사람을 그리는 짧은 수식어}, '{별칭}'입니다." 형식으로 씁니다.${avoidRule}${bannedRule}
반드시 JSON 하나만 출력합니다. 코드 블록이나 다른 글은 쓰지 않습니다: {"alias":"...","intro":"..."}`,
    messages: [{ role: "user", content: answers.join("\n\n") }],
  };
}

export function draftPrompt(guidelines: string, answers: string[]): { system: string; messages: Msg[] } {
  return {
    system: `${BASE(guidelines)}\n\n아래 인터뷰 답변으로 별칭 소개 글(약 2페이지)을 쓰세요. 소개 글만 출력하세요.`,
    messages: [{ role: "user", content: answers.join("\n\n") }],
  };
}

// 2진실 1거짓: 인터뷰 답변 전체를 보고 만든다. 진실 2개는 답변에 실제로 있는 사실 중 소개 글에 쓰지 않은 것,
// 거짓 1개는 그럴듯하게 지어낸 것. 활동 중에는 소개 글과 겹치면 정답이 드러나므로 겹치지 않게 한다.
export function truthLiesPrompt(guidelines: string, intro: string, qa: { q: string; a: string }[]): { system: string; messages: Msg[] } {
  return {
    system: `${BASE(guidelines)}

회원의 인터뷰 답변으로 '2진실 1거짓' 게임 문장 3개를 만드세요.
- 진실 2개: 인터뷰 답변에 실제로 나온 사실로만 만듭니다. 소개 글에 이미 쓴 내용은 쓰지 않습니다(소개 글을 읽은 사람이 바로 맞히면 안 됩니다).
- 거짓 1개: 답변에 없는 내용을 진실과 비슷한 말투와 길이로, 그럴듯하게 지어냅니다. 너무 뻔하거나 실례가 되는 거짓은 피합니다.
- 각 문장은 한 문장, 40자 안팎의 평서문("~했다", "~이다")으로 씁니다. 이름·회사명·직함·학교 등 신원이 드러나는 말은 쓰지 않습니다.
- 거짓 문장의 위치(lieIndex, 0~2)는 무작위로 정합니다.
반드시 JSON 하나만 출력합니다. 코드 블록이나 다른 글은 쓰지 않습니다: {"statements":["...","...","..."],"lieIndex":1}`,
    messages: [{ role: "user", content: `소개 글:\n${intro || "(아직 없음)"}\n\n인터뷰 질문과 답변:\n${qa.map((x) => `질문: ${x.q}\n답: ${x.a}`).join("\n\n")}` }],
  };
}

// 명리학 풀이: 계산된 사주 원국을 바탕으로 ① 소개 페이지에 싣는 성격·성향(공개) ② 생애주기 전체 풀이(본인만)를 쓴다.
export function readingPrompt(guidelines: string, saju: string): { system: string; messages: Msg[] } {
  return {
    system: `당신은 따뜻하고 신중한 명리학 상담가입니다. 반드시 한국어로 답합니다.
아래에 만세력으로 정확히 계산한 사주 원국(년·월·일·시주, 일간, 오행 분포, 십신, 대운)이 있습니다. 간지를 새로 계산하지 말고 주어진 값만 근거로 풀이하세요.

[관리자 지침]
${guidelines}

두 가지 글을 씁니다.
1) traits — 소개 페이지 맨 끝에 다른 회원에게 공개되는 "명리학으로 본 성격과 성향" (5~8문장)
   - 장점과 강점 중심으로, 단점으로 읽힐 수 있는 표현은 최대한 피하고, 필요하면 "이런 면을 살리면 좋다" 식으로 긍정적으로 바꿔 씁니다.
   - 띠(동물), 태어난 연도·월·일, 나이, 간지 글자, 성별은 쓰지 않습니다(신원을 짐작할 수 있기 때문입니다). 오행 이미지(예: 큰 나무, 따뜻한 햇살) 정도의 비유는 괜찮습니다.
2) full — 본인만 보는 "생애주기 명리 풀이" (마크다운, 약 2~3페이지)
   - 첫머리에 사주 원국과 오행의 특징을 쉽게 설명합니다.
   - 대운 흐름을 따라 생애주기(청년기, 중년기, 장년기, 노년기와 지금 시기)를 나누어 설명합니다.
   - 건강, 재물, 직업, 성격, 성향, 연애, 결혼, 인간관계를 각각 소제목으로 다룹니다.
   - 단정적인 예언, 불안을 키우는 표현, 특정 질병·사고 단정은 쓰지 않고 "경향", "조심하면 좋은 점" 정도로 씁니다.
   - 마지막에 "명리학 풀이는 재미와 자기 성찰을 위한 참고용"이라는 한 줄을 붙입니다.
반드시 JSON 하나만 출력합니다. 코드 블록이나 다른 글은 쓰지 않습니다: {"traits":"...","full":"..."}`,
    messages: [{ role: "user", content: saju }],
  };
}

// AI 답에서 JSON 객체 하나를 꺼낸다(코드 블록·앞뒤 글이 붙어 와도 읽는다).
export function extractJson(text: string | null): unknown {
  if (!text) return null;
  const t = text.replace(/```(?:json)?/gi, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function revisePrompt(guidelines: string, current: string, request: string): { system: string; messages: Msg[] } {
  return {
    system: `${BASE(guidelines)}\n\n회원의 수정 요청이 관리자 지침에 어긋나면 첫 줄에 정확히 "거절:" 로 시작해 이유를 한 문장으로 쓰세요. 지침에 맞으면 요청대로 고친 소개 글만 출력하세요.`,
    messages: [{ role: "user", content: `현재 글:\n${current}\n\n수정 요청: ${request}` }],
  };
}
