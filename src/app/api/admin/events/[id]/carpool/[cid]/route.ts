import { NextResponse } from "next/server";
import { bad, guardEv } from "@/lib/api";
import { applyInput, autoName, carInput, carpoolState, cars, conflict, inputPeople, removeSelf, riderCap, saveCarpoolState, seatOwner, selfOf, timeIssue, toCar, toRow } from "@/lib/carpool";
import { askOwnerInfo, confirmIfClosed } from "@/lib/car-auto";
import { dropCar, ownerMoved, syncRemoved } from "@/lib/car-requests";
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
  // 목록 캐시(2초)가 아니라 지금 값으로 읽는다(그사이 회원이 잡은 자리를 덮어쓰지 않게)
  const row = await s.get("Carpools", cid);
  if (!row || row.eventId !== id) return bad("차량을 찾을 수 없어요.", 404);
  const members = await s.list("Members");
  if (inputPeople(parsed.data).some((p) => !members.some((m) => m.id === p))) return bad("명단에 없는 회원이에요.");

  const all = await cars(id);
  const before = toCar(row);
  const next = applyInput(toCar(row), parsed.data);
  // 관리자 화면이 오래돼서 그사이 회원이 잡은 자리를 모르고 저장한 경우: 그 회원은 빼지 않고 그대로 둔다.
  //  (seen = 화면이 보고 있던 탑승자. 지금 탑승자 중 seen 에 없고 보낸 명단에도 없는 사람 = 그사이 들어온 사람)
  const kept: string[] = [];
  for (const d of ["go", "back"] as const) {
    const seen = parsed.data.seen?.[d];
    if (!seen || !next[d].on) continue;
    for (const m of before[d].riders) if (!seen.includes(m) && !next[d].riders.includes(m)) { next[d].riders.push(m); kept.push(m); }
    if (kept.length && next[d].riders.length > riderCap(next, d)) {
      const names = kept.map((m) => members.find((x) => x.id === m)?.name ?? "회원").join(", ");
      return bad(`그사이 ${names} 님이 이 차에 탔어요. 화면을 새로 불러온 뒤 다시 해 주세요.`, 409);
    }
  }
  // 정보 수정 창에서 저장할 때(탑승자 옮기기 말고) 회원 차량은 지원 회원 필수
  if (parsed.data.ownerId !== undefined && next.kind === "member" && !next.ownerId) return bad("회원 차량은 차량모집 지원 회원을 골라 주세요.");
  if (next.ownerId && !members.some((m) => m.id === next.ownerId)) return bad("지원 회원이 명단에 없어요.");
  const freed = parsed.data.ownerId !== undefined || parsed.data.driverId !== undefined ? await seatOwner(all.filter((c) => c.id !== cid), next) : [];
  if (!next.name) next.name = autoName(next, all, (mid) => members.find((m) => m.id === mid)?.name ?? "");
  const order = timeIssue(next);
  if (order) return bad(order);
  const why = conflict(all, next, new Map(members.map((m) => [m.id, m.name])));
  if (why) return bad(why, 409);
  await s.update("Carpools", cid, toRow(next));
  // 뺀 탑승자의 신청은 취소로, 빈자리(사람을 빼거나 좌석을 늘림)에는 대기자를 올린다(마감 뒤 바꾼 배정은 아래에서 바로 알린다)
  await syncRemoved(id, before, next);
  await ownerMoved(id, next.ownerId, freed);
  await confirmIfClosed(id, g.s.mid); // 마감(안내) 뒤 바꾼 배정은 그 회원에게 바로 알림
  // 차에 넣은 사람은 그 구간 개별 이동에서 뺀다
  const st = await carpoolState(id);
  for (const d of ["go", "back"] as const) {
    const added = next[d].riders.filter((m) => !before[d].riders.includes(m));
    const self = selfOf(st, d);
    await removeSelf(id, d, added.filter((m) => self.includes(m)));
  }
  // 정보 수정 창에서 저장했을 때만(탑승자 옮기기 말고) 빈 칸 알림
  if (parsed.data.name !== undefined || parsed.data.ownerId !== undefined) await askOwnerInfo(id, next);
  // 그사이 들어온 회원을 그대로 뒀으면 관리자 화면에 알려 준다
  return NextResponse.json({ ok: true, kept: [...new Set(kept)].map((m) => members.find((x) => x.id === m)?.name ?? "회원") });
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
