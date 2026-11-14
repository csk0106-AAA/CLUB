import { z } from "zod";
import { parseJson } from "./api";
import { memberClubs } from "./lists";

// 공개 대상(게시글·행사 공통).
//  mode "all"     : 전체 회원
//  mode "members" : 회원을 직접 고름
//  mode "events"  : 고른 행사(여러 개)의 참석자를 불러와서 고름
//  mode "clubs"   : 고른 소모임(여러 개)의 회원을 불러와서 고름
// 어느 방식이든 화면에서 아래 회원 목록을 한 번 더 고칠 수 있고, 최종 대상은 memberIds 다(저장 시점 기준).
// mode / events / clubs 는 어떤 기준으로 골랐는지 다시 보여 주기 위해 남긴다.
export type Audience = {
  mode: "all" | "members" | "events" | "clubs";
  events: string[];
  clubs: string[];
  memberIds: string[];
};

export const ALL: Audience = { mode: "all", events: [], clubs: [], memberIds: [] };

export const audienceInput = z.object({
  mode: z.enum(["all", "members", "events", "clubs"]),
  events: z.array(z.string().max(64)).max(50).default([]),
  clubs: z.array(z.string().max(40)).max(50).default([]),
  memberIds: z.array(z.string().max(64)).max(1000).default([]),
});

export function readAudience(text: string | undefined): Audience {
  const a = parseJson<Partial<Audience>>(text, {});
  if (!a || !a.mode || a.mode === "all") return ALL;
  return {
    mode: a.mode,
    events: Array.isArray(a.events) ? a.events.map(String) : [],
    clubs: Array.isArray(a.clubs) ? a.clubs.map(String) : [],
    memberIds: Array.isArray(a.memberIds) ? a.memberIds.map(String) : [],
  };
}

// 이 회원에게 보이는지(알림도 같은 기준으로 보낸다). 작성자에게는 항상 보인다.
export function inAudience(a: Audience, memberId: string, authorId?: string): boolean {
  if (a.mode === "all") return true;
  if (authorId && authorId === memberId) return true;
  return a.memberIds.includes(memberId);
}

// 소모임 행사의 참관자(회원 id 목록)
export function readObservers(text: string | undefined): string[] {
  const v = parseJson<unknown>(text, []);
  return Array.isArray(v) ? [...new Set(v.map(String).filter(Boolean))] : [];
}

// 행사를 보는 회원: id 와 Members.clubs(소모임 행사 판단용). 문자열(id)만 주면 소모임 회원 여부는 모르는 것으로 본다.
export type Viewer = { id?: string; clubs?: string };

// 회원에게 이 행사가 보이는지: 공개(published) + 대상에 포함
//  - 소모임 행사(e.club): 그 소모임 회원(Members.clubs 실시간) + 참관자(e.observers)
//  - 그 밖: 공개 대상(e.audience)
export function eventVisible(
  e: { published?: string; audience?: string; club?: string; observers?: string },
  who: Viewer | string,
): boolean {
  if (e.published !== "true") return false;
  const v: Viewer = typeof who === "string" ? { id: who } : who;
  const club = (e.club ?? "").trim();
  if (club) return inClubOrObserver(e, v);
  return inAudience(readAudience(e.audience), v.id ?? "");
}

// 소모임 행사 대상인지(공개 여부와 상관없이). 소모임이 없는 행사면 true.
export function inClubOrObserver(e: { club?: string; observers?: string }, v: Viewer): boolean {
  const club = (e.club ?? "").trim();
  if (!club) return true;
  return memberClubs(v).some((c) => c.name === club) || readObservers(e.observers).includes(v.id ?? "");
}

// 화면 표시용 요약
export function audienceLabel(a: Audience, names?: { events?: Record<string, string> }): string {
  if (a.mode === "all") return "전체 회원";
  const n = `${a.memberIds.length}명`;
  if (a.mode === "members") return `선택한 회원 ${n}`;
  if (a.mode === "events") return `행사 참석자 (${a.events.map((id) => names?.events?.[id] ?? "행사").join(", ")}) ${n}`;
  return `소모임 (${a.clubs.join(", ")}) ${n}`;
}
