import { z } from "zod";
import { feeFor, ruleLabel } from "./fee";
import { getSetting, setSetting } from "./store";

// 모임회비(연회비/월회비). 모임 회비는 Settings "dues", 클럽 회비는 Settings "clubDues" = { [클럽]: Dues }.
//  period: annual(연회비) / monthly(월회비)
//  amount: 기본 금액(숫자 문자열, "" = 없음) — 조건별 금액 줄에 맞지 않는 회원이 낸다
//  rules : 조건별 금액 [{kind, position, amount}] — kind/position 이 "" 이면 "전체".
//          position 의 "일반회원" = 직책 없는 회원. 맞는 줄 중 조건이 가장 많은 줄(같으면 위쪽 줄)을 쓴다(lib/fee.ts 와 같은 규칙).
//  periodStart/periodEnd: 연회비 입금 기간("YYYY-MM-DD" 또는 "")
//  monthDay: 월회비 입금일("1"~"31" 또는 "") — "매월 N일까지"
//  bank/account/holder: 입금계좌, note: 안내 메모
// 예전 모양(amount + rules[{position}] + kindRules[{kind}] + dueText)은 읽을 때 새 모양으로 바꾼다(parseDues).
const money = z.string().regex(/^\d{0,9}$/);
const day = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "날짜를 확인해 주세요.");
export const duesRule = z.object({
  kind: z.string().trim().max(40).default(""),
  position: z.string().trim().max(40).default(""),
  amount: z.string().regex(/^\d{1,9}$/, "금액이 빈 줄이 있어요. 금액을 넣거나 줄을 지워 주세요."),
});
export const duesInput = z.object({
  period: z.enum(["annual", "monthly"]).default("annual"),
  amount: money.default(""),
  rules: z.array(duesRule).max(30).default([]),
  periodStart: day.default(""),
  periodEnd: day.default(""),
  monthDay: z.string().regex(/^([1-9]|[12]\d|3[01])?$/).default(""),
  bank: z.string().trim().max(40).default(""),
  account: z.string().trim().max(80).default(""),
  holder: z.string().trim().max(60).default(""),
  note: z.string().trim().max(1000).default(""),
});
export type Dues = z.infer<typeof duesInput>;
export type DuesRule = Dues["rules"][number];

export const EMPTY_DUES: Dues = {
  period: "annual", amount: "", rules: [], periodStart: "", periodEnd: "", monthDay: "", bank: "", account: "", holder: "", note: "",
};

export const PERIOD_LABEL: Record<Dues["period"], string> = { annual: "연회비", monthly: "월회비" };

type Legacy = {
  rules?: { kind?: string; position?: string; amount?: string }[];
  kindRules?: { kind?: string; amount?: string }[];
  dueText?: string;
  note?: string;
};

// 예전 모양 → 새 모양: 직책별 줄 → 회원구분별 줄 순서로 조건별 금액에 넣고(예전처럼 직책별이 먼저), 납부 안내는 메모 앞에 붙인다.
export function migrateDues(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  const o = { ...(v as Record<string, unknown>) } as Record<string, unknown> & Legacy;
  const legacy = "kindRules" in o || "dueText" in o;
  if (!legacy) return o;
  const rules = [
    ...(Array.isArray(o.rules) ? o.rules : []).map((r) => ({ kind: r.kind ?? "", position: r.position ?? "", amount: r.amount ?? "" })),
    ...(Array.isArray(o.kindRules) ? o.kindRules : []).map((r) => ({ kind: r.kind ?? "", position: "", amount: r.amount ?? "" })),
  ];
  const note = [String(o.dueText ?? "").trim(), String(o.note ?? "").trim()].filter(Boolean).join("\n").slice(0, 1000);
  delete o.kindRules;
  delete o.dueText;
  return { ...o, rules, note };
}

export function parseDues(v: unknown): Dues {
  const r = duesInput.safeParse(migrateDues(v ?? {}));
  return r.success ? r.data : EMPTY_DUES;
}

