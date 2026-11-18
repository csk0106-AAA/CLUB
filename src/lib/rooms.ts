import { parseJson } from "./api";
import { getSetting, getStore, setSetting } from "./store";
import type { Row } from "./store/types";

// 숙박 숙소배정: 날짜별로 방을 만들고 투숙자를 배정한다. 같은 날짜에 한 사람은 한 방에만 들어간다.
export type Room = { id: string; date: string; name: string; capacity: number; memo: string; guests: string[] };

export const toRoom = (r: Row): Room => ({
  id: r.id, date: r.date, name: r.name, capacity: Number(r.capacity) || 0, memo: r.memo ?? "", guests: parseJson<string[]>(r.guests, []),
});

export async function rooms(eventId: string): Promise<Room[]> {
  return (await (await getStore()).list("Rooms")).filter((r) => r.eventId === eventId).map(toRoom);
}

export const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

// 일정 기간에서 숙박하는 날짜(시작일부터 종료일 전날까지). 당일 일정이면 시작일만 돌려준다.
export function nightsOf(startsAt: string, endsAt: string): string[] {
  const s = startsAt.slice(0, 10);
  const e = endsAt.slice(0, 10);
  if (!validDate(s)) return [];
  if (!validDate(e) || e <= s) return [s];
  const out: string[] = [];
  for (let t = Date.parse(s); t < Date.parse(e) && out.length < 31; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

// 방 이름을 비워 두면 그 날짜에 안 쓰인 번호로 "객실 1", "객실 2"…를 붙인다.
export function suggestRoomName(all: Room[], date: string): string {
  const same = all.filter((r) => r.date === date);
  const used = new Set(same.map((r) => r.name));
  let n = same.length + 1;
  while (used.has(`객실 ${n}`)) n++;
  return `객실 ${n}`;
}

// 같은 날짜의 다른 방에 이미 있는 사람, 정원 초과, 중복을 걸러 안내 문구를 돌려준다.
export function roomConflict(all: Room[], next: Room, names: Map<string, string>): string | null {
  if (new Set(next.guests).size !== next.guests.length) return "같은 사람이 두 번 들어갔어요.";
  if (next.guests.length > next.capacity) return `정원은 ${next.capacity}명이에요. 투숙자를 줄이거나 정원을 늘려 주세요.`;
  for (const o of all) {
    if (o.id === next.id || o.date !== next.date) continue;
    const hit = next.guests.find((g) => o.guests.includes(g));
    if (hit) return `${names.get(hit) ?? "회원"} 님이 같은 날짜의 다른 방(${o.name})에 이미 있어요.`;
  }
  return null;
}

const key = (eventId: string) => `rooms:${eventId}`;
// same: "모든 밤 같은 배정"(첫날 밤 배정을 나머지 밤에 그대로 맞춘다). 아니면 날짜별 배정.
export type RoomState = { published: boolean; publishedAt: string; same?: boolean };
export const roomState = (eventId: string): Promise<RoomState> => getSetting<RoomState>(key(eventId), { published: false, publishedAt: "" });
// 바꾼 값만 덮어쓴다(배포 상태를 바꿔도 같은 배정 설정은 남게)
export const saveRoomState = async (eventId: string, s: Partial<RoomState>): Promise<void> => setSetting(key(eventId), { ...(await roomState(eventId)), ...s });

// "모든 밤 같은 배정"이면 첫날 밤 방 구성(방 이름·정원·메모·투숙자)을 나머지 밤에 그대로 맞춘다.
// 첫날 방을 만들거나 고치거나 지운 뒤, 그리고 같은 배정으로 바꿀 때 부른다.
export async function syncSameRooms(eventId: string): Promise<void> {
  if (!(await roomState(eventId)).same) return;
  const s = await getStore();
  const ev = (await s.list("Events")).find((e) => e.id === eventId);
  const nights = ev ? nightsOf(ev.startsAt ?? "", ev.endsAt ?? "") : [];
  if (nights.length < 2) return;
  const all = await rooms(eventId);
  const base = all.filter((r) => r.date === nights[0]);
  for (const r of all) if (r.date !== nights[0]) await s.remove("Rooms", r.id);
  for (const n of nights.slice(1)) {
    for (const r of base) await s.insert("Rooms", { eventId, date: n, name: r.name, capacity: String(r.capacity), memo: r.memo, guests: JSON.stringify(r.guests) });
  }
}
