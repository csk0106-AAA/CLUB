import { NextResponse } from "next/server";
import { eventStart } from "@/lib/activities";
import { bad, guard, parseJson } from "@/lib/api";
import { avatarView } from "@/lib/avatar";
import { consentRequired, hasConsent } from "@/lib/consent";
import { memberClubs } from "@/lib/lists";
import { isGuest } from "@/lib/member-kind";
import { maskedMembers } from "@/lib/profile-book";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 프로필 한 장. pid: 프로필 번호(별칭 회원) 또는 "m-회원번호"(실명 회원).
//  - 공개로 승인된 소개 글만 내려준다(없으면 introMd 빈 값 — 화면이 "소개 작성하기"/"아직 소개가 없어요"를 보여 준다).
//  - 실명 공개 전인 '내가 누굴까요?' 참여 회원은 별칭만(이름·회사·사진 없음). 회원 번호로는 열 수 없다(누구인지 드러나므로).
//  - 2진실 1거짓은 활동 중에는 절대 내려주지 않고, 활동이 끝난 뒤(그 회원 차례의 정답 공개 또는 일정 종료)에만 정답과 함께 보여 준다.
export async function GET(_req: Request, ctx: { params: Promise<{ pid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  if (!(await hasConsent(g.s.mid))) return consentRequired();
  const { pid } = await ctx.params;
  const s = await getStore();
  const [members, profiles, masked] = await Promise.all([s.list("Members"), s.list("Profiles"), maskedMembers()]);

  const byMember = pid.startsWith("m-") ? pid.slice(2) : "";
  const p = byMember ? profiles.find((x) => x.memberId === byMember) : profiles.find((x) => x.id === pid);
  const memberId = byMember || p?.memberId || "";
  const who = members.find((m) => m.id === memberId && !isGuest(m.kind));
  if (!who) return bad("프로필을 찾을 수 없어요.", 404);
  const hidden = masked.get(who.id);
  // 별칭 회원을 회원 번호로 열면 안 된다(주소로 주인이 드러남)
  if (hidden && byMember && who.id !== g.s.mid) return bad("프로필을 찾을 수 없어요.", 404);

  const mine = who.id === g.s.mid;
  const approved = p?.introStatus === "approved";
  const card = hidden
    ? { name: "", company: "", title: "", clubs: [] as string[], avatar: null }
    : { name: who.name, company: who.company ?? "", title: who.title ?? "", clubs: memberClubs(who).map((c) => c.name), avatar: avatarView(who) };

  const [tls, rounds, acts, events] = await Promise.all([
    s.list("TruthLies"), s.list("Rounds"), s.list("EventActivities"), s.list("Events"),
  ]);
  const finished = (aid: string): boolean => {
    if (rounds.some((r) => r.eventActivityId === aid && r.targetMemberId === who.id && r.state === "answer")) return true;
    const ev = events.find((e) => e.id === acts.find((a) => a.id === aid)?.eventId);
    const end = ev ? eventStart(ev.endsAt || ev.startsAt) : null;
    return end != null && Date.now() > end;
  };
  const tl = approved && !hidden
    ? tls
      .filter((t) => t.memberId === who.id && t.status === "approved" && finished(t.eventActivityId))
      .sort((a, b) => (b.approvedAt ?? "").localeCompare(a.approvedAt ?? ""))[0]
    : undefined;
  const truthLies = tl ? { statements: parseJson<string[]>(tl.statements, []), lieIndex: Number(tl.lieIndex) } : null;

  return NextResponse.json({
    alias: p?.alias ?? "", masked: !!hidden, ...card,
    introMd: approved ? p?.introMd ?? "" : "",
    mine, truthLies,
    // 내 화면: 참여 중인 '내가 누굴까요?' 활동(그 활동에서 소개를 쓴다)
    myActivity: mine && hidden ? { aid: hidden.aid, eventId: hidden.eventId } : null,
    // 명리학: 성격·성향은 본인이 소개 페이지에 싣기로 한 경우만, 생애주기 전체 풀이는 본인에게만
    traitsMd: approved && p?.traitsShown === "true" ? p.traitsMd ?? "" : "",
    readingMd: mine ? p?.readingMd ?? "" : "",
    sajuInfo: mine ? parseJson<unknown>(p?.sajuInfo, null) : null, // 입력 정보·사주 원국도 본인에게만
  });
}
