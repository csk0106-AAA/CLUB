import { NextResponse } from "next/server";
import { bad, guardEv } from "@/lib/api";
import { applyInput, autoName, carInput, cars, conflict, inputPeople, timeIssue, toCar, toRow } from "@/lib/carpool";
import { dropCar, syncRemoved } from "@/lib/car-requests";
import { addAlerts } from "@/lib/member-alerts";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; cid: string }> };

// 차량 수정(차량 정보, 갈 때·올 때 운행 여부, 구간별 일정과 탑승자). 같은 구간에 두 대에 들어가는 사람이 없도록 검사한다.
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["events"]);
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
  const before = toCar(row);
  const next = applyInput(toCar(row), parsed.data);
  if (!next.name) next.name = autoName(next, all, (mid) => members.find((m) => m.id === mid)?.name ?? "");
  const order = timeIssue(next);
  if (order) return bad(order);
  const why = conflict(all, next, new Map(members.map((m) => [m.id, m.name])));
  if (why) return bad(why, 409);
  await s.update("Carpools", cid, toRow(next));
  // 뺀 탑승자의 신청은 취소로, 빈자리에는 대기자를 올린다(확정한 배정은 그대로 보이고, 바꾼 것은 다시 "확정"을 눌러야 알린다)
  await syncRemoved(id, before, next);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["events"]);
  if ("err" in g) return g.err;
  const { id, cid } = await ctx.params;
  const s = await getStore();
  if (!(await s.list("Carpools")).some((c) => c.id === cid && c.eventId === id)) return bad("차량을 찾을 수 없어요.", 404);
  const gone = (await s.list("Carpools")).find((c) => c.id === cid);
  await s.remove("Carpools", cid);
  const hit = [...new Set([...(gone ? [...JSON.parse(gone.riders || "[]"), ...JSON.parse(gone.backRiders || "[]")] : []), ...(await dropCar(id, cid))])] as string[];
  await addAlerts(hit, { eventId: id, text: `${gone?.name ?? "차량"}이(가) 없어져서 배정이 풀렸어요. 다른 차량을 신청해 주세요.`, href: `/events/${id}#cars` });
  return NextResponse.json({ ok: true });
}