export async function readDues(): Promise<Dues> {
  return parseDues(await getSetting<unknown>("dues", {}));
}

/* ───── 클럽 회비 (Settings "clubDues") ───── */
export async function readClubDues(club: string): Promise<Dues | null> {
  const all = await getSetting<Record<string, unknown>>("clubDues", {});
  const v = all && typeof all === "object" ? all[club] : undefined;
  return v ? parseDues(v) : null;
}
export async function writeClubDues(club: string, d: Dues): Promise<void> {
  const all = await getSetting<Record<string, unknown>>("clubDues", {});
  await setSetting("clubDues", { ...(all && typeof all === "object" ? all : {}), [club]: d });
}

// 클럽 입금계좌: 클럽관리 › 회비관리의 계좌. 아직 회비를 저장하지 않았으면 예전 클럽 기본 정보의 계좌.
// 클럽 일정을 만들 때 일정 입금계좌로 먼저 넣는다.
export async function clubPayAccount(club: string, info?: { bank: string; account: string; holder: string }): Promise<{ account: string; holder: string }> {
  const d = await readClubDues(club);
  if (d && (d.account || d.bank || d.holder)) return { account: duesAccount(d), holder: d.holder };
  return info ? { account: duesAccount(info), holder: info.holder } : { account: "", holder: "" };
}

// 이 회원의 회비(금액 문자열, "" = 없음). 조건별 금액 → 기본 금액.
export function duesAmount(d: { amount: string; rules: DuesRule[] }, m: { kind?: string; position?: string }): string {
  return feeFor({ fee: d.amount, feeRules: JSON.stringify(d.rules.map((r) => ({ days: "", ...r }))) }, m, null);
}

export async function duesFor(m: { kind?: string; position?: string }): Promise<string> {
  return duesAmount(await readDues(), m);
}

// 입금계좌 한 줄: "국민은행 123-45-6789" (예금주는 따로)
export function duesAccount(d: { bank: string; account: string }): string {
  return [d.bank, d.account].map((x) => x.trim()).filter(Boolean).join(" ");
}

const won = (n: string) => `${Number(n).toLocaleString("ko-KR")}원`;
const ymd = (d: string) => d.replace(/-/g, "/");

// 입금 기한 한 줄: 연회비 "2026/01/01 ~ 2026/12/30", 월회비 "매월 10일까지"
export function duesDueLabel(d: Pick<Dues, "period" | "periodStart" | "periodEnd" | "monthDay">): string {
  if (d.period === "monthly") return d.monthDay ? `매월 ${d.monthDay}일까지` : "";
  if (d.periodStart && d.periodEnd) return `${ymd(d.periodStart)} ~ ${ymd(d.periodEnd)}`;
  if (d.periodEnd) return `${ymd(d.periodEnd)}까지`;
  if (d.periodStart) return `${ymd(d.periodStart)}부터`;
  return "";
}

// 요약: "정회원 · 회장 2,000,000원 / 그 밖의 회원 300,000원 · 연회비"
export function duesSummary(d: Pick<Dues, "amount" | "rules" | "period">): string {
  const parts = [
    ...d.rules.map((r) => `${ruleLabel({ days: "", ...r })} ${won(r.amount)}`),
    ...(d.amount ? [`${d.rules.length ? "그 밖의 회원" : "모든 회원"} ${won(d.amount)}`] : []),
  ];
  return parts.length ? `${parts.join(" / ")} · ${PERIOD_LABEL[d.period]}` : "";
}

// 같은 조건 줄이 두 번 있는지(있으면 그 조건 이름)
export function duplicateRule(rules: DuesRule[]): string | null {
  const keys = rules.map((r) => `${r.kind}|${r.position}`);
  const i = keys.findIndex((k, j) => keys.indexOf(k) !== j);
  return i >= 0 ? ruleLabel({ days: "", ...rules[i] }) : null;
}

// 한국 시간 올해
export function kstYear(now = Date.now()): number {
  return new Date(now + 9 * 3600_000).getUTCFullYear();
}
