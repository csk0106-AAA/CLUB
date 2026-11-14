import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { readObservers } from "@/lib/audience";
import { canHandle } from "@/lib/club-requests";
import { memberClubs } from "@/lib/lists";
import { pushTo } from "@/lib/push";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const body = z.object({ decision: z.enum(["approve", "decline"]) });

// 소모임 직책자(직책자가 없으면 전체 관리자)가 가입·참관 신청을 승인하거나 거절한다.
//  승인 join    → 신청한 회원의 Members.clubs 에 그 소모임(직책 없음)을 더한다.
//  승인 observe → 그 행사의 참관자(Events.observers)에 더한다.
// 결과는 신청한 회원의 알림에 뜨고 휴대폰 알림(내용 없이)도 간다.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("승인 또는 거절을 골라 주세요.");

  const s = await getStore();
  const [rows, members, events] = await Promise.all([s.list("ClubRequests"), s.list("Members"), s.list("Events")]);
  const r = rows.find((x) => x.id === id);
  if (!r) return bad("신청을 찾을 수 없어요.", 404);
  if (!canHandle(members, r.club, g.s.mid)) return bad("이 소모임의 직책자만 신청을 처리할 수 있어요.", 403);
  if (r.status !== "pending") return bad("이미 처리된 신청이에요.", 409);

  const approve = parsed.data.decision === "approve";
  if (approve) {
    const who = members.find((m) => m.id === r.memberId);
    if (!who) return bad("신청한 회원을 찾을 수 없어요.", 404);
    const seats = memberClubs(who);
    const inClub = seats.some((c) => c.name === r.club);
    if (r.kind === "join") {
      if (!inClub) await s.update("Members", who.id, { clubs: JSON.stringify([...seats, { name: r.club, role: "" }]) });
      // 같은 소모임의 대기 중인 참관 신청은 가입으로 해결됐으니 함께 닫는다(따로 결과 알림은 띄우지 않는다).
      const now = new Date().toISOString();
      for (const o of rows.filter((x) => x.id !== id && x.status === "pending" && x.club === r.club && x.memberId === who.id)) {
        await s.update("ClubRequests", o.id, { status: "approved", handledBy: g.s.mid, handledAt: now, resultSeen: "true" });
      }
    } else {
      const ev = events.find((e) => e.id === r.eventId);
      if (!ev) return bad("행사를 찾을 수 없어요. 거절로 처리해 주세요.", 404);
      const obs = readObservers(ev.observers);
      if (!inClub && !obs.includes(who.id)) await s.update("Events", ev.id, { observers: JSON.stringify([...obs, who.id]) });
    }
  }
  const row = await s.update("ClubRequests", id, {
    status: approve ? "approved" : "declined",
    handledBy: g.s.mid,
    handledAt: new Date().toISOString(),
    resultSeen: "",
  });
  try {
    await pushTo([r.memberId], "alerts");
  } catch (e) {
    console.error("[push] 소모임 신청 결과 알림 실패", e);
  }
  return NextResponse.json({ request: { id, status: row?.status ?? (approve ? "approved" : "declined") } });
}
