import { NextResponse } from "next/server";
import { onsiteKeyOf } from "@/lib/template-schema";
import { z } from "zod";
import { liveView } from "@/lib/activities";
import { bad, guard } from "@/lib/api";
import { NOT_ATTENDEE, canJoin, canAct, NOT_ACTION } from "@/lib/participants";
import { activeRound, currentRound, flowAutoAnswer, isFlow, liveRow, rounds } from "@/lib/rounds";
import { getStore } from "@/lib/store";
import { memberScope } from "@/lib/team-run";
import { loadWho } from "@/lib/who";

const body = z.object({ chosenIndex: z.number().int().min(0).max(2) });

// 거짓 투표: 1인 1회, 본인 차례는 불가, 마감 후 변경 불가.
// 진행자가 투표를 열어서 회원 화면이 '투표'로 켜져 있을 때만 받는다(템플릿 설정을 따른다).
export async function POST(req: Request, ctx: { params: Promise<{ aid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("1번에서 3번 중에서 골라 주세요.");

  if (!(await canJoin(w.cfg, w.act, w.ev, g.s.mid))) return bad(NOT_ATTENDEE, 403);
  if (!(await canAct(w.cfg, w.act, w.ev, g.s.mid, onsiteKeyOf(w.cfg, "vote")))) return bad(NOT_ACTION, 403);
  // 조별 진행이면 내가 속한 조의 차례·회원 화면을 따른다
  const sc = await memberScope(w.act, g.s.mid);
  const team = sc.teamId;
  const flow = isFlow(w.cfg);
  const cur = flow ? activeRound(await rounds(aid, team)) : await currentRound(aid, team);
  if (!cur) return bad("지금 진행 중인 소개가 없어요.", 409);
  if (cur.targetMemberId === g.s.mid) return bad("내 차례에는 투표할 수 없어요.", 403);
  const view = liveView(w.cfg, await liveRow(aid, team));
  if (cur.state !== "voting" || !view.unlocked || view.memberScreen !== "vote") return bad("지금은 투표할 수 없어요. 진행자가 투표를 열면 할 수 있어요.", 409);

  const s = await getStore();
  const dup = (await s.list("Votes")).find((v) => v.roundId === cur.id && v.voterId === g.s.mid);
  if (dup) return bad("이미 투표했어요. 한 번만 할 수 있어요.", 409);
  await s.insert("Votes", { roundId: cur.id, voterId: g.s.mid, chosenIndex: String(parsed.data.chosenIndex), createdAt: new Date().toISOString() });
  // 현장 맞히기 흐름: 당사자 빼고 모두 투표했으면 결과 발표
  if (flow) await flowAutoAnswer({ act: w.act, ev: w.ev, cfg: w.cfg }, cur, team, sc.inScope);
  return NextResponse.json({ ok: true });
}
