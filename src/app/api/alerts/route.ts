import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { handlersOf, isAttend, reqLabel } from "@/lib/club-requests";
import { getPermGroups } from "@/lib/perms";
import { getSetting, getStore } from "@/lib/store";
import type { Row } from "@/lib/store/types";
import { isDuesHandler, pendingDuesNotices, periodLabel } from "@/lib/dues-ledger";
import { joinerIssuesFor } from "@/lib/new-joiners";
import { commentAlertsOf, countsOf, isAppHandler, markCommentsSeen, markSeen, newPostsOf, payNoticesFor } from "@/lib/unread";

export const dynamic = "force-dynamic";

// 홈 화면 종 아이콘의 알림 창:
//  posts    : 마지막으로 본 뒤 새로 올라오거나 바뀐 글
//  toHandle : 내가 처리할 클럽 가입·참관 신청(직책자)
//  mine     : 내가 보낸 신청과 결과(최근 20개). unseen 이면 아직 안 본 결과
//  count    : 종 아이콘 숫자(새 글 + 처리할 신청 + 안 본 결과) — 하단 홈 탭 숫자와 같다
export async function GET() {
  const g = await guard();
  if ("err" in g) return g.err;
  const mid = g.s.mid;
  const s = await getStore();
  const groups = await getPermGroups();
  const [rows, members, events, posts, counts, comments] = await Promise.all([
    s.list("ClubRequests"), s.list("Members"), s.list("Events"), newPostsOf(mid), countsOf(mid), commentAlertsOf(mid),
  ]);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "(지운 회원)";
  const evName = (id: string) => (id ? events.find((e) => e.id === id)?.name ?? "" : "");
  const recent = (a: Row, b: Row) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "");

  const toHandle = rows
    // 종 알림은 숫자와 같게 그 클럽 처리자(직책자, 없으면 전체 관리자)에게만. 다른 관리자는 클럽관리 › 신청내역에서 본다.
    .filter((r) => r.status === "pending" && r.memberId !== mid && handlersOf(members, r.club, groups).includes(mid))
    .sort(recent)
    .map((r) => ({
      id: r.id, kind: r.kind, kindLabel: reqLabel(r), attend: isAttend(r), club: r.club, eventId: r.eventId, eventName: evName(r.eventId),
      memberName: name(r.memberId), message: r.message, createdAt: r.createdAt,
    }));
  const mine = rows
    .filter((r) => r.memberId === mid)
    .sort(recent)
    .slice(0, 20)
    .map((r) => ({
      id: r.id, kind: r.kind, kindLabel: reqLabel(r), attend: isAttend(r), club: r.club, eventId: r.eventId, eventName: evName(r.eventId),
      status: r.status, createdAt: r.createdAt, handledAt: r.handledAt, handledByName: r.handledBy ? name(r.handledBy) : "", reason: r.reason ?? "",
      unseen: r.status !== "pending" && r.resultSeen !== "true",
    }));
  // 승인 전 회원 신청 수(회원정보·모든 권한 관리자에게만)
  const memberApps = isAppHandler(members.find((m) => m.id === mid), groups)
    ? (await s.list("MemberApps")).filter((a) => a.status === "pending").length
    : 0;
  // 확인 전 입금 알림(회원이 "입금했어요"를 누름) — 이 사람이 확인할 수 있는 일정만
  const payNotices = payNoticesFor(members.find((m) => m.id === mid), events, await s.list("EventApplies"), groups)
    .sort((a, b) => (b.payNotice ?? "").localeCompare(a.payNotice ?? ""))
    .map((a) => {
      const ev = events.find((e) => e.id === a.eventId);
      return { id: a.id, eventId: a.eventId, eventName: ev?.name ?? "", club: ev?.club ?? "", memberName: name(a.memberId), at: a.payNotice };
    });
  // 모임 회비 입금 알림(확인 전) — 회비를 관리하는 관리자에게만
  const duesNotices = isDuesHandler(members.find((m) => m.id === mid), groups)
    ? pendingDuesNotices(await s.list("DuesPayments"))
      .sort((a, b) => (b.notice ?? "").localeCompare(a.notice ?? ""))
      .map((p) => ({ id: p.id, period: p.period, periodLabel: periodLabel(p.period), memberName: name(p.memberId), at: p.notice }))
    : [];
  // 신규 회원 확인이 필요한 글·일정
  const joinerIssues = await joinerIssuesFor(members.find((m) => m.id === mid), groups, await s.list("Posts"), events, members, await getSetting<Record<string, string>>("eventStamps", {}));
  return NextResponse.json({
    joinerIssues,
    memberApps,
    payNotices,
    duesNotices,
    // 종 아이콘 숫자에 센 글 전부(홈 목록의 "새 글"/"수정됨" 표시와 같은 글)
    posts: posts.map((p) => ({ id: p.id, title: p.title, at: p.updatedAt || p.createdAt, fresh: p.fresh })),
    toHandle,
    mine,
    // 내 글에 다른 회원이 새로 단 댓글(알림 창을 마지막으로 연 뒤. 숫자는 counts.alerts 에 들어 있다)
    comments: comments.slice(0, 30),
    count: counts.posts + counts.alerts,
  });
}

const body = z.object({ seen: z.literal(true) });

// 알림 창을 열어 본 뒤: 새 글, 내 글에 달린 댓글, 내 신청 결과를 "봤음"으로 표시한다(처리할 신청은 처리해야 숫자에서 빠진다).
export async function POST(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  if (!body.safeParse(await req.json().catch(() => null)).success) return bad("요청을 확인해 주세요.");
  const s = await getStore();
  await markSeen(g.s.mid, "posts");
  await markCommentsSeen(g.s.mid);
  const rows = await s.list("ClubRequests");
  for (const r of rows.filter((x) => x.memberId === g.s.mid && x.status !== "pending" && x.resultSeen !== "true")) {
    await s.update("ClubRequests", r.id, { resultSeen: "true" });
  }
  const c = await countsOf(g.s.mid);
  return NextResponse.json({ ...c, count: c.posts + c.alerts });
}
