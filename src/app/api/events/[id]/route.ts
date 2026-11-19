import { NextResponse } from "next/server";
import { bad, guard, parseJson } from "@/lib/api";
import { memberFee, payable } from "@/lib/fee";
import { eventJoinable, eventVisible, inClubOrObserver, readObservers } from "@/lib/audience";
import { defaultCoverUrl, eventCoverUrl, readCovers } from "@/lib/covers";
import { bestPhoto } from "@/lib/event-photos";
import { clubLeaders } from "@/lib/clubs";
import { isAttend, joinView, latestJoin } from "@/lib/club-requests";
import { memberClubs } from "@/lib/lists";
import { fixLegacyTypes } from "@/lib/event-migrate";
import { isGuest } from "@/lib/member-kind";
import { ITEMS } from "@/lib/items";
import { fileMeta } from "@/lib/event-files";
import { getStore } from "@/lib/store";
import { canPreviewEvent } from "@/lib/event-preview";

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
  // 공개 대상 밖 일정은 목록에만 보이고 열 수 없다. 공개전 일정은 관리하는 사람만 회원 화면 그대로 미리 본다(preview, 참석 신청은 안 됨)
  const found = events.find((x) => x.id === id);
  const visible = !!found && eventVisible(found, me ?? g.s.mid);
  if (found && !visible && found.published === "true") return NextResponse.json({ error: "나에게 공개되지 않은 일정이에요.", outside: true }, { status: 403 });
  const preview = !!found && !visible && (await canPreviewEvent(found, me, g.s.mid));
  const e = visible || preview ? found : undefined;
  if (!e) return bad("일정을 찾을 수 없어요.", 404);

  const a = applies.find((x) => x.eventId === id && x.memberId === g.s.mid);
  const attending = a?.answer === "참석";
  // 회비는 이 회원의 참석일·회원구분·직책에 맞는 금액만 내려준다(다른 조건의 금액은 보내지 않는다).
  // 클럽 일정: 클럽 이름, 회장(직책자) 이름, 내가 그 클럽 직책자인지(참관자 추가 카드)
  const club = (e.club ?? "").trim();
  // 내가 속하지 않은 클럽 일정이면 읽기만 된다(참석 신청 대신 "클럽 관리자에게 요청하기")
  const canApply = !preview && inClubOrObserver(e, { id: g.s.mid, clubs: me?.clubs, kind: me?.kind });
  // 이 일정에 보낸 내 참석 요청(참관/가입 + 참석) 중 가장 최근 것. 클럽 밖 회원에게만 보여 준다.
  const myReq = requests
    .filter((r) => r.memberId === g.s.mid && r.eventId === id && isAttend(r))
    .sort((p, q) => (q.createdAt ?? "").localeCompare(p.createdAt ?? ""))[0];
  const leaders = club ? clubLeaders(members, club) : [];
  const observers = readObservers(e.observers);
  const mf = memberFee(e, { kind: me?.kind, position: me?.position }, a);
  const fee = mf.known && payable(mf.amount) ? mf.amount : "";
  // 관리자가 "회원에게 보이기"를 켠 준비목록·비용(읽기만)
  const showPrep = e.showPrep === "true";
  const showCosts = e.showCosts === "true";
  const [prepRows, costRows] = await Promise.all([showPrep ? s.list("EventPrep") : [], showCosts ? s.list("EventCosts") : []]);
  const prep = showPrep
    ? prepRows.filter((r) => r.eventId === id).map((r) => ITEMS.prep.view(r)).sort((a, b) => Number(a.done) - Number(b.done))
    : null;
  const costs = showCosts ? costRows.filter((r) => r.eventId === id).sort(ITEMS.costs.sort).map((r) => ITEMS.costs.view(r)) : null;
  // 준비목록 파일(준비목록을 보일 때만, 내용은 /api/events/[id]/files/[fid] 로 내려받는다)
  const prepFiles = showPrep
    ? (await s.list("EventFiles")).filter((r) => r.eventId === id).sort((p, q) => (p.createdAt ?? "").localeCompare(q.createdAt ?? ""))
      .map((r) => fileMeta(r, (mid) => members.find((m) => m.id === mid)?.name ?? ""))
    : null;
  const activities = acts
    .filter((x) => x.eventId === id)
    .sort((p, q) => Number(p.order) - Number(q.order))
    .map((x) => ({ id: x.id, name: parseJson<{ name?: string }>(x.config, {}).name ?? "활동" }));

  // 맨 위 사진: 목록 카드와 같은 규칙(회원 사진 중 좋아요 많은 것 → 먼저 올린 것 → 클럽·모임 대표사진, lib/covers.ts)
  const photo = eventJoinable(e, me ?? g.s.mid) ? bestPhoto((await s.list("EventPhotos")).filter((p) => p.eventId === id)) : null;
  // 일정 대표사진을 올렸으면 그것이 먼저
  const covers = await readCovers();
  const coverUrl = e.coverAt ? eventCoverUrl({ id: e.id, coverAt: e.coverAt }, covers, false) : photo ? `/api/events/${id}/photos/${photo.id}` : defaultCoverUrl(covers, e.club, false);

  return NextResponse.json({
    event: {
      id: e.id,
      // 관리하는 사람이 공개 대상 밖·공개전 일정을 회원 화면으로 보는 중(참석 신청 안 됨). draft: 공개전 일정
      preview, draft: e.published !== "true",
      coverUrl, // 맨 위 큰 사진(원본 크기). 없으면 ""
      going: applies.filter((x) => x.eventId === id && x.answer === "참석").length, // 참석 인원
      type: e.type,
      approval: e.approval === "admin" ? "admin" : "", // 참석 확정 방식(admin = 관리자 승인 후 참석)
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
      // 내 참석 요청: status pending(관리자 확인 중) | approved | declined
      // 대기회원·참관회원: 참석 대신 참관 신청(일정 관리자 승인). 클럽 일정이 아니어도 이 칸을 쓴다.
      guest: isGuest(me?.kind),
      attendReq: (club || isGuest(me?.kind)) && myReq
        ? { id: myReq.id, kind: myReq.kind, status: myReq.status, message: myReq.message, createdAt: myReq.createdAt, handledAt: myReq.handledAt, reason: myReq.reason ?? "" }
        : null,
      // 클럽 회원이 아니면: 이 클럽 가입 신청 중 가장 최근 것(설정·게시글에서 보낸 것 포함). 없으면 null
      clubJoin: club && !isGuest(me?.kind) && !(me && memberClubs(me).some((c) => c.name === club)) ? joinView(latestJoin(requests, g.s.mid, club)) : null,
    },
    activities,
    prep, // null = 회원에게 안 보임
    prepFiles,
    costs,
    apply: a ? {
      answer: a.answer, days: a.days ? a.days.split(",") : [], paid: a.paid === "true", payNotice: a.payNotice ?? "",
      // 회비 돌려받기: "wait" 송금대기 / "done" 송금완료(lib/refund.ts)
      refund: a.refund ?? "", refundAmount: a.refundAmount ?? "", refundDoneAt: a.refundDoneAt ?? "",
      // 관리자 승인 후 참석: req "참석" 승인 대기, reqResult "declined" 반려(reqReason 사유)
      req: a.req ?? "", reqDays: a.reqDays ? a.reqDays.split(",") : [], reqResult: a.reqResult ?? "", reqReason: a.reqReason ?? "",
    } : null,
    feeDue: attending && fee !== "" && a?.paid !== "true",
  });
}
