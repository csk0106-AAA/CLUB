import { NextResponse } from "next/server";
import { z } from "zod";
import { adminOrOfficer, bad } from "@/lib/api";
import { ask, extractJson, isAiEnabled } from "@/lib/ai";
import { templateInput } from "@/lib/activities";
import { AI_POINTS } from "@/lib/ai-guides";
import { REQUIRED_STEPS } from "@/lib/rounds";
import { WORRY_STEPS } from "@/lib/worry";

export const dynamic = "force-dynamic";

// 템플릿 편집기의 "AI에게 요청": 지금 편집 중인 설정 + 요청 → AI가 판단한다.
//  canDo true : 이미 있는 기능(단계·화면·켜지는 때·사전 작성·AI 지점·참여 대상·방식·진행자)으로 할 수 있으면 고친 설정 전체(config)
//  canDo false: 새 코드가 필요하면 개발 요청 초안(devRequest)
// 저장은 하지 않는다. 편집기에 적용한 뒤 관리자가 저장 방법(수정/새 버전/새 활동)을 고른다.
const body = z.object({
  config: z.unknown(),
  request: z.string().trim().min(1).max(2000),
});

const CATALOGUE = `[이 앱이 이미 갖춘 기능 — 이것만 조합할 수 있습니다]
1. 현장 단계 onsite.steps: { key(영문 소문자, 겹치지 않게), label, memberScreen, unlock, hostButton(진행자 화면 버튼 이름, 없으면 버튼 없음) }
   memberScreen(회원 휴대폰 화면): wait(대기 화면) | write(작성 화면) | vote(투표 화면) | iam_button("저예요" 버튼) | pick_person(명단에서 사람 고르기) | view(결과 보기)
   unlock(회원 화면이 켜지는 때): host_click(진행자가 버튼을 누르면 켜짐) | immediate(단계가 시작되면 바로 켜짐)
2. 사전 작성 preEvent: { enabled, opensBeforeDays(일정 며칠 전부터), closesBeforeDays(며칠 전까지), steps }
   steps 에 쓸 수 있는 값: alias(별칭), ai_interview(AI 인터뷰로 소개 글), truth_lies(2진실 1거짓), reading_optional(명리학 풀이, 선택), approve(본인 승인), worry_write(고민 미리 적기)
   guessPhase(소개 활동의 사전 맞히기): { enabled, opensBeforeDays, closesBeforeDays, steps: ["guess"] }
3. 실제로 동작하는 엔진(단계 key 가 맞아야 합니다)
   - 소개 엔진: preEvent.steps 에 ai_interview → 현장 단계 key ${REQUIRED_STEPS.join(", ")} 가 모두 있어야 합니다. 거짓 투표는 익명 집계(누가 무엇을 골랐는지는 보이지 않음). scoring { enabled, tieBreak: roulette|none } 은 이 엔진에서만.
   - 고민 엔진: preEvent.steps 에 worry_write → 현장 단계 key ${WORRY_STEPS.join(", ")} 가 모두 있어야 합니다. 회원이 고민마다 익명/실명을 고릅니다.
   - 현장 작성 엔진: memberScreen "write" 단계가 있으면 타임캡슐처럼 개인 목표·팀 약속을 쓰고 봉인합니다.
   - 그 밖의 단계는 "진행 안내형": 진행자가 버튼을 누르면 회원 휴대폰에 단계 이름이 보일 뿐, 투표·작성·사람 고르기 입력을 실제로 받지는 않습니다.
4. AI 지점 aiGuides(키별 지침 글): ${AI_POINTS.map((p) => `${p.key}(${p.label})`).join(", ")} — followup~reading 은 ai_interview 활동, worry 는 worry_write 활동에서만 쓰입니다. aiCommon(이 활동 공통 지침), interview { questions[], followUpMax 0~12 }.
5. participants: all(전체 회원) | selected(관리자가 고른 회원, 출석 체크 후 시작)
   mode: all(전체 활동) | team(팀 활동, 팀 배정은 일정에서)
6. host: { required(진행자가 있어야 하는지), note(진행자 안내 500자 이내) } — 진행자 사람과 접속번호는 일정에서 정합니다.
7. name, description`;

