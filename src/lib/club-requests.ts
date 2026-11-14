import { readObservers } from "./audience";
import { clubLeaders } from "./clubs";
import { memberClubs } from "./lists";
import { ownPerms } from "./perms";
import { getStore } from "./store";
import type { Row } from "./store/types";

// 소모임 가입 신청 / 소모임 행사 1회 참관 신청 (ClubRequests 탭).
//  - 소모임 밖 회원이 보내고, 그 소모임 직책자(Members.clubs 의 role 이 있는 회원)가 승인·거절한다.
//    직책자가 아직 없는 소모임이면 전체 관리자(perms 에 all)가 대신 처리한다.
//  - 승인: join → 회원의 Members.clubs 에 그 소모임(직책 없음)을 더한다.
//          observe → 그 행사의 참관자(Events.observers)에 더한다.
//  - 결과는 신청한 회원의 알림(홈 화면 종 아이콘)에 뜨고, 본 뒤에는 숫자에서 빠진다(resultSeen).
export type ReqKind = "join" | "observe";
export type ReqStatus = "pending" | "approved" | "declined";
export const KIND_LABEL: Record<ReqKind, string> = { join: "소모임 가입", observe: "행사 1회 참관" };

// 이 소모임 신청을 처리할 회원 id 목록
export function handlersOf(members: Row[], club: string): string[] {
  const leaders = clubLeaders(members, club).map((l) => l.id).filter(Boolean);
  if (leaders.length) return leaders;
  return members.filter((m) => m.kind !== "회원대기" && ownPerms(m).includes("all")).map((m) => m.id);
}

export function canHandle(members: Row[], club: string, mid: string): boolean {
  return handlersOf(members, club).includes(mid);
}

const inClub = (m: Row | undefined, club: string) => !!m && memberClubs(m).some((c) => c.name === club);

// 이미 승인된 것과 같은 상태인지(가입돼 있거나 참관자로 들어가 있으면 다시 신청할 필요가 없다)
export function alreadyIn(kind: ReqKind, me: Row | undefined, club: string, ev?: Row): boolean {
  if (inClub(me, club)) return true;
  if (kind === "observe" && ev && me) return readObservers(ev.observers).includes(me.id);
  return false;
}

// 같은 회원·종류·소모임(참관이면 같은 행사)의 처리 대기 신청
export function pendingDup(rows: Row[], kind: ReqKind, club: string, memberId: string, eventId: string): Row | undefined {
  return rows.find((r) =>
    r.status === "pending" && r.kind === kind && r.club === club && r.memberId === memberId && (kind === "join" || r.eventId === eventId),
  );
}

// 알림 숫자: 내가 처리할 신청 + 아직 안 본 내 신청 결과
export async function requestCounts(mid: string): Promise<{ toHandle: number; results: number }> {
  const s = await getStore();
  const [rows, members] = await Promise.all([s.list("ClubRequests"), s.list("Members")]);
  return countIn(rows, members, mid);
}

export function countIn(rows: Row[], members: Row[], mid: string): { toHandle: number; results: number } {
  const handlerCache = new Map<string, string[]>();
  const hs = (club: string) => {
    if (!handlerCache.has(club)) handlerCache.set(club, handlersOf(members, club));
    return handlerCache.get(club)!;
  };
  return {
    toHandle: rows.filter((r) => r.status === "pending" && r.memberId !== mid && hs(r.club).includes(mid)).length,
    results: rows.filter((r) => r.memberId === mid && r.status !== "pending" && r.resultSeen !== "true").length,
  };
}
