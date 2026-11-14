import { z } from "zod";

// 게시글(게시판) 공통: 양식, 양식별 내용(data) 검증, 기본 템플릿, 첨부 파일 종류.
// 화면과 서버가 함께 쓰므로 서버 전용 모듈(store, auth …)을 가져오지 않는다.
//
// Posts.data (양식별 JSON)
//  rules   : {}                                         — 본문은 안내 문구, 회칙 조문은 Rules 표에서 실시간으로 보여 준다
//  fee     : { defaultAmount, rules:[{kind, position, amount}], deadline, account, accountHolder }
//  minutes : { heldAt, place, attendees, agenda:[{title, status, note}], followUp }
//  general : {}
//  survey  : { questions:[{id, type:"text"|"single"|"multi", q, options[]}], deadline }
//  poll    : { options[], multi, deadline, anonymous }
//  quiz    : { items:[{q, answer:"O"|"X", explain}] }
// PostResponses.answer (JSON)
//  survey  : { answers: { [questionId]: string | number[] } }
//  poll    : { choices: number[] }
//  quiz    : { answers: ("O"|"X")[] }

export const FORMS = ["rules", "fee", "minutes", "general", "survey", "poll", "quiz"] as const;
export type Form = (typeof FORMS)[number];
export const isForm = (f: string): f is Form => (FORMS as readonly string[]).includes(f);

export const FORM_LABEL: Record<Form, string> = {
  rules: "회칙",
  fee: "연회비 안내",
  minutes: "회의록",
  general: "일반",
  survey: "설문",
  poll: "투표",
  quiz: "퀴즈(OX)",
};
export const FORM_HINT: Record<Form, string> = {
  rules: "확정된 회칙 조문을 그대로 보여 줘요 (전체 관리자만)",
  fee: "회원구분·직책별 연회비, 납부기한, 계좌",
  minutes: "일시, 장소, 참석자, 안건, 후속 조치",
  general: "제목과 내용",
  survey: "질문 여러 개 (주관식·하나 고르기·여러 개 고르기)",
  poll: "보기 중 하나 또는 여러 개 고르기",
  quiz: "O·X 문제와 해설",
};
// 응답을 받는 양식
export const RESPONSE_FORMS: Form[] = ["survey", "poll", "quiz"];

// 회의록 안건 상태(lib/club.ts 의 AGENDA_STATUS 와 같은 값. 화면에서 쓰려고 여기에 둔다)
export const AGENDA_STATUS = ["논의 전", "확정·실행완료", "새로운 안건", "보류·삭제", "후속 조치"] as const;

const t = (max: number) => z.string().trim().max(max);
// 마감: "YYYY-MM-DDTHH:mm"(한국 시간) 또는 "YYYY-MM-DD" 또는 ""
const deadline = z.string().regex(/^(\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?)?$/, "마감 일시를 확인해 주세요.").default("");

export const feeData = z.object({
  defaultAmount: z.string().regex(/^\d{0,9}$/, "금액은 숫자만 적어 주세요.").default(""),
  rules: z
    .array(z.object({ kind: t(40).default(""), position: t(40).default(""), amount: z.string().regex(/^\d{1,9}$/, "금액이 빈 줄이 있어요. 금액을 넣거나 줄을 지워 주세요.") }))
    .max(30)
    .default([]),
  deadline: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "납부기한을 확인해 주세요.").default(""),
  account: t(100).default(""),
  accountHolder: t(40).default(""),
});
export type FeeData = z.infer<typeof feeData>;

export const minutesData = z.object({
  heldAt: t(30).default(""),
  place: t(100).default(""),
  attendees: t(1000).default(""),
  agenda: z
    .array(z.object({ title: t(200).default(""), status: z.enum(AGENDA_STATUS).catch("논의 전"), note: t(4000).default("") }))
    .max(40)
    .default([]),
  followUp: t(2000).default(""),
});
export type MinutesData = z.infer<typeof minutesData>;

export const surveyData = z
  .object({
    questions: z
      .array(
        z.object({
          id: t(24).min(1),
          type: z.enum(["text", "single", "multi"]),
          q: t(300).min(1, "비어 있는 질문이 있어요."),
          options: z.array(t(100).min(1, "비어 있는 보기가 있어요.")).max(20).default([]),
        }),
      )
      .min(1, "질문을 하나 이상 넣어 주세요.")
      .max(30),
    deadline,
  })
  .refine((v) => v.questions.every((q) => q.type === "text" || q.options.length >= 2), { message: "고르는 질문에는 보기를 두 개 이상 넣어 주세요." })
  .refine((v) => new Set(v.questions.map((q) => q.id)).size === v.questions.length, { message: "질문 번호가 겹쳐요." });
export type SurveyData = z.infer<typeof surveyData>;

export const pollData = z.object({
  options: z.array(t(100).min(1, "비어 있는 보기가 있어요.")).min(2, "보기를 두 개 이상 넣어 주세요.").max(20),
  multi: z.boolean().default(false),
  deadline,
  anonymous: z.boolean().default(false),
});
export type PollData = z.infer<typeof pollData>;

export const quizData = z.object({
  items: z
    .array(z.object({ q: t(300).min(1, "비어 있는 문제가 있어요."), answer: z.enum(["O", "X"]), explain: t(1000).default("") }))
    .min(1, "문제를 하나 이상 넣어 주세요.")
    .max(30),
});
export type QuizData = z.infer<typeof quizData>;

const empty = z.object({}).strip();

export const DATA_SCHEMA: Record<Form, z.ZodTypeAny> = {
  rules: empty,
  fee: feeData,
  minutes: minutesData,
  general: empty,
  survey: surveyData,
  poll: pollData,
  quiz: quizData,
};

