import { NextResponse } from "next/server";
import { bad, guard, parseJson } from "@/lib/api";
import { memberFee, payable } from "@/lib/fee";
import { eventVisible, inClubOrObserver, readObservers } from "@/lib/audience";
import { clubLeaders } from "@/lib/clubs";
import { memberClubs } from "@/lib/lists";
import { fixLegacyTypes } from "@/lib/event-migrate";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 회원이 보는 일정 개요. 계좌번호는 참석 신청한 회원에게만 내려준다.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, applies, acts, members, requests] = await Promise.all([
    s.list("Events"),
    s.list("EventApplies"),
    s.list("EventActivities"),
    s.list("Members"),
    s.list("ClubRequests"),
  ]);
  await fixLegacyTypes(events);
  const me = members.find((m) => m.id === g.s.mid);
  const e = events.find((x) => x.id === id && eventVisible(x, me ?? g.s.mid));
  if (!e) return bad("일정을 찾을 수 없어요.", 404);

  const a = applies.find((x) => x.eventId === id && x.memberId === g.s.mid);
  const attending = a?.answer === "참석";
  // 회비는 이 회원의 참석일·회원구분·직책에 맞는 금액만 내려준다(다른 조건의 금액은 보내지 않는다).
  // 소모임 일정: 소모임 이름, 회장(직책자) 이름, 내가 그 소모임 직책자인지(참관자 추가 카드)
  const club = (e.club ?? "").trim();
  // 내가 속하지 않은 소모임 일정이면 읽기만 된다(참석 신청 대신 가입·참관 신청 카드)
  const canApply = inClubOrObserver(e, { id: g.s.mid, clubs: me?.clubs });
  // 내 가입·참관 신청의 최근 상태("" = 보낸 적 없음)
  const latest = (kind: string) =>
    requests
      .filter((r) => r.memberId === g.s.mid && r.kind === kind && r.club === club && (kind === "join" || r.eventId === id))
      .sort((p, q) => q.createdAt.localeCompare(p.createdAt))[0]?.status ?? "";
  const leaders = club ? clubLeaders(members, club) : [];
  const observers = readObservers(e.observers);
  const mf = memberFee(e, { kind: me?.kind, position: me?.position }, a);
  const fee = mf.known && payable(mf.amount) ? mf.amount : "";
  const activities = acts
    .filter((x) => x.eventId === id)
    .sort((p, q) => Number(p.order) - Number(q.order))
    .map((x) => ({ id: x.id, name: parseJson<{ name?: string }>(x.config, {}).name ?? "활동" }));

  return NextResponse.json({
    event: {
      id: e.id,
      type: e.type,
      name: e.name,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      place: e.place,
      booking: e.booking,
      status: e.status,
      fee, // 이 회원이 낼 회비("" = 없음 또는 아직 모름)
      feePending: !mf.known, // 참석 날짜를 골라야 회비가 정해짐
      feeDeadline: e.feeDeadline,
      account: attending ? e.account : "",
      accountHolder: attending ? e.accountHolder : "",
      club,
      clubLeaders: leaders.map((l) => ({ name: l.name, role: l.role })),
      observer: !!club && observers.includes(g.s.mid) && !leaders.some((l) => l.id === g.s.mid) && !(me && memberClubs(me).some((c) => c.name === club)),
      canObserve: !!club && leaders.some((l) => l.id === g.s.mid),
      canApply,
      requests: club && !canApply ? { join: latest("join"), observe: latest("observe") } : null,
    },
    activities,
    apply: a ? { answer: a.answer, days: a.days ? a.days.split(",") : [], paid: a.paid === "true", payNotice: a.payNotice ?? "" } : null,
    feeDue: attending && fee !== "" && a?.paid !== "true",
  });
}
