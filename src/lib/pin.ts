// 개인 PIN(서버 전용): 회원 로그인 PIN과 관리자 화면용 PIN.
//  - PIN 은 그대로 저장하지 않고 scrypt 해시로만 저장한다(Pins 탭 — 회원 명단·내보내기에 나오지 않게 따로 둔다).
//  - 회원 PIN: 처음 로그인할 때(연락처 뒷자리 4자리)만 쓰고 그때 6자리 PIN 을 만든다. 그 뒤로는 PIN 으로만 로그인한다.
//  - 관리자용 PIN: 관리자 화면에 처음 들어갈 때 공용 관리자 비밀번호(ADMIN_PASSCODE)를 거쳐 만든다. 그 뒤로는 관리자용 PIN 으로만.
//  - 두 PIN 은 같은 번호를 쓸 수 없다.
//  - 로그인 실패 잠금은 DB(Settings fail:<키>)에 남겨 서버가 바뀌어도 유지한다(5번 틀리면 15분).
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSetting, getStore, setSetting } from "./store";

export type PinKind = "member" | "admin";

// PIN 적용 시작(한국 시간, 예: "2026-12-12T00:00:00+09:00"). 비워 두면 꺼져 있다(보류 중, 2026-11-23).
//  꺼져 있거나 그 전에는 예전 방식(연락처 뒷자리 4자리 로그인, 공용 관리자 비밀번호)으로 동작한다. 날짜가 정해지면 여기에 넣는다.
export const PIN_FROM: string = "";
export const pinActive = (now = Date.now()): boolean => !!PIN_FROM && now >= Date.parse(PIN_FROM);
const COL: Record<PinKind, "pinHash" | "adminPinHash"> = { member: "pinHash", admin: "adminPinHash" };

// PIN 규칙: 6자리 숫자, 같은 숫자 반복·연속 숫자(123456, 654321 등) 금지, 내 연락처 뒷자리 4자리를 포함하면 안 된다
export function pinProblem(pin: string, phone = ""): string | null {
  if (!/^\d{6}$/.test(pin)) return "PIN 은 숫자 6자리로 정해 주세요.";
  if (/^(\d)\1{5}$/.test(pin)) return "같은 숫자만 반복한 PIN 은 쓸 수 없어요.";
  const up = "01234567890", down = "09876543210";
  if (up.includes(pin) || down.includes(pin)) return "연속된 숫자(예: 123456)는 쓸 수 없어요.";
  const tail = phone.replace(/\D/g, "").slice(-4);
  if (tail.length === 4 && pin.includes(tail)) return "휴대폰 번호 뒷자리 4자리가 들어간 PIN 은 쓸 수 없어요.";
  return null;
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `s1$${salt}$${hash}`;
}

export function verifyPin(pin: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const [v, salt, hash] = stored.split("$");
  if (v !== "s1" || !salt || !hash) return false;
  const got = scryptSync(pin, salt, 32);
  const want = Buffer.from(hash, "hex");
  return want.length === got.length && timingSafeEqual(got, want);
}

export async function pinsOf(mid: string): Promise<{ member: string; admin: string }> {
  const row = await (await getStore()).get("Pins", mid);
  return { member: row?.pinHash ?? "", admin: row?.adminPinHash ?? "" };
}

// PIN 저장. 다른 종류의 PIN 과 같은 번호면 막는다(이유를 돌려준다, 저장하면 null)
export async function savePin(mid: string, kind: PinKind, pin: string): Promise<string | null> {
  const s = await getStore();
  const row = await s.get("Pins", mid);
  const other = kind === "member" ? row?.adminPinHash : row?.pinHash;
  if (other && verifyPin(pin, other)) return kind === "member" ? "관리자용 PIN 과 다른 번호로 정해 주세요." : "로그인 PIN 과 다른 번호로 정해 주세요.";
  const patch = { [COL[kind]]: hashPin(pin), updatedAt: new Date().toISOString() };
  if (row) await s.update("Pins", mid, patch);
  else await s.insert("Pins", { id: mid, pinHash: "", adminPinHash: "", ...patch });
  return null;
}

export async function clearPin(mid: string, kind: PinKind): Promise<void> {
  const s = await getStore();
  if (await s.get("Pins", mid)) await s.update("Pins", mid, { [COL[kind]]: "", updatedAt: new Date().toISOString() });
}

// ── 로그인 실패 잠금(DB) ──
const LIMIT = 5;
const LOCK_MS = 15 * 60_000;
type Fail = { n: number; until: number };
const fkey = (k: string) => `fail:${k}`;

export async function failWait(key: string): Promise<number> {
  const f = await getSetting<Fail | null>(fkey(key), null);
  if (!f || !f.until || f.until <= Date.now()) return 0;
  return Math.ceil((f.until - Date.now()) / 1000);
}
// 실패 하나 기록. 이번에 잠기면 true(호출한 쪽이 알림을 보낸다)
export async function failRecord(key: string): Promise<boolean> {
  const f = await getSetting<Fail | null>(fkey(key), null);
  const cur = f && f.until > Date.now() ? f : { n: f && !f.until ? f.n : 0, until: 0 };
  const n = cur.n + 1;
  if (n >= LIMIT) {
    await setSetting(fkey(key), { n: 0, until: Date.now() + LOCK_MS });
    return true;
  }
  await setSetting(fkey(key), { n, until: 0 });
  return false;
}
export async function failClear(key: string): Promise<void> {
  const f = await getSetting<Fail | null>(fkey(key), null);
  if (f) await setSetting(fkey(key), { n: 0, until: 0 });
}
export const waitText = (sec: number) => `여러 번 틀려서 잠겼어요. ${Math.ceil(sec / 60)}분 뒤에 다시 시도해 주세요.`;
