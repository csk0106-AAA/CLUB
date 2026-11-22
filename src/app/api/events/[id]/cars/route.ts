import { NextResponse } from "next/server";
import { lockedFor } from "@/lib/event-visibility";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { eventVisible } from "@/lib/audience";
import { cancelRequest, carRequests, dropCar, leaveCar, markSeen, REQ_LABEL, requestSeat, setSelf, visibleRiders, waitClosed } from "@/lib/car-requests";
import { applyInput, autoName, carInput, carpoolState, cars, conflict, crewLabel, selfOf, missingInfo, seatOwner, DIR_LABEL, DIRS, driverLabel, driverSeat, legSeats, newCar, recruiting, requestsOpen, timeIssue, toRow, type Car } from "@/lib/carpool";
import { askOwnerInfo, notifyNewCar, runCarpoolDue } from "@/lib/car-auto";
import { addAlerts } from "@/lib/member-alerts";
import { isGuest } from "@/lib/member-kind";
import { pushTo } from "@/lib/push";
import { getPermGroups } from "@/lib/perms";
import { managedEventIds } from "@/lib/unread";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 회원 차량 배정: 참석 신청한 회원이 차량 목록을 보고 구간(갈 때·올 때)별로 신청·대기 등록·변경 요청·취소.
// 관리자가 "회원 신청 받기"를 켰을 때 신청할 수 있고, 확정되면 종 알림과 일정 화면(내 차량)에 보인다.
async function ctxOf(ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g;
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, members, applies] = await Promise.all([s.list("Events"), s.list("Members"), s.list("EventApplies")]);
  const me = members.find((m) => m.id === g.s.mid);
  const ev = events.find((e) => e.id === id && eventVisible(e, me ?? g.s.mid));
  if (!ev) return { err: bad("일정을 찾을 수 없어요.", 404) };
  const attending = applies.some((a) => a.eventId === id && a.memberId === g.s.mid && a.answer === "참석");
  return { g, id, members, attending };
}

