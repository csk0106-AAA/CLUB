import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, hostGuard } from "@/lib/api";
import { hostGate } from "@/lib/host-gate";
import { doAction, doFlow, isFlow, loadStage, type Action, type FlowAction } from "@/lib/rounds";
import { scopeOf } from "@/lib/team-run";

const body = z.object({
  // 현장 맞히기 흐름이면 open·gclose(맞히기 마감)·reveal(저예요 열기)·name·vote·answer·awards(시상)·back
  action: z.enum(["open", "results", "ready", "name", "vote", "close", "answer", "back", "gclose", "reveal", "awards"]),
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
  // 조별 진행이면 ?team=조 id 의 차례만 다룬다(조 진행자는 맡은 조로 고정)
  const sc = await scopeOf(req, st.act, g);
  if (sc instanceof NextResponse) return sc;
  // 진행자가 꼭 있어야 하는 활동인데 진행자가 없으면: 관리자는 알려만 주고, 그 밖에는 막는다(소개 열기에서).
  const hg: ReturnType<typeof hostGate> = parsed.data.action === "open" ? hostGate(st.cfg, st.act, g.s) : {};
  if (hg.block) return bad(hg.block, 409);
  const a = parsed.data.action;
  const flow = isFlow(st.cfg);
  const FLOW: string[] = ["open", "gclose", "reveal", "name", "vote", "answer", "awards", "back"];
  if (flow ? !FLOW.includes(a) : ["gclose", "reveal", "awards"].includes(a)) return bad("이 활동에서는 쓸 수 없는 버튼이에요.");
  const r = flow
    ? await doFlow(st, a as FlowAction, parsed.data.targetMemberId, sc)
    : await doAction(st, a as Action, parsed.data.targetMemberId, sc);
  if (!r.ok) return bad(r.error, r.status ?? 400);
  return NextResponse.json({ ok: true, ...(hg.warn ? { warning: hg.warn } : {}) });
}
