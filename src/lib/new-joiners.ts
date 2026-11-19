import { readAudience } from "./audience";
import { readEditors } from "./editors";
import { isGuest, isWithdrawn } from "./member-kind";
import { effectivePerms, isClubOfficer, type getPermGroups } from "./perms";
import { creatableTypes } from "./perm-keys";
import { canManage, manageHref, managedOf } from "./published";
import type { Row } from "./store/types";

// 신규 회원 확인: 공개 대상을 "골라서" 올린 글·일정은 그 뒤 가입한 회원이 볼 수 없다.
// 그런 회원이 있으면 글쓴이·편집자(회칙·회비 글은 그 관리자), 일정은 그 일정을 관리하는 사람에게 알린다
// (종 알림 숫자·알림 창, 게시판 맨 위, 글 화면, 일정 관리 화면).
// 기준 시각: 확인한 시각(audSeenAt) → 마지막 수정 → 올린 시각. 회원 가입 시각은 Members.joinedAt.

export function joinersSince(audienceRaw: string | undefined, since: string, members: Row[], skip: string[] = []): { id: string; name: string }[] {
  const aud = readAudience(audienceRaw);
  if (aud.mode === "all" || !since) return [];
  const inAud = new Set(aud.memberIds);
  return members
    .filter((m) => m.joinedAt && m.joinedAt > since && !inAud.has(m.id) && !skip.includes(m.id) && !isWithdrawn(m.kind))
    .map((m) => ({ id: m.id, name: m.name }));
}

export const postJoiners = (p: Row, members: Row[]) => joinersSince(p.audience, p.audSeenAt || p.updatedAt || p.createdAt || "", members, [p.authorId]);

// 일정: 클럽 일정은 클럽 회원이 대상(새 회원도 클럽을 고르면 자동)이라 해당 없음. 공개된 일정만.
export function eventJoiners(e: Row, members: Row[], stamps: Record<string, string>): { id: string; name: string }[] {
  if (e.published !== "true" || (e.club ?? "").trim()) return [];
  return joinersSince(e.audience, e.audSeenAt || stamps[e.id] || e.createdAt || "", members);
}

// 이 사람이 처리할 신규 회원 확인 건(종 알림)
export type JoinerIssue = { kind: "post" | "event"; id: string; title: string; count: number; href: string };
export async function joinerIssuesFor(me: Row | undefined, groups: Awaited<ReturnType<typeof getPermGroups>>, posts: Row[], events: Row[], members: Row[], stamps: Record<string, string>): Promise<JoinerIssue[]> {
  if (!me || isGuest(me.kind)) return [];
  const perms = effectivePerms(me, groups);
  const all = perms.includes("all");
  // 화면과 같은 기준(고칠 수 있는 사람에게만 알린다)
  //  글 편집자: 지금도 글쓰기 권한(모든권한·게시글_글쓰기·클럽 직책자)이 있어야 한다(board/_lib/server.ts isEditorOf)
  //  일정 만든 사람·편집자: 그 일정 종류를 만들 권한이 지금도 있어야 한다(lib/api.ts guardEv)
  const canWrite = all || perms.includes("write") || isClubOfficer(me);
  const types = creatableTypes(perms); // null = 모든 종류
  const out: JoinerIssue[] = [];
  for (const p of posts) {
    const managed = managedOf(p);
    const mine = managed ? await canManage(me, perms, managed) : all || p.authorId === me.id || (canWrite && readEditors(p.editors).includes(me.id));
    if (!mine) continue;
    const n = postJoiners(p, members).length;
    if (n) out.push({ kind: "post", id: p.id, title: p.title ?? "", count: n, href: managed ? manageHref(managed, perms) : `/board/${p.id}` });
  }
  const evAll = all || perms.includes("events");
  for (const e of events) {
    const own = (e.createdBy === me.id || readEditors(e.editors).includes(me.id)) && (types === null || types.includes(e.type));
    if (!(evAll || own)) continue;
    const n = eventJoiners(e, members, stamps).length;
    if (n) out.push({ kind: "event", id: e.id, title: e.name ?? "", count: n, href: `/admin/events/${e.id}` });
  }
  return out;
}
