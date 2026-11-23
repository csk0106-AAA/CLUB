import { z } from "zod";
import { parseJson } from "./api";
import { kstTime } from "./kst-time";
import { addToSettingList, getSetting, getStore, mergeSetting, removeFromSettingList } from "./store";
import type { Row } from "./store/types";

// 예전 방식의 구간 이름. 지금은 차량마다 갈 때(go)·올 때(back) 운행 여부를 따로 저장하고,
// leg 열은 예전 코드와 호환되도록 goOn/backOn 에서 만들어 함께 저장한다.
export const LEGS = ["왕복", "갈 때", "올 때"] as const;
export type Leg = (typeof LEGS)[number];

export const DIRS = ["go", "back"] as const;
export type Dir = (typeof DIRS)[number];
export const DIR_LABEL: Record<Dir, string> = { go: "갈 때", back: "올 때" };

// 한 구간의 운행 정보: 출발지·출발 시간·도착지·도착 예상 시간·탑승자
// seats·memo: 구간마다 따로(예: 올 때는 짐이 많아 3석). 비어 있으면(예전 차량) 차량 전체 seats·memo
export type LegInfo = { on: boolean; from: string; departAt: string; to: string; arriveAt: string; riders: string[]; seats: number; memo: string };
// kind: member(회원 차량) | rental(외부 대절)
//  운전자: 회원이면 driverId, 회원이 아니면(외부 대절 기사님, 회원 차를 다른 사람이 운전 등) driverName 에 이름
//  좌석(seats): 회원 차량을 회원이 운전하면 운전자 포함(운전자도 한 자리), 운전자가 외부 사람이거나 외부 대절이면 운전자 제외
export type CarKind = "member" | "rental";
export type Car = {
  id: string; name: string; plate: string; driverId: string; seats: number; // 이름 외 운전자·차량번호는 선택 입력
  kind: CarKind; driverName: string;
  memo: string; ownerId: string; // 메모(예: 강남역 경유 가능), 차량모집 지원으로 회원이 등록한 차면 그 회원 id
  leg: Leg; // goOn/backOn 에서 만든 값(호환용)
  go: LegInfo; back: LegInfo;
};

export const emptyLeg = (on = false, seats = 0): LegInfo => ({ on, from: "", departAt: "", to: "", arriveAt: "", riders: [], seats, memo: "" });

export const legName = (go: boolean, back: boolean): Leg => (go && back ? "왕복" : back && !go ? "올 때" : "갈 때");
export const dirsOf = (c: Pick<Car, "go" | "back">): Dir[] => DIRS.filter((d) => c[d].on);

// 저장된 행 → 차량. goOn/backOn 이 없으면 예전 leg 값으로 한 번 바꿔 읽는다.
// 왕복: 갈 때·올 때 모두 운행, 탑승자 같음, 올 때 출발지/도착지는 갈 때의 반대(시간은 비움)
// 갈 때: 갈 때만 / 올 때: 올 때만(예전 출발·도착 정보를 올 때로 옮김)
export function toCar(r: Row): Car {
  const kind: CarKind = r.kind === "rental" ? "rental" : "member";
  const base = { id: r.id, name: r.name ?? "", plate: r.plate ?? "", driverId: kind === "rental" ? "" : r.driverId ?? "", seats: Number(r.seats) || 0, kind, driverName: r.driverName ?? "", memo: r.memo ?? "", ownerId: r.ownerId ?? "" };
  const flat: LegInfo = {
    on: true, from: r.from ?? "", departAt: r.departAt ?? "", to: r.to ?? "", arriveAt: r.arriveAt ?? "", riders: parseJson<string[]>(r.riders, []), seats: 0, memo: "",
  };
  // 구간별 좌석·메모(없으면 차량 전체 값)
  const legExtra = (c: Car): Car => {
    c.go.seats = Number(r.goSeats) || base.seats;
    c.back.seats = Number(r.backSeats) || base.seats;
    c.go.memo = r.goMemo ?? base.memo;
    c.back.memo = r.backMemo ?? base.memo;
    return c;
  };
  const known = (v: string | undefined) => v === "true" || v === "false";
  if (known(r.goOn) || known(r.backOn)) {
    const go = { ...flat, on: r.goOn === "true" };
    const back: LegInfo = {
      on: r.backOn === "true", from: r.backFrom ?? "", departAt: r.backDepartAt ?? "", to: r.backTo ?? "", arriveAt: r.backArriveAt ?? "",
      riders: parseJson<string[]>(r.backRiders, []), seats: 0, memo: "",
    };
    return legExtra({ ...base, leg: legName(go.on, back.on), go, back });
  }
  if (r.leg === "올 때") return legExtra({ ...base, leg: "올 때", go: emptyLeg(false), back: flat });
  if (r.leg === "왕복") {
    return legExtra({ ...base, leg: "왕복", go: flat, back: { on: true, from: flat.to, departAt: "", to: flat.from, arriveAt: "", riders: [...flat.riders], seats: 0, memo: "" } });
  }
  return legExtra({ ...base, leg: "갈 때", go: flat, back: emptyLeg(false) });
}