export async function GET(_req: Request, ctx: Ctx) {
  const c = await ctxOf(ctx);
  if ("err" in c) return c.err;
  const { g, id, members, attending } = c;
  // 미응답·불참 회원에게 차량 배정이 닫혀 있으면 차량 목록을 보내지 않는다(lib/event-visibility.ts)
  const evRow = await (await getStore()).get("Events", id);
  const assignLocked = !!evRow && lockedFor(evRow, c.attending).includes("cars");
  await runCarpoolDue(); // 마감 시각이 지났으면 먼저 자동 처리
  const [all, reqs, state] = await Promise.all([cars(id), carRequests(id), carpoolState(id)]);
  const mine0 = all.find((x) => x.ownerId === g.s.mid);
  const nm = (mid: string) => members.find((m) => m.id === mid)?.name ?? "";
  const mine = reqs.filter((r) => r.memberId === g.s.mid && !["changed"].includes(r.status));
  return NextResponse.json({
    open: requestsOpen(state), // 차량신청 받는 중(관리자가 열었거나 차량 모집이 끝남)
    recruiting: recruiting(state), recruitUntil: state.recruitOn ? state.recruitUntil ?? "" : "", // 차량모집 중
    recruitFrom: state.recruitOn ? state.recruitFrom ?? "" : "", openFrom: state.open ? state.openFrom ?? "" : "", // 시작 시각(앞으로면 안내)
    // 내가 지원한 차량(수정·지원 취소용)
    myCar: mine0 ? { id: mine0.id, name: mine0.name, plate: mine0.plate, driverId: mine0.driverId, driverName: mine0.driverName, seats: mine0.seats, memo: mine0.memo,
      go: { on: mine0.go.on, from: mine0.go.from, departAt: mine0.go.departAt, to: mine0.go.to, arriveAt: mine0.go.arriveAt, riders: mine0.go.riders.length, seats: legSeats(mine0, "go"), memo: mine0.go.memo },
      missing: missingInfo(mine0), // 빈 칸(차량번호·출발지·출발 시간·도착지)
      back: { on: mine0.back.on, from: mine0.back.from, departAt: mine0.back.departAt, to: mine0.back.to, arriveAt: mine0.back.arriveAt, riders: mine0.back.riders.length, seats: legSeats(mine0, "back"), memo: mine0.back.memo } } : null,
    members: recruiting(state) ? members.filter((m) => !isGuest(m.kind)).map((m) => ({ id: m.id, name: m.name })) : [], // 운전자 검색(지원할 때)
    waitUntil: state.waitUntil ?? "", waitClosed: waitClosed(state.waitUntil),
    attending, // 참석 신청한 회원만 신청할 수 있다
    // 카풀 칸 단계: none(차량신청을 아직 정하지 않음) / open(신청 받는 중·시작 예정) / closed(마감, 확정 전) / confirmed(관리자 확정)
    //  open: 관리자가 차량신청을 켰거나(시작 예정 포함), 차량모집이 끝나 차량신청이 열렸을 때. 차량모집만 진행 중이면 none
    //  admin: 관리자배정(관리자가 배정 중) — 확정되면 confirmed
    phase: state.published ? "confirmed" : state.adminOnly ? "admin" : waitClosed(state.waitUntil) ? "closed" : (state.open || requestsOpen(state)) ? "open" : "none",
    adminOnly: !!state.adminOnly,
    recruitOn: !!state.recruitOn, // 차량모집을 켰는지(꺼져 있으면 "차량모집 지원" 칸을 숨긴다)
    published: !!state.published,
    // 내가 탈 차(구간별 그룹명): 탑승자로 배정됐거나, 내가 운전하거나, 내가 지원한 차
    myName: nm(g.s.mid), // 탑승자 명단에서 내 이름을 눈에 띄게
    // 구간별 내 역할: rider(탑승자 — 탑승 취소·바꾸기 가능) / driver(운전·지원) / self(개별 이동) / ""(배정 없음)
    myRole: Object.fromEntries(DIRS.map((d) => [d,
      selfOf(state, d).includes(g.s.mid) ? "self"
      : all.some((c) => c[d].on && ((c.kind !== "rental" && c.driverId === g.s.mid) || c.ownerId === g.s.mid)) ? "driver"
      : all.some((c) => c[d].on && c[d].riders.includes(g.s.mid)) ? "rider" : ""])),
    mySelf: { go: selfOf(state, "go").includes(g.s.mid), back: selfOf(state, "back").includes(g.s.mid) }, // 내가 개별 이동을 골랐는지
    myRide: Object.fromEntries(DIRS.map((d) => [d, selfOf(state, d).includes(g.s.mid) ? "개별 이동" : all.find((c) => c[d].on && (c[d].riders.includes(g.s.mid) || (c.kind !== "rental" && c.driverId === g.s.mid) || c.ownerId === g.s.mid))?.name ?? ""])),
    hasCarpool: all.length > 0 || !!state.recruitOn || !!state.open || !!state.published || !!state.adminOnly,
    cars: !assignLocked && (requestsOpen(state) || recruiting(state) || state.published || waitClosed(state.waitUntil)) ? all.map((car) => ({
      id: car.id, name: car.name, kind: car.kind, plate: car.plate, driver: driverLabel(car, nm), seats: car.seats, memo: car.memo, mine: car.ownerId === g.s.mid,
      crew: crewLabel(car, nm), // "지원 OOO(운전 OOO)" / "운전 OOO"
      legs: DIRS.filter((d) => car[d].on).map((d) => ({
        dir: d, label: DIR_LABEL[d], from: car[d].from, to: car[d].to, departAt: car[d].departAt, arriveAt: car[d].arriveAt,
        seats: legSeats(car, d), memo: car[d].memo, // 구간별 좌석·메모
        taken: car[d].riders.length + driverSeat(car), // 찬 자리(승인·확정 + 회원 차량은 운전자)
        waiting: reqs.filter((r) => r.carId === car.id && r.dir === d && r.status === "waiting").length,
        riders: visibleRiders(car, d, reqs).map(nm), // 확정된 탑승자만
        // 이 차에 배정된 모든 탑승자(ok: 확정, 아니면 배정됨·확정 전) — 차량별로 누가 타는지, 내가 어디 있는지 보여 준다
        seated: car[d].riders.map((m) => ({ name: nm(m), ok: reqs.length === 0 || reqs.some((r) => r.carId === car.id && r.dir === d && r.memberId === m && r.status === "confirmed") })),
        // 확정 명단: 운전자(회원) · 지원자 · 확정된 탑승자
        crewList: confirmedCrew(car, d, visibleRiders(car, d, reqs), nm),
      })),
    })) : [],
    // 내 신청(최근 것 먼저). 확정·반려·관리자 취소는 seen 이 false 면 새 알림
    mine: mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => ({
      id: r.id, carId: r.carId, dir: r.dir, status: r.status, label: REQ_LABEL[r.status], note: r.note, createdAt: r.createdAt, handledAt: r.handledAt, isNew: !r.seen,
      waitRank: r.status === "waiting" ? reqs.filter((x) => x.carId === r.carId && x.dir === r.dir && x.status === "waiting" && x.createdAt <= r.createdAt).length : 0,
    })),
  });
}

