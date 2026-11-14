import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { memberFee, payable } from "@/lib/fee";
import { eventJoinable, eventVisible } from "@/lib/audience";
import { getStore } from "@/lib/store";

const body = z.object({ sent: z.boolean() });

// 회원이 "입금했어요"를 누르면 관리자 회비 탭에 '입금 알림 받음'으로 먼저 표시된다.
// 실제 입금 확인(알림 사라짐)은 여전히 관리자가 한다.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");

  const s = await getStore();
  const [events, applies, members] = await Promise.all([s.list("Events"), s.list("EventApplies"), s.list("Members")]);
  const me = members.find((m) => m.id === g.s.mid);
  const e = events.find((x) => x.id === id && eventVisible(x, me ?? g.s.mid));
  if (!e) return bad("일정을 찾을 수 없어요.", 404);
  if (!eventJoinable(e, me ?? g.s.mid)) return bad("이 소모임 회원만 회비를 알릴 수 있어요.", 403);
  const a = applies.find((x) => x.eventId === id && x.memberId === g.s.mid);
  const mf = memberFee(e, { kind: me?.kind, position: me?.position }, a);
  if (!a || a.answer !== "참석" || !mf.known || !payable(mf.amount)) return bad("참석을 신청한 일정의 회비만 알릴 수 있어요.");
  if (a.paid === "true") return bad("이미 입금이 확인됐어요.");

  await s.update("EventApplies", a.id, { payNotice: parsed.data.sent ? new Date().toISOString() : "" });
  return NextResponse.json({ ok: true });
}
