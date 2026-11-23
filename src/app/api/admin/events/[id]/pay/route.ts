import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { getStore } from "@/lib/store";
import { addAlerts } from "@/lib/member-alerts";
import { pushTo } from "@/lib/push";
import { eventTitle } from "@/lib/event-title";
import { feeDiff, memberFee } from "@/lib/fee";

// paid: 입금 확인(true)·확인 취소(false). reject: 입금 알림을 "입금 안 됨"으로 돌려보내기. reason: 회원에게 보일 사유
const body = z.object({ memberId: z.string().min(1), paid: z.boolean().optional(), reject: z.boolean().optional(), reason: z.string().trim().max(200).optional() });

// 입금 확인. 확인하면 그 회원 화면의 회비 알림이 사라진다(회원 화면은 이 값으로 알림을 계산한다).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardEv(ctx, "events");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const { memberId, paid, reject, reason } = parsed.data;

  const s = await getStore();
  const a = (await s.list("EventApplies")).find((x) => x.eventId === id && x.memberId === memberId);
  if (!a || a.answer !== "참석") return bad("참석을 신청한 회원만 입금을 확인할 수 있어요.");
  const ev = await s.get("Events", id);
  const title = ev ? eventTitle(ev.name, ev.club) : "일정";
  const why = reason ? ` 사유: ${reason}` : "";
  const now = new Date().toISOString();
  let text = "";
  // 지금 회비와 입금 확인 때 금액의 차액(+ 추가 입금 필요, lib/fee.ts feeDiff)
  const m = await s.get("Members", memberId);
  const mf = ev ? memberFee(ev, { kind: m?.kind, position: m?.position }, a) : { known: false, amount: "" };
  const extra = feeDiff(a, mf);
  if (reject) {
    // 입금 알림 돌려보내기(입금 확인 전, 또는 추가 입금 알림)
    if (!a.payNotice) return bad("입금 알림을 보낸 회원만 돌려보낼 수 있어요.");
    await s.update("EventApplies", a.id, { payNotice: "", payUndoAt: now, payUndoReason: reason ?? "" });
    text = `${title} 회비 ${extra > 0 ? "추가 입금이" : "입금이"} 확인되지 않았어요.${why} 입금했다면 다시 “입금했어요”를 눌러 주세요.`;
  } else if (paid !== undefined) {
    const was = a.paid === "true";
    await s.update("EventApplies", a.id, {
      paid: String(paid),
      // 이미 입금 확인된 회원의 추가 입금 확인이면 처음 확인일은 그대로
      paidAt: paid ? (was && a.paidAt ? a.paidAt : now.slice(0, 10)) : "",
      // 입금 확인 때의 회비(차액 계산용). 날짜를 골라야 정해지면 비워 둔다(차액을 따지지 않음). 취소하면 지운다
      paidAmount: paid ? (mf.known ? mf.amount || "0" : was ? a.paidAmount ?? "" : "") : "",
      // 확인하든 취소하든 회원의 입금 알림은 끝난다(취소하면 회원이 다시 알릴 수 있다)
      payNotice: "",
      ...(paid ? { payUndoAt: "", payUndoReason: "" } : was ? { payUndoAt: now, payUndoReason: reason ?? "" } : {}),
    });
    if (paid && !was) text = `${title} 회비 입금이 확인됐어요.`;
    if (paid && was && extra > 0) text = `${title} 회비 추가 입금 ${extra.toLocaleString("ko-KR")}원이 확인됐어요.`;
    if (!paid && was) text = `${title} 회비 입금 확인이 취소됐어요.${why} 입금했다면 다시 “입금했어요”를 눌러 주세요.`;
  } else return bad("입력값을 확인해 주세요.");
  if (text) {
    await addAlerts([memberId], { eventId: id, text, href: `/events/${id}/fee` });
    await pushTo([memberId], "alerts").catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
