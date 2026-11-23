import { addSelf, cars, carpoolState, removeSelf, requestsOpen, riderCap, selfOf, toCar, toRow, type Car, type Dir } from "./carpool";
import { addAlerts } from "./member-alerts";
import { pushTo } from "./push";
import { kstTime } from "./kst-time";
import { getStore } from "./store";
import type { Row } from "./store/types";

// 차량 배정 신청(회원) — 표 CarRequests. 구간(갈 때 go / 올 때 back)마다 따로 신청한다.
// 관리자 승인 없이: 자리가 있으면 바로 그 차에 들어가고(approved = 확정 전), 정원이 차면 대기.
// 자리가 나면 대기 1번이 자동으로 들어간다. 신청 마감 시각이 되면 그때의 배정으로 자동 마감된다(lib/car-auto.ts).
// 관리자배정이면 관리자 화면 "배정 완료 (알림)"으로 안내한다.
//  pending   : 승인 대기(예전 방식 — 관리자가 승인하면 그 차 탑승자로 들어간다)
//  approved  : 배정됨(탑승자에 들어감, 확정 전 — 회원에게는 아직 안 보임)
//  confirmed : 확정(마감 또는 "배정 완료 (알림)" → 회원에게 종 알림·일정 화면에 보임)
//  waiting   : 대기(정원이 차서 기다림. 자리가 나면 먼저 대기한 사람부터 배정된다. 대기 기한이 지나면 올라가지 않는다)
//  rejected  : 반려 · canceled : 취소(회원이 취소하거나 관리자가 탑승자에서 뺌) · changed : 다른 차로 바꿔 끝난 신청
// 변경 요청: 이미 탄 차가 있는데 다른 차를 신청하면 fromCarId 를 남기고, 배정되면 원래 차에서 빠진다(최초 신청과 같은 과정).
// 자리 잡기는 "신청을 대기로 먼저 남기고 → 자리를 잡은 뒤(지금 값으로 다시 읽어 확인) → 배정됨으로" 순서로 한다.
// 저장소에 트랜잭션이 없어 동시에 저장하면 한쪽 탑승자가 빠질 수 있으므로, 저장 뒤 다시 읽어 빠진 사람을 되살린다(repair).
export type CarReqStatus = "pending" | "approved" | "confirmed" | "waiting" | "rejected" | "canceled" | "changed";
export type CarReq = {
  id: string; eventId: string; carId: string; memberId: string; dir: Dir; status: CarReqStatus;
  createdAt: string; handledAt: string; fromCarId: string; seen: boolean; note: string;
};
export const REQ_LABEL: Record<CarReqStatus, string> = {
  pending: "승인 대기", approved: "배정됨", confirmed: "배정됨", waiting: "신청 대기", rejected: "반려", canceled: "취소", changed: "변경됨",
};

export const toReq = (r: Row): CarReq => ({
  id: r.id, eventId: r.eventId, carId: r.carId, memberId: r.memberId, dir: r.dir === "back" ? "back" : "go",
  status: (r.status as CarReqStatus) || "pending", createdAt: r.createdAt ?? "", handledAt: r.handledAt ?? "",
  fromCarId: r.fromCarId ?? "", seen: r.seen === "true", note: r.note ?? "",
});

export async function carRequests(eventId: string): Promise<CarReq[]> {
  return (await (await getStore()).list("CarRequests")).filter((r) => r.eventId === eventId).map(toReq);
}

// 지금 DB 값으로 읽기(저장소의 2초 목록 캐시를 거치지 않는다).
//  (lib/store ListOpts.fresh)
const fresh = (eventId: string) => ({ where: { field: "eventId", in: [eventId] }, fresh: true });
// 예전 형식 행(goOn/backOn 이 없음)은 구간 열만 고치면 안 되므로 통째로 저장한다
type LiveCar = Car & { legacy: boolean };
const known = (v?: string) => v === "true" || v === "false";
const liveCar = (r: Row): LiveCar => ({ ...toCar(r), legacy: !known(r.goOn) && !known(r.backOn) });
async function freshCars(eventId: string): Promise<LiveCar[]> {
  return (await (await getStore()).list("Carpools", fresh(eventId))).map(liveCar);
}
async function freshCar(eventId: string, carId: string): Promise<LiveCar | null> {
  const r = await (await getStore()).get("Carpools", carId);
  return r && r.eventId === eventId ? liveCar(r) : null;
}
async function freshReqs(eventId: string): Promise<CarReq[]> {
  return (await (await getStore()).list("CarRequests", fresh(eventId))).map(toReq);
}
async function freshReq(id: string): Promise<CarReq | null> {
  const r = await (await getStore()).get("CarRequests", id);
  return r ? toReq(r) : null;
}
// 한 구간의 탑승자 명단만 저장(다른 구간·차량 정보는 건드리지 않아, 동시에 고친 내용을 덜 덮어쓴다)
async function saveRiders(car: LiveCar, dir: Dir): Promise<void> {
  const patch = car.legacy ? toRow(car) : { [dir === "go" ? "riders" : "backRiders"]: JSON.stringify(car[dir].riders) };
  await (await getStore()).update("Carpools", car.id, patch);
  car.legacy = false;
}