// 차량 → 저장할 열. 운행하지 않는 구간의 탑승자는 비운다.
export function toRow(c: Car): Record<string, string> {
  const go = c.go.on ? c.go.riders : [];
  const back = c.back.on ? c.back.riders : [];
  return {
    name: c.name, plate: c.plate, driverId: c.kind === "rental" ? "" : c.driverId, leg: legName(c.go.on, c.back.on),
    // 차량 전체 seats·memo 는 예전 화면 호환용(큰 쪽 좌석, 갈 때 메모)
    seats: String(Math.max(legSeats(c, "go"), legSeats(c, "back"))), memo: c.go.memo || c.back.memo || c.memo,
    goSeats: String(legSeats(c, "go")), backSeats: String(legSeats(c, "back")), goMemo: c.go.memo, backMemo: c.back.memo,
    kind: c.kind, driverName: c.kind === "rental" || !c.driverId ? c.driverName : "", ownerId: c.ownerId,
    goOn: String(c.go.on), backOn: String(c.back.on),
    from: c.go.from, departAt: c.go.departAt, to: c.go.to, arriveAt: c.go.arriveAt, riders: JSON.stringify(go),
    backFrom: c.back.from, backDepartAt: c.back.departAt, backTo: c.back.to, backArriveAt: c.back.arriveAt, backRiders: JSON.stringify(back),
  };
}

// 등록·수정 입력. go/back 에 구간별 정보를 받는다.
// 예전 형식(leg + from/to/departAt/arriveAt/riders)도 받아서 같은 모양으로 바꾼다.
const text = (max: number) => z.string().trim().max(max).optional();
const legInput = z.object({
  on: z.boolean().optional(), from: text(60), departAt: text(40), to: text(60), arriveAt: text(40), riders: z.array(z.string()).max(45).optional(),
  seats: z.number().int().min(1).max(45).optional(), memo: text(100), // 구간별 좌석·메모
});
export const carInput = z.object({
  name: text(30), plate: text(20), driverId: z.string().optional(), seats: z.number().int().min(1).max(45).optional(),
  kind: z.enum(["member", "rental"]).optional(), driverName: text(30), // 회원이 아닌 운전자 이름(기사님 등)
  memo: text(100), // 메모(예: 강남역 경유 가능)
  ownerId: z.string().max(80).optional(), // 관리자가 등록할 때: 차량을 지원한 회원(그 회원이 직접 고칠 수 있다)
  go: legInput.optional(), back: legInput.optional(),
  leg: z.enum(LEGS).optional(), from: text(60), departAt: text(40), to: text(60), arriveAt: text(40), riders: z.array(z.string()).max(45).optional(),
  // 관리자 화면이 보고 있던 탑승자(구간별). 그사이 회원이 잡은 자리는 이 명단에 없으니 빼지 않고 그대로 둔다(lib 아님, carpool/[cid] PATCH)
  seen: z.object({ go: z.array(z.string()).max(45).optional(), back: z.array(z.string()).max(45).optional() }).optional(),
});
export type CarInput = z.infer<typeof carInput>;

