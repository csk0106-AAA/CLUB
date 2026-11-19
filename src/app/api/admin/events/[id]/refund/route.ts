import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { completeRefund } from "@/lib/refund";

const body = z.object({ memberId: z.string().min(1) });

// 회비 송금(환불) 완료: 송금대기 → 송금완료, 회원에게 바로 알림(lib/refund.ts)
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardEv(ctx, "events");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const err = await completeRefund(id, parsed.data.memberId);
  if (err) return bad(err);
  return NextResponse.json({ ok: true });
}
