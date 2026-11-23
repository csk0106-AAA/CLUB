import { managersOf } from "./event-managers";
import { feeDiff, memberFee } from "./fee";
import { addAlerts } from "./member-alerts";
import { pushTo } from "./push";
import { getStore } from "./store";
import type { Row } from "./store/types";

// 회비 돌려주기(송금·환불)
//  입금이 확인된(모임 통장에 들어온) 회원이 참석에서 빠지면(본인이 불참으로 바꾸거나 관리자가 바꿈):
//   - 그 줄은 refund "wait"(송금대기), 돌려줄 금액을 남기고 입금 확인은 푼다(참석자 회비 합계에서 빠진다)
//   - 관리자: "입금이 확인되었으니 회원에게 회비를 돌려주세요." / 회원: "일정에 참석하지 않아 회비를 송금해 드릴 예정입니다."
//   - 송금대기인 동안 참석 해제 시점부터 일주일마다 관리자에게 다시 알린다(remindRefunds, 화면·알림 숫자를 읽을 때 처리)
//  관리자가 "송금완료"를 누르면 refund "done" + 회원에게 바로 알림.
//  송금대기 중에 다시 참석하면 돌려줄 필요가 없으니 입금 확인 상태로 되돌린다.
const won = (n: string | number) => `${(Number(n) || 0).toLocaleString("ko-KR")}원`;
const WEEK = 7 * 86_400_000;

// 참석 여부가 바뀔 때 함께 저장할 값(없으면 {}). 알림도 여기서 보낸다.
export async function refundOnAnswer(ev: Row, before: Row | undefined, nextAnswer: string, member: Row | undefined): Promise<Record<string, string>> {
  if (!before) return {};
  const name = member?.name ?? "회원";
  const now = new Date().toISOString();
  // 참석 → 참석 아님, 입금 확인된 상태
  if (before.answer === "참석" && nextAnswer !== "참석" && before.paid === "true") {
    // 돌려줄 금액: 입금 확인 때의 금액(paidAmount, 실제로 받은 돈). 예전 기록(값 없음)은 지금 회비로.
    //  날짜를 바꿔 차액이 생긴 채로 빠져도 받은 돈만큼만 돌려주니 차액과 겹쳐 세지 않는다.
    const amount = before.paidAmount || memberFee(ev, { kind: member?.kind ?? "", position: member?.position ?? "" }, before).amount || "0";
    const mgr = await managersOf(ev.id);
    await addAlerts(mgr, { eventId: ev.id, text: `${name} 님이 ${ev.name} 참석에서 빠졌어요. 입금이 확인되었으니 회원에게 회비 ${won(amount)}을 돌려주세요. 송금했으면 회비 탭에서 “송금완료”를 눌러 주세요.`, href: `/admin/events/${ev.id}?tab=fee` });
    if (member) await addAlerts([member.id], { eventId: ev.id, text: `${ev.name}에 참석하지 않아 회비 ${won(amount)}을 송금해 드릴 예정입니다.`, href: `/events/${ev.id}` });
    await pushTo([...mgr, ...(member ? [member.id] : [])], "alerts").catch(() => undefined);
    // paidAt·paidAmount 는 남겨 둔다: 송금대기 중 다시 참석하면 원래 입금 확인 상태 그대로 되돌린다
    return { paid: "false", paidAt: before.paidAt ?? "", payNotice: "", refund: "wait", refundAmount: amount, refundSince: now, refundRemindAt: now, refundDoneAt: "" };
  }
  // 송금대기 중 다시 참석: 돈은 아직 통장에 있으니 환불 요청을 취소하고 입금 확인으로 되돌린다.
  //  관리자 승인 일정이어도 이미 승인됐던 회원이라 다시 승인받지 않는다(승인 대기도 지운다, 부르는 쪽에서 answer "참석").
  if (nextAnswer === "참석" && before.refund === "wait") {
    const mgr = await managersOf(ev.id);
    await addAlerts(mgr, { eventId: ev.id, text: `${name} 님이 ${ev.name}에 다시 참석해서 환불 요청이 취소됐어요.`, href: `/admin/events/${ev.id}?tab=fee` });
    await pushTo(mgr, "alerts").catch(() => undefined);
    return {
      paid: "true", paidAt: before.paidAt || (before.refundSince ? before.refundSince.slice(0, 10) : now.slice(0, 10)),
      refund: "", refundAmount: "", refundSince: "", refundRemindAt: "", refundDoneAt: "",
      req: "", reqDays: "", reqAt: "", reqResult: "", reqReason: "",
    };
  }
  return {};
}