export const newCar = (): Car => ({ id: "new", name: "", plate: "", driverId: "", seats: 5, kind: "member", driverName: "", memo: "", ownerId: "", leg: "왕복", go: emptyLeg(true, 5), back: emptyLeg(true, 5) });

const FIELDS = ["from", "departAt", "to", "arriveAt"] as const;

export function applyInput(cur: Car, d: CarInput): Car {
  const next: Car = { ...cur, go: { ...cur.go, riders: [...cur.go.riders] }, back: { ...cur.back, riders: [...cur.back.riders] } };
  if (d.name !== undefined) next.name = d.name;
  if (d.plate !== undefined) next.plate = d.plate;
  if (d.driverId !== undefined) next.driverId = d.driverId;
  if (d.seats !== undefined) { next.seats = d.seats; next.go.seats = d.seats; next.back.seats = d.seats; } // 예전 형식: 두 구간 같게
  if (d.kind !== undefined) next.kind = d.kind;
  if (d.driverName !== undefined) next.driverName = d.driverName;
  if (d.memo !== undefined) { next.memo = d.memo; next.go.memo = d.memo; next.back.memo = d.memo; }
  if (d.ownerId !== undefined) next.ownerId = d.ownerId;
  if (next.kind === "rental") next.driverId = ""; // 외부 대절은 운전자가 회원이 아니다
  if (next.driverId) next.driverName = ""; // 회원이 운전하면 이름을 따로 두지 않는다
  // 예전 형식
  if (d.leg) {
    next.go.on = d.leg !== "올 때";
    next.back.on = d.leg !== "갈 때";
  }
  const target: Dir = d.leg ? (d.leg === "올 때" ? "back" : "go") : next.go.on ? "go" : "back";
  for (const f of FIELDS) if (d[f] !== undefined) next[target][f] = d[f];
  if (d.leg === "왕복" && !next.back.from && !next.back.to) {
    next.back.from = next.go.to;
    next.back.to = next.go.from;
  }
  if (d.riders) for (const dir of dirsOf(next)) next[dir].riders = [...d.riders];
  // 새 형식
  for (const dir of DIRS) {
    const x = d[dir];
    if (!x) continue;
    if (x.on !== undefined) next[dir].on = x.on;
    for (const f of FIELDS) if (x[f] !== undefined) next[dir][f] = x[f];
    if (x.riders) next[dir].riders = [...x.riders];
    if (x.seats !== undefined) next[dir].seats = x.seats;
    if (x.memo !== undefined) next[dir].memo = x.memo;
  }
  for (const dir of DIRS) if (!next[dir].on) next[dir].riders = [];
  next.leg = legName(next.go.on, next.back.on);
  return next;
}

export const inputPeople = (d: CarInput): string[] => [
  ...(d.driverId ? [d.driverId] : []), ...(d.riders ?? []), ...(d.go?.riders ?? []), ...(d.back?.riders ?? []),
];

// 도착 예상 시간이 출발 시간보다 빠르면 안 된다.
export function timeOrder(departAt: string, arriveAt: string): string | null {
  return departAt && arriveAt && arriveAt < departAt ? "도착 예상 시간이 출발 시간보다 빠를 수 없어요." : null;
}

// 운행하는 구간마다 시간 순서를 확인한다.
export function timeIssue(c: Car): string | null {
  for (const d of dirsOf(c)) if (timeOrder(c[d].departAt, c[d].arriveAt)) return `${DIR_LABEL[d]}: 도착 시간이 출발 시간보다 빠를 수 없어요.`;
  return null;
}

// 운전자 이름: 회원 차량은 회원 이름, 외부 대절은 직접 적은 이름
export const driverLabel = (c: Pick<Car, "kind" | "driverId" | "driverName">, nameOf: (id: string) => string): string =>
  c.kind !== "rental" && c.driverId ? nameOf(c.driverId) : c.driverName;

