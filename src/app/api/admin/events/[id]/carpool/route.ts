import { NextResponse } from "next/server";
import { bad, guardEv } from "@/lib/api";
import { applyInput, autoName, carInput, carpoolState, cars, conflict, freeFor, inputPeople, newCar, seatOwner, selfOf, timeIssue, toRow } from "@/lib/carpool";
import { carRequests, ownerMoved, REQ_LABEL } from "@/lib/car-requests";
import { askOwnerInfo, notifyNewCar, runCarpoolDue } from "@/lib/car-auto";
import { getStore } from "@/lib/store";
import { isGuest } from "@/lib/member-kind";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 카풀 배정: 차량마다 갈 때·올 때 운행 여부와 구간별 일정·탑승자. 배포 전에는 회원에게 보이지 않는다.
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  await runCarpoolDue(); // 마감 시각이 지났으면 먼저 자동 처리
  const s = await getStore();
  const [members, applies, all, state, reqs] = await Promise.all([s.list("Members"), s.list("EventApplies"), cars(id), carpoolState(id), carRequests(id)]);
  const nm = (mid: string) => members.find((m) => m.id === mid)?.name ?? "(지운 회원)";
  const live = members.filter((m) => (!isGuest(m.kind) || applies.some((a) => a.eventId === id && a.memberId === m.id && a.answer === "참석")));
  const att = live.filter((m) => applies.some((a) => a.eventId === id && a.memberId === m.id && a.answer === "참석")).map((m) => m.id);
  const self = { go: selfOf(state, "go").filter((m) => att.includes(m)), back: selfOf(state, "back").filter((m) => att.includes(m)) };
  const free = freeFor(all, att, self);
  return NextResponse.json({
    published: state.published,
    self, // 개별 이동(구간별)
    open: !!state.open, // 회원 신청 받기
    waitUntil: state.waitUntil ?? "", // 차량신청 마감
    recruitOn: !!state.recruitOn, recruitUntil: state.recruitUntil ?? "", recruitFrom: state.recruitFrom ?? "", // 차량모집
    openFrom: state.openFrom ?? "", // 차량신청 시작
    adminOnly: !!state.adminOnly, // 관리자배정
    // 회원 신청: 승인 대기·대기(처리할 것) + 승인(확정 전)·확정 표시용
    requests: reqs
      .filter((r) => ["pending", "waiting", "approved", "confirmed"].includes(r.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((r) => ({ id: r.id, carId: r.carId, dir: r.dir, memberId: r.memberId, name: nm(r.memberId), status: r.status, label: REQ_LABEL[r.status], createdAt: r.createdAt, fromCar: r.fromCarId ? all.find((c) => c.id === r.fromCarId)?.name ?? "" : "" })),
    members: live.map((m) => ({ id: m.id, name: m.name })),
    allMembers: members.filter((m) => !isGuest(m.kind)).map((m) => ({ id: m.id, name: m.name })), // 운전자 검색(참석하지 않는 회원이 운전할 수도 있다)
    attendingIds: att,
    cars: all,
    free,
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["events"]);
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
  // 그룹명을 비우면 차량번호 → 운전자 이름 → "카풀 N조"
  if (car.kind === "member" && !car.ownerId) return bad("회원 차량은 차량모집 지원 회원을 골라 주세요.");
  if (car.ownerId && !members.some((m) => m.id === car.ownerId)) return bad("지원 회원이 명단에 없어요.");
  const freed = await seatOwner(existing, car); // 지원 회원이 운전하지 않으면 탑승자로 먼저
  if (!car.name) car.name = autoName(car, existing, (mid) => names.get(mid) ?? "");
  const order = timeIssue(car);
  if (order) return bad(order);
  const why = conflict(existing, car, names);
  if (why) return bad(why, 409);
  const row = await s.insert("Carpools", { eventId: id, ...toRow(car) });
  await ownerMoved(id, car.ownerId, freed); // 지원 회원이 타던 다른 차의 자리는 그 차 대기자에게
  await notifyNewCar(id, car.name); // 차량신청 중이면 차 없는 참석자에게 "새 차량"
  await askOwnerInfo(id, car); // 지원 회원이 있고 빈 칸이 있으면 채워 달라고
  return NextResponse.json({ id: row.id });
}
