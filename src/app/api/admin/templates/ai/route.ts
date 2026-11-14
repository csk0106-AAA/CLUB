import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { ask, isAiEnabled } from "@/lib/ai";
import { templateInput } from "@/lib/activities";
import { DEFAULT_TEMPLATES } from "@/lib/template-schema";

export const dynamic = "force-dynamic";

// AI와 대화하며 새 활동 템플릿을 만든다. AI가 만든 설정도 templateInput 검증을 통과해야 돌려준다.
// 저장은 하지 않는다. 관리자가 미리보기를 보고 승인(저장)하면 기존 POST /api/admin/templates 로 저장한다.
const body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(30),
});

const examples = DEFAULT_TEMPLATES.map(({ id: _i, version: _v, ...c }) => c);

const SYSTEM = `당신은 원우회(20명 안팎의 경영자 모임) 일정의 활동을 설계하는 도우미입니다. 반드시 한국어로 답합니다.
관리자의 설명을 듣고 이 앱의 "활동 템플릿" 설정(JSON)을 만듭니다.

[앱이 실제로 동작시킬 수 있는 것]
1. 소개 엔진: preEvent.steps 에 "ai_interview" 가 있으면 AI 인터뷰로 소개 글을 쓰고, 2진실 1거짓, 사전 맞히기, 현장 소개·이름 공개·거짓 투표·정답 공개가 동작합니다. (기본 "내가 누굴까요?")
2. 고민 엔진: preEvent.steps 에 "worry_write" 가 있으면 사전에 고민을 적고, 현장에서 뽑기·대화 타이머·이름 오픈이 동작합니다. (기본 "나의 고민은?")
3. 현장 작성 엔진: onsite 단계 중 memberScreen 이 "write" 인 단계가 있으면 사회자가 열 때 회원이 개인 목표·팀 약속을 쓰고 봉인합니다. (기본 "타임캡슐")
4. 그 밖의 활동: 사회자가 단계 버튼을 누르면 회원 휴대폰에 지금 단계 이름과 안내가 보이는 "진행 안내형" 활동입니다. 이 경우 회원 휴대폰에서 투표·작성·사람 고르기 입력은 실제로 받지 않습니다.
새 활동은 위 엔진 중 가장 가까운 것을 바탕으로 이름·설명·단계 이름·사회자 버튼·기간·참여 대상을 바꿔서 만드세요.
엔진에 없는 입력(예: 키워드 입력, 퀴즈 정답 입력)이 꼭 필요하면 4번 진행 안내형으로 만들고, 그 한계를 reply 에 솔직히 알려 주세요.

[설정 규칙]
- name(필수), description(한두 문장), participants: "all"(전체 회원) 또는 "selected"(관리자가 고른 회원)
- preEvent: { enabled, opensBeforeDays, closesBeforeDays, steps } — 일정 며칠 전부터 며칠 전까지 사전 작성. 없으면 { "enabled": false, "steps": [] }
- guessPhase: 소개 엔진에서만 사용(사전 맞히기). 아니면 넣지 않습니다.
- onsite.steps: 1개 이상. 각 단계 { key(영문 소문자, 겹치지 않게), label, memberScreen, unlock, hostButton }
  memberScreen: wait(대기) | write(작성) | vote(투표) | iam_button("저예요") | pick_person(사람 고르기) | view(결과 보기)
  unlock: host_click(사회자가 누르면 켜짐) | immediate(단계 시작 시 바로)
- scoring: 소개 엔진에서만 { "enabled": true, "tieBreak": "roulette" }. 아니면 넣지 않습니다.

[기본 템플릿 예시]
${JSON.stringify(examples)}

[답하는 형식] 반드시 아래 JSON 하나만 출력합니다. 코드 블록이나 다른 글은 쓰지 않습니다.
{"reply": "관리자에게 하는 말(무엇을 만들었는지, 진행 방식, 한계를 3~5문장으로)", "config": { ...템플릿 설정... } 또는 null}
설명이 부족해 아직 만들 수 없으면 config 를 null 로 두고 reply 에서 필요한 것(인원, 시간, 진행 방식 등)을 한두 가지만 물어보세요.`;

function parseOut(text: string): { reply: string; config: unknown } | null {
  const t = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(t.slice(start, end + 1)) as { reply?: unknown; config?: unknown };
    return { reply: typeof o.reply === "string" ? o.reply : "", config: o.config ?? null };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  if (!isAiEnabled()) return bad("AI가 아직 연결되지 않았어요. 기존 템플릿을 복제해서 직접 맞춰 주세요.", 503);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");

  const msgs = parsed.data.messages.map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.content }));
  // 형식이나 검증에 실패하면 이유를 알려 주고 한 번 더 만들게 한다.
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await ask(SYSTEM, msgs, 3000);
    if (!text) break;
    const out = parseOut(text);
    if (!out) {
      msgs.push({ role: "assistant", content: text }, { role: "user", content: "형식이 맞지 않아요. 설명한 JSON 하나만 다시 출력해 주세요." });
      continue;
    }
    if (out.config === null) return NextResponse.json({ reply: out.reply, config: null });
    const ok = templateInput.safeParse(out.config);
    if (ok.success) return NextResponse.json({ reply: out.reply, config: ok.data });
    const why = ok.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    msgs.push({ role: "assistant", content: text }, { role: "user", content: `설정이 규칙에 맞지 않아요(${why}). 고쳐서 JSON 하나만 다시 출력해 주세요.` });
  }
  return bad("AI가 템플릿을 만들지 못했어요. 설명을 조금 더 구체적으로 적어 다시 시도해 주세요.", 502);
}