// 차량 사람 표시: 지원자와 운전자가 다르면 "지원 OOO(운전 OOO)", 같거나 지원자가 없으면 "운전 OOO"
export function crewLabel(c: Pick<Car, "kind" | "driverId" | "driverName" | "ownerId">, nameOf: (id: string) => string): string {
  const drv = driverLabel(c, nameOf) || "미정";
  if (c.ownerId && c.ownerId !== c.driverId) return `지원 ${nameOf(c.ownerId)}(운전 ${drv})`;
  return drv === "미정" ? "" : `운전 ${drv}`;
}

// 운전자가 차지하는 자리: 회원 차량에 운전자(회원이든 아니든)가 정해져 있으면 1
// 운전자가 차지하는 자리: 회원 차량을 회원이 운전할 때만 1(회원 차량을 외부 사람이 운전하거나 외부 대절이면 좌석수는 운전자 제외로 받는다)
export const driverSeat = (c: Pick<Car, "kind" | "driverId" | "driverName">): number => (c.kind !== "rental" && c.driverId ? 1 : 0);
// 탑승자로 넣을 수 있는 자리 수
// 구간 좌석(그 구간 값, 없으면 차량 전체 값) / 그 구간에 탑승자로 넣을 수 있는 자리 수
export const legSeats = (c: Pick<Car, "seats" | "go" | "back">, d: Dir): number => c[d].seats || c.seats;
export const riderCap = (c: Car, d: Dir): number => Math.max(0, legSeats(c, d) - driverSeat(c));

// 그룹명을 비워 두면 차량번호 → 운전자 이름 → "카풀 1조"처럼 안 쓰인 번호 순서로 붙인다. 관리자가 나중에 바꿀 수 있다.
export function autoName(c: Car, all: Car[], nameOf: (id: string) => string): string {
  const others = all.filter((x) => x.id !== c.id);
  const free = (n: string) => !!n && !others.some((x) => x.name === n);
  if (free(c.plate.trim())) return c.plate.trim();
  const dl = driverLabel(c, nameOf).trim();
  if (free(dl)) return dl;
  return suggestName(others);
}

// "카풀 1조", "카풀 2조"처럼 안 쓰인 번호로 임의의 이름
export function suggestName(all: Car[]): string {
  const used = new Set(all.map((c) => c.name));
  let n = all.length + 1;
  while (used.has(`차량 ${n}조`)) n++;
  return `차량 ${n}조`;
}

export async function cars(eventId: string): Promise<Car[]> {
  return (await (await getStore()).list("Carpools")).filter((c) => c.eventId === eventId).map(toCar);
}

const peopleOn = (c: Car, d: Dir): string[] => (c[d].on ? [...(c.driverId ? [c.driverId] : []), ...c[d].riders] : []);

// 구간별 검사: 같은 구간에 두 대 탑승 금지, 운전자 ≠ 탑승자, 탑승자 ≤ 좌석, 도착 ≥ 출발, 최소 한 구간 운행.
export function conflict(all: Car[], next: Car, names: Map<string, string>): string | null {
  if (!next.go.on && !next.back.on) return "갈 때와 올 때 중 하나는 운행해야 해요.";
  const others = all.filter((c) => c.id !== next.id);
  for (const d of dirsOf(next)) {
    const label = DIR_LABEL[d];
    const people = peopleOn(next, d);
    if (new Set(people).size !== people.length) return `${label}: 운전자와 탑승자가 겹쳐요.`;
    if (next[d].riders.length > riderCap(next, d)) {
      // 지원 회원이 운전하지 않으면 지원 회원도 그 차 탑승자로 들어가므로 자리가 하나 더 필요하다
      const ownerRides = !!next.ownerId && next.ownerId !== next.driverId && next[d].riders.includes(next.ownerId);
      if (ownerRides && next[d].riders.length === 1) {
        return `${label}: 지원 회원이 운전하지 않아서 지원 회원도 이 차에 타요. 좌석 수를 ${driverSeat(next) + 1}석 이상으로 해 주세요(지금 ${legSeats(next, d)}석).`;
      }
      return `${label}: 좌석은 ${legSeats(next, d)}개예요${driverSeat(next) ? "(운전자 포함)" : ""}${ownerRides ? " — 지원 회원도 이 차에 타요" : ""}. 탑승자를 줄이거나 좌석 수를 늘려 주세요.`;
    }
    if (timeOrder(next[d].departAt, next[d].arriveAt)) return `${label}: 도착 시간이 출발 시간보다 빠를 수 없어요.`;
    for (const pid of people) {
      const o = others.find((x) => peopleOn(x, d).includes(pid));
      if (o) return `${names.get(pid) ?? "회원"} 님은 ${label} 다른 차량(${o.name})에 이미 있어요.`;
    }
  }
  return null;
}

