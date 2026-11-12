import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";

const body = z.object({
  memberId: z.string().min(1),
  answer: z.enum(["참석", "불참", ""]),
  memo: z.string().max(200).default(""),
});

// 관리자가 회원의 참석 신청을 대신 고치거나 메모를 남긴다(전화로 들은 답 등).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("events");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 메모는 200자까지예요.");
  const { memberId, answer, memo } = parsed.data;

  const s = await getStore();
  const [events, members, applies] = await Promise.all([s.list("Events"), s.list("Members"), s.list("EventApplies")]);
  if (!events.some((e) => e.id === id)) return bad("행사를 찾을 수 없어요.", 404);
  if (!members.some((m) => m.id === memberId)) return bad("회원을 찾을 수 없어요.", 404);

  const a = applies.find((x) => x.eventId === id && x.memberId === memberId);
  if (a) {
    // 참석이 아니게 되면 날짜와 입금 확인은 의미가 없으므로 비운다.
    const keep = answer === "참석";
    await s.update("EventApplies", a.id, {
      answer,
      memo,
      ...(keep ? {} : { days: "", paid: "false", paidAt: "" }),
    });
  } else if (answer || memo) {
    await s.insert("EventApplies", { eventId: id, memberId, answer, memo, days: "", paid: "false", paidAt: "" });
  }
  return NextResponse.json({ ok: true });
}
