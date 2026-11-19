import { cars, carpoolState, requestsOpen, riderCap, saveCarpoolState, selfOf, toRow, type Car, type Dir } from "./carpool";
import { addAlerts } from "./member-alerts";
import { kstTime } from "./kst-time";
import { getStore } from "./store";
import type { Row } from "./store/types";

// 차량 배정 신청(회원) — 표 CarRequests. 구간(갈 때 go / 올 때 back)마다 따로 신청한다.
// 관리자 승인 없이: 자리가 있으면 바로 그 차에 들어가고(approved = 확정 전), 정원이 차면 대기.
// 자리가 나면 대기 1번이 자동으로 들어간다. 마감 시각에는 신청만 닫히고(lib/car-auto.ts),
// 최종 확정은 관리자 화면 "확정(알림)"으로만 한다.
//  pending   : 승인 대기(관리자가 승인하면 그 차 탑승자로 들어간다)
//  approved  : 승인됨(탑승자에 들어감, 확정 전 — 회원에게는 아직 안 보임)
//  confirmed : 확정(관리자가 "확정"을 누름 → 회원에게 종 알림·일정 화면에 보임)
//  waiting   : 대기(정원이 차서 기다림. 자리가 나면 먼저 대기한 사람부터 pending 으로 올라간다. 대기 기한이 지나면 올라가지 않는다)
//  rejected  : 반려 · canceled : 취소(회원이 취소하거나 관리자가 탑승자에서 뺌) · changed : 다른 차로 바꿔 끝난 신청
// 변경 요청: 이미 탄 차가 있는데 다른 차를 신청하면 fromCarId 를 남기고, 승인되면 원래 차에서 빠진다(최초 신청과 같은 과정).
export type CarReqStatus = "pending" | "approved" | "confirmed" | "waiting" | "rejected" | "canceled" | "changed";
export type CarReq = {
  id: string; eventId: string; carId: string; memberId: string; dir: Dir; status: CarReqStatus;
  createdAt: string; handledAt: string; fromCarId: string; seen: boolean; note: string;
};
export const REQ_LABEL: Record<CarReqStatus, string> = {
  pending: "승인 대기", approved: "배정(확정 전)", confirmed: "확정", waiting: "신청 대기", rejected: "반려", canceled: "취소", changed: "변경됨",
};

export const toReq = (r: Row): CarReq => ({
  id: r.id, eventId: r.eventId, carId: r.carId, memberId: r.memberId, dir: r.dir === "back" ? "back" : "go",
  status: (r.status as CarReqStatus) || "pending", createdAt: r.createdAt ?? "", handledAt: r.handledAt ?? "",
  fromCarId: r.fromCarId ?? "", seen: r.seen === "true", note: r.note ?? "",
});

export async function carRequests(eventId: string): Promise<CarReq[]> {
  return (await (await getStore()).list("CarRequests")).filter((r) => r.eventId === eventId).map(toReq);
}

const now = () => new Date().toISOString();
const OPEN: CarReqStatus[] = ["pending", "waiting"];
const SEATED: CarReqStatus[] = ["approved", "confirmed"];
// 대기 기한이 지났는지
export const waitClosed = (waitUntil?: string) => !!waitUntil && Date.now() > kstTime(waitUntil);
// 이 차·구간에 남은 자리(탑승자 수 기준) 중 승인 대기 중인 신청을 뺀 수
const openSeats = (car: Car, dir: Dir, reqs: CarReq[]) =>
  riderCap(car, dir) - car[dir].riders.length - reqs.filter((r) => r.carId === car.id && r.dir === dir && r.status === "pending").length;
// 이 차의 운전자(회원)·지원자 — 탑승 알림을 받는 사람
export const carOwners = (car: Car): string[] => [...new Set([car.kind !== "rental" ? car.driverId : "", car.ownerId].filter(Boolean))];
const evHref = (eventId: string) => `/events/${eventId}#cars`;

async function setStatus(id: string, patch: Partial<Record<keyof CarReq, string>>) {
  await (await getStore()).update("CarRequests", id, { ...patch, handledAt: now() });
}

