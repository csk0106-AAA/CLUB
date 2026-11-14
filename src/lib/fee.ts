import { z } from "zod";
import { parseJson } from "./api";

// 조건별 회비. 일정의 기본 회비(fee) 위에, 참석일 수 / 회원구분 / 직책 조건을 붙인 금액을 여러 줄 둘 수 있다.
// 빈 조건("")은 "전체". 회원에게 맞는 줄 중 조건을 가장 많이 지정한 줄을 쓰고(같으면 위쪽 줄),
// 맞는 줄이 없으면 기본 회비를 쓴다. 금액은 숫자 문자열(원), ""는 회비 없음.
export const feeRule = z.object({
  days: z.string().regex(/^\d{0,2}$/), // "" 전체, "1" 1일, "2" 2일(1박2일) …
  kind: z.string().max(40),
  position: z.string().max(40),
  amount: z.string().regex(/^\d{1,9}$/),
});
export type FeeRule = z.infer<typeof feeRule>;
export const feeRules = z.array(feeRule).max(30);

export function readRules(json: string | undefined): FeeRule[] {
  const r = feeRules.safeParse(parseJson<unknown>(json, []));
  return r.success ? r.data : [];
}

type Who = { kind?: string; position?: string };
const spec = (r: FeeRule) => (r.days ? 1 : 0) + (r.kind ? 1 : 0) + (r.position ? 1 : 0);

// 직책 "일반회원" = 직책이 없는 회원(빈 값이나 "-")
export const GENERAL_POSITION = "일반회원";
const positionOf = (p?: string) => (!p || p.trim() === "" || p.trim() === "-" ? GENERAL_POSITION : p.trim());

function best(rules: FeeRule[], m: Who, days: number | null): FeeRule | null {
  let pick: FeeRule | null = null;
  for (const r of rules) {
    if (r.kind && r.kind !== (m.kind ?? "")) continue;
    if (r.position && r.position !== positionOf(m.position)) continue;
    if (r.days && (days == null || Number(r.days) !== days)) continue;
    if (!pick || spec(r) > spec(pick)) pick = r;
  }
  return pick;
}

// 이 회원이 낼 회비. days: 참석 날짜 수(모르면 null)
export function feeFor(ev: { fee?: string; feeRules?: string }, m: Who, days: number | null): string {
  const r = best(readRules(ev.feeRules), m, days);
  return r ? r.amount : ev.fee ?? "";
}

// 참석 날짜를 고르기 전에 회비를 알 수 있는지.
// 날짜 조건이 있는 줄 때문에 날짜에 따라 금액이 달라지면 known=false.
export function feePreview(ev: { fee?: string; feeRules?: string; startsAt?: string; endsAt?: string }, m: Who): { known: boolean; amount: string } {
  const rules = readRules(ev.feeRules);
  if (!rules.some((r) => r.days)) return { known: true, amount: feeFor(ev, m, null) };
  const amounts = new Set([1, 2, 3, 4, 5, 6, 7].map((d) => feeFor(ev, m, d)));
  return amounts.size === 1 ? { known: true, amount: [...amounts][0] } : { known: false, amount: "" };
}

// 일정 기간의 날짜 수(하루짜리 일정이면 1)
function eventDayCount(ev: { startsAt?: string; endsAt?: string }): number {
  const a = ev.startsAt?.slice(0, 10);
  const b = (ev.endsAt || ev.startsAt)?.slice(0, 10);
  if (!a || !b) return 1;
  return Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1);
}

// 회원 한 명의 회비. 참석 날짜를 골랐으면 그 날짜 수로, 하루짜리 일정이면 1일로 계산한다.
// 여러 날 일정인데 아직 날짜를 고르지 않았고 날짜에 따라 금액이 달라지면 known=false.
export function memberFee(
  ev: { fee?: string; feeRules?: string; startsAt?: string; endsAt?: string },
  m: Who,
  apply?: { days?: string } | null,
): { known: boolean; amount: string } {
  const chosen = apply?.days ? apply.days.split(",").filter(Boolean).length : 0;
  if (chosen > 0) return { known: true, amount: feeFor(ev, m, chosen) };
  if (eventDayCount(ev) === 1) return { known: true, amount: feeFor(ev, m, 1) };
  return feePreview(ev, m);
}

// 실제로 낼 돈이 있는지(0원은 회비 없음)
export const payable = (amount: string) => Number(amount) > 0;

// 조건 줄을 사람이 읽는 말로 (관리자 화면·공지 문구용)
export function ruleLabel(r: FeeRule): string {
  const parts = [r.kind, r.position, r.days ? (r.days === "1" ? "1일 참석" : `${r.days}일 참석(${Number(r.days) - 1}박${r.days}일)`) : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : "전체";
}