const key = (eventId: string) => `carpool:${eventId}`;
// published: 확정(회원에게 보임) · open: 차량신청 받기
// recruitOn/recruitUntil: 차량모집(회원이 자기 차를 등록) — 마감 시각이 지나면 차량신청이 자동으로 열린다
// waitUntil: 차량신청 마감 — 지나면 신청을 받지 않고 그때의 배정으로 자동 마감(남은 대기도 마감). 관리자배정은 "배정 완료 (알림)"
// recruitDone/confirmDone: 그 시각의 자동 처리를 마쳤는지(lib/car-auto.ts)
// recruitFrom/openFrom: 차량모집·차량신청 시작 시각(비우면 켜는 순간부터). recruitStarted/openStarted: 시작 알림을 보냈는지
export type CarpoolState = {
  published: boolean; publishedAt: string; open?: boolean; waitUntil?: string;
  recruitOn?: boolean; recruitUntil?: string; recruitDone?: boolean; confirmDone?: boolean;
  recruitFrom?: string; openFrom?: string; recruitStarted?: boolean; openStarted?: boolean;
  selfGo?: string[]; selfBack?: string[]; // 개별 이동(차를 타지 않고 각자 가는 회원) — 구간별
  adminOnly?: boolean; // 관리자배정: 차량모집·차량신청 없이 관리자가 모두 배정(켜면 둘은 꺼진다)
};
export const selfOf = (s: CarpoolState, d: Dir): string[] => (d === "go" ? s.selfGo : s.selfBack) ?? [];
const passed = (iso?: string) => !!iso && Date.now() > kstTime(iso);
const begun = (iso?: string) => !iso || Date.now() >= kstTime(iso);
// 차량모집 지원을 받는 중인지: 켜져 있고, 시작 시각이 지났고, 모집·신청 마감 전
export const recruiting = (s: CarpoolState) => !!s.recruitOn && begun(s.recruitFrom) && !passed(s.recruitUntil) && !passed(s.waitUntil);
// 차량신청을 받는 중인지: (차량신청을 켰고 시작 시각이 지남) 또는 (차량신청을 따로 켜지 않았는데 차량모집이 끝남), 그리고 신청 마감 전.
// 차량모집이 끝나기 전에 차량신청이 시작되면 그때까지 등록된 차로 먼저 받고, 나중에 등록된 차도 바로 목록에 더해진다.
export const requestsOpen = (s: CarpoolState) =>
  ((!!s.open && begun(s.openFrom)) || (!s.open && !!s.recruitOn && passed(s.recruitUntil))) && !passed(s.waitUntil);
// 기본값 위에 저장된 값을 얹는다(바꾼 칸만 저장된 줄도 published·publishedAt 이 늘 있게)
export const carpoolState = async (eventId: string): Promise<CarpoolState> =>
  ({ published: false, publishedAt: "", ...(await getSetting<Partial<CarpoolState>>(key(eventId), {})) });
