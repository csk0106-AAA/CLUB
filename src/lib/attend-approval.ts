import { managersOf } from "./event-managers";
import { addAlerts } from "./member-alerts";
import { pushTo } from "./push";
import { refundOnAnswer } from "./refund";
import { getStore } from "./store";
import type { Row } from "./store/types";

// 참석 확정 방식(Events.approval)
//  "" (기본): 회원이 참석을 신청하면 바로 참석
//  "admin": 회원이 신청하면 승인 대기(EventApplies.req "참석") → 관리자가 신청현황에서 승인하면 참석, 반려하면 사유와 함께 알림
//  대기회원·참관회원, 다른 클럽 회원은 어느 쪽이든 참관·가입 신청(ClubRequests) 승인을 거친다(lib/club-requests.ts).
export const needsApproval = (ev: Row) => ev.approval === "admin";

// 일정 기간의 날짜 목록(최대 7일)
export function eventDays(startsAt: string, endsAt: string): string[] {
  const from = (startsAt || "").slice(0, 10);
  const to = (endsAt || startsAt || "").slice(0, 10);
  if (!from) return [];
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`) && out.length < 7; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export const clearReq = { req: "", reqDays: "", reqAt: "", reqResult: "", reqReason: "" };

// 회원이 참석을 신청했다(승인 대기) → 일정 관리자에게 알림
export async function notifyRequest(ev: Row, name: string): Promise<void> {
  const mgr = await managersOf(ev.id);
  await addAlerts(mgr, { eventId: ev.id, text: `${name} 님이 ${ev.name} 참석을 신청했어요. 신청현황에서 승인해 주세요.`, href: `/admin/events/${ev.id}?tab=apply` });
  await pushTo(mgr, "alerts").catch(() => undefined);
}

// 관리자가 승인·반려
export async function decide(eventId: string, memberId: string, approve: boolean, reason: string): Promise<string | null> {
  const s = await getStore();
  const [ev, applies] = await Promise.all([s.get("Events", eventId), s.list("EventApplies")]);
  const a = applies.find((x) => x.eventId === eventId && x.memberId === memberId);
  if (!ev || !a) return "신청 기록을 찾을 수 없어요.";
  if (a.req !== "참석") return "승인 대기 중인 신청이 아니에요.";
  if (approve) {
    const days = a.reqDays || (eventDays(ev.startsAt, ev.endsAt).length === 1 ? eventDays(ev.startsAt, ev.endsAt).join(",") : "");
    // 예전에 생긴 "승인 대기 + 송금대기" 줄: 승인하면 환불 요청을 취소하고 입금 확인으로 되돌린다(lib/refund.ts)
    const refund = a.refund === "wait" ? await refundOnAnswer(ev, a, "참석", await s.get("Members", memberId) ?? undefined) : {};
    await s.update("EventApplies", a.id, { answer: "참석", days, checkedBy: "", checkedAt: "", ...refund, ...clearReq });
    await addAlerts([memberId], { eventId, text: `${ev.name} 참석이 확정됐어요.`, href: `/events/${eventId}` });
  } else {
    await s.update("EventApplies", a.id, { ...clearReq, reqResult: "declined", reqReason: reason });
    await addAlerts([memberId], { eventId, text: `${ev.name} 참석 신청이 반려됐어요.${reason ? ` 사유: ${reason}` : ""}`, href: `/events/${eventId}` });
  }
  await pushTo([memberId], "alerts").catch(() => undefined);
  return null;
}
