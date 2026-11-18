import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { nightsOf, roomState, rooms, saveRoomState, suggestRoomName, syncSameRooms, validDate } from "@/lib/rooms";
import { getStore } from "@/lib/store";
import { isGuest } from "@/lib/member-kind";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 숙박 방배정(날짜별). 배포 전에는 회원에게 보이지 않는다.
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, members, applies, all, state] = await Promise.all([s.list("Events"), s.list("Members"), s.list("EventApplies"), rooms(id), roomState(id)]);
  const ev = events.find((e) => e.id === id);
  if (!ev) return bad("일정을 찾을 수 없어요.", 404);
  const live = members.filter((m) => (!isGuest(m.kind) || applies.some((a) => a.eventId === id && a.memberId === m.id && a.answer === "참석")));
  const att = live.filter((m) => applies.some((a) => a.eventId === id && a.memberId === m.id && a.answer === "참석")).map((m) => m.id);
  const dates = [...new Set([...nightsOf(ev.startsAt, ev.endsAt), ...all.map((r) => r.date)])].sort();
  // 그 날 밤 숙박하는 참석자: 참석 날짜로 그날과 다음 날을 모두 고른 사람. 참석 날짜를 고르지 않았으면(날짜 선택 없는 일정 등) 모든 밤.
  const daysOf = new Map(applies.filter((a) => a.eventId === id && a.answer === "참석").map((a) => [a.memberId, (a.days ?? "").split(",").map((x) => x.trim().slice(0, 10)).filter(Boolean)]));
  const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const stayers = Object.fromEntries(dates.map((d) => [d, att.filter((p) => {
    const ds = daysOf.get(p) ?? [];
    return ds.length === 0 || (ds.includes(d) && ds.includes(nextDay(d)));
  })]));
  const free = Object.fromEntries(dates.map((d) => [d, stayers[d].filter((p) => !all.some((r) => r.date === d && r.guests.includes(p)))]));
  return NextResponse.json({
    published: state.published,
    same: !!state.same, // 모든 밤 같은 배정
    nights: nightsOf(ev.startsAt, ev.endsAt),
    dates,
    members: live.map((m) => ({ id: m.id, name: m.name, gender: m.gender ?? "" })),
    attendingIds: att,
    stayers, // 날짜별 그 날 밤 숙박하는 참석자(투숙자 추가 목록)
    rooms: all.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "ko", { numeric: true })),
    free,
  });
}

const body = z.object({
  date: z.string().refine(validDate, "날짜를 확인해 주세요."),
  name: z.string().trim().max(30).default(""),
  capacity: z.number().int().min(1).max(20).default(2),
  memo: z.string().trim().max(100).default(""),
});

export async function POST(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("날짜와 정원을 확인해 주세요.");
  const s = await getStore();
  if (!(await s.list("Events")).some((e) => e.id === id)) return bad("일정을 찾을 수 없어요.", 404);
  const all = await rooms(id);
  const name = parsed.data.name || suggestRoomName(all, parsed.data.date);
  if (all.some((r) => r.date === parsed.data.date && r.name === name)) return bad("같은 날짜에 같은 이름의 방이 있어요.", 409);
  const row = await s.insert("Rooms", { eventId: id, date: parsed.data.date, name, capacity: String(parsed.data.capacity), memo: parsed.data.memo, guests: "[]" });
  await saveRoomState(id, { published: false, publishedAt: "" });
  await syncSameRooms(id); // 모든 밤 같은 배정이면 나머지 밤도 맞춘다
  return NextResponse.json({ id: row.id });
}

// 한 날짜의 방 구성을 통째로 저장(조편성처럼 화면에서 고친 초안을 한 번에). 모든 밤 같은 배정이면 첫날 밤 구성으로 나머지 밤을 맞춘다.
const board = z.object({
  date: z.string().refine(validDate),
  rooms: z.array(z.object({
    name: z.string().trim().min(1).max(30),
    capacity: z.number().int().min(1).max(20),
    memo: z.string().trim().max(100).default(""),
    guests: z.array(z.string()).max(20),
  })).max(60),
});

export async function PUT(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = board.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("방 이름과 정원을 확인해 주세요.");
  const s = await getStore();
  if (!(await s.list("Events")).some((e) => e.id === id)) return bad("일정을 찾을 수 없어요.", 404);
  const members = new Map((await s.list("Members")).map((m) => [m.id, m.name]));
  const names = new Set<string>();
  const seen = new Set<string>();
  for (const r of parsed.data.rooms) {
    if (names.has(r.name)) return bad(`같은 이름의 방(${r.name})이 있어요.`);
    names.add(r.name);
    if (r.guests.length > r.capacity) return bad(`${r.name}: 정원은 ${r.capacity}명이에요. 투숙자를 줄이거나 정원을 늘려 주세요.`);
    for (const mid of r.guests) {
      if (!members.has(mid)) return bad("명단에 없는 회원이 있어요.");
      if (seen.has(mid)) return bad(`${members.get(mid)} 님이 두 방에 들어가 있어요.`);
      seen.add(mid);
    }
  }
  const { date } = parsed.data;
  for (const r of await rooms(id)) if (r.date === date) await s.remove("Rooms", r.id);
  for (const r of parsed.data.rooms) await s.insert("Rooms", { eventId: id, date, name: r.name, capacity: String(r.capacity), memo: r.memo, guests: JSON.stringify(r.guests) });
  await saveRoomState(id, { published: false, publishedAt: "" });
  await syncSameRooms(id);
  return NextResponse.json({ ok: true });
}
