import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { approve, confirmAll, reject } from "@/lib/car-requests";
import { autoAssign, carpoolState, cars, saveCarpoolState } from "@/lib/carpool";
import { confirmByAdmin, markDue, runCarpoolDue } from "@/lib/car-auto";
import { pushTo } from "@/lib/push";
import { getStore } from "@/lib/store";

const body = z.object({
  action: z.enum(["publish", "unpublish", "auto", "settings", "approve", "reject"]),
  open: z.boolean().optional(), // settings: 카풀 신청 지금 받기
  waitUntil: z.string().max(40).optional(), // settings: 카풀신청 마감 시각("" = 없음)
  recruitOn: z.boolean().optional(), // settings: 차량 지원 모집
  recruitUntil: z.string().max(40).optional(), // settings: 차량 지원 모집 마감
  recruitFrom: z.string().max(40).optional(), // settings: 차량모집 시작("" = 켜는 순간부터)
  openFrom: z.string().max(40).optional(), // settings: 카풀신청 시작("" = 켜는 순간부터)
  reqId: z.string().optional(), // approve / reject
  note: z.string().trim().max(200).optional(),
});

// publish: 확정(승인된 탑승자를 확정하고 회원에게 종 알림) / unpublish: 확정 취소(회원에게 안 보임)
// auto: 빈 좌석 자동 배정 / settings: 신청 받기·대기 기한 / approve·reject: 회원 신청 승인·반려
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardEv(ctx, ["events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const d = parsed.data;
  const s = await getStore();

  if (d.action === "settings") {
    if (d.waitUntil && Number.isNaN(Date.parse(d.waitUntil))) return bad("카풀 신청 마감 시각을 확인해 주세요.");
    if (d.recruitUntil && Number.isNaN(Date.parse(d.recruitUntil))) return bad("차량 모집 마감 시각을 확인해 주세요.");
    if (d.recruitUntil && d.waitUntil && d.recruitUntil >= d.waitUntil) return bad("차량모집 마감은 카풀신청 마감보다 앞이어야 해요.");
    for (const x of [d.recruitFrom, d.openFrom]) if (x && Number.isNaN(Date.parse(x))) return bad("시작 일시를 확인해 주세요.");
    if (d.recruitFrom && d.recruitUntil && d.recruitFrom >= d.recruitUntil) return bad("차량모집 시작이 마감보다 앞이어야 해요.");
    if (d.openFrom && d.waitUntil && d.openFrom >= d.waitUntil) return bad("카풀신청 시작이 마감보다 앞이어야 해요.");
    const before = await carpoolState(id);
    await saveCarpoolState(id, {
      ...(d.open === undefined ? {} : { open: d.open }),
      ...(d.waitUntil === undefined ? {} : { waitUntil: d.waitUntil, ...(d.waitUntil !== (before.waitUntil ?? "") ? { confirmDone: false } : {}) }),
      ...(d.recruitOn === undefined ? {} : { recruitOn: d.recruitOn }),
      ...(d.recruitUntil === undefined ? {} : { recruitUntil: d.recruitUntil, ...(d.recruitUntil !== (before.recruitUntil ?? "") ? { recruitDone: false } : {}) }),
      ...(d.recruitFrom === undefined ? {} : { recruitFrom: d.recruitFrom, ...(d.recruitFrom !== (before.recruitFrom ?? "") ? { recruitStarted: false } : {}) }),
      ...(d.openFrom === undefined ? {} : { openFrom: d.openFrom, ...(d.openFrom !== (before.openFrom ?? "") ? { openStarted: false } : {}) }),
    });
    // 새로 켜면 시작 알림을 다시 보내도록(꺼져 있던 것을 켬)
    await saveCarpoolState(id, {
      ...(d.recruitOn && !before.recruitOn ? { recruitStarted: false } : {}),
      ...(d.open && !before.open ? { openStarted: false } : {}),
    });
    await markDue(id); // 시작·마감 시각에 자동 처리(lib/car-auto.ts) — 지금 시작하는 것은 바로 알림
    await runCarpoolDue();
    return NextResponse.json({ ok: true });
  }
  if (d.action === "approve" || d.action === "reject") {
    if (!d.reqId) return bad("신청을 골라 주세요.");
    const why = d.action === "approve" ? await approve(id, d.reqId) : await reject(id, d.reqId, d.note ?? "");
    if (why) return bad(why, 409);
    if (d.action === "reject") {
      const r = await s.get("CarRequests", d.reqId);
      if (r?.memberId) await pushTo([r.memberId], "alerts", g.s.mid).catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  }
  if (d.action === "unpublish") {
    await saveCarpoolState(id, { published: false, publishedAt: "" });
    return NextResponse.json({ ok: true });
  }
  if (d.action === "auto") {
    const [members, applies] = await Promise.all([s.list("Members"), s.list("EventApplies")]);
    const att = members.filter((m) => applies.some((a) => a.eventId === id && a.memberId === m.id && a.answer === "참석")).map((m) => m.id);
    const added = await autoAssign(id, att);
    return NextResponse.json({ ok: true, added });
  }
  if ((await cars(id)).length === 0) return bad("확정할 차량이 없어요. 먼저 차량을 등록해 주세요.", 409);
  // 확정: 승인된(그리고 관리자가 직접 넣은) 탑승자를 확정으로 → 회원 종 알림 + 휴대폰 알림
  // 최종 확정은 관리자만: 탑승자 확정 알림 + 운전자·지원자에게 탑승자 명단(+ 마감이 지났으면 대기자 마감 알림)
  const told = await confirmByAdmin(id, (await s.get("Events", id))?.name ?? "", `/events/${id}#cars`, g.s.mid);
  return NextResponse.json({ ok: true, told });
}
