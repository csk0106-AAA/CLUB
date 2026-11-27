import { carOwners, carRequests, confirmAll } from "./car-requests";
import { carpoolState, cars, driverLabel, DIRS, missingInfo, requestsOpen, saveCarpoolState, selfOf } from "./carpool";
import { kstTime } from "./kst-time";
import { addAlerts } from "./member-alerts";
import { managersOf } from "./event-managers";
import { remindRefunds } from "./refund";
import { remindCapsules } from "./capsule-notify";
import { pushTo } from "./push";
import { getSetting, getStore, patchSetting } from "./store";
import { effectivePerms, getPermGroups } from "./perms";
import { readEditors } from "./editors";
import { isGuest } from "./member-kind";

// 카풀 시각에 맞춘 자동 처리(따로 도는 예약 작업이 없어서, 화면·알림 숫자를 읽을 때 지난 시각이 있으면 그때 처리한다).
//  차량모집 마감(recruitUntil): 차량신청이 열렸다고 참석자에게 알림
//  차량신청 마감(waitUntil): 그때의 배정으로 자동 마감(관리자 확정 없이) — 배정된 회원·운전자에게 알림, 관리자에게도 마감 알림
//  관리자 배정(adminOnly)만 관리자가 "배정 완료(알림)"을 누른다. 일정 시작 3일 전까지 안 눌렀으면 리마인드(한 번)
// 처리할 일정은 Settings "carpoolDue" = { 일정 id: true } 로 모아 둔다(관리자가 시각을 저장할 때 넣는다).
const DUE = "carpoolDue";
const passed = (iso?: string) => !!iso && Date.now() > kstTime(iso);

export async function markDue(eventId: string): Promise<void> {
  const due = await getSetting<Record<string, boolean>>(DUE, {});
  if (!due[eventId]) await patchSetting(DUE, [eventId], true);
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
  await remindUnassigned();
  await remindRefunds(); // 회비 송금대기: 일주일마다 관리자에게
  await remindCapsules().catch((e) => console.error("[capsule] 열림 알림 실패", e)); // 타임캡슐 열림 7일 전(관리자)·1일 전·열림(회원)
  if (ids.length === 0) return;
  // 끝난 일정만 하나씩 지운다(목록 전체를 다시 쓰면 그사이 markDue 로 들어온 일정이 사라진다)
  const drop = (eventId: string) => patchSetting(DUE, [eventId], undefined);
  for (const eventId of ids) {
    const st = await carpoolState(eventId);
    const ev = await s.get("Events", eventId);
    if (!ev) { await drop(eventId); continue; }
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
    // 0) 차량신청 시작 시각 → 참석자에게 알림(차량모집이 아직이면 그때까지 등록된 차로 먼저)
    if (st.open && (!st.openFrom || passed(st.openFrom)) && !st.openStarted && !passed(st.waitUntil)) {
      await saveCarpoolState(eventId, { openStarted: true });
      await tell(`${ev.name} 차량신청이 시작됐어요. 차량을 골라 신청해 주세요.`);
    }
    // 1) 차량모집 마감: 차량신청을 따로 정하지 않았으면 이때 차량신청이 열린다
    if (st.recruitOn && passed(st.recruitUntil) && !st.recruitDone && !passed(st.waitUntil)) {
      await saveCarpoolState(eventId, { recruitDone: true });
      if (!st.open) await tell(`${ev.name} 차량신청이 시작됐어요. 차량을 골라 신청해 주세요.`);
    }
    // 2) 차량신청 마감 → 그때의 배정으로 자동 마감하고 회원에게 알림(관리자 확정 없이). 관리자에게는 마감됐다고만 알린다.
    if (passed(st.waitUntil) && !st.confirmDone) {
      await saveCarpoolState(eventId, { confirmDone: true });
      if (!st.adminOnly) await confirmByAdmin(eventId, ev.name, href, "");
      const mgr = await managersOf(eventId);
      await addAlerts(mgr, { eventId, text: `${ev.name} 차량신청이 마감됐어요. 배정된 회원에게 안내했어요. 마감 뒤 바꾼 배정은 그 회원에게 바로 알려요.`, href: `/admin/events/${eventId}?tab=car` });
      await pushTo(mgr, "alerts").catch(() => undefined);
    }
    const after = await carpoolState(eventId);
    const pending = (after.recruitOn && !after.recruitDone && !!after.recruitUntil) || (!!after.waitUntil && !after.confirmDone)
      || (after.recruitOn && !after.recruitStarted) || (!!after.open && !after.openStarted);
    if (!pending) await drop(eventId);
  }
}