// 관리자가 "송금완료"를 눌렀다: 상태를 바꾸고 회원에게 바로 알린다
export async function completeRefund(eventId: string, memberId: string): Promise<string | null> {
  const s = await getStore();
  const [ev, applies, members] = await Promise.all([s.get("Events", eventId), s.list("EventApplies"), s.list("Members")]);
  const a = applies.find((x) => x.eventId === eventId && x.memberId === memberId);
  if (!ev || !a) return "신청 기록을 찾을 수 없어요.";
  if (a.refund !== "wait") return "송금대기인 회원이 아니에요.";
  // 돈을 돌려줬으니 입금 기록(paidAt·paidAmount)도 지운다: 다시 참석하면 새로 신청한 것처럼(미입금)
  await s.update("EventApplies", a.id, { refund: "done", refundDoneAt: new Date().toISOString(), paidAt: "", paidAmount: "" });
  const m = members.find((x) => x.id === memberId);
  if (m) {
    await addAlerts([m.id], { eventId, text: `${ev.name} 회비 ${won(a.refundAmount ?? 0)}을 송금해 드렸어요. 확인해 주세요.`, href: `/events/${eventId}` });
    await pushTo([m.id], "alerts").catch(() => undefined);
  }
  return null;
}

// 차액 환불 "송금완료": 입금 확인 뒤 회비가 줄어(참석 날짜·회비 조건 변경) 돌려준 차액. paidAmount 를 지금 회비로 맞추고 회원에게 알린다.
export async function completeDiffRefund(eventId: string, memberId: string): Promise<string | null> {
  const s = await getStore();
  const [ev, applies, members] = await Promise.all([s.get("Events", eventId), s.list("EventApplies", { where: { field: "eventId", in: [eventId] } }), s.list("Members")]);
  const a = applies.find((x) => x.memberId === memberId);
  const m = members.find((x) => x.id === memberId);
  if (!ev || !a) return "신청 기록을 찾을 수 없어요.";
  const mf = memberFee(ev, { kind: m?.kind ?? "", position: m?.position ?? "" }, a);
  const diff = feeDiff(a, mf);
  if (diff >= 0) return "돌려줄 차액이 없어요. 화면을 새로 고쳐 주세요.";
  await s.update("EventApplies", a.id, { paidAmount: mf.amount || "0" });
  if (m) {
    await addAlerts([m.id], { eventId, text: `${ev.name} 회비 차액 ${won(-diff)}을 송금해 드렸어요. 확인해 주세요.`, href: `/events/${eventId}` });
    await pushTo([m.id], "alerts").catch(() => undefined);
  }
  return null;
}

// 송금대기가 일주일 넘게 남아 있으면 관리자에게 다시 알린다(참석 해제 시점부터 일주일마다)
export async function remindRefunds(): Promise<void> {
  const s = await getStore();
  const waits = (await s.list("EventApplies")).filter((a) => a.refund === "wait");
  if (waits.length === 0) return;
  const [events, members] = await Promise.all([s.list("Events"), s.list("Members")]);
  const now = Date.now();
  for (const a of waits) {
    const last = Date.parse(a.refundRemindAt || a.refundSince || "");
    if (Number.isNaN(last) || now - last < WEEK) continue;
    const ev = events.find((e) => e.id === a.eventId);
    if (!ev) continue;
    const name = members.find((m) => m.id === a.memberId)?.name ?? "회원";
    const since = Date.parse(a.refundSince || "");
    const weeks = Number.isNaN(since) ? 1 : Math.max(1, Math.floor((now - since) / WEEK));
    const mgr = await managersOf(ev.id);
    await addAlerts(mgr, { eventId: ev.id, text: `${ev.name}: ${name} 님에게 회비 ${won(a.refundAmount ?? 0)}을 아직 돌려주지 않았어요(참석 해제 ${weeks}주 지남). 송금했으면 회비 탭에서 “송금완료”를 눌러 주세요.`, href: `/admin/events/${ev.id}?tab=fee` });
    await pushTo(mgr, "alerts").catch(() => undefined);
    // 다음 알림은 참석 해제 시점 기준 다음 주
    const next = Number.isNaN(since) ? now : since + (weeks) * WEEK;
    await s.update("EventApplies", a.id, { refundRemindAt: new Date(next).toISOString() });
  }
}
