import { NextResponse } from "next/server";
import { bad, guardEv } from "@/lib/api";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; aid: string }> };

// 리허설 초기화: 현장 진행 기록만 지워 본 행사 때 처음부터 다시 할 수 있게 한다(관리자·일정 작성자·편집자).
//  지우는 것: 진행 순서(차례 기록 Rounds)와 거짓 투표(Votes), 회원 화면 상태·동점자 룰렛 결과(LiveState),
//            고민 뽑기의 "뽑은 상태"(고민 글은 남기고 뽑힘·순서·이름 공개만 되돌린다)
//  남기는 것: 소개 글·2진실 1거짓·사전 추측·인터뷰·고민 글·타임캡슐·출석·팀
export async function POST(_req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid && a.eventId === id);
  if (!act) return bad("활동을 찾을 수 없어요.", 404);

  const rounds = (await s.list("Rounds")).filter((r) => r.eventActivityId === aid);
  const roundIds = new Set(rounds.map((r) => r.id));
  const votes = (await s.list("Votes")).filter((v) => roundIds.has(v.roundId));
  for (const v of votes) await s.remove("Votes", v.id);
  for (const r of rounds) await s.remove("Rounds", r.id);
  for (const l of (await s.list("LiveState")).filter((x) => x.eventActivityId === aid)) await s.remove("LiveState", l.id);
  let worries = 0;
  for (const w of (await s.list("Worries")).filter((x) => x.eventActivityId === aid && x.drawnAt)) {
    await s.update("Worries", w.id, { drawnAt: "", orderNo: "", nameRevealed: "false", authorShown: "false" });
    worries++;
  }
  return NextResponse.json({ ok: true, rounds: rounds.length, votes: votes.length, worries });
}
