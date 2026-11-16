import { readObservers } from "./audience";
import { clubLeaders } from "./clubs";
import { memberClubs } from "./lists";
import { isGuest } from "./member-kind";
import { effectivePerms, getPermGroups, type PermGroups } from "./perms";
import { getStore } from "./store";
import type { Row } from "./store/types";

// 소모임 가입 신청 / 소모임 일정 1회 참관 신청 (ClubRequests 탭).
//  - 소모임 밖 회원이 보내고, 그 소모임 직책자(Members.clubs 의 role 이 있는 회원)가 승인·거절한다.
//    직책자가 아직 없는 소모임이면 전체 관리자(perms 에 all)가 대신 처리한다.
//  - 승인: join → 회원의 Members.clubs 에 그 소모임(직책 없음)을 더한다.
//          observe → 그 일정의 참관자(Events.observers)에 더한다.
//  - attend="true"(소모임 일정 화면의 "소모임 관리자에게 요청하기"): 위 승인에 더해 그 일정에 참석 신청까지 넣는다.
//  - 결과는 신청한 회원의 알림(홈 화면 종 아이콘)에 뜨고, 본 뒤에는 숫자에서 빠진다(resultSeen).
export type ReqKind = "join" | "observe";
export type ReqStatus = "pending" | "approved" | "declined";
export const KIND_LABEL: Record<ReqKind, string> = { join: "소모임 가입 신청", observe: "일정 1회 참관 신청" };

// 이 소모임 신청을 처리할 회원 id 목록
// club 이 비어 있으면(대기회원·참관회원의 일반 일정 참관 신청) 일정 관리 권한(events)·모든 권한 관리자가 처리한다.
// groups: 직책·소모임 직책 그룹 권한(Settings permGroups). 회장 그룹으로 받은 "모든 권한"도 처리자로 본다.
export function handlersOf(members: Row[], club: string, groups: PermGroups = {}): string[] {
  if (!club) return members.filter((m) => !isGuest(m.kind) && effectivePerms(m, groups).some((p) => p === "all" || p === "events")).map((m) => m.id);
  const leaders = clubLeaders(members, club).map((l) => l.id).filter(Boolean);
  if (leaders.length) return leaders;
  return members.filter((m) => !isGuest(m.kind) && effectivePerms(m, groups).includes("all")).map((m) => m.id);
}

// 처리(승인·반려)할 수 있는지: 그 소모임 직책자(없으면 전체 관리자) + "모든 권한" 관리자는 언제나
export function canHandle(members: Row[], club: string, mid: string, groups: PermGroups = {}): boolean {
  if (handlersOf(members, club, groups).includes(mid)) return true;
  const me = members.find((m) => m.id === mid);
  return !!me && effectivePerms(me, groups).includes("all");
}

// 소모임관리 › 신청내역에서 볼 수 있는 소모임: 관리자(모든 권한·회원정보)는 전체(null), 소모임 직책자는 자기 소모임만
export function viewableClubs(members: Row[], mid: string, groups: PermGroups = {}): string[] | null {
  const me = members.find((m) => m.id === mid);
  if (!me) return [];
  const perms = effectivePerms(me, groups);
  if (perms.includes("all") || perms.includes("clubs")) return null;
  return memberClubs(me).filter((c) => c.role).map((c) => c.name);
}

// 회원 화면에 보낼 가입 신청 상태(소모임 회원이 아닐 때: "○○ 회원이 아닙니다" 칸)
export type JoinView = { id: string; status: string; reason: string; message: string; createdAt: string; handledAt: string } | null;
export function joinView(r: Row | undefined): JoinView {
  return r ? { id: r.id, status: r.status, reason: r.reason ?? "", message: r.message ?? "", createdAt: r.createdAt ?? "", handledAt: r.handledAt ?? "" } : null;
}

// 이 회원의 이 소모임 가입 신청 중 가장 최근 것(일정에서 보낸 가입+참석 요청 포함)
export function latestJoin(rows: Row[], memberId: string, club: string): Row | undefined {
  return rows
    .filter((r) => r.memberId === memberId && r.club === club && r.kind === "join")
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
}

const inClub = (m: Row | undefined, club: string) => !!m && memberClubs(m).some((c) => c.name === club);

// 이미 승인된 것과 같은 상태인지(가입돼 있거나 참관자로 들어가 있으면 다시 신청할 필요가 없다)
export function alreadyIn(kind: ReqKind, me: Row | undefined, club: string, ev?: Row): boolean {
  if (me && isGuest(me.kind)) return kind === "observe" && !!ev && readObservers(ev.observers).includes(me.id);
  if (inClub(me, club)) return true;
  if (kind === "observe" && ev && me) return readObservers(ev.observers).includes(me.id);
  return false;
}

// 소모임 일정 화면에서 보낸 "참석 요청"(참관/가입 + 그 일정 참석)인지
export const isAttend = (r: Row) => r.attend === "true";

// 알림 목록에 보일 신청 이름
export function reqLabel(r: Row): string {
  if (isAttend(r)) return r.kind === "join" ? "가입 + 참석 신청" : "참관 + 참석 신청";
  return KIND_LABEL[r.kind as ReqKind] ?? "신청";
}

// 이 회원이 이 일정에 보낸 처리 대기 중인 참석 요청(일정마다 하나만)
export function pendingAttend(rows: Row[], memberId: string, eventId: string): Row | undefined {
  return rows.find((r) => r.status === "pending" && isAttend(r) && r.memberId === memberId && r.eventId === eventId);
}

// 참석 요청 승인: 그 일정의 참석 신청을 "참석"으로 넣는다(이미 있으면 답만 참석으로, 고른 날짜는 그대로).
// 여러 날 일정(워크숍)은 날짜를 비워 두면 회원이 일정 화면에서 날짜를 고른다.
export async function attendApprove(memberId: string, eventId: string): Promise<void> {
  if (!eventId) return;
  const s = await getStore();
  const cur = (await s.list("EventApplies")).find((a) => a.eventId === eventId && a.memberId === memberId);
  if (cur) {
    if (cur.answer !== "참석") await s.update("EventApplies", cur.id, { answer: "참석" });
  } else {
    await s.insert("EventApplies", { eventId, memberId, answer: "참석", days: "", paid: "false" });
  }
}

// 같은 회원·종류·소모임(참관이면 같은 일정)의 처리 대기 신청
export function pendingDup(rows: Row[], kind: ReqKind, club: string, memberId: string, eventId: string): Row | undefined {
  return rows.find((r) =>
    r.status === "pending" && r.kind === kind && r.club === club && r.memberId === memberId && (kind === "join" || r.eventId === eventId),
  );
}

// 알림 숫자: 내가 처리할 신청 + 아직 안 본 내 신청 결과
export async function requestCounts(mid: string): Promise<{ toHandle: number; results: number }> {
  const s = await getStore();
  const [rows, members] = await Promise.all([s.list("ClubRequests"), s.list("Members")]);
  return countIn(rows, members, mid, await getPermGroups());
}

export function countIn(rows: Row[], members: Row[], mid: string, groups: PermGroups = {}): { toHandle: number; results: number } {
  const handlerCache = new Map<string, string[]>();
  const hs = (club: string) => {
    if (!handlerCache.has(club)) handlerCache.set(club, handlersOf(members, club, groups));
    return handlerCache.get(club)!;
  };
  return {
    toHandle: rows.filter((r) => r.status === "pending" && r.memberId !== mid && hs(r.club).includes(mid)).length,
    results: rows.filter((r) => r.memberId === mid && r.status !== "pending" && r.resultSeen !== "true").length,
  };
}
