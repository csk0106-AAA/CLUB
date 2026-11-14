import { z } from "zod";
import { GENERAL_POSITION } from "./fee";
import { getSetting } from "./store";

// 모임회비(연회비/월회비). Settings "dues" 에 저장한다.
//  period: annual(연회비) / monthly(월회비)
//  amount: 기본 회비(숫자 문자열, "" = 없음)
//  rules: 직책별 회비 [{position, amount}] — position 은 "회원 구분" 화면의 직책(일반회원 = 직책 없는 회원)
//  kindRules: 회원구분별 회비 [{kind, amount}] — 직책별 회비가 없을 때 쓴다
//  dueText: 납부 기한/안내(예: "매년 3월 31일까지")
//  bank/account/holder: 입금계좌, note: 메모(안내 문구)
// 회원의 회비 = 직책별 줄 → 회원구분별 줄 → 기본 회비 순서로 처음 맞는 금액.
const money = z.string().regex(/^\d{0,9}$/);
export const duesInput = z.object({
  period: z.enum(["annual", "monthly"]).default("annual"),
  amount: money.default(""),
  rules: z.array(z.object({ position: z.string().trim().min(1).max(40), amount: z.string().regex(/^\d{1,9}$/) })).max(30).default([]),
  kindRules: z.array(z.object({ kind: z.string().trim().min(1).max(40), amount: z.string().regex(/^\d{1,9}$/) })).max(30).default([]),
  dueText: z.string().trim().max(200).default(""),
  bank: z.string().trim().max(40).default(""),
  account: z.string().trim().max(80).default(""),
  holder: z.string().trim().max(60).default(""),
  note: z.string().trim().max(1000).default(""),
});
export type Dues = z.infer<typeof duesInput>;

export const EMPTY_DUES: Dues = { period: "annual", amount: "", rules: [], kindRules: [], dueText: "", bank: "", account: "", holder: "", note: "" };

export const PERIOD_LABEL: Record<Dues["period"], string> = { annual: "연회비", monthly: "월회비" };

export function parseDues(v: unknown): Dues {
  const r = duesInput.safeParse(v ?? {});
  return r.success ? r.data : EMPTY_DUES;
}

export async function readDues(): Promise<Dues> {
  return parseDues(await getSetting<unknown>("dues", {}));
}

const positionOf = (p?: string) => (!p || p.trim() === "" || p.trim() === "-" ? GENERAL_POSITION : p.trim());

// 이 회원의 모임회비(금액 문자열, "" = 없음)
export function duesAmount(d: Dues, m: { kind?: string; position?: string }): string {
  const pos = d.rules.find((r) => r.position === positionOf(m.position));
  if (pos) return pos.amount;
  const kind = d.kindRules.find((r) => r.kind === (m.kind ?? "").trim());
  if (kind) return kind.amount;
  return d.amount;
}

export async function duesFor(m: { kind?: string; position?: string }): Promise<string> {
  return duesAmount(await readDues(), m);
}

// 입금계좌 한 줄: "국민은행 123-45-6789" (예금주는 따로)
export function duesAccount(d: Dues): string {
  return [d.bank, d.account].map((x) => x.trim()).filter(Boolean).join(" ");
}

const won = (n: string) => `${Number(n).toLocaleString("ko-KR")}원`;

// 요약: "회장 50,000원 / 일반회원 30,000원 · 연회비"
export function duesSummary(d: Dues): string {
  const parts = [
    ...d.rules.map((r) => `${r.position} ${won(r.amount)}`),
    ...d.kindRules.map((r) => `${r.kind} ${won(r.amount)}`),
    ...(d.amount ? [`${d.rules.length || d.kindRules.length ? "그 밖의 회원" : "모든 회원"} ${won(d.amount)}`] : []),
  ];
  return parts.length ? `${parts.join(" / ")} · ${PERIOD_LABEL[d.period]}` : "";
}
