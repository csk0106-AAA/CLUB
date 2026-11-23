import { clubLabel } from "@/lib/club-label";
import { isClubPaused } from "@/lib/club-status";
import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { eventJoinable, eventVisible } from "@/lib/audience";
import { isGuest } from "@/lib/member-kind";
import { getStore } from "@/lib/store";
import { refundOnAnswer } from "@/lib/refund";
import { clearReq, needsApproval, notifyRequest } from "@/lib/attend-approval";
import { feeDiff, memberFee } from "@/lib/fee";
import { managersOf } from "@/lib/event-managers";
import { addAlerts } from "@/lib/member-alerts";
import { pushTo } from "@/lib/push";

const body = z.object({
  answer: z.enum(["참석", "불참"]),
  // 참석 날짜(YYYY-MM-DD). 일정 기간 안의 날짜만 받는다.
  days: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(7).optional(),
});

// 참석 신청 / 참석 안함 / 여러 날 일정의 참석 날짜 선택. 나중에 바꿀 수 있다.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const { answer, days } = parsed.data;

  const s = await getStore();
  const me = (await s.list("Members")).find((m) => m.id === g.s.mid);
  const ev = (await s.list("Events")).find((x) => x.id === id && eventVisible(x, me ?? g.s.mid));
  if (!ev) return bad("일정을 찾을 수 없어요.", 404);
  if (ev.club && (await isClubPaused(ev.club))) return bad(`${ev.club} 클럽은 활동을 멈춰서 참석 신청을 받지 않아요.`, 409);
  // 다른 클럽 일정은 읽기만 된다: 클럽 회원·참관자만 신청할 수 있다.
  // 대기회원·참관회원은 참관 신청이 승인된 일정만 참석 신청할 수 있다.
  if (!eventJoinable(ev, me ?? g.s.mid) && isGuest(me?.kind)) return bad("참관 신청이 승인된 일정만 참석 신청할 수 있어요. 먼저 참관을 신청해 주세요.", 403);
  if (!eventJoinable(ev, me ?? g.s.mid)) return bad(`${clubLabel(ev.club)} 회원만 참석 신청할 수 있어요. 클럽 가입이나 참관을 먼저 신청해 주세요.`, 403);

  if (days && days.length > 0) {
    const from = (ev.startsAt || "").slice(0, 10);
    const to = (ev.endsAt || ev.startsAt || "").slice(0, 10);
    if (!from || days.some((d) => d < from || d > to)) return bad("일정 기간 안의 날짜를 골라 주세요.");
  }

  // 한 회원은 한 일정에 한 줄만: 예전에 겹쳐 생긴 줄이 있으면 한 줄만 남긴다(입금 확인된 줄이 있으면 그 줄, 없으면 먼저 만든 줄)
  const mine = (await s.list("EventApplies", { where: { field: "eventId", in: [id] } }))
    .filter((r) => r.memberId === g.s.mid)
    .sort((p, q) => Number(q.paid === "true") - Number(p.paid === "true"));
  for (const extra of mine.slice(1)) await s.remove("EventApplies", extra.id);
  const cur = mine[0];
  // 새 줄 만들기: 버튼을 빠르게 두 번 눌러 같은 회원 줄이 둘 생겼으면 나중 줄을 지우고 먼저 줄에 이번 내용을 쓴다
  //  돌려주는 값: 이번에 만든 줄이 남았는지(겹친 요청 중 하나만 알림을 보내려고)
  const insertOnce = async (row: Record<string, string>): Promise<boolean> => {
    const made = await s.insert("EventApplies", row);
    const now = (await s.list("EventApplies", { where: { field: "eventId", in: [id] } })).filter((r) => r.memberId === g.s.mid);
    if (now.length < 2) return true;
    const keep = now[0];
    for (const extra of now.slice(1)) await s.remove("EventApplies", extra.id);
    if (keep.id === made.id) return true;
    await s.update("EventApplies", keep.id, row);
    return false;
  };

  // 관리자 승인 후 참석인 일정: 아직 참석이 아니면 승인 대기로(이미 참석이면 날짜 바꾸기는 그대로)
  //  송금대기(입금 확인 뒤 참석 취소, 아직 돌려주기 전)인 회원은 이미 승인됐던 회원이라 승인 없이 바로 참석 + 입금 확인으로 되돌린다(아래 refundOnAnswer).
  //  송금완료(돈을 돌려줌)된 회원은 새 신청과 같다(승인 대기, 미입금).
  if (answer === "참석" && needsApproval(ev) && cur?.answer !== "참석" && cur?.refund !== "wait") {
    const reqDays = days ? [...days].sort().join(",") : cur?.reqDays ?? "";
    const fresh = cur?.req !== "참석";
    const fields = { req: "참석", reqDays, reqAt: fresh ? new Date().toISOString() : cur?.reqAt ?? "", reqResult: "", reqReason: "" };
    if (cur) await s.update("EventApplies", cur.id, { ...fields, answer: "", checkedBy: "", checkedAt: "" });
    const kept = cur ? true : await insertOnce({ eventId: id, memberId: g.s.mid, answer: "", days: "", paid: "false", ...fields });
    if (fresh && kept) await notifyRequest(ev, me?.name ?? "회원");
    return NextResponse.json({ ok: true, pending: true });
  }

  // 불참이면 날짜를 비운다. 참석이면 넘어온 날짜(없으면 기존 날짜)를 저장한다.
  //  송금대기에서 다시 참석하는데 날짜가 없으면, 예전에 남은 승인 대기 날짜(reqDays)라도 쓴다
  const nextDays = answer === "불참" ? "" : days ? [...days].sort().join(",") : cur?.days || (cur?.refund === "wait" ? cur.reqDays ?? "" : "");

  if (cur) {
    // 회원이 직접 답하면 관리자 체크 표시는 지운다
    // 입금 확인된 뒤 불참으로 바꾸면 송금대기(관리자·회원 알림), 송금대기 중 다시 참석하면 환불 요청 취소 + 입금 확인으로(lib/refund.ts)
    const refund = cur.answer !== answer || (answer === "참석" && cur.refund === "wait") ? await refundOnAnswer(ev, cur, answer, me) : {};
    await s.update("EventApplies", cur.id, { answer, days: nextDays, checkedBy: "", checkedAt: "", ...refund, ...(answer === "불참" ? clearReq : {}) });
    // 입금 확인된 회원이 참석 날짜를 바꿔 회비가 달라지면(추가 입금·차액 환불) 일정 관리자에게 알린다
    if (answer === "참석" && cur.answer === "참석" && cur.paid === "true" && nextDays !== (cur.days ?? "")) {
      const who = { kind: me?.kind, position: me?.position };
      const before = feeDiff(cur, memberFee(ev, who, cur));
      const after = feeDiff(cur, memberFee(ev, who, { days: nextDays }));
      if (after !== 0 && after !== before) {
        const won = (n: number) => `${Math.abs(n).toLocaleString("ko-KR")}원`;
        const mgr = await managersOf(ev.id);
        await addAlerts(mgr, { eventId: ev.id, text: `${me?.name ?? "회원"} 님이 ${ev.name} 참석 날짜를 바꿔서 회비가 달라졌어요(${after > 0 ? `추가 입금 ${won(after)}` : `환불 ${won(after)}`}). 회비 탭에서 확인해 주세요.`, href: `/admin/events/${ev.id}?tab=fee` });
        await pushTo(mgr, "alerts").catch(() => undefined);
      }
    }
  } else {
    await insertOnce({ eventId: id, memberId: g.s.mid, answer, days: nextDays, paid: "false" });
  }
  return NextResponse.json({ ok: true });
}
