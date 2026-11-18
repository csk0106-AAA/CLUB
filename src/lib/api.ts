import { NextResponse } from "next/server";
import { can, getSession, type Session } from "./auth";
import { readEditors } from "./editors";
import { isHost } from "./hosts";
import { memberClubs } from "./lists";
import { creatableTypes } from "./perm-keys";
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

// 일정 하나를 다루는 관리 API(/api/admin/events/[id]/…) 용.
//  perm(기본 일정관리) 권한이 있으면 통과. 없으면 "일정 만들기" 권한(evMain·evClub)이 있고
//  그 일정을 내가 만든 경우(Events.createdBy)에만 통과한다(다른 사람이 만든 일정은 고칠 수 없다).
//  클럽관리 권한(clubs)은 클럽 일정이면 통과한다.
export async function guardEv(ctx: { params: Promise<{ id: string }> }, perm: string | string[] = "events"): Promise<Guard> {
  const s = await getSession();
  if (!s) return { err: NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 }) };
  if (s.host) return { err: hostOnly() };
  const list = Array.isArray(perm) ? perm : [perm];
  if (list.some((p) => can(s, p))) return { s };
  const clubs = can(s, "clubs");
  if (clubs || can(s, "evMain") || can(s, "evClub")) {
    const { id } = await ctx.params;
    const ev = (await (await getStore()).list("Events")).find((e) => e.id === id);
    // 클럽관리 권한: 클럽 일정은 모두 관리한다
    if (ev && clubs && (ev.club ?? "").trim()) return { s };
    // 내가 만들었거나 만든 사람이 편집자로 추가한 일정 — 그 일정 종류를 만들 권한이 지금도 있어야 한다
    const types = s.admin ? creatableTypes(s.perms) : [];
    const mine = !!ev && (ev.createdBy === s.mid || readEditors(ev.editors).includes(s.mid));
    if (ev && mine && (!types || types.includes(ev.type))) return { s };
    return { err: NextResponse.json({ error: "내가 만든 일정이나 편집자로 추가된 일정만 고칠 수 있어요." }, { status: 403 }) };
  }
  return { err: NextResponse.json({ error: "이 작업을 할 권한이 없어요." }, { status: 403 }) };
}

// 일정 삭제: 일정관리 권한, 클럽관리 권한(클럽 일정), 또는 만든 사람(그 일정 종류를 만들 권한이 지금도 있을 때).
// 편집자는 고칠 수만 있고 지울 수는 없다.
export function canDeleteEvent(s: Session, ev: { type?: string; club?: string; createdBy?: string }): boolean {
  if (s.host) return false;
  if (can(s, "events")) return true;
  if (can(s, "clubs") && (ev.club ?? "").trim()) return true;
  if (ev.createdBy !== s.mid || !(can(s, "evMain") || can(s, "evClub"))) return false;
  const types = s.admin ? creatableTypes(s.perms) : [];
  return !types || types.includes(ev.type ?? "");
}

// 관리자(perm, 2차 비밀번호 통과) 또는 클럽 직책자(관리자 비밀번호 없이) 통과.
//  adminOk: 관리자 권한으로 통과했는지(모든 클럽·삭제 등), officerOf: 내가 직책을 맡은 클럽 이름들(지금 DB 기준)
export type OfficerGuard = { s: Session; adminOk: boolean; officerOf: string[] } | { err: NextResponse };
export async function adminOrOfficer(perm: string | string[]): Promise<OfficerGuard> {
  const s = await getSession();
  if (!s) return { err: NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 }) };
  if (s.host) return { err: hostOnly() };
  const list = Array.isArray(perm) ? perm : [perm];
  const adminOk = list.some((p) => can(s, p));
  const me = (await (await getStore()).list("Members")).find((m) => m.id === s.mid);
  // 클럽 직책자도 관리자 기능을 쓸 때는 관리자 비밀번호(2차 인증)를 거쳐야 한다(session.admin).
  const officerOf = me && s.admin ? memberClubs(me).filter((c) => c.role).map((c) => c.name) : [];
  if (!adminOk && officerOf.length === 0) {
    const isOfficer = !!me && memberClubs(me).some((c) => c.role);
    return { err: NextResponse.json({ error: isOfficer && !s.admin ? "관리자 비밀번호를 먼저 입력해 주세요." : "이 작업을 할 권한이 없어요." }, { status: 403 }) };
  }
  return { s, adminOk, officerOf };
}

// 진행자 접속번호로 들어온 세션이 다른 화면을 부르면: 화면(client.ts)이 hostOnly 를 보고 /host 로 보낸다.
function hostOnly(): NextResponse {
  return NextResponse.json({ error: "진행자 접속 중에는 활동 진행 화면만 볼 수 있어요.", hostOnly: true }, { status: 403 });
}

// 활동 진행(진행자 화면) API 용: 관리자 권한이 있거나, 이 활동의 진행자 접속번호로 로그인한 경우 통과.
export async function hostGuard(aid: string, perm: string | string[] = ["templates", "events"]): Promise<Guard> {
  const s = await getSession();
  if (!s) return { err: NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 }) };
  if (s.host) {
    // 관리자가 진행자를 바꾸거나 지정을 풀면 예전 세션은 바로 막힌다.
    const act = s.host.includes(aid) ? (await (await getStore()).list("EventActivities")).find((a) => a.id === aid) : undefined;
    return act && isHost(act, s.mid) ? { s } : { err: NextResponse.json({ error: "이 활동의 진행자가 아니에요.", hostOnly: true }, { status: 403 }) };
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

// 관리자 권한 범위(lib/perm-keys.ts)
export { PERM_KEYS as ADMIN_PERMS } from "./perm-keys";
export const MAX_ADMINS = 5;