async function attendees(eventId: string): Promise<string[]> {
  const applies = await (await getStore()).list("EventApplies");
  return applies.filter((a) => a.eventId === eventId && a.answer === "참석").map((a) => a.memberId);
}

// 확정 안내(차량신청 마감 때 자동, 관리자배정이면 "배정 완료 (알림)"): 배정된 사람 확정(종 알림은 확정 기록으로), 운전자·지원자에게 탑승자 명단.
// 차량신청 마감이 지났으면 남은 대기자도 마감 알림. 확정 알림 받은 회원 수를 돌려준다.
export async function confirmByAdmin(eventId: string, eventName: string, href: string, byId: string): Promise<number> {
  const s = await getStore();
  const told = await confirmAll(eventId);
  await notifyOwners(eventId, eventName, href);
  await saveCarpoolState(eventId, { published: true, publishedAt: new Date().toISOString() });
  const st = await carpoolState(eventId);
  const waiting = passed(st.waitUntil) ? (await carRequests(eventId)).filter((r) => r.status === "waiting") : [];
  for (const w of waiting) await s.update("CarRequests", w.id, { status: "canceled", note: "마감까지 자리가 나지 않았어요", seen: "true", handledAt: new Date().toISOString() });
  await addAlerts(waiting.map((w) => w.memberId), { eventId, text: `${eventName} 차량신청이 마감됐는데 자리가 나지 않아 배정되지 못했어요. 관리자에게 문의해 주세요.`, href });
  const all = [...told, ...waiting.map((w) => w.memberId)];
  if (all.length) await pushTo(all, "alerts", byId).catch(() => undefined);
  return told.length;
}

// 이 일정을 관리하는 사람(일정관리·모든 권한, 클럽 일정이면 클럽관리, 만든 사람·편집자)

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
    const start = ev?.startsAt ? kstTime(ev.startsAt) : NaN;
    if (!ev || Number.isNaN(start) || start <= now || start - now > 3 * 86_400_000) continue;
    const st = await carpoolState(id);
    if (!st.adminOnly) continue; // 신청 방식은 마감 때 자동으로 안내된다
    const unconfirmed = reqRows.some((r) => r.eventId === id && r.status === "approved");
    const anyRider = carRows.some((c) => c.eventId === id && ((JSON.parse(c.riders || "[]") as string[]).length || (JSON.parse(c.backRiders || "[]") as string[]).length));
    if (st.published && !unconfirmed) continue;
    if (!anyRider && !unconfirmed) continue;
    const mgr = await managersOf(id);
    await addAlerts(mgr, { eventId: id, text: `${ev.name} 시작이 3일 안으로 다가왔는데 차량배정이 아직 확정되지 않았어요. 배정을 확인하고 “배정 완료 (알림)”을 눌러 주세요.`, href: `/admin/events/${id}?tab=car` });
    await pushTo(mgr, "alerts").catch(() => undefined);
    await patchSetting(REMIND, [id], true);
  }
}

// 운전자(회원)·차량모집 지원자에게 내 차 탑승자 명단
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

// 차량신청 중에 차량이 새로 등록되면: 아직 차가 없는 참석자에게 "새 차량이 추가됐어요"
export async function notifyNewCar(eventId: string, carName: string, exceptId = ""): Promise<void> {
  const st = await carpoolState(eventId);
  if (!requestsOpen(st)) return;
  const all = await cars(eventId);
  const seated = new Set(all.flatMap((c) => [c.kind !== "rental" ? c.driverId : "", ...c.go.riders, ...c.back.riders]).filter(Boolean));
  const ev = await (await getStore()).get("Events", eventId);
  const who = (await attendees(eventId)).filter((m) => !seated.has(m) && m !== exceptId);
  await addAlerts(who, { eventId, text: `${ev?.name ?? "일정"}에 새 차량(${carName})이 추가됐어요. 차량을 신청할 수 있어요.`, href: `/events/${eventId}#cars` });
}

