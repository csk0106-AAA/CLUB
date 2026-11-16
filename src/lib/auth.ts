import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { normPerms } from "./perm-keys";
import { getStore } from "./store";

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30일

export type Session = {
  mid: string;
  name: string;
  perms: string[]; // 관리자 권한 목록. 비어 있으면 일반 회원
  admin: boolean; // 관리자 2차 비밀번호까지 통과했는지
  // 진행자 접속번호로 로그인했을 때만: 진행할 수 있는 활동 id 목록. 이 세션은 활동 진행 화면만 쓸 수 있다.
  host?: string[];
};

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET 환경변수가 필요합니다.");
  }
  return new TextEncoder().encode(s ?? "dev-only-secret-change-before-deploy-0123456789");
}

export async function createSession(s: Session): Promise<void> {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

// 회원 명단의 지금 이름(못 찾거나 읽지 못하면 토큰의 이름)
async function currentName(mid: string, fallback: string): Promise<string> {
  try {
    const m = (await (await getStore()).list("Members")).find((x) => x.id === mid);
    return m?.name || fallback;
  } catch {
    return fallback;
  }
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const mid = String(payload.mid);
    return {
      mid,
      // 이름은 로그인할 때 토큰에 넣은 값이 아니라 지금 회원 명단의 이름(관리자가 회원 명단에서 이름을 바꾸면 바로 반영).
      // 회원은 id 로 찾으므로 이름을 바꿔도 로그인·권한·기록은 그대로다.
      name: await currentName(mid, String(payload.name)),
      // 예전 권한 이름(fees·minutes·activities·board)은 지금 이름으로 바꿔 읽는다
      perms: Array.isArray(payload.perms) ? normPerms((payload.perms as unknown[]).map(String)) : [],
      admin: payload.admin === true,
      ...(Array.isArray(payload.host) ? { host: (payload.host as unknown[]).map(String) } : {}),
    };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

// 권한 확인: 'all' 은 모든 권한. 관리자 2차 비밀번호를 통과해야 한다.
export function can(s: Session | null, perm: string): boolean {
  if (!s || !s.admin || s.host) return false;
  return s.perms.includes("all") || s.perms.includes(perm);
}

// 로그인 실패 잠금 (5회 연속 실패 시 1분). 서버 메모리 기반이라 인스턴스가 바뀌면 초기화된다.
const fails = new Map<string, { n: number; until: number }>();

export function lockedFor(key: string): number {
  const f = fails.get(key);
  if (!f || f.until <= Date.now()) return 0;
  return Math.ceil((f.until - Date.now()) / 1000);
}

export function recordFail(key: string): void {
  const f = fails.get(key) ?? { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 5) {
    f.until = Date.now() + 60_000;
    f.n = 0;
  }
  fails.set(key, f);
}

export function clearFails(key: string): void {
  fails.delete(key);
}
