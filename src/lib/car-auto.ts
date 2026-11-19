import { carOwners, carRequests, confirmAll } from "./car-requests";
import { carpoolState, cars, driverLabel, requestsOpen, saveCarpoolState } from "./carpool";
import { addAlerts } from "./member-alerts";
import { pushTo } from "./push";
import { getSetting, getStore, setSetting } from "./store";
import { effectivePerms, getPermGroups } from "./perms";
import { readEditors } from "./editors";
import { isGuest } from "./member-kind";

// 카풀 시각에 맞춘 자동 처리(따로 도는 예약 작업이 없어서, 화면·알림 숫자를 읽을 때 지난 시각이 있으면 그때 처리한다).
//  차량 지원 모집 마감(recruitUntil): 카풀 신청이 열렸다고 참석자에게 알림
//  카풀신청 마감(waitUntil): 신청을 닫고 관리자에게 "확정해 주세요" 알림(확정은 관리자가 "확정(알림)"을 눌러야 한다)
//  일정 시작 3일 전까지 확정하지 않았으면 관리자에게 리마인드(한 번)
// 처리할 일정은 Settings "carpoolDue" = { 일정 id: true } 로 모아 둔다(관리자가 시각을 저장할 때 넣는다).
const DUE = "carpoolDue";
const passed = (iso?: string) => !!iso && Date.now() > Date.parse(iso);

export async function markDue(eventId: string): Promise<void> {
  const due = await getSetting<Record<string, boolean>>(DUE, {});
  if (!due[eventId]) await setSetting(DUE, { ...due, [eventId]: true });
}

let running: Promise<void> | null = null;
export function runCarpoolDue(): Promise<void> {
  if (!running) running = run().catch((e) => console.error("[carpool] 자동 처리 실패", e)).finally(() => { running = null; });
  return running;
}

async function run(): Promise<void> {
  const due = await getSetting<Record<string, boolean>>(DUE, {});
  const ids = Object.keys(due);
  const s = await getStore();
  await remindUnconfirmed();
  if (ids.length === 0) return;
  let changed = false;
  for (const eventId of ids) {
    const st = await carpoolState(eventId);
    const ev = await s.get("Events", eventId);
    if (!ev) { delete due[eventId]; changed = true; continue; }
    const href = `/events/${eventId}#cars`;
    const tell = async (text: string) => {
      const att = await attendees(eventId);
      await addAlerts(att, { eventId, text, href });
      await pushTo(att, "alerts").catch(() => undefined);
    };
    // 0) 차량모집 시작 시각 → 참석자에게 알림
    if (st.recruitOn && (!st.recruitFrom || passed(st.recruitFrom)) && !st.recruitStarted && !passed(st.recruitUntil)) {
      await saveCarpoolState(eventId, { recruitStarted: true });
      await tell(`${ev.name} 차량모집이 시작됐어요. 차를 가져오실 분은 일정 화면에서 “내 차로 지원하기”로 등록해 주세요.`);
    }
    // 0) 카풀신청 시작 시각 → 참석자에게 알림(차량모집이 아직이면 그때까지 등록된 차로 먼저)
    if (st.open && (!st.openFrom || passed(st.openFrom)) && !st.openStarted && !passed(st.waitUntil)) {
      await saveCarpoolState(eventId, { openStarted: true });
      await tell(`${ev.name} 카풀신청이 시작됐어요. 차량을 골라 신청해 주세요.`);
    }
    // 1) 차량모집 마감: 카풀신청을 따로 정하지 않았으면 이때 카풀신청이 열린다
    if (st.recruitOn && passed(st.recruitUntil) && !st.recruitDone && !passed(st.waitUntil)) {
      await saveCarpoolState(eventId, { recruitDone: true });
      if (!st.open) await tell(`${ev.name} 카풀신청이 시작됐어요. 차량을 골라 신청해 주세요.`);
    }
    // 2) 카풀신청 마감 → 신청이 닫히고 관리자에게 확정 요청 알림(자동 확정은 하지 않는다)
    if (passed(st.waitUntil) && !st.confirmDone) {
      await saveCarpoolState(eventId, { confirmDone: true });
      const mgr = await managersOf(eventId);
      await addAlerts(mgr, { eventId, text: `${ev.name} 카풀신청이 마감됐어요. 배정을 확인하고 “확정(알림)”을 눌러 주세요.`, href: `/admin/events/${eventId}?tab=car` });
      await pushTo(mgr, "alerts").catch(() => undefined);
    }
    const after = await carpoolState(eventId);
    const pending = (after.recruitOn && !after.recruitDone && !!after.recruitUntil) || (!!after.waitUntil && !after.confirmDone)
      || (after.recruitOn && !after.recruitStarted) || (!!after.open && !after.openStarted);
    if (!pending) { delete due[eventId]; changed = true; }
  }
  if (changed) await setSetting(DUE, due);
}

async function attendees(eventId: string): Promise<string[]> {
  const applies = await (await getStore()).list("EventApplies");
  return applies.filter((a) => a.eventId === eventId && a.answer === "참석").map((a) => a.memberId);
}

