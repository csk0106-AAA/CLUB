import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { canHandle, KIND_LABEL, type ReqKind } from "@/lib/club-requests";
import { getStore } from "@/lib/store";
import type { Row } from "@/lib/store/types";
import { countsOf, markSeen, newPostsOf } from "@/lib/unread";

export const dynamic = "force-dynamic";

// 홈 화면 종 아이콘의 알림 창:
//  posts    : 마지막으로 본 뒤 새로 올라오거나 바뀐 글
//  toHandle : 내가 처리할 소모임 가입·참관 신청(직책자)
//  mine     : 내가 보낸 신청과 결과(최근 20개). unseen 이면 아직 안 본 결과
//  count    : 종 아이콘 숫자(새 글 + 처리할 신청 + 안 본 결과) — 하단 홈 탭 숫자와 같다
export async function GET() {
  const g = await guard();
  if ("err" in g) return g.err;
  const mid = g.s.mid;
  const s = await getStore();
  const [rows, members, events, posts, counts] = await Promise.all([
    s.list("ClubRequests"), s.list("Members"), s.list("Events"), newPostsOf(mid), countsOf(mid),
  ]);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "(지운 회원)";
  const evName = (id: string) => (id ? events.find((e) => e.id === id)?.name ?? "" : "");
  const label = (k: string) => KIND_LABEL[k as ReqKind] ?? "신청";
  const recent = (a: Row, b: Row) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "");

  const toHandle = rows
    .filter((r) => r.status === "pending" && r.memberId !== mid && canHandle(members, r.club, mid))
    .sort(recent)
    .map((r) => ({
      id: r.id, kind: r.kind, kindLabel: label(r.kind), club: r.club, eventId: r.eventId, eventName: evName(r.eventId),
      memberName: name(r.memberId), message: r.message, createdAt: r.createdAt,
    }));
  const mine = rows
    .filter((r) => r.memberId === mid)
    .sort(recent)
    .slice(0, 20)
    .map((r) => ({
      id: r.id, kind: r.kind, kindLabel: label(r.kind), club: r.club, eventId: r.eventId, eventName: evName(r.eventId),
      status: r.status, createdAt: r.createdAt, handledAt: r.handledAt, handledByName: r.handledBy ? name(r.handledBy) : "",
      unseen: r.status !== "pending" && r.resultSeen !== "true",
    }));
  return NextResponse.json({
    posts: posts.slice(0, 30).map((p) => ({ id: p.id, title: p.title, at: p.updatedAt || p.createdAt })),
    toHandle,
    mine,
    count: counts.posts + counts.alerts,
  });
}

const body = z.object({ seen: z.literal(true) });

// 알림 창을 열어 본 뒤: 새 글과 내 신청 결과를 "봤음"으로 표시한다(처리할 신청은 처리해야 숫자에서 빠진다).
export async function POST(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  if (!body.safeParse(await req.json().catch(() => null)).success) return bad("요청을 확인해 주세요.");
  const s = await getStore();
  await markSeen(g.s.mid, "posts");
  const rows = await s.list("ClubRequests");
  for (const r of rows.filter((x) => x.memberId === g.s.mid && x.status !== "pending" && x.resultSeen !== "true")) {
    await s.update("ClubRequests", r.id, { resultSeen: "true" });
  }
  const c = await countsOf(g.s.mid);
  return NextResponse.json({ ...c, count: c.posts + c.alerts });
}
