import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, hostGuard } from "@/lib/api";
import { hostGate } from "@/lib/host-gate";
import { doAction, loadStage } from "@/lib/rounds";

const body = z.object({
  action: z.enum(["open", "results", "ready", "name", "vote", "close", "answer", "back"]),
  targetMemberId: z.string().optional(), // open 일 때 순서를 지정하면 그 사람, 없으면 무작위
});

// 진행자 버튼(소개 열기, 추측 결과, 저예요 열기, 이름 공개, 투표, 마감, 정답 공개, 한 단계 되돌리기)
export async function POST(req: Request, ctx: { params: Promise<{ id: string; aid: string }> }) {
  const g = await hostGuard((await ctx.params).aid);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const st = await loadStage(id, aid);
  if (typeof st === "string") return bad(st, 404);
  // 진행자가 꼭 있어야 하는 활동인데 진행자가 없으면: 관리자는 알려만 주고, 그 밖에는 막는다(소개 열기에서).
  const hg: ReturnType<typeof hostGate> = parsed.data.action === "open" ? hostGate(st.cfg, st.act, g.s) : {};
  if (hg.block) return bad(hg.block, 409);
  const r = await doAction(st, parsed.data.action, parsed.data.targetMemberId);
  if (!r.ok) return bad(r.error, r.status ?? 400);
  return NextResponse.json({ ok: true, ...(hg.warn ? { warning: hg.warn } : {}) });
}
