import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { applyInput, carInput, cars, conflict, inputPeople, saveCarpoolState, suggestName, timeIssue, toCar, toRow } from "@/lib/carpool";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; cid: string }> };

// 차량 수정(차량 정보, 갈 때·올 때 운행 여부, 구간별 일정과 탑승자). 같은 구간에 두 대에 들어가는 사람이 없도록 검사한다.
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(["events"]);
  if ("err" in g) return g.err;
  const { id, cid } = await ctx.params;
  const parsed = carInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const s = await getStore();
  const row = (await s.list("Carpools")).find((c) => c.id === cid && c.eventId === id);
  if (!row) return bad("차량을 찾을 수 없어요.", 404);
  const members = await s.list("Members");
  if (inputPeople(parsed.data).some((p) => !members.some((m) => m.id === p))) return bad("명단에 없는 회원이에요.");

  const all = await cars(id);
  const next = applyInput(toCar(row), parsed.data);
  if (!next.name) next.name = suggestName(all.filter((c) => c.id !== cid));
  const order = timeIssue(next);
  if (order) return bad(order);
  const why = conflict(all, next, new Map(members.map((m) => [m.id, m.name])));
  if (why) return bad(why, 409);
  await s.update("Carpools", cid, toRow(next));
  await saveCarpoolState(id, { published: false, publishedAt: "" });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard(["events"]);
  if ("err" in g) return g.err;
  const { id, cid } = await ctx.params;
  const s = await getStore();
  if (!(await s.list("Carpools")).some((c) => c.id === cid && c.eventId === id)) return bad("차량을 찾을 수 없어요.", 404);
  await s.remove("Carpools", cid);
  await saveCarpoolState(id, { published: false, publishedAt: "" });
  return NextResponse.json({ ok: true });
}