// 바꾼 값만 덮어쓴다(신청 받기·대기 기한은 그대로 두고 확정 상태만 바꾸는 등).
//  DB 에서 한 번에 합치므로 두 관리자가 거의 동시에 다른 칸을 저장해도 서로 지우지 않는다.
export const saveCarpoolState = (eventId: string, s: Partial<CarpoolState>): Promise<void> => mergeSetting(key(eventId), s);
// 개별 이동 회원 더하기/빼기: 목록 전체를 다시 쓰지 않고 그 회원만 넣고 뺀다(동시에 여럿이 골라도 잃지 않게)
const selfKey = (d: Dir) => (d === "go" ? "selfGo" : "selfBack");
export const addSelf = (eventId: string, d: Dir, mids: string[]): Promise<void> => addToSettingList(key(eventId), [selfKey(d)], mids);
export const removeSelf = (eventId: string, d: Dir, mids: string[]): Promise<void> => removeFromSettingList(key(eventId), [selfKey(d)], mids);

// 구간별로 아직 차가 없는 참석자(운전자나 탑승자로 들어가지 않은 사람)
// self: 개별 이동을 고른 회원(배정 대기에서 뺀다)
export function freeFor(all: Car[], applicants: string[], self: Record<Dir, string[]> = { go: [], back: [] }): Record<Dir, string[]> {
  const used = { go: new Set<string>(self.go), back: new Set<string>(self.back) };
  for (const c of all) for (const d of DIRS) for (const pid of peopleOn(c, d)) used[d].add(pid);
  return { go: applicants.filter((p) => !used.go.has(p)), back: applicants.filter((p) => !used.back.has(p)) };
}

// 자동 배정: 구간별로 빈 좌석에 그 구간 차가 없는 참석자를 차례로 채운다.
export async function autoAssign(eventId: string, applicants: string[]): Promise<number> {
  const s = await getStore();
  const all = await cars(eventId);
  let added = 0;
  for (const car of all) {
    let changed = false;
    for (const d of dirsOf(car)) {
      const free = freeFor(all, applicants)[d];
      const room = riderCap(car, d) - car[d].riders.length;
      const take = free.filter((p) => p !== car.driverId && !car[d].riders.includes(p)).slice(0, Math.max(0, room));
      if (take.length === 0) continue;
      car[d].riders = [...car[d].riders, ...take];
      added += take.length;
      changed = true;
    }
    if (changed) await s.update("Carpools", car.id, toRow(car));
  }
  return added;
}

// 지원한 차량의 빈 칸(차량번호, 운행하는 구간의 출발지·출발 시간·도착지). 회원에게 채워 달라고 알릴 때 쓴다.
export function missingInfo(c: Car): string[] {
  const out: string[] = [];
  if (!c.plate.trim()) out.push("차량번호");
  for (const d of DIRS) {
    if (!c[d].on) continue;
    if (!c[d].from.trim()) out.push(`${DIR_LABEL[d]} 출발지`);
    if (!c[d].departAt.trim()) out.push(`${DIR_LABEL[d]} 출발 시간`);
    if (!c[d].to.trim()) out.push(`${DIR_LABEL[d]} 도착지`);
  }
  return out;
}

// 지원 회원이 운전하지 않으면(다른 회원·외부 사람이 운전) 지원 회원을 그 차 탑승자로 먼저 넣는다(운행하는 구간마다).
// 같은 구간의 다른 차에 타고 있었으면 거기서 뺀다(그 차는 저장). 지원 회원이 직접 운전하면 탑승자에서 뺀다.
// 뺀 차·구간을 돌려준다(부르는 쪽에서 lib/car-requests.ts ownerMoved 로 그 자리에 대기자를 올린다).
export async function seatOwner(others: Car[], car: Car): Promise<{ id: string; dir: Dir }[]> {
  const mid = car.ownerId;
  const freed: { id: string; dir: Dir }[] = [];
  if (!mid) return freed;
  const s = await getStore();
  for (const d of DIRS) {
    if (car.driverId === mid || !car[d].on) {
      car[d].riders = car[d].riders.filter((x) => x !== mid);
      continue;
    }
    if (!car[d].riders.includes(mid)) car[d].riders = [mid, ...car[d].riders];
    for (const o of others.filter((x) => x.id !== car.id && x[d].riders.includes(mid))) {
      o[d].riders = o[d].riders.filter((x) => x !== mid);
      await s.update("Carpools", o.id, toRow(o));
      freed.push({ id: o.id, dir: d });
    }
  }
  return freed;
}