// 회원 신청(또는 변경 요청). 자리가 있으면 승인 대기, 없으면 대기(기한 안에서만).
export async function requestSeat(eventId: string, mid: string, carId: string, dir: Dir): Promise<{ status: CarReqStatus } | { error: string }> {
  const [all, reqs, state] = await Promise.all([cars(eventId), carRequests(eventId), carpoolState(eventId)]);
  if (waitClosed(state.waitUntil)) return { error: "차량신청이 마감됐어요. 차량 변경·취소는 “관리자에게 변경·취소 요청”을 눌러 주세요." };
  if (!requestsOpen(state)) return { error: "지금은 차량신청을 받지 않아요." };
  const car = all.find((c) => c.id === carId);
  if (!car || !car[dir].on) return { error: "이 차량은 이 구간을 운행하지 않아요." };
  if (car.kind === "member" && car.driverId === mid) return { error: "내가 운전하는 차예요." };
  if (car[dir].riders.includes(mid)) return { error: "이미 이 차에 타요." };
  // 이 구간에 대기 중인 다른 차가 있으면 그 대기는 취소하고 새 차로 신청한다(대기하지 않고 차를 바꾸기)
  for (const w of reqs.filter((r) => r.memberId === mid && r.dir === dir && OPEN.includes(r.status) && r.carId !== carId)) {
    await setStatus(w.id, { status: "canceled", note: "다른 차로 바꿨어요" });
  }
  if (reqs.some((r) => r.memberId === mid && r.dir === dir && OPEN.includes(r.status) && r.carId === carId)) return { error: "이 차에 이미 대기 중이에요." };
  const from = all.find((c) => c.id !== carId && c[dir].on && (c[dir].riders.includes(mid) || (c.kind === "member" && c.driverId === mid)));
  if (from && from.kind === "member" && from.driverId === mid) return { error: "다른 차를 운전하고 있어요." };
  const s = await getStore();
  // 개별 이동을 골랐던 회원이 차를 신청하면 개별 이동에서 뺀다
  if (selfOf(state, dir).includes(mid)) await saveCarpoolState(eventId, dir === "go" ? { selfGo: selfOf(state, dir).filter((x) => x !== mid) } : { selfBack: selfOf(state, dir).filter((x) => x !== mid) });
  const seat = openSeats(car, dir, reqs) > 0;
  const status: CarReqStatus = seat ? "approved" : "waiting";
  const row = await s.insert("CarRequests", {
    eventId, carId, memberId: mid, dir, status, createdAt: now(), handledAt: seat ? now() : "", fromCarId: from?.id ?? "", seen: "true", note: "",
  });
  if (seat) await seatIn(eventId, row.id);
  return { status };
}

// 회원이 자기 신청(승인 대기·대기)을 취소
export async function cancelRequest(eventId: string, mid: string, reqId: string): Promise<string | null> {
  const [reqs0, state] = await Promise.all([carRequests(eventId), carpoolState(eventId)]);
  const r = reqs0.find((x) => x.id === reqId && x.memberId === mid);
  if (waitClosed(state.waitUntil)) return "차량신청이 마감돼서 직접 취소할 수 없어요. “관리자에게 변경·취소 요청”을 눌러 주세요.";
  if (!r || !(OPEN.includes(r.status) || SEATED.includes(r.status))) return "취소할 수 있는 신청이 없어요.";
  await setStatus(r.id, { status: "canceled" });
  if (SEATED.includes(r.status)) {
    const car = (await cars(eventId)).find((c) => c.id === r.carId);
    if (car) {
      car[r.dir].riders = car[r.dir].riders.filter((x) => x !== mid);
      await (await getStore()).update("Carpools", car.id, toRow(car));
      const name = (await (await getStore()).list("Members")).find((m) => m.id === mid)?.name ?? "회원";
      await addAlerts(carOwners(car).filter((x) => x !== mid), { eventId, text: `${name} 님이 내 차(${car.name}) ${r.dir === "go" ? "갈 때" : "올 때"} 탑승을 취소했어요.`, href: evHref(eventId) });
    }
    await promote(eventId, r.carId, r.dir);
  }
  return null;
}

// 자리가 나면 먼저 대기한 사람부터 승인 대기로(대기 기한이 지났으면 올리지 않는다)
export async function promote(eventId: string, carId: string, dir: Dir): Promise<number> {
  const [all, reqs, state] = await Promise.all([cars(eventId), carRequests(eventId), carpoolState(eventId)]);
  const car = all.find((c) => c.id === carId);
  if (!car || waitClosed(state.waitUntil)) return 0;
  let room = openSeats(car, dir, reqs);
  let n = 0;
  for (const w of reqs.filter((r) => r.carId === carId && r.dir === dir && r.status === "waiting").sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (room <= 0) break;
    if (await seatIn(eventId, w.id)) {
      await addAlerts([w.memberId], { eventId, text: `자리가 나서 ${car.name} ${dir === "go" ? "갈 때" : "올 때"} 차량에 배정됐어요(확정 전).`, href: evHref(eventId) });
      room--;
      n++;
    }
  }
  return n;
}