const body = z.object({
  action: z.enum(["request", "cancel", "seen", "offer", "offerUpdate", "offerCancel", "ask", "self", "leave"]),
  on: z.boolean().optional(), // self: 개별 이동 켜고 끄기
  note: z.string().trim().max(300).optional(), // ask: 관리자에게 보낼 변경·취소 요청 내용
  carId: z.string().optional(), dir: z.enum(["go", "back"]).optional(), reqId: z.string().optional(),
  car: carInput.optional(), // offer·offerUpdate: 차량 정보(운전자: 나 / 다른 회원 driverId / 회원 아닌 사람 driverName)
});

export async function POST(req: Request, ctx: Ctx) {
  const c = await ctxOf(ctx);
  if ("err" in c) return c.err;
  const { g, id, attending } = c;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const d = parsed.data;
  if (d.action === "seen") {
    await markSeen(id, g.s.mid);
    return NextResponse.json({ ok: true });
  }
  if (d.action === "cancel") {
    const why = await cancelRequest(id, g.s.mid, d.reqId ?? "");
    return why ? bad(why, 409) : NextResponse.json({ ok: true });
  }
  if (d.action === "offer" || d.action === "offerUpdate" || d.action === "offerCancel") return offer(id, g.s.mid, attending, d);
  // 마감 뒤 변경·취소: 관리자에게 요청(종 알림)
  if (d.action === "ask") {
    if (!d.note) return bad("바꾸고 싶은 내용을 적어 주세요.");
    const s = await getStore();
    const [members, events] = await Promise.all([s.list("Members"), s.list("Events")]);
    const groups = await getPermGroups();
    const managers = members.filter((m) => managedEventIds(m, events, groups).has(id)).map((m) => m.id).filter((x) => x !== g.s.mid);
    const me = members.find((m) => m.id === g.s.mid)?.name ?? "회원";
    const ev = events.find((e) => e.id === id);
    await addAlerts(managers, { eventId: id, text: `${me} 님 차량 변경·취소 요청(${ev?.name ?? "일정"}): ${d.note}`, href: `/admin/events/${id}?tab=car` });
    await pushTo(managers, "alerts", g.s.mid).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }
  // 탑승 취소: 배정된 차에서 내린다(마감·확정 뒤에도 회원이 직접). 확정된 배정이면 관리자에게 알린다.
  if (d.action === "leave") {
    if (!d.dir) return bad("구간을 골라 주세요.");
    const st = await carpoolState(id);
    const left = await leaveCar(id, g.s.mid, d.dir);
    if (!left) return bad("이 구간에 배정된 차량이 없어요.", 409);
    if (st.published || waitClosed(st.waitUntil)) await tellManagers(id, g.s.mid, `${DIR_LABEL[d.dir]} ${left} 탑승을 취소했어요`);
    return NextResponse.json({ ok: true });
  }
  if (!attending) return bad("참석 신청한 회원만 차량을 신청할 수 있어요.", 403);
  // 개별 이동: 회원이 직접 켜고 끈다. 켜는 것(차에서 내림)은 마감·확정 뒤에도 되고, 끄는 것(다시 차가 필요)은 마감 전에만.
  if (d.action === "self") {
    if (!d.dir || d.on === undefined) return bad("구간을 골라 주세요.");
    const st = await carpoolState(id);
    const closed = waitClosed(st.waitUntil);
    if (!d.on && closed) return bad("차량신청이 마감됐어요. 다시 차가 필요하면 “관리자에게 변경·취소 요청”을 눌러 주세요.", 409);
    if (!(st.open || requestsOpen(st) || st.published || closed || st.adminOnly)) return bad("지금은 차량신청을 받지 않아요.", 409);
    await setSelf(id, g.s.mid, d.dir, d.on);
    if (d.on && (st.published || closed)) await tellManagers(id, g.s.mid, `${DIR_LABEL[d.dir]} 개별 이동으로 바꿨어요`);
    return NextResponse.json({ ok: true });
  }
  if (!d.carId || !d.dir) return bad("차량과 구간을 골라 주세요.");
  const r = await requestSeat(id, g.s.mid, d.carId, d.dir);
  if ("error" in r) return bad(r.error, 409);
  return NextResponse.json({ ok: true, status: r.status });
}

