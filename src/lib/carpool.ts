import { z } from "zod";
import { parseJson } from "./api";
import { getSetting, getStore, setSetting } from "./store";
import type { Row } from "./store/types";

// 예전 방식의 구간 이름. 지금은 차량마다 갈 때(go)·올 때(back) 운행 여부를 따로 저장하고,
// leg 열은 예전 코드와 호환되도록 goOn/backOn 에서 만들어 함께 저장한다.
export const LEGS = ["왕복", "갈 때", "올 때"] as const;
export type Leg = (typeof LEGS)[number];

export const DIRS = ["go", "back"] as const;
export type Dir = (typeof DIRS)[number];
export const DIR_LABEL: Record<Dir, string> = { go: "갈 때", back: "올 때" };

// 한 구간의 운행 정보: 출발지·출발 시간·도착지·도착 예상 시간·탑승자
export type LegInfo = { on: boolean; from: string; departAt: string; to: string; arriveAt: string; riders: string[] };
export type Car = {
  id: string; name: string; plate: string; driverId: string; seats: number; // 이름 외 운전자·차량번호는 선택 입력
  leg: Leg; // goOn/backOn 에서 만든 값(호환용)
  go: LegInfo; back: LegInfo;
};

export const emptyLeg = (on = false): LegInfo => ({ on, from: "", departAt: "", to: "", arriveAt: "", riders: [] });

export const legName = (go: boolean, back: boolean): Leg => (go && back ? "왕복" : back && !go ? "올 때" : "갈 때");
export const dirsOf = (c: Pick<Car, "go" | "back">): Dir[] => DIRS.filter((d) => c[d].on);

// 저장된 행 → 차량. goOn/backOn 이 없으면 예전 leg 값으로 한 번 바꿔 읽는다.
// 왕복: 갈 때·올 때 모두 운행, 탑승자 같음, 올 때 출발지/도착지는 갈 때의 반대(시간은 비움)
// 갈 때: 갈 때만 / 올 때: 올 때만(예전 출발·도착 정보를 올 때로 옮김)
export function toCar(r: Row): Car {
  const base = { id: r.id, name: r.name ?? "", plate: r.plate ?? "", driverId: r.driverId ?? "", seats: Number(r.seats) || 0 };
  const flat: LegInfo = {
    on: true, from: r.from ?? "", departAt: r.departAt ?? "", to: r.to ?? "", arriveAt: r.arriveAt ?? "", riders: parseJson<string[]>(r.riders, []),
  };
  const known = (v: string | undefined) => v === "true" || v === "false";
  if (known(r.goOn) || known(r.backOn)) {
    const go = { ...flat, on: r.goOn === "true" };
    const back: LegInfo = {
      on: r.backOn === "true", from: r.backFrom ?? "", departAt: r.backDepartAt ?? "", to: r.backTo ?? "", arriveAt: r.backArriveAt ?? "",
      riders: parseJson<string[]>(r.backRiders, []),
    };
    return { ...base, leg: legName(go.on, back.on), go, back };
  }
  if (r.leg === "올 때") return { ...base, leg: "올 때", go: emptyLeg(false), back: flat };
  if (r.leg === "왕복") {
    return { ...base, leg: "왕복", go: flat, back: { on: true, from: flat.to, departAt: "", to: flat.from, arriveAt: "", riders: [...flat.riders] } };
  }
  return { ...base, leg: "갈 때", go: flat, back: emptyLeg(false) };
}

// 차량 → 저장할 열. 운행하지 않는 구간의 탑승자는 비운다.
export function toRow(c: Car): Record<string, string> {
  const go = c.go.on ? c.go.riders : [];
  const back = c.back.on ? c.back.riders : [];
  return {
    name: c.name, plate: c.plate, driverId: c.driverId, seats: String(c.seats), leg: legName(c.go.on, c.back.on),
    goOn: String(c.go.on), backOn: String(c.back.on),
    from: c.go.from, departAt: c.go.departAt, to: c.go.to, arriveAt: c.go.arriveAt, riders: JSON.stringify(go),
    backFrom: c.back.from, backDepartAt: c.back.departAt, backTo: c.back.to, backArriveAt: c.back.arriveAt, backRiders: JSON.stringify(back),
  };
}

// 등록·수정 입력. go/back 에 구간별 정보를 받는다.
// 예전 형식(leg + from/to/departAt/arriveAt/riders)도 받아서 같은 모양으로 바꾼다.
const text = (max: number) => z.string().trim().max(max).optional();
const legInput = z.object({
  on: z.boolean().optional(), from: text(60), departAt: text(40), to: text(60), arriveAt: text(40), riders: z.array(z.string()).max(12).optional(),
});
export const carInput = z.object({
  name: text(30), plate: text(20), driverId: z.string().optional(), seats: z.number().int().min(1).max(12).optional(),
  go: legInput.optional(), back: legInput.optional(),
  leg: z.enum(LEGS).optional(), from: text(60), departAt: text(40), to: text(60), arriveAt: text(40), riders: z.array(z.string()).max(12).optional(),
});
export type CarInput = z.infer<typeof carInput>;

export const newCar = (): Car => ({ id: "new", name: "", plate: "", driverId: "", seats: 4, leg: "왕복", go: emptyLeg(true), back: emptyLeg(true) });

const FIELDS = ["from", "departAt", "to", "arriveAt"] as const;

export function applyInput(cur: Car, d: CarInput): Car {
  const next: Car = { ...cur, go: { ...cur.go, riders: [...cur.go.riders] }, back: { ...cur.back, riders: [...cur.back.riders] } };
  if (d.name !== undefined) next.name = d.name;
  if (d.plate !== undefined) next.plate = d.plate;
  if (d.driverId !== undefined) next.driverId = d.driverId;
  if (d.seats !== undefined) next.seats = d.seats;
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

// 그룹명을 비워 두면 "카풀 1조", "카풀 2조"처럼 안 쓰인 번호로 임의의 이름을 붙인다. 관리자가 나중에 바꿀 수 있다.
export function suggestName(all: Car[]): string {
  const used = new Set(all.map((c) => c.name));
  let n = all.length + 1;
  while (used.has(`카풀 ${n}조`)) n++;
  return `카풀 ${n}조`;
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
    if (next[d].riders.length > next.seats) return `${label}: 좌석은 ${next.seats}개예요. 탑승자를 줄이거나 좌석 수를 늘려 주세요.`;
    if (timeOrder(next[d].departAt, next[d].arriveAt)) return `${label}: 도착 시간이 출발 시간보다 빠를 수 없어요.`;
    for (const pid of people) {
      const o = others.find((x) => peopleOn(x, d).includes(pid));
      if (o) return `${names.get(pid) ?? "회원"} 님은 ${label} 다른 차량(${o.name})에 이미 있어요.`;
    }
  }
  return null;
}

const key = (eventId: string) => `carpool:${eventId}`;
export type CarpoolState = { published: boolean; publishedAt: string };
export const carpoolState = (eventId: string): Promise<CarpoolState> =>
  getSetting<CarpoolState>(key(eventId), { published: false, publishedAt: "" });
export const saveCarpoolState = (eventId: string, s: CarpoolState): Promise<void> => setSetting(key(eventId), s);

// 구간별로 아직 차가 없는 참석자(운전자나 탑승자로 들어가지 않은 사람)
export function freeFor(all: Car[], applicants: string[]): Record<Dir, string[]> {
  const used = { go: new Set<string>(), back: new Set<string>() };
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
      const room = car.seats - car[d].riders.length;
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
