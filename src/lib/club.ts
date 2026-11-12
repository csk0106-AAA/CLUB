import { z } from "zod";
import { parseJson } from "./api";
import type { TabName } from "./store/schema";
import type { Row } from "./store/types";

// 조직도, 회칙, 회의록. 관리자가 구조와 내용을 모두 고칠 수 있다.
export type ClubKind = "org" | "rules" | "minutes";

// 안건은 회의 전에 적고(상태: 논의 전), 회의 중에 상태와 내용을 기록한다.
export const AGENDA_STATUS = ["논의 전", "확정·실행완료", "새로운 안건", "보류·삭제", "후속 조치"] as const;
export const MEETING_PHASE = ["예정", "완료"] as const;

// 검증에서 직접 정한 안내 문구가 있으면 그것을, 아니면 일반 문구를 돌려준다.
export function clubError(e: z.ZodError): string {
  return e.issues.find((i) => i.code === "custom")?.message ?? "입력값을 확인해 주세요.";
}

// 안건 상태 이름: 내부 값(AGENDA_STATUS)은 그대로 두고, 화면에 보이는 이름만 관리자가 바꾼다(설정에 저장).
export const AGENDA_LABELS_KEY = "agendaStatusLabels";
export type AgendaLabels = Record<string, string>;

type Def = {
  tab: TabName;
  perm: string[];
  schema: z.ZodType<Record<string, string>, z.ZodTypeDef, unknown>;
  view: (r: Row) => Record<string, unknown>;
  sort: (a: Row, b: Row) => number;
  // 저장할 때 덧붙일 열(예: 변경 기록). prev 가 없으면 새로 추가하는 경우다.
  audit?: (prev: Row | null, next: Record<string, string>, by: string) => Record<string, string>;
};

// 회칙 변경 기록: 누가, 언제, 무엇을 바꿨는지. 내용이 바뀌면 바꾸기 전 내용도 남긴다.
export type RuleLog = { at: string; by: string; what: string; before?: string };
const RULE_FIELDS: [string, string][] = [["chapter", "장"], ["article", "조"], ["body", "내용"], ["version", "버전"], ["confirmed", "확정 여부"]];

function ruleAudit(prev: Row | null, next: Record<string, string>, by: string): Record<string, string> {
  const log = parseJson<RuleLog[]>(prev?.history, []);
  let entry: RuleLog;
  if (!prev) entry = { at: new Date().toISOString(), by, what: "새로 추가" };
  else {
    const val = (r: Record<string, string>, k: string) => (k === "confirmed" ? String(r[k] === "true") : r[k] ?? "");
    const changed = RULE_FIELDS.filter(([k]) => val(prev, k) !== val(next, k));
    if (changed.length === 0) return {};
    const parts = changed.map(([k, label]) =>
      k === "version" ? `버전 ${prev.version || "-"} → ${next.version}`
        : k === "confirmed" ? (next.confirmed === "true" ? "확정으로 표시" : "확정 취소")
          : `${label} 수정`);
    entry = { at: new Date().toISOString(), by, what: parts.join(", ") };
    if (changed.some(([k]) => k === "body")) entry.before = (prev.body ?? "").slice(0, 1000);
  }
  return { history: JSON.stringify([entry, ...log].slice(0, 30)) };
}

const s = (max: number) => z.string().trim().max(max);

export const CLUB: Record<ClubKind, Def> = {
  org: {
    tab: "Org",
    perm: ["members"],
    schema: z
      .object({ dept: s(30).min(1), role: s(30).default(""), memberId: s(80).default(""), clubName: s(40).default(""), frequency: s(100).default(""), leaderId: s(80).default("") })
      .transform((v) => ({ dept: v.dept, role: v.role, memberId: v.memberId, clubName: v.clubName, frequency: v.frequency, leaderId: v.leaderId })),
    view: (r) => ({ id: r.id, dept: r.dept, role: r.role, memberId: r.memberId, clubName: r.clubName, frequency: r.frequency, leaderId: r.leaderId }),
    sort: () => 0,
  },
  rules: {
    tab: "Rules",
    perm: ["minutes"],
    schema: z
      .object({ chapter: s(60).min(1), article: s(60).default(""), body: s(4000).default(""), version: s(20).default("v1"), confirmed: z.boolean().default(false) })
      .transform((v) => ({ chapter: v.chapter, article: v.article, body: v.body, version: v.version, confirmed: String(v.confirmed) })),
    view: (r) => ({ id: r.id, chapter: r.chapter, article: r.article, body: r.body, version: r.version, confirmed: r.confirmed === "true", history: parseJson<RuleLog[]>(r.history, []) }),
    sort: () => 0,
    audit: ruleAudit,
  },
  minutes: {
    tab: "Minutes",
    perm: ["minutes"],
    schema: z
      .object({
        heldAt: s(30).min(1),
        place: s(100).default(""),
        attendees: s(300).default(""),
        // 안건: 제목은 회의 전에, 상태와 회의 내용(note)은 회의 중에 기록한다.
        agenda: z.array(z.object({ title: s(200).min(1), status: z.enum(AGENDA_STATUS).default("논의 전"), note: s(2000).default("") })).max(40).default([]),
        followUp: s(1000).default(""),
        phase: z.enum(MEETING_PHASE).default("예정"), // 예정: 안건 작성/회의 중, 완료: 기록을 마침
      })
      .refine((v) => v.phase !== "완료" || v.agenda.every((a) => a.status !== "논의 전"), {
        message: "아직 논의 전인 안건이 있어서 완료로 표시할 수 없어요. 안건마다 상태를 정하고 내용을 기록해 주세요.",
      })
      .transform((v) => ({ heldAt: v.heldAt, place: v.place, attendees: v.attendees, agenda: JSON.stringify(v.agenda), status: v.phase, followUp: v.followUp })),
    view: (r) => ({ id: r.id, heldAt: r.heldAt, place: r.place, attendees: r.attendees, agenda: parseJson(r.agenda, []), followUp: r.followUp, phase: r.status || "예정" }),
    sort: (a, b) => b.heldAt.localeCompare(a.heldAt),
  },
};

export const isClubKind = (k: string): k is ClubKind => k in CLUB;
