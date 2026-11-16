import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { readObservers } from "@/lib/audience";
import { attendApprove, canHandle, isAttend } from "@/lib/club-requests";
import { memberClubs } from "@/lib/lists";
import { pushTo } from "@/lib/push";
import { getPermGroups } from "@/lib/perms";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// reason: 반려 사유(반려할 때만, 신청한 회원에게 보인다)
const body = z.object({ decision: z.enum(["approve", "decline"]), reason: z.string().trim().max(300).default("") });

// 소모임 직책자(직책자가 없으면 전체 관리자)가 가입·참관 신청을 승인하거나 거절한다.
//  승인 join    → 신청한 회원의 Members.clubs 에 그 소모임(직책 없음)을 더한다.
//  승인 observe → 그 일정의 참관자(Events.observers)에 더한다.
//  참석 요청(attend)이면 위에 더해 그 일정에 참석 신청(EventApplies 참석)까지 넣는다.
// 결과는 신청한 회원의 알림에 뜨고 휴대폰 알림(내용 없이)도 간다.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("승인 또는 반려를 골라 주세요. 반려 사유는 300자까지 쓸 수 있어요.");

  const s = await getStore();
  const [rows, members, events] = await Promise.all([s.list("ClubRequests"), s.list("Members"), s.list("Events")]);
  const r = rows.find((x) => x.id === id);
  if (!r) return bad("신청을 찾을 수 없어요.", 404);
  if (!canHandle(members, r.club, g.s.mid, await getPermGroups())) return bad("이 소모임의 직책자(또는 모든권한 관리자)만 신청을 처리할 수 있어요.", 403);
  if (r.status !== "pending") return bad("이미 처리된 신청이에요.", 409);

  const approve = parsed.data.decision === "approve";
  if (approve) {
    const who = members.find((m) => m.id === r.memberId);
    if (!who) return bad("신청한 회원을 찾을 수 없어요.", 404);
    const seats = memberClubs(who);
    const inClub = seats.some((c) => c.name === r.club);
    if (r.kind === "join") {
      if (isAttend(r) && r.eventId && !events.some((e) => e.id === r.eventId)) return bad("일정을 찾을 수 없어요. 거절로 처리해 주세요.", 404);
      if (!inClub) await s.update("Members", who.id, { clubs: JSON.stringify([...seats, { name: r.club, role: "" }]) });
      // 같은 소모임의 대기 중인 참관·참석 요청은 가입으로 해결됐으니 함께 닫는다(따로 결과 알림은 띄우지 않는다).
      // 그중 참석 요청은 그 일정에 참석 신청까지 넣어 준다.
      const now = new Date().toISOString();
      for (const o of rows.filter((x) => x.id !== id && x.status === "pending" && x.club === r.club && x.memberId === who.id)) {
        if (isAttend(o)) await attendApprove(who.id, o.eventId);
        await s.update("ClubRequests", o.id, { status: "approved", handledBy: g.s.mid, handledAt: now, resultSeen: "true" });
      }
    } else {
      const ev = events.find((e) => e.id === r.eventId);
      if (!ev) return bad("일정을 찾을 수 없어요. 거절로 처리해 주세요.", 404);
      const obs = readObservers(ev.observers);
      if (!inClub && !obs.includes(who.id)) await s.update("Events", ev.id, { observers: JSON.stringify([...obs, who.id]) });
    }
    if (isAttend(r)) await attendApprove(who.id, r.eventId);
  }
  const row = await s.update("ClubRequests", id, {
    status: approve ? "approved" : "declined",
    handledBy: g.s.mid,
    handledAt: new Date().toISOString(),
    resultSeen: "",
    reason: approve ? "" : parsed.data.reason,
  });
  try {
    await pushTo([r.memberId], "alerts");
  } catch (e) {
    console.error("[push] 소모임 신청 결과 알림 실패", e);
  }
  return NextResponse.json({ request: { id, status: row?.status ?? (approve ? "approved" : "declined") } });
}

// 신청한 회원이 아직 처리되지 않은 자기 신청을 취소한다(행을 지운다).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const r = (await s.list("ClubRequests")).find((x) => x.id === id);
  if (!r || r.memberId !== g.s.mid) return bad("신청을 찾을 수 없어요.", 404);
  if (r.status !== "pending") return bad("이미 처리된 신청은 취소할 수 없어요.", 409);
  await s.remove("ClubRequests", id);
  return NextResponse.json({ ok: true });
}
