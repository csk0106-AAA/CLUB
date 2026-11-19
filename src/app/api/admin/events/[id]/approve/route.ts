import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { decide } from "@/lib/attend-approval";

const body = z.object({ memberId: z.string().min(1), decision: z.enum(["approve", "decline"]), reason: z.string().trim().max(300).default("") });

// 관리자 승인 후 참석(일정 설정): 승인 대기 회원을 승인·반려한다. 회원에게 바로 알림(lib/attend-approval.ts)
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardEv(ctx, "events");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("승인 또는 반려를 골라 주세요. 반려 사유는 300자까지예요.");
  const err = await decide(id, p.data.memberId, p.data.decision === "approve", p.data.reason);
  if (err) return bad(err);
  return NextResponse.json({ ok: true });
}
