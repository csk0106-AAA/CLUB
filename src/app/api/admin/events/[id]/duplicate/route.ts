import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { readDayPlaces } from "@/lib/day-places";
import { creatableTypes } from "@/lib/perm-keys";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 일정 복제: 이 일정의 설정과 준비한 내용을 새 초안 일정으로 복사한다(관리할 수 있는 일정만, 그 종류를 만들 권한이 있을 때).
//  복사: 일정 정보·회비 설정·세부일정·날짜별 기본 위치·준비목록(완료 해제)·비용(집행 0)·활동(설정 그대로, 진행자·접속번호 비움)
//  날짜: 새 시작일과 원래 시작일의 차이만큼 끝나는 일시·회비 마감일·세부일정·활동 시간을 함께 옮긴다.
//  복사하지 않음: 참석 신청·입금, 사진첩, 조편성·카풀·숙소배정, 회의록, 참관자, 편집자
const body = z.object({
  name: z.string().trim().min(1).max(80),
  startsAt: z.string().regex(/^(\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?)?$/).optional(), // 비우면 원래 일시 그대로
});

const DAY = 86_400_000;
const dayMs = (s: string) => Date.parse(`${s.slice(0, 10)}T00:00:00Z`);
// "YYYY-MM-DD…" 의 날짜 부분만 days 만큼 옮긴다(시각은 그대로)
function shift(v: string | undefined, days: number): string {
  if (!v || !days || !/^\d{4}-\d{2}-\d{2}/.test(v)) return v ?? "";
  const d = new Date(dayMs(v) + days * DAY).toISOString().slice(0, 10);
  return d + v.slice(10);
}

export async function POST(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, "events");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("새 일정 이름을 입력해 주세요. 일시는 달력에서 골라 주세요.");
  const s = await getStore();
  const ev = (await s.list("Events")).find((e) => e.id === id);
  if (!ev) return bad("일정을 찾을 수 없어요.", 404);
  const allowed = creatableTypes(g.s.perms);
  if (allowed && !allowed.includes(ev.type) && !(ev.club && g.s.perms.includes("clubs"))) return bad(`${ev.type} 일정을 만들 권한이 없어요.`, 403);

  // 날짜 옮기기: 새 시작일 - 원래 시작일(일 단위)
  const newStart = parsed.data.startsAt ?? ev.startsAt ?? "";
  const days = newStart && ev.startsAt && /^\d{4}-\d{2}-\d{2}/.test(ev.startsAt) ? Math.round((dayMs(newStart) - dayMs(ev.startsAt)) / DAY) : 0;
  const places = readDayPlaces(ev.dayPlaces);
  const movedPlaces = Object.fromEntries(Object.entries(places).map(([k, v]) => [shift(k, days), v]));

  const copy = await s.insert("Events", {
    type: ev.type, name: parsed.data.name, club: ev.club ?? "",
    startsAt: newStart, endsAt: shift(ev.endsAt, days), place: ev.place ?? "", booking: ev.booking ?? "",
    status: "초안", published: "false", pinned: "false",
    fee: ev.fee ?? "", feeDeadline: shift(ev.feeDeadline, days), feeRules: ev.feeRules ?? "", account: ev.account ?? "", accountHolder: ev.accountHolder ?? "",
    supports: ev.supports ?? "", audience: ev.audience ?? "",
    dayPlaces: Object.keys(movedPlaces).length ? JSON.stringify(movedPlaces) : "",
    showPrep: ev.showPrep ?? "", showCosts: ev.showCosts ?? "", photoLimit: ev.photoLimit ?? "",
    createdBy: g.s.mid,
  });
  const nid = copy.id;

  const [sched, prep, costs, acts] = await Promise.all([s.list("EventSchedule"), s.list("EventPrep"), s.list("EventCosts"), s.list("EventActivities")]);
  for (const r of sched.filter((x) => x.eventId === id)) {
    await s.insert("EventSchedule", { eventId: nid, at: shift(r.at, days), title: r.title, place: r.place ?? "", memo: r.memo ?? "" });
  }
  for (const r of prep.filter((x) => x.eventId === id)) {
    await s.insert("EventPrep", { eventId: nid, item: r.item, owner: r.owner ?? "", done: "", category: r.category ?? "", price: r.price ?? "" });
  }
  for (const r of costs.filter((x) => x.eventId === id)) {
    await s.insert("EventCosts", { eventId: nid, item: r.item, budget: r.budget ?? "", spent: "0", spentBase: "0", status: "", owner: r.owner ?? "", memo: r.memo ?? "", order: r.order ?? "" });
  }
  for (const r of acts.filter((x) => x.eventId === id)) {
    await s.insert("EventActivities", {
      eventId: nid, templateId: r.templateId, templateVersion: r.templateVersion, config: r.config, state: "ready", order: r.order,
      startsAt: shift(r.startsAt, days), endsAt: shift(r.endsAt, days),
    });
  }
  return NextResponse.json({ event: { id: nid, club: copy.club } });
}