// 차량모집 지원(회원이 자기 차를 등록): 모집 기간에만 등록, 차량신청 마감 전까지 수정·지원 취소.
// 회원 차량이고, 운전자는 나 / 다른 회원 / 회원 아닌 사람. 좌석은 운전자 포함. 등록·취소하면 관리자에게, 취소하면 탔던 사람에게 알림.
async function offer(eventId: string, mid: string, attending: boolean, d: z.infer<typeof body>) {
  const s = await getStore();
  const [state, all, members, events] = await Promise.all([carpoolState(eventId), cars(eventId), s.list("Members"), s.list("Events")]);
  const ev = events.find((e) => e.id === eventId);
  const nm = (x: string) => members.find((m) => m.id === x)?.name ?? "";
  const mineCar = all.find((c) => c.ownerId === mid);
  const href = `/events/${eventId}#cars`;
  const groups = await getPermGroups();
  const managers = members.filter((m) => managedEventIds(m, events, groups).has(eventId)).map((m) => m.id).filter((x) => x !== mid);
  if (waitClosed(state.waitUntil)) return bad("차량신청이 마감돼서 바꿀 수 없어요. 관리자에게 말씀해 주세요.", 409);

  if (d.action === "offerCancel") {
    if (!mineCar) return bad("지원한 차량이 없어요.", 404);
    await s.remove("Carpools", mineCar.id);
    // 탔던 분 + 대기하던 분(관리자가 직접 넣은 탑승자 포함)
    const riders = [...new Set([...mineCar.go.riders, ...mineCar.back.riders, ...(await dropCar(eventId, mineCar.id))])];
    await addAlerts(riders, { eventId, text: `${ev?.name ?? "일정"} ${mineCar.name} 차량모집 지원이 취소돼서 배정이 풀렸어요. 다른 차량을 신청해 주세요.`, href });
    await addAlerts(managers, { eventId, text: `${nm(mid)} 님이 ${ev?.name ?? "일정"} 차량모집 지원을 취소했어요(${mineCar.name}).`, href: `/admin/events/${eventId}?tab=car` });
    await pushTo(riders, "alerts").catch(() => undefined);
    return NextResponse.json({ ok: true });
  }
  if (!attending) return bad("참석 신청한 회원만 차량을 지원할 수 있어요.", 403);
  if (!d.car) return bad("차량 정보를 적어 주세요.");
  // 운전자: "__me__" = 지원한 회원 본인
  const input = { ...d.car, ownerId: undefined, kind: "member" as const, driverId: d.car.driverId === "__me__" ? mid : d.car.driverId };
  if (input.driverId && !members.some((m) => m.id === input.driverId)) return bad("명단에 없는 회원이에요.");
  const names = new Map(members.map((m) => [m.id, m.name]));

  if (d.action === "offer") {
    if (!recruiting(state)) return bad("지금은 차량모집 지원을 받지 않아요.", 409);
    if (mineCar) return bad("이미 지원한 차량이 있어요. 수정해 주세요.", 409);
    const car = applyInput({ ...newCar(), ownerId: mid }, { ...input, go: { ...input.go, riders: [] }, back: { ...input.back, riders: [] } });
    if (!car.driverId && !car.driverName.trim()) return bad("운전자를 정해 주세요.");
    await seatOwner(all, car);
    if (!car.name) car.name = autoName(car, all, (x) => names.get(x) ?? "");
    const why = timeIssue(car) ?? conflict(all, car, names);
    if (why) return bad(why, 409);
    await s.insert("Carpools", { eventId, ...toRow(car) });
    await notifyNewCar(eventId, car.name, mid); // 차량신청이 먼저 열렸으면 차 없는 참석자에게 "새 차량"
    await askOwnerInfo(eventId, car); // 빈 칸이 있으면 채워 달라고
    await addAlerts(managers, { eventId, text: `${nm(mid)} 님이 ${ev?.name ?? "일정"} 차량을 지원했어요(${car.name}, ${(["go", "back"] as const).filter((x) => car[x].on).map((x) => `${DIR_LABEL[x]} ${legSeats(car, x)}석`).join(" · ")}).`, href: `/admin/events/${eventId}?tab=car` });
    return NextResponse.json({ ok: true });
  }
  // offerUpdate: 탑승자는 그대로 두고 차량 정보만
  if (!mineCar) return bad("지원한 차량이 없어요.", 404);
  const next = applyInput(mineCar, { ...input, go: input.go ? { ...input.go, riders: undefined } : undefined, back: input.back ? { ...input.back, riders: undefined } : undefined });
  if (!next.driverId && !next.driverName.trim()) return bad("운전자를 정해 주세요.");
  await seatOwner(all.filter((c) => c.id !== mineCar.id), next);
  if (!next.name) next.name = autoName(next, all, (x) => names.get(x) ?? "");
  const why = timeIssue(next) ?? conflict(all, next, names);
  if (why) return bad(why, 409);
  await s.update("Carpools", mineCar.id, toRow(next));
  return NextResponse.json({ ok: true });
}