const now = () => new Date().toISOString();
const OPEN: CarReqStatus[] = ["pending", "waiting"];
const SEATED: CarReqStatus[] = ["approved", "confirmed"];
const LEG = (dir: Dir) => (dir === "go" ? "갈 때" : "올 때");
// 대기 기한이 지났는지
export const waitClosed = (waitUntil?: string) => !!waitUntil && Date.now() > kstTime(waitUntil);
// 이 차·구간에 남은 자리(탑승자 수 기준) 중 승인 대기 중인 다른 신청을 뺀 수
const openSeats = (car: Car, dir: Dir, reqs: CarReq[], exceptId = "") =>
  riderCap(car, dir) - car[dir].riders.length - reqs.filter((r) => r.carId === car.id && r.dir === dir && r.status === "pending" && r.id !== exceptId).length;
// 이 차의 운전자(회원)·지원자 — 탑승 알림을 받는 사람
export const carOwners = (car: Car): string[] => [...new Set([car.kind !== "rental" ? car.driverId : "", car.ownerId].filter(Boolean))];
const evHref = (eventId: string) => `/events/${eventId}#cars`;
// 이 구간에 운전하거나 지원한 차가 있는지(탑승자 명단에 없어도 차가 있는 사람)
const drivesIn = (all: Car[], dir: Dir, mid: string) => all.some((c) => c[dir].on && ((c.kind !== "rental" && c.driverId === mid) || c.ownerId === mid));

async function setStatus(id: string, patch: Partial<Record<keyof CarReq, string>>) {
  await (await getStore()).update("CarRequests", id, { ...patch, handledAt: now() });
}

// 회원 신청(또는 변경 요청). 신청을 대기로 먼저 남기고, 자리가 있으면(앞에 대기한 사람부터) 그 자리를 잡아 배정됨으로 바꾼다.
// 그사이 자리가 차면 대기로 남고 message 로 알려 준다.
export async function requestSeat(eventId: string, mid: string, carId: string, dir: Dir): Promise<{ status: CarReqStatus; message?: string } | { error: string }> {
  const [all, reqs, state] = await Promise.all([freshCars(eventId), freshReqs(eventId), carpoolState(eventId)]);
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
  if (selfOf(state, dir).includes(mid)) await removeSelf(eventId, dir, [mid]);
  const looked = openSeats(car, dir, reqs) > 0; // 읽었을 때 자리가 있어 보였는지
  const row = await s.insert("CarRequests", {
    eventId, carId, memberId: mid, dir, status: "waiting", createdAt: now(), handledAt: "", fromCarId: from?.id ?? "", seen: "true", note: "",
  });
  // 자리가 있으면 먼저 대기한 사람부터 배정(내 신청도 차례가 되면 여기서 배정된다. 나에게는 따로 알리지 않는다)
  await promote(eventId, carId, dir, row.id);
  const after = await freshReq(row.id);
  if (after && SEATED.includes(after.status)) return { status: "approved" };
  if (after && after.status !== "waiting") return { status: after.status };
  return {
    status: "waiting",
    message: looked ? "그사이 자리가 다 차서 신청 대기로 받았어요. 자리가 나면 자동으로 배정하고 알려 드릴게요." : "정원이 차서 신청 대기로 받았어요. 자리가 나면 자동으로 배정하고 알려 드릴게요.",
  };
}

