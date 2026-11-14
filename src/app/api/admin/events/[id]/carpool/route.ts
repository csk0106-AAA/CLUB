import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { applyInput, carInput, carpoolState, cars, conflict, freeFor, inputPeople, newCar, saveCarpoolState, suggestName, timeIssue, toRow } from "@/lib/carpool";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 카풀 배정: 차량마다 갈 때·올 때 운행 여부와 구간별 일정·탑승자. 배포 전에는 회원에게 보이지 않는다.
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(["events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [members, applies, all, state] = await Promise.all([s.list("Members"), s.list("EventApplies"), cars(id), carpoolState(id)]);
  const live = members.filter((m) => m.kind !== "회원대기");
  const att = live.filter((m) => applies.some((a) => a.eventId === id && a.memberId === m.id && a.answer === "참석")).map((m) => m.id);
  const free = freeFor(all, att);
  return NextResponse.json({
    published: state.published,
    members: live.map((m) => ({ id: m.id, name: m.name })),
    attendingIds: att,
    cars: all,
    free,
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(["events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = carInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const s = await getStore();
  if (!(await s.list("Events")).some((e) => e.id === id)) return bad("일정을 찾을 수 없어요.", 404);
  const members = await s.list("Members");
  if (inputPeople(parsed.data).some((p) => !members.some((m) => m.id === p))) return bad("명단에 없는 회원이에요.");

  const names = new Map(members.map((m) => [m.id, m.name]));
  const existing = await cars(id);
  const car = applyInput(newCar(), parsed.data);
  if (!car.name) car.name = suggestName(existing);
  const order = timeIssue(car);
  if (order) return bad(order);
  const why = conflict(existing, car, names);
  if (why) return bad(why, 409);
  const row = await s.insert("Carpools", { eventId: id, ...toRow(car) });
  // 구성이 바뀌면 다시 배포해야 한다.
  await saveCarpoolState(id, { published: false, publishedAt: "" });
  return NextResponse.json({ id: row.id });
}