// 확정 명단(구간): 운전자(회원) · 지원자(운전하지 않으면) · 확정된 탑승자 — 이름 뒤에 역할
function confirmedCrew(car: Car, d: "go" | "back", confirmed: string[], nm: (id: string) => string): string[] {
  const out: string[] = [];
  const drv = driverLabel(car, nm);
  if (drv) out.push(`${drv}(운전)`);
  if (car.ownerId && car.ownerId !== car.driverId) out.push(`${nm(car.ownerId)}(지원)`);
  for (const m of confirmed) if (m !== car.ownerId && m !== car.driverId) out.push(nm(m));
  return out;
}


// 확정·마감 뒤 회원이 직접 바꾼 차량 이동을 일정 관리자에게 알린다
async function tellManagers(eventId: string, mid: string, what: string) {
  const s = await getStore();
  const [members, events] = await Promise.all([s.list("Members"), s.list("Events")]);
  const groups = await getPermGroups();
  const managers = members.filter((m) => managedEventIds(m, events, groups).has(eventId)).map((m) => m.id).filter((x) => x !== mid);
  const me = members.find((m) => m.id === mid)?.name ?? "회원";
  const ev = events.find((e) => e.id === eventId);
  await addAlerts(managers, { eventId, text: `${me} 님이 ${what}(${ev?.name ?? "일정"}).`, href: `/admin/events/${eventId}?tab=car` });
  await pushTo(managers, "alerts", mid).catch(() => undefined);
}