// 회원이 자기 신청(승인 대기·대기·배정)을 취소
export async function cancelRequest(eventId: string, mid: string, reqId: string): Promise<string | null> {
  const [r, state] = await Promise.all([freshReq(reqId), carpoolState(eventId)]);
  if (waitClosed(state.waitUntil)) return "차량신청이 마감돼서 직접 취소할 수 없어요. “관리자에게 변경·취소 요청”을 눌러 주세요.";
  if (!r || r.eventId !== eventId || r.memberId !== mid || !(OPEN.includes(r.status) || SEATED.includes(r.status))) return "취소할 수 있는 신청이 없어요.";
  await setStatus(r.id, { status: "canceled" });
  if (SEATED.includes(r.status)) {
    const car = await freshCar(eventId, r.carId);
    if (car && car[r.dir].riders.includes(mid)) {
      car[r.dir].riders = car[r.dir].riders.filter((x) => x !== mid);
      await saveRiders(car, r.dir);
      const name = (await (await getStore()).list("Members")).find((m) => m.id === mid)?.name ?? "회원";
      await addAlerts(carOwners(car).filter((x) => x !== mid), { eventId, text: `${name} 님이 내 차(${car.name}) ${LEG(r.dir)} 탑승을 취소했어요.`, href: evHref(eventId) });
    }
    await promote(eventId, r.carId, r.dir);
  }
  return null;
}

// 자리가 나면 먼저 대기한 사람부터 배정하고 그 회원에게 알린다(대기 기한이 지났으면 올리지 않는다).
// quietId: 알리지 않을 신청(방금 신청한 본인 — 화면에서 바로 결과를 본다). 끝에 빠진 탑승자를 되살린다.
export async function promote(eventId: string, carId: string, dir: Dir, quietId = ""): Promise<number> {
  const [car, reqs, state] = await Promise.all([freshCar(eventId, carId), freshReqs(eventId), carpoolState(eventId)]);
  if (!car) return 0;
  let n = 0;
  if (!waitClosed(state.waitUntil)) {
    for (const w of reqs.filter((r) => r.carId === carId && r.dir === dir && r.status === "waiting").sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const got = await seatIn(eventId, w.id);
      if (got === "full") break; // 자리가 없으면 그만
      if (got !== "ok") continue; // 그사이 취소된 신청 등은 건너뛴다
      n++;
      if (w.id === quietId) continue;
      await addAlerts([w.memberId], { eventId, text: `자리가 나서 ${car.name} ${LEG(dir)} 차량에 배정됐어요(확정 전).`, href: evHref(eventId) });
      await pushTo([w.memberId], "alerts").catch(() => undefined);
    }
  }
  await repair(eventId, carId, dir);
  return n;
}

// 신청 한 건을 그 차 탑승자로 넣는다. 자리를 먼저 잡고(지금 값으로 다시 읽어 확인) 정말 들어갔을 때만 배정됨으로 바꾼다.
// 같은 구간의 다른 차에 탔으면 거기서 빼고(변경 요청) 그 차의 대기자를 올린다. 운전자·지원자에게 알림.
// 돌려주는 값: ok(배정됨) · had(이미 그 차에 있음 — 동시에 다른 처리가 넣음, 알림 없이 배정됨으로만) · full(자리 없음) · skip(대기·승인 대기 신청이 아니거나 차가 없음)
async function seatIn(eventId: string, reqId: string): Promise<"ok" | "had" | "full" | "skip"> {
  const r = await freshReq(reqId);
  if (!r || r.eventId !== eventId || !OPEN.includes(r.status)) return "skip";
  const took = await takeSeat(eventId, r);
  if (took === "had") { await setStatus(r.id, { status: "approved" }); return "had"; }
  if (took !== "ok") return took;
  const [all, reqs] = await Promise.all([freshCars(eventId), freshReqs(eventId)]);
  const car = all.find((c) => c.id === r.carId);
  const freed: string[] = [];
  for (const o of all.filter((c) => c.id !== r.carId && c[r.dir].riders.includes(r.memberId))) {
    o[r.dir].riders = o[r.dir].riders.filter((x) => x !== r.memberId);
    await saveRiders(o, r.dir);
    for (const old of reqs.filter((x) => x.carId === o.id && x.dir === r.dir && x.memberId === r.memberId && SEATED.includes(x.status))) await setStatus(old.id, { status: "changed" });
    freed.push(o.id);
  }
  await setStatus(r.id, { status: "approved" });
  if (car) {
    const name = (await (await getStore()).list("Members")).find((m) => m.id === r.memberId)?.name ?? "회원";
    await addAlerts(carOwners(car).filter((x) => x !== r.memberId), { eventId, text: `${name} 님이 내 차(${car.name}) ${LEG(r.dir)}에 탑승 신청했어요.`, href: evHref(eventId) });
  }
  for (const id of freed) await promote(eventId, id, r.dir); // 원래 차에 난 자리는 그 차 대기자에게
  return "ok";
}