// 지원 회원의 차량에 빈 칸이 있으면 "정보를 입력해 주세요" 알림(누르면 일정 화면의 차량 정보 입력 창이 열린다)
export async function askOwnerInfo(eventId: string, car: { ownerId: string; name: string } & Parameters<typeof missingInfo>[0]): Promise<void> {
  if (!car.ownerId || missingInfo(car).length === 0) return;
  const href = `/events/${eventId}?carEdit=1#cars`;
  const s = await getStore();
  const already = (await s.list("MemberAlerts")).some((a) => a.memberId === car.ownerId && a.href === href && a.seen !== "true");
  if (already) return;
  await addAlerts([car.ownerId], { eventId, text: "차량모집에 지원해 주셔서 감사합니다. 등록 된 차량의 출발, 도착 정보를 입력 해 주세요", href });
  await pushTo([car.ownerId], "alerts").catch(() => undefined);
}

// 차량신청을 받는 중인데 일정 시작 3일 안으로 들어왔을 때, 아직 차량배정이 안 된 참석자에게 "차량을 신청해 주세요"(일정마다 한 번)
//  배정된 것으로 보는 경우: 탑승자, 운전자(회원), 차량모집 지원자, 개별 이동, 신청 대기 — 차가 운행하는 구간마다 확인
const REMIND_MEMBERS = "carpoolMemberReminded";
async function remindUnassigned(): Promise<void> {
  const s = await getStore();
  const [carRows, events, applies, reqRows] = await Promise.all([s.list("Carpools"), s.list("Events"), s.list("EventApplies"), s.list("CarRequests")]);
  const ids = [...new Set(carRows.map((c) => c.eventId))];
  if (ids.length === 0) return;
  const done = await getSetting<Record<string, boolean>>(REMIND_MEMBERS, {});
  const now = Date.now();
  let changed = false;
  for (const id of ids) {
    if (done[id]) continue;
    const ev = events.find((e) => e.id === id);
    const start = ev?.startsAt ? kstTime(ev.startsAt) : NaN;
    if (!ev || Number.isNaN(start) || start <= now || start - now > 3 * 86_400_000) continue;
    const st = await carpoolState(id);
    if (st.adminOnly || !requestsOpen(st)) continue;
    const all = await cars(id);
    const att = applies.filter((a) => a.eventId === id && a.answer === "참석").map((a) => a.memberId);
    const waiting = reqRows.filter((r) => r.eventId === id && r.status === "waiting");
    const missing = att.filter((m) => DIRS.some((d) => {
      if (!all.some((c) => c[d].on)) return false; // 그 구간에 운행하는 차가 없으면 따지지 않는다
      const seated = all.some((c) => c[d].on && (c[d].riders.includes(m) || (c.kind !== "rental" && c.driverId === m) || c.ownerId === m));
      return !seated && !selfOf(st, d).includes(m) && !waiting.some((r) => r.memberId === m && r.dir === d);
    }));
    if (missing.length) {
      const until = st.waitUntil ? ` 신청 마감은 ${new Date(kstTime(st.waitUntil) + 9 * 3600_000).toISOString().slice(5, 16).replace("-", "/").replace("T", " ")}이에요.` : "";
      await addAlerts(missing, { eventId: id, text: `${ev.name}이(가) 3일 앞으로 다가왔는데 아직 차량배정이 안 되셨어요. 차량을 신청하거나 개별 이동을 골라 주세요.${until}`, href: `/events/${id}#cars` });
      await pushTo(missing, "alerts").catch(() => undefined);
    }
    await patchSetting(REMIND_MEMBERS, [id], true);
  }
}

// 마감(안내)된 뒤 관리자가 배정을 바꾸면: 바뀐 회원에게 바로 알린다(관리자가 따로 확정하지 않아도 되게)
export async function confirmIfClosed(eventId: string, byId: string): Promise<void> {
  const st = await carpoolState(eventId);
  if (!st.published) return;
  const told = await confirmAll(eventId);
  if (!told.length) return;
  const ev = await (await getStore()).get("Events", eventId);
  await addAlerts(told, { eventId, text: `${ev?.name ?? "일정"} 차량 배정이 바뀌었어요. 탈 차량을 확인해 주세요.`, href: `/events/${eventId}#cars` });
  await pushTo(told, "alerts", byId).catch(() => undefined);
}
