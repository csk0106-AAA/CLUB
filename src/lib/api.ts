import { NextResponse } from "next/server";
import { can, getSession, type Session } from "./auth";
import { getStore } from "./store";

type Guard = { s: Session } | { err: NextResponse };

// 로그인 확인. perm 을 주면 관리자 2차 인증과 해당 권한까지 확인한다.
// 여러 권한 중 하나만 있어도 되면 perm 에 배열을 준다.
export async function guard(perm?: string | string[]): Promise<Guard> {
  const s = await getSession();
  if (!s) return { err: NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 }) };
  if (s.host) return { err: hostOnly() };
  if (perm) {
    const list = Array.isArray(perm) ? perm : [perm];
    if (!list.some((p) => can(s, p))) {
      return { err: NextResponse.json({ error: "이 작업을 할 권한이 없어요." }, { status: 403 }) };
    }
  }
  return { s };
}

// 사회자 접속번호로 들어온 세션이 다른 화면을 부르면: 화면(client.ts)이 hostOnly 를 보고 /host 로 보낸다.
function hostOnly(): NextResponse {
  return NextResponse.json({ error: "사회자 접속 중에는 활동 진행 화면만 볼 수 있어요.", hostOnly: true }, { status: 403 });
}

// 활동 진행(사회자 화면) API 용: 관리자 권한이 있거나, 이 활동의 사회자 접속번호로 로그인한 경우 통과.
export async function hostGuard(aid: string, perm: string | string[] = ["activities", "events"]): Promise<Guard> {
  const s = await getSession();
  if (!s) return { err: NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 }) };
  if (s.host) {
    // 관리자가 사회자를 바꾸거나 지정을 풀면 예전 세션은 바로 막힌다.
    const act = s.host.includes(aid) ? (await (await getStore()).list("EventActivities")).find((a) => a.id === aid) : undefined;
    return act && act.hostId === s.mid ? { s } : { err: NextResponse.json({ error: "이 활동의 사회자가 아니에요.", hostOnly: true }, { status: 403 }) };
  }
  const list = Array.isArray(perm) ? perm : [perm];
  if (!list.some((p) => can(s, p))) return { err: NextResponse.json({ error: "이 작업을 할 권한이 없어요." }, { status: 403 }) };
  return { s };
}

export function bad(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function parseJson<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export const ADMIN_PERMS = ["all", "members", "events", "fees", "activities", "minutes"] as const;
export const MAX_ADMINS = 5;