// 신청 한 건을 그 차 탑승자로 넣는다(같은 구간의 다른 차에 탔으면 거기서 빼고 — 변경 요청). 운전자·지원자에게 알림.
async function seatIn(eventId: string, reqId: string): Promise<boolean> {
  const s = await getStore();
  const [all, reqs] = await Promise.all([cars(eventId), carRequests(eventId)]);
  const r = reqs.find((x) => x.id === reqId);
  const car = r && all.find((c) => c.id === r.carId);
  if (!r || !car || !car[r.dir].on || car[r.dir].riders.length >= riderCap(car, r.dir)) return false;
  for (const o of all.filter((c) => c.id !== car.id && c[r.dir].riders.includes(r.memberId))) {
    o[r.dir].riders = o[r.dir].riders.filter((x) => x !== r.memberId);
    await s.update("Carpools", o.id, toRow(o));
    for (const old of reqs.filter((x) => x.carId === o.id && x.dir === r.dir && x.memberId === r.memberId && SEATED.includes(x.status))) await setStatus(old.id, { status: "changed" });
  }
  if (!car[r.dir].riders.includes(r.memberId)) car[r.dir].riders = [...car[r.dir].riders, r.memberId];
  await s.update("Carpools", car.id, toRow(car));
  await setStatus(r.id, { status: "approved" });
  const members = await s.list("Members");
  const name = members.find((m) => m.id === r.memberId)?.name ?? "회원";
  await addAlerts(carOwners(car).filter((x) => x !== r.memberId), { eventId, text: `${name} 님이 내 차(${car.name}) ${r.dir === "go" ? "갈 때" : "올 때"}에 탑승 신청했어요.`, href: evHref(eventId) });
  return true;
}

// 관리자 승인: 탑승자로 넣는다(변경 요청이면 원래 차에서 뺀다). 확정은 따로("확정" 버튼).
export async function approve(eventId: string, reqId: string): Promise<string | null> {
  const s = await getStore();
  const [all, reqs] = await Promise.all([cars(eventId), carRequests(eventId)]);
  const r = reqs.find((x) => x.id === reqId);
  if (!r || r.status !== "pending") return "승인할 수 있는 신청이 아니에요.";
  const car = all.find((c) => c.id === r.carId);
  if (!car || !car[r.dir].on) return "차량을 찾을 수 없어요.";
  if (car[r.dir].riders.length >= riderCap(car, r.dir)) return `${car.name}은(는) 자리가 없어요. 탑승자를 빼거나 좌석을 늘린 뒤 승인해 주세요.`;
  // 같은 구간의 다른 차에서 빼기(변경 요청)
  for (const o of all.filter((c) => c.id !== car.id && c[r.dir].riders.includes(r.memberId))) {
    o[r.dir].riders = o[r.dir].riders.filter((x) => x !== r.memberId);
    await s.update("Carpools", o.id, toRow(o));
    for (const old of reqs.filter((x) => x.carId === o.id && x.dir === r.dir && x.memberId === r.memberId && SEATED.includes(x.status))) await setStatus(old.id, { status: "changed" });
    await promote(eventId, o.id, r.dir);
  }
  car[r.dir].riders = [...car[r.dir].riders, r.memberId];
  await s.update("Carpools", car.id, toRow(car));
  await setStatus(r.id, { status: "approved" });
  return null;
}

export async function reject(eventId: string, reqId: string, note = ""): Promise<string | null> {
  const r = (await carRequests(eventId)).find((x) => x.id === reqId);
  if (!r || !OPEN.includes(r.status)) return "반려할 수 있는 신청이 아니에요.";
  await setStatus(r.id, { status: "rejected", seen: "false", note });
  if (r.status === "pending") await promote(eventId, r.carId, r.dir);
  return null;
}

// 관리자가 차량 카드에서 탑승자를 뺐을 때: 그 사람의 승인·확정 신청을 취소로, 빈자리에 대기자를 올린다
export async function syncRemoved(eventId: string, before: Car, after: Car): Promise<void> {
  const reqs = await carRequests(eventId);
  for (const dir of ["go", "back"] as Dir[]) {
    const gone = before[dir].riders.filter((m) => !after[dir].on || !after[dir].riders.includes(m));
    for (const m of gone) {
      const had = reqs.filter((x) => x.carId === before.id && x.dir === dir && x.memberId === m && SEATED.includes(x.status));
      for (const r of had) await setStatus(r.id, { status: "canceled", note: "관리자가 탑승자에서 뺐어요" });
      // 다른 차로 옮긴 경우(같은 구간에 다시 들어감)는 알리지 않고 확정 때 새 차로 알린다
      const moved = (await cars(eventId)).some((c) => c.id !== before.id && c[dir].riders.includes(m));
      if (had.some((r) => r.status === "confirmed") && !moved) {
        await addAlerts([m], { eventId, text: `관리자가 ${before.name} ${dir === "go" ? "갈 때" : "올 때"} 배정을 풀었어요. 차량을 다시 확인해 주세요.`, href: evHref(eventId) });
      }
    }
    if (gone.length || (after[dir].seats || after.seats) > (before[dir].seats || before.seats)) await promote(eventId, before.id, dir);
  }
}

