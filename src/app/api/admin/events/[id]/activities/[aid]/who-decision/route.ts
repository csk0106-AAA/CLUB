import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { loadWho, whoState } from "@/lib/who";
import { askWho, decideWho } from "@/lib/who-join";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; aid: string }> };

// 관리자가 참여자 선택 화면에서: 이미 실명 소개가 공개된 회원을 "프로필북 초기화" / "일부활동참여"로 정하거나, 회원에게 묻는다(알림).
//  관리자가 초기화하면 지운 소개는 백업되고 회원에게 알림이 간다.
const body = z.object({ memberId: z.string().min(1).max(64), decision: z.enum(["update", "partial", "ask"]) });

export async function POST(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("요청을 확인해 주세요.");
  const st = await whoState(w, p.data.memberId);
  if (st === "none") return bad("이 활동의 참여 대상이 아니에요. 먼저 참여자로 선택하고 저장해 주세요.", 409);
  if (st === "in") return bad("이미 이 활동에서 소개를 쓰고 있는 회원이에요.", 409);
  if (p.data.decision === "ask") {
    await askWho(w, p.data.memberId);
    return NextResponse.json({ ok: true, asked: true });
  }
  const r = await decideWho(w, p.data.memberId, p.data.decision, { name: g.s.name });
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json({ ok: true, state: r.state });
}
