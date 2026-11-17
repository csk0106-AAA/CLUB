import { readDues, duesAmount, kstYear, type Dues } from "./dues";
import { isGuest } from "./member-kind";
import { effectivePerms, getPermGroups } from "./perms";
import { readSupports } from "./supports";
import type { Row } from "./store/types";

// 모임 회비 입금·사용 장부(관리자 › 모임설정 › 회비입금 / 회비내역).
//  기간(period): 연회비 "2026", 월회비 "2026-11". 지금 기간은 회비설정의 입금 기간(연회비) 또는 이번 달(월회비).

const kstNow = () => new Date(Date.now() + 9 * 3600_000).toISOString();

export function currentPeriod(d: Dues): string {
  if (d.period === "monthly") return kstNow().slice(0, 7);
  return (d.periodStart || d.periodEnd).slice(0, 4) || String(kstYear());
}

export function periodLabel(p: string): string {
  return /^\d{4}-\d{2}$/.test(p) ? `${p.slice(0, 4)}년 ${Number(p.slice(5))}월 월회비` : `${p}년 연회비`;
}

// 회비를 낼 회원: 대기회원·참관회원·탈퇴회원이 아니고 금액이 있는 회원
export function duesTargets(members: Row[], d: Dues): { member: Row; amount: string }[] {
  return members.filter((m) => !isGuest(m.kind)).map((m) => ({ member: m, amount: duesAmount(d, m) })).filter((x) => Number(x.amount) > 0);
}

// 회비 입금·사용을 관리하는 사람: 모임설정(group) 또는 모든 권한
export function isDuesHandler(me: Row | undefined, groups: Awaited<ReturnType<typeof getPermGroups>>): boolean {
  return !!me && !isGuest(me.kind) && effectivePerms(me, groups).some((p) => p === "all" || p === "group");
}

// 확인 전 입금 알림(회원이 모임회비 공지에서 "입금했어요"를 누름)
export const pendingDuesNotices = (payments: Row[]) => payments.filter((p) => p.notice && p.paid !== "true");

// 일정에서 "모임회비 지원"으로 쓴 돈: 장부의 지출로 자동으로 보여 준다(일정 날짜 기준)
export function eventDuesSupports(events: Row[]): { id: string; date: string; item: string; amount: number; memo: string; eventId: string }[] {
  return events.flatMap((e) =>
    readSupports(e.supports).filter((s) => s.kind === "dues" && Number(s.amount) > 0).map((s, i) => ({
      id: `ev-${e.id}-${i}`, date: (e.startsAt || "").slice(0, 10), item: `일정 지원 · ${e.name}${s.name ? ` (${s.name})` : ""}`,
      amount: Number(s.amount) || 0, memo: s.memo, eventId: e.id,
    })),
  );
}

export async function duesNow(): Promise<{ dues: Dues; period: string }> {
  const dues = await readDues();
  return { dues, period: currentPeriod(dues) };
}