// 차량을 지우면 그 차의 신청을 모두 취소
export async function dropCar(eventId: string, carId: string): Promise<string[]> {
  const hit = (await carRequests(eventId)).filter((x) => x.carId === carId && !["rejected", "canceled", "changed"].includes(x.status));
  for (const r of hit) await setStatus(r.id, { status: "canceled", note: "차량이 없어졌어요" });
  return [...new Set(hit.map((r) => r.memberId))];
}

// 확정: 승인된 신청을 확정으로(회원에게 종 알림). 관리자가 직접 넣은 탑승자도 확정 기록을 만든다. 알릴 회원 id 를 돌려준다.
export async function confirmAll(eventId: string): Promise<string[]> {
  const s = await getStore();
  const [all, reqs] = await Promise.all([cars(eventId), carRequests(eventId)]);
  const told = new Set<string>();
  for (const r of reqs.filter((x) => x.status === "approved")) {
    await setStatus(r.id, { status: "confirmed", seen: "false" });
    told.add(r.memberId);
  }
  for (const c of all) {
    for (const dir of ["go", "back"] as Dir[]) {
      if (!c[dir].on) continue;
      for (const m of c[dir].riders) {
        if (reqs.some((x) => x.carId === c.id && x.dir === dir && x.memberId === m && SEATED.includes(x.status))) continue;
        await s.insert("CarRequests", { eventId, carId: c.id, memberId: m, dir, status: "confirmed", createdAt: now(), handledAt: now(), fromCarId: "", seen: "false", note: "관리자 배정" });
        told.add(m);
      }
    }
  }
  return [...told];
}

// 회원에게 보일 탑승자: 확정된 사람만(신청 기록이 하나도 없는 예전 배정은 모두)
export function visibleRiders(car: Car, dir: Dir, reqs: CarReq[]): string[] {
  if (reqs.length === 0) return car[dir].riders;
  return car[dir].riders.filter((m) => reqs.some((r) => r.carId === car.id && r.dir === dir && r.memberId === m && r.status === "confirmed"));
}

// 종 알림: 회원 — 아직 안 본 확정·반려·관리자 취소 / 관리자 — 처리할 승인 대기
export const unseenFor = (rows: Row[], mid: string) =>
  rows.filter((r) => r.memberId === mid && r.seen === "false" && ["confirmed", "rejected", "canceled"].includes(r.status));
export const pendingIn = (rows: Row[], eventIds: Set<string>) => rows.filter((r) => r.status === "pending" && eventIds.has(r.eventId));

export async function markSeen(eventId: string, mid: string): Promise<void> {
  const s = await getStore();
  for (const r of (await s.list("CarRequests")).filter((x) => x.eventId === eventId && x.memberId === mid && x.seen === "false")) await s.update("CarRequests", r.id, { seen: "true" });
}

// 개별 이동 켜기: 그 구간에 탄 차가 있으면 빼고(자리는 대기자에게), 신청 대기도 취소. 끄기: 개별 이동에서만 뺀다(배정 대기로).
export async function setSelf(eventId: string, mid: string, dir: Dir, on: boolean): Promise<void> {
  const st = await carpoolState(eventId);
  const cur = selfOf(st, dir).filter((x) => x !== mid);
  const next = on ? [...cur, mid] : cur;
  await saveCarpoolState(eventId, dir === "go" ? { selfGo: next } : { selfBack: next });
  if (!on) return;
  const s = await getStore();
  const reqs = await carRequests(eventId);
  for (const r of reqs.filter((x) => x.memberId === mid && x.dir === dir && (OPEN.includes(x.status) || SEATED.includes(x.status)))) {
    await setStatus(r.id, { status: "canceled", note: "개별 이동으로 바꿨어요" });
  }
  for (const car of (await cars(eventId)).filter((c) => c[dir].riders.includes(mid))) {
    car[dir].riders = car[dir].riders.filter((x) => x !== mid);
    await s.update("Carpools", car.id, toRow(car));
    await promote(eventId, car.id, dir);
  }
}