// 자리 잡기: 지금 값으로 차를 읽어 빈자리가 있으면 넣고, 다시 읽어 정말 들어갔는지 확인한다.
//  동시에 다른 사람이 저장해 내가 빠졌으면 자리가 남아 있는 동안 다시 넣는다(몇 번만).
async function takeSeat(eventId: string, r: CarReq): Promise<"ok" | "had" | "full" | "skip"> {
  const reqs = await freshReqs(eventId);
  for (let i = 0; i < 3; i++) {
    const car = await freshCar(eventId, r.carId);
    if (!car || !car[r.dir].on) return "skip";
    if (car[r.dir].riders.includes(r.memberId)) return i === 0 ? "had" : "ok";
    if (openSeats(car, r.dir, reqs, r.id) <= 0) return "full";
    car[r.dir].riders = [...car[r.dir].riders, r.memberId];
    await saveRiders(car, r.dir);
    const check = await freshCar(eventId, r.carId);
    if (check?.[r.dir].riders.includes(r.memberId)) return "ok";
  }
  return "full";
}

// 빠진 탑승자 되살리기: 동시에 저장하다 명단이 덮어써져, 배정됨·확정 신청이 있는데 어느 차에도 없는 사람.
//  최근(2분 안) 처리된 신청만 본다(예전 기록을 건드리지 않게). 자리가 있으면 다시 넣고, 없으면 대기로 돌리고 알린다.
async function repair(eventId: string, carId: string, dir: Dir): Promise<void> {
  const [all, reqs] = await Promise.all([freshCars(eventId), freshReqs(eventId)]);
  const recent = (r: CarReq) => !!r.handledAt && Date.now() - Date.parse(r.handledAt) < 120_000;
  const lost = reqs
    .filter((r) => r.carId === carId && r.dir === dir && SEATED.includes(r.status) && recent(r))
    .filter((r) => !all.some((c) => c[dir].on && c[dir].riders.includes(r.memberId)) && !drivesIn(all, dir, r.memberId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const r of lost) {
    const cur = await freshReq(r.id);
    if (!cur || !SEATED.includes(cur.status)) continue; // 그사이 취소·변경됨
    const car = await freshCar(eventId, carId);
    if (!car || !car[dir].on) return;
    if (car[dir].riders.includes(r.memberId)) continue;
    if (car[dir].riders.length < riderCap(car, dir)) {
      car[dir].riders = [...car[dir].riders, r.memberId];
      await saveRiders(car, dir);
      continue;
    }
    await setStatus(r.id, { status: "waiting", note: "동시에 신청이 몰려 자리가 모자랐어요" });
    await addAlerts([r.memberId], { eventId, text: `${car.name} ${LEG(dir)} 자리가 모자라 신청 대기로 바뀌었어요. 자리가 나면 자동으로 배정하고 알려 드릴게요.`, href: evHref(eventId) });
    await pushTo([r.memberId], "alerts").catch(() => undefined);
  }
}

// 관리자 승인(예전 승인 대기 신청): 탑승자로 넣는다(변경 요청이면 원래 차에서 뺀다).
export async function approve(eventId: string, reqId: string): Promise<string | null> {
  const r = await freshReq(reqId);
  if (!r || r.eventId !== eventId || r.status !== "pending") return "승인할 수 있는 신청이 아니에요.";
  const car = await freshCar(eventId, r.carId);
  if (!car || !car[r.dir].on) return "차량을 찾을 수 없어요.";
  if (!car[r.dir].riders.includes(r.memberId) && car[r.dir].riders.length >= riderCap(car, r.dir)) return `${car.name}은(는) 자리가 없어요. 탑승자를 빼거나 좌석을 늘린 뒤 승인해 주세요.`;
  const got = await seatIn(eventId, r.id);
  if (got === "full") return `${car.name}은(는) 자리가 없어요. 탑승자를 빼거나 좌석을 늘린 뒤 승인해 주세요.`;
  if (got === "skip") return "승인할 수 있는 신청이 아니에요.";
  await repair(eventId, car.id, r.dir);
  return null;
}

export async function reject(eventId: string, reqId: string, note = ""): Promise<string | null> {
  const r = await freshReq(reqId);
  if (!r || r.eventId !== eventId || !OPEN.includes(r.status)) return "반려할 수 있는 신청이 아니에요.";
  await setStatus(r.id, { status: "rejected", seen: "false", note });
  if (r.status === "pending") await promote(eventId, r.carId, r.dir);
  return null;
}

// 관리자가 차량 카드에서 탑승자를 뺐을 때: 그 사람의 승인·확정 신청을 취소로, 빈자리에 대기자를 올린다.
//  좌석을 늘렸거나(운전자가 바뀌어 자리가 늘어난 것 포함) 사람을 뺐으면 대기자를 올리고, 아니어도 빠진 탑승자는 되살린다.
export async function syncRemoved(eventId: string, before: Car, after: Car): Promise<void> {
  const reqs = await freshReqs(eventId);
  for (const dir of ["go", "back"] as Dir[]) {
    const gone = before[dir].riders.filter((m) => !after[dir].on || !after[dir].riders.includes(m));
    for (const m of gone) {
      const had = reqs.filter((x) => x.carId === before.id && x.dir === dir && x.memberId === m && SEATED.includes(x.status));
      for (const r of had) await setStatus(r.id, { status: "canceled", note: "관리자가 탑승자에서 뺐어요" });
      // 다른 차로 옮긴 경우(같은 구간에 다시 들어감)는 알리지 않고 확정 때 새 차로 알린다
      const moved = (await freshCars(eventId)).some((c) => c.id !== before.id && c[dir].riders.includes(m));
      if (had.some((r) => r.status === "confirmed") && !moved) {
        await addAlerts([m], { eventId, text: `관리자가 ${before.name} ${LEG(dir)} 배정을 풀었어요. 차량을 다시 확인해 주세요.`, href: evHref(eventId) });
      }
    }
    if (after[dir].on) await promote(eventId, before.id, dir);
  }
}

// 지원 회원을 자기 차 탑승자로 넣으면서 다른 차에서 뺐을 때(lib/carpool.ts seatOwner): 그 차의 신청은 변경됨으로, 빈자리는 대기자에게
export async function ownerMoved(eventId: string, ownerId: string, freed: { id: string; dir: Dir }[]): Promise<void> {
  if (freed.length === 0) return;
  const reqs = await freshReqs(eventId);
  for (const f of freed) {
    for (const r of reqs.filter((x) => x.carId === f.id && x.dir === f.dir && x.memberId === ownerId && SEATED.includes(x.status))) await setStatus(r.id, { status: "changed" });
    await promote(eventId, f.id, f.dir);
  }
}

// 지원 회원이 자기 차 정보(좌석 등)를 고쳤을 때: 늘어난 자리에 대기자를 올린다
export async function promoteCar(eventId: string, car: Car): Promise<void> {
  for (const dir of ["go", "back"] as Dir[]) if (car[dir].on) await promote(eventId, car.id, dir);
}

// 차량을 지우면 그 차의 신청을 모두 취소
export async function dropCar(eventId: string, carId: string): Promise<string[]> {
  const hit = (await freshReqs(eventId)).filter((x) => x.carId === carId && !["rejected", "canceled", "changed"].includes(x.status));
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
// 탑승 취소: 이 구간에 배정된 차에서 내린다(신청도 취소). 자리를 비우는 일이라 마감 뒤에도 회원이 직접 할 수 있다.
//  자리가 나면 대기한 사람을 올리고(마감 전), 차 주인에게 알린다. 내린 차 이름을 돌려준다("" 이면 탄 차가 없었음).
export async function leaveCar(eventId: string, mid: string, dir: Dir, note = "탑승을 취소했어요"): Promise<string> {
  const s = await getStore();
  for (const r of (await freshReqs(eventId)).filter((x) => x.memberId === mid && x.dir === dir && (OPEN.includes(x.status) || SEATED.includes(x.status)))) {
    await setStatus(r.id, { status: "canceled", note });
  }
  let left = "";
  for (const car of (await freshCars(eventId)).filter((c) => c[dir].riders.includes(mid))) {
    car[dir].riders = car[dir].riders.filter((x) => x !== mid);
    await saveRiders(car, dir);
    left = car.name;
    const name = (await s.list("Members")).find((m) => m.id === mid)?.name ?? "회원";
    await addAlerts(carOwners(car).filter((x) => x !== mid), { eventId, text: `${name} 님이 내 차(${car.name}) ${LEG(dir)} 탑승을 취소했어요.`, href: evHref(eventId) });
    await promote(eventId, car.id, dir);
  }
  return left;
}

export async function setSelf(eventId: string, mid: string, dir: Dir, on: boolean): Promise<void> {
  await (on ? addSelf : removeSelf)(eventId, dir, [mid]);
  if (!on) return;
  for (const r of (await freshReqs(eventId)).filter((x) => x.memberId === mid && x.dir === dir && (OPEN.includes(x.status) || SEATED.includes(x.status)))) {
    await setStatus(r.id, { status: "canceled", note: "개별 이동으로 바꿨어요" });
  }
  for (const car of (await freshCars(eventId)).filter((c) => c[dir].riders.includes(mid))) {
    car[dir].riders = car[dir].riders.filter((x) => x !== mid);
    await saveRiders(car, dir);
    await promote(eventId, car.id, dir);
  }
}