const SYSTEM = `당신은 모임 앱의 "활동 템플릿" 설정을 고쳐 주는 도우미입니다. 반드시 한국어로 답합니다.
관리자가 지금 편집 중인 템플릿 설정(JSON)과 요청을 받습니다.

${CATALOGUE}

[판단]
- 위 기능의 조합(설정 값 바꾸기, 단계 추가·삭제·순서·화면·켜지는 때 바꾸기, 사전 작성 단계, 지침, 참여 대상, 방식, 진행자)만으로 요청을 이룰 수 있으면 canDo 를 true 로 하고, 요청을 반영한 "설정 전체"를 config 로 돌려줍니다. 요청과 관계없는 값은 그대로 둡니다.
- 앱에 없는 동작(새 입력 방식, 새 화면, 새 규칙, 예: 투표 익명 여부 선택, 퀴즈 정답 채점, 사진 올리기)이 필요하면 canDo 를 false 로 하고 config 는 넣지 않습니다. 대신 개발자가 만들 수 있게 devRequest { title(한 줄), detail(무엇을 어떻게 동작하게 할지 구체적으로), why(왜 필요한지) } 를 씁니다.
- 일부만 가능하면 가능한 부분을 config 로 반영하고 canDo true, 안 되는 부분은 summary 에 밝히고 devRequest 도 함께 씁니다.
- summary: 관리자에게 하는 말 2~4문장. 무엇을 바꿨는지(또는 왜 지금은 안 되는지)를 쉬운 말로 씁니다.

[답하는 형식] JSON 하나만 출력합니다. 코드 블록이나 다른 글은 쓰지 않습니다.
{"canDo": true|false, "summary": "...", "config": {...} (canDo 가 true 일 때만), "devRequest": {"title":"...","detail":"...","why":"..."} (필요할 때만)}`;

type Out = { canDo?: unknown; summary?: unknown; config?: unknown; devRequest?: { title?: unknown; detail?: unknown; why?: unknown } };
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function POST(req: Request) {
  const g = await adminOrOfficer("activities");
  if ("err" in g) return g.err;
  if (!isAiEnabled()) return NextResponse.json({ error: "AI가 아직 연결되지 않았어요. 아래에서 개발 요청을 직접 남길 수 있어요.", aiOff: true }, { status: 503 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청 내용을 적어 주세요.");
  const cur = templateInput.safeParse(parsed.data.config);
  if (!cur.success) return bad("지금 편집 중인 설정에 맞지 않는 값이 있어요. 먼저 고친 뒤 다시 요청해 주세요.");

  const msgs: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: `[지금 설정]\n${JSON.stringify(cur.data)}\n\n[요청]\n${parsed.data.request}` },
  ];
  // 형식이나 설정 검증에 실패하면 이유를 알려 주고 한 번 더 받는다.
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await ask(SYSTEM, msgs, 4000);
    if (!text) break;
    const o = extractJson(text) as Out | null;
    if (!o || typeof o.canDo !== "boolean") {
      msgs.push({ role: "assistant", content: text }, { role: "user", content: "형식이 맞지 않아요. 설명한 JSON 하나만 다시 출력해 주세요." });
      continue;
    }
    const dr = o.devRequest && str(o.devRequest.title) && str(o.devRequest.detail)
      ? { title: str(o.devRequest.title).slice(0, 120), detail: str(o.devRequest.detail).slice(0, 4000), why: str(o.devRequest.why).slice(0, 2000) }
      : undefined;
    if (!o.canDo) return NextResponse.json({ canDo: false, summary: str(o.summary), devRequest: dr ?? { title: parsed.data.request.slice(0, 120), detail: parsed.data.request, why: "" } });
    const ok = templateInput.safeParse(o.config);
    if (ok.success) return NextResponse.json({ canDo: true, summary: str(o.summary), config: ok.data, ...(dr ? { devRequest: dr } : {}) });
    const why = ok.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    msgs.push({ role: "assistant", content: text }, { role: "user", content: `config 가 규칙에 맞지 않아요(${why}). 고쳐서 JSON 하나만 다시 출력해 주세요.` });
  }
  return bad("AI가 답을 만들지 못했어요. 요청을 조금 더 구체적으로 적어 다시 시도하거나, 개발 요청으로 남겨 주세요.", 502);
}