// zod 오류 중 직접 정한 안내 문구가 있으면 그것을 쓴다.
export function zodMessage(e: z.ZodError, fallback = "입력값을 확인해 주세요."): string {
  const own = e.issues.find((i) => i.message && !/^(Required|Invalid|Expected|String must|Array must|Number must)/.test(i.message));
  return own?.message ?? fallback;
}

export type Template = { title: string; body: string; data: Record<string, unknown> };

export const templateInput = z.object({ title: t(100).default(""), body: t(10000).default(""), data: z.unknown() });

export const DEFAULT_TEMPLATES: Record<Form, Template> = {
  rules: {
    title: "회칙",
    body: "원우회 회칙이에요. 확정된 조문만 보여요. 궁금한 점은 사무국에 물어봐 주세요.",
    data: {},
  },
  fee: {
    title: "연회비 안내",
    body: "올해 연회비를 안내해 드려요. 아래 ‘내 연회비’를 확인하고 납부기한까지 보내 주세요. 입금자명은 본인 이름으로 부탁드려요.",
    data: { defaultAmount: "", rules: [], deadline: "", account: "", accountHolder: "" },
  },
  minutes: {
    title: "회의록",
    body: "",
    data: { heldAt: "", place: "", attendees: "", agenda: [{ title: "", status: "논의 전", note: "" }], followUp: "" },
  },
  general: { title: "", body: "", data: {} },
  survey: {
    title: "설문",
    body: "잠깐 시간 내서 답해 주세요. 마감 전까지는 답을 고칠 수 있어요.",
    data: {
      questions: [
        { id: "q1", type: "single", q: "만족도는 어떠셨나요?", options: ["아주 좋아요", "좋아요", "보통이에요", "아쉬워요"] },
        { id: "q2", type: "text", q: "하고 싶은 말을 자유롭게 적어 주세요.", options: [] },
      ],
      deadline: "",
    },
  },
  poll: {
    title: "투표",
    body: "",
    data: { options: ["찬성", "반대"], multi: false, deadline: "", anonymous: false },
  },
  quiz: {
    title: "OX 퀴즈",
    body: "O 또는 X 를 골라 주세요. 다 풀면 정답과 해설을 보여 드려요.",
    data: { items: [{ q: "", answer: "O", explain: "" }] },
  },
};

// 마감 지났는지: "YYYY-MM-DDTHH:mm" 는 한국 시간, "YYYY-MM-DD" 는 그날 끝까지.
export function deadlineMs(d: string): number | null {
  if (!d) return null;
  const iso = d.length === 10 ? `${d}T23:59:59+09:00` : `${d}:00+09:00`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}
export function isClosed(d: string, now = Date.now()): boolean {
  const ms = deadlineMs(d);
  return ms !== null && now > ms;
}

/* ───── 첨부 파일 ───── */
export const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel 요청 한도(약 4.5MB) 안쪽
export const MAX_FILES = 10;

// 확장자 → [저장할 Content-Type, 브라우저가 보내 올 수 있는 MIME 목록, 이미지 여부]
const OCTET = "application/octet-stream";
export const FILE_TYPES: Record<string, { type: string; mimes: string[]; image: boolean }> = {
  jpg: { type: "image/jpeg", mimes: ["image/jpeg", "image/pjpeg"], image: true },
  jpeg: { type: "image/jpeg", mimes: ["image/jpeg", "image/pjpeg"], image: true },
  png: { type: "image/png", mimes: ["image/png"], image: true },
  webp: { type: "image/webp", mimes: ["image/webp"], image: true },
  gif: { type: "image/gif", mimes: ["image/gif"], image: true },
  pdf: { type: "application/pdf", mimes: ["application/pdf", OCTET], image: false },
  doc: { type: "application/msword", mimes: ["application/msword", OCTET], image: false },
  docx: { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", OCTET], image: false },
  xls: { type: "application/vnd.ms-excel", mimes: ["application/vnd.ms-excel", OCTET], image: false },
  xlsx: { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip", OCTET], image: false },
  ppt: { type: "application/vnd.ms-powerpoint", mimes: ["application/vnd.ms-powerpoint", OCTET], image: false },
  pptx: { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", mimes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/zip", OCTET], image: false },
  hwp: { type: "application/x-hwp", mimes: ["application/x-hwp", "application/haansofthwp", "application/vnd.hancom.hwp", OCTET], image: false },
  hwpx: { type: "application/vnd.hancom.hwpx", mimes: ["application/vnd.hancom.hwpx", "application/hwp+zip", "application/haansofthwpx", "application/zip", OCTET], image: false },
  zip: { type: "application/zip", mimes: ["application/zip", "application/x-zip-compressed", "application/x-zip", OCTET], image: false },
  txt: { type: "text/plain; charset=utf-8", mimes: ["text/plain", OCTET], image: false },
};
export const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif";
export const FILE_ACCEPT = Object.keys(FILE_TYPES).filter((k) => !FILE_TYPES[k].image).map((k) => `.${k}`).join(",");

export const extOf = (name: string) => (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] ?? "").toLowerCase();

// 확장자와 MIME 이 모두 허용 목록에 맞는지. 맞으면 저장할 형식을 돌려준다.
export function checkFileType(name: string, mime: string): { type: string; image: boolean } | null {
  const def = FILE_TYPES[extOf(name)];
  if (!def) return null;
  const m = (mime || "").split(";")[0].trim().toLowerCase();
  if (m && !def.mimes.includes(m)) return null;
  if (!m && def.image) return null;
  return { type: def.type, image: def.image };
}

export type FileMeta = { id: string; name: string; type: string; size: number; image: boolean };

export function fmtSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
