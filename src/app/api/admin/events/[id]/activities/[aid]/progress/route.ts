import { NextResponse } from "next/server";
import { bad, guardEv } from "@/lib/api";
import { readConfig } from "@/lib/activities";
import { actionSet, joinSet } from "@/lib/participants";
import { getStore } from "@/lib/store";
import { isGuest } from "@/lib/member-kind";

export const dynamic = "force-dynamic";

// 작성 현황(인원 수만). 승인 전 초안과 인터뷰 내용은 관리자에게도 보이지 않는다.
//  분모(전체)는 이 활동에서 소개를 쓰는 회원(활동참여자 중 게임 참여 — 선택참여로 소개를 쓰지 않는 회원은 빠짐),
//  맞히기 참여는 맞히기를 할 수 있는 회원(선택참여면 선별 조건에 맞히기가 있는 회원) 중 실제로 고른 사람 수.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; aid: string }> }) {
  const g = await guardEv(ctx, ["templates", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid && a.eventId === id);
  if (!act) return bad("활동을 찾을 수 없어요.", 404);
  const cfg = readConfig(act.config);
  const ev = (await s.list("Events")).find((e) => e.id === id);

  const [members, profiles, interviews, guesses] = await Promise.all([
    s.list("Members"), s.list("Profiles"), s.list("Interviews"), s.list("Guesses"),
  ]);
  const writers = cfg ? await joinSet(cfg, act, ev) : null;
  const ids = members.filter((m) => (writers ? writers.has(m.id) : !isGuest(m.kind))).map((m) => m.id);
  const approved = ids.filter((m) => profiles.find((p) => p.memberId === m)?.introStatus === "approved");
  const writing = ids.filter(
    (m) => !approved.includes(m) && (interviews.some((i) => i.memberId === m && i.eventActivityId === aid) || profiles.some((p) => p.memberId === m && p.alias)),
  );
  const canGuess = cfg ? await actionSet(cfg, act, ev, "guess") : null;
  const guessers = new Set(guesses.filter((x) => x.eventActivityId === aid && (!canGuess || canGuess.has(x.guesserId))).map((x) => x.guesserId));
  return NextResponse.json({
    total: ids.length,
    approved: approved.length,
    writing: writing.length,
    notStarted: ids.length - approved.length - writing.length,
    guessers: guessers.size,
  });
}
