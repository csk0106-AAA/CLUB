import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { getStore } from "@/lib/store";
import { refundOnAnswer } from "@/lib/refund";
import { clearReq } from "@/lib/attend-approval";

const body = z.object({
  memberId: z.string().min(1),
  answer: z.enum(["참석", "불참", ""]),
  memo: z.string().max(200).optional(), // 보내지 않으면 기존 메모 그대로
  // 참석 날짜(YYYY-MM-DD). 보내지 않으면 기존 날짜를 그대로 둔다.
  days: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(7).optional(),
});

// 일정 기간의 날짜 목록(최대 7일)
function eventDays(startsAt: string, endsAt: string): string[] {
  const from = startsAt.slice(0, 10);
  const to = (endsAt || startsAt).slice(0, 10);
  if (!from) return [];
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`) && out.length < 7; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

// 관리자가 회원의 참석 신청(참석 여부·참석 날짜·메모)을 대신 고친다(전화로 들은 답 등).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardEv(ctx, "events");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 메모는 200자까지예요.");
  const { memberId, answer, memo, days } = parsed.data;

  const s = await getStore();
  const [events, members, applies] = await Promise.all([s.list("Events"), s.list("Members"), s.list("EventApplies")]);
  const ev = events.find((e) => e.id === id);
  if (!ev) return bad("일정을 찾을 수 없어요.", 404);
  if (!members.some((m) => m.id === memberId)) return bad("회원을 찾을 수 없어요.", 404);

  // 참석 날짜는 일정 기간 안의 날짜만 받는다.
  let dayValue: string | undefined;
  if (answer === "참석" && days) {
    const allowed = new Set(eventDays(ev.startsAt, ev.endsAt));
    if (days.some((d) => !allowed.has(d))) return bad("일정 기간 안의 날짜만 고를 수 있어요.");
    dayValue = [...new Set(days)].sort().join(",");
  }

  const a = applies.find((x) => x.eventId === id && x.memberId === memberId);
  // 참석 여부를 관리자가 바꾸면 "관리자 체크" 표시(누가·언제)를 남긴다. 미응답으로 되돌리면 지운다.
  const changed = (a?.answer ?? "") !== answer;
  // 참석으로 바꾸는데 날짜를 안 보냈고 기존 날짜도 없으면: 일정의 모든 날(하루 일정은 그날)
  //  승인 대기 중이던 회원이면 회원이 고른 날짜(reqDays)를 쓴다
  if (answer === "참석" && dayValue === undefined && !(a?.days)) dayValue = a?.reqDays || eventDays(ev.startsAt, ev.endsAt).join(",");
  // 입금 확인된 회원이 참석에서 빠지면 송금대기(알림), 송금대기 중 다시 참석하면 입금 확인으로(lib/refund.ts)
  const refund = changed ? await refundOnAnswer(ev, a, answer, members.find((m) => m.id === memberId)) : {};
  const mark = !changed ? {} : answer ? { checkedBy: g.s.mid, checkedAt: new Date().toISOString() } : { checkedBy: "", checkedAt: "" };
  if (a) {
    // 참석이 아니게 되면 날짜와 입금 확인은 의미가 없으므로 비운다.
    const keep = answer === "참석";
    await s.update("EventApplies", a.id, {
      answer,
      ...(memo === undefined ? {} : { memo }),
      ...mark,
      ...(keep ? (dayValue === undefined ? {} : { days: dayValue }) : { days: "", paid: "false", paidAt: "" }),
      ...refund,
      // 관리자가 참석 여부를 정하면 승인 대기는 끝난다
      ...(changed || answer === "참석" ? clearReq : {}),
    });
  } else if (answer || memo) {
    await s.insert("EventApplies", { eventId: id, memberId, answer, memo: memo ?? "", days: dayValue ?? "", paid: "false", paidAt: "", ...mark });
  }
  return NextResponse.json({ ok: true });
}
