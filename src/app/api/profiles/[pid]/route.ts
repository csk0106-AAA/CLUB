import { NextResponse } from "next/server";
import { eventStart } from "@/lib/activities";
import { bad, guard, parseJson } from "@/lib/api";
import { consentRequired, hasConsent } from "@/lib/consent";
import { getSetting, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 프로필 한 장: 공개로 승인된 소개 글만 내려준다.
// 2진실 1거짓은 활동 중에는 절대 내려주지 않고, 활동이 끝난 뒤(그 회원 차례의 정답 공개 또는 행사 종료)에만 정답과 함께 보여 준다.
export async function GET(_req: Request, ctx: { params: Promise<{ pid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  if (!(await hasConsent(g.s.mid))) return consentRequired();
  const { pid } = await ctx.params;
  const s = await getStore();
  const p = (await s.list("Profiles")).find((x) => x.id === pid && x.introStatus === "approved");
  if (!p) return bad("프로필을 찾을 수 없어요.", 404);
  const revealAt = await getSetting<string>("profileRevealAt", "");
  const revealed = revealAt !== "" && Date.now() >= Date.parse(`${revealAt}:00+09:00`);
  const name = revealed ? (await s.list("Members")).find((m) => m.id === p.memberId)?.name ?? "" : "";

  const [tls, rounds, acts, events] = await Promise.all([
    s.list("TruthLies"), s.list("Rounds"), s.list("EventActivities"), s.list("Events"),
  ]);
  const finished = (aid: string): boolean => {
    if (rounds.some((r) => r.eventActivityId === aid && r.targetMemberId === p.memberId && r.state === "answer")) return true;
    const ev = events.find((e) => e.id === acts.find((a) => a.id === aid)?.eventId);
    const end = ev ? eventStart(ev.endsAt || ev.startsAt) : null;
    return end != null && Date.now() > end;
  };
  const tl = tls
    .filter((t) => t.memberId === p.memberId && t.status === "approved" && finished(t.eventActivityId))
    .sort((a, b) => (b.approvedAt ?? "").localeCompare(a.approvedAt ?? ""))[0];
  const truthLies = tl ? { statements: parseJson<string[]>(tl.statements, []), lieIndex: Number(tl.lieIndex) } : null;

  const mine = p.memberId === g.s.mid;
  return NextResponse.json({
    alias: p.alias, name, introMd: p.introMd, mine, truthLies,
    // 명리학: 성격·성향은 본인이 소개 페이지에 싣기로 한 경우만, 생애주기 전체 풀이는 본인에게만
    traitsMd: p.traitsShown === "true" ? p.traitsMd ?? "" : "",
    readingMd: mine ? p.readingMd ?? "" : "",
  });
}
