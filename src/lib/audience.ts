import { z } from "zod";
import { parseJson } from "./api";

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

// 회원에게 이 행사가 보이는지: 공개(published) + 공개 대상에 포함
export function eventVisible(e: { published?: string; audience?: string }, memberId: string): boolean {
  return e.published === "true" && inAudience(readAudience(e.audience), memberId);
}

// 화면 표시용 요약
export function audienceLabel(a: Audience, names?: { events?: Record<string, string> }): string {
  if (a.mode === "all") return "전체 회원";
  const n = `${a.memberIds.length}명`;
  if (a.mode === "members") return `선택한 회원 ${n}`;
  if (a.mode === "events") return `행사 참석자 (${a.events.map((id) => names?.events?.[id] ?? "행사").join(", ")}) ${n}`;
  return `소모임 (${a.clubs.join(", ")}) ${n}`;
}