// 관리자 확정(알림): 배정된 사람 확정(종 알림은 확정 기록으로), 운전자·지원자에게 탑승자 명단.
// 카풀신청 마감이 지났으면 남은 대기자도 마감 알림. 확정 알림 받은 회원 수를 돌려준다.
export async function confirmByAdmin(eventId: string, eventName: string, href: string, byId: string): Promise<number> {
  const s = await getStore();
  const told = await confirmAll(eventId);
  await notifyOwners(eventId, eventName, href);
  await saveCarpoolState(eventId, { published: true, publishedAt: new Date().toISOString() });
  const st = await carpoolState(eventId);
  const waiting = passed(st.waitUntil) ? (await carRequests(eventId)).filter((r) => r.status === "waiting") : [];
  for (const w of waiting) await s.update("CarRequests", w.id, { status: "canceled", note: "마감까지 자리가 나지 않았어요", seen: "true", handledAt: new Date().toISOString() });
  await addAlerts(waiting.map((w) => w.memberId), { eventId, text: `${eventName} 카풀 신청이 마감됐는데 자리가 나지 않아 배정되지 못했어요. 관리자에게 문의해 주세요.`, href });
  const all = [...told, ...waiting.map((w) => w.memberId)];
  if (all.length) await pushTo(all, "alerts", byId).catch(() => undefined);
  return told.length;
}

// 이 일정을 관리하는 사람(일정관리·모든 권한, 클럽 일정이면 클럽관리, 만든 사람·편집자)
async function managersOf(eventId: string): Promise<string[]> {
  const s = await getStore();
  const [members, ev, groups] = await Promise.all([s.list("Members"), s.get("Events", eventId), getPermGroups()]);
  if (!ev) return [];
  return members.filter((m) => {
    if (isGuest(m.kind)) return false;
    const p = effectivePerms(m, groups);
    return p.includes("all") || p.includes("events") || (p.includes("clubs") && !!(ev.club ?? "").trim()) || ev.createdBy === m.id || readEditors(ev.editors).includes(m.id);
  }).map((m) => m.id);
}

// 일정 시작 3일 전까지 카풀을 확정하지 않았으면(배정했는데 확정 전 사람이 있거나 한 번도 확정하지 않음) 관리자에게 리마인드 — 일정마다 한 번
const REMIND = "carpoolReminded";
async function remindUnconfirmed(): Promise<void> {
  const s = await getStore();
  const [carRows, events, reqRows] = await Promise.all([s.list("Carpools"), s.list("Events"), s.list("CarRequests")]);
  const ids = [...new Set(carRows.map((c) => c.eventId))];
  if (ids.length === 0) return;
  const done = await getSetting<Record<string, boolean>>(REMIND, {});
  const now = Date.now();
  let changed = false;
  for (const id of ids) {
    if (done[id]) continue;
    const ev = events.find((e) => e.id === id);
    const start = ev?.startsAt ? Date.parse(ev.startsAt) : NaN;
    if (!ev || Number.isNaN(start) || start <= now || start - now > 3 * 86_400_000) continue;
    const st = await carpoolState(id);
    const unconfirmed = reqRows.some((r) => r.eventId === id && r.status === "approved");
    const anyRider = carRows.some((c) => c.eventId === id && ((JSON.parse(c.riders || "[]") as string[]).length || (JSON.parse(c.backRiders || "[]") as string[]).length));
    if (st.published && !unconfirmed) continue;
    if (!anyRider && !unconfirmed) continue;
    const mgr = await managersOf(id);
    await addAlerts(mgr, { eventId: id, text: `${ev.name} 시작이 3일 안으로 다가왔는데 카풀이 아직 확정되지 않았어요. 배정을 확인하고 “확정(알림)”을 눌러 주세요.`, href: `/admin/events/${id}?tab=car` });
    await pushTo(mgr, "alerts").catch(() => undefined);
    done[id] = true;
    changed = true;
  }
  if (changed) await setSetting(REMIND, done);
}

// 운전자(회원)·차량 지원자에게 내 차 탑승자 명단
export async function notifyOwners(eventId: string, eventName: string, href: string): Promise<void> {
  const members = await (await getStore()).list("Members");
  const nm = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  for (const car of await cars(eventId)) {
    const owners = carOwners(car);
    if (owners.length === 0) continue;
    const legs = (["go", "back"] as const).filter((d) => car[d].on).map((d) => `${d === "go" ? "갈 때" : "올 때"} ${car[d].riders.map(nm).join(", ") || "없음"}`);
    await addAlerts(owners, { eventId, text: `${eventName} 내 차(${car.name}${driverLabel(car, nm) ? ` · 운전 ${driverLabel(car, nm)}` : ""}) 탑승자가 확정됐어요 — ${legs.join(" / ")}`, href });
  }
}

// 카풀신청 중에 차량이 새로 등록되면: 아직 차가 없는 참석자에게 "새 차량이 추가됐어요"
export async function notifyNewCar(eventId: string, carName: string, exceptId = ""): Promise<void> {
  const st = await carpoolState(eventId);
  if (!requestsOpen(st)) return;
  const all = await cars(eventId);
  const seated = new Set(all.flatMap((c) => [c.kind !== "rental" ? c.driverId : "", ...c.go.riders, ...c.back.riders]).filter(Boolean));
  const ev = await (await getStore()).get("Events", eventId);
  const who = (await attendees(eventId)).filter((m) => !seated.has(m) && m !== exceptId);
  await addAlerts(who, { eventId, text: `${ev?.name ?? "일정"}에 새 차량(${carName})이 추가됐어요. 카풀을 신청할 수 있어요.`, href: `/events/${eventId}#cars` });
}
