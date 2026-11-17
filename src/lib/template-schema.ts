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

export const preEventSchema = z.object({
  enabled: z.boolean(), // false면 일정 전 사전 작성 단계가 없다(현장에서만 진행)
  opensBeforeDays: z.number().int().min(0).optional(),
  closesBeforeDays: z.number().int().min(0).optional(),
  steps: z.array(z.string()).default([]),
});

export const templateConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().min(1),
  description: z.string().default(""),
  // 참여 대상: all(전체 회원) / selected(관리자 선택 회원).
  // selected 이면 관리자가 활동 전에 참여할 사람을 고르고(출석 체크) 완료해야 한다.
  // 활동에 들어가는 일(2진실 1거짓과 맞히기, 투표, 진행 대상, 고민 작성과 뽑기, 타임캡슐 작성)에 적용된다.
  // 선택되지 않은 회원은 활동에 들어가지 않고, 소개 활동이라면 AI 인터뷰로 프로필 북용 소개만 작성한다.
  participants: z.enum(["all", "selected"]).default("all"),
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
  interview: z.object({ questions: z.array(z.string().max(300)).max(30), followUpMax: z.number().int().min(0).max(12), skippable: z.array(z.boolean()).max(30).optional() }).optional(),
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
  derivedFrom: z.string().optional(), // v1 템플릿 id
  sourceEvent: z.object({ id: z.string(), name: z.string(), date: z.string() }).optional(),
});

export type TemplateConfig = z.infer<typeof templateConfigSchema>;
export type TemplateStep = z.infer<typeof stepSchema>;

// 기본 템플릿 3종 (사용자 요청 활동)
export const DEFAULT_TEMPLATES: TemplateConfig[] = [
  {
    id: "who-am-i",
    name: "내가 누굴까요?",
    version: 1,
    participants: "selected", // 기본: 관리자가 선택한 회원만 참여(활동 전에 출석 체크)
    description: "AI 인터뷰로 별칭 소개글을 만들고, 누구인지 맞히고, 2진실 1거짓을 즐깁니다.",
    preEvent: {
      enabled: true,
      opensBeforeDays: 14,
      closesBeforeDays: 7,
      steps: ["alias", "ai_interview", "truth_lies", "reading_optional", "approve"],
    },
    guessPhase: { enabled: true, opensBeforeDays: 7, closesBeforeDays: 1, steps: ["guess"] },
    onsite: {
      steps: [
        { key: "intro", label: "소개 페이지 열기", memberScreen: "wait", unlock: "host_click", hostButton: "소개 열기" },
        { key: "reveal", label: "이름 공개", memberScreen: "iam_button", unlock: "host_click", hostButton: "이름 공개" },
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
