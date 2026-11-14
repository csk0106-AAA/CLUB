import { parseJson } from "./api";
import { memberClubs } from "./lists";
import { getSetting, getStore } from "./store";

// 권한 모델
//  - 그룹 권한: Settings "permGroups" = { "pos:회장": ["all"], "club:회장": ["board"], … }
//      pos:<모임 직책>  — Members.position 이 이 직책인 회원
//      club:<소모임 직책> — Members.clubs 중 role 이 이 직책인 소모임이 하나라도 있는 회원
//  - 개인 권한: Members.perms ("|" 구분). extra.permsCustom 이 true 면 개인 권한만 쓴다(그룹 권한 무시).
//    아니면 최종 권한 = 그룹 권한 ∪ 개인 권한.
//  - "board" 권한: 게시글 작성(관리자는 양식 템플릿 수정까지). 소모임 직책자는 그룹 권한과 상관없이 작성만 할 수 있다.
export type PermGroups = Record<string, string[]>;

export const posKey = (p: string) => `pos:${p}`;
export const clubKey = (r: string) => `club:${r}`;

type M = { position?: string; clubs?: string; perms?: string; extra?: string };

export async function getPermGroups(): Promise<PermGroups> {
  return getSetting<PermGroups>("permGroups", {});
}

export function ownPerms(m: M): string[] {
  return m.perms ? m.perms.split("|").filter(Boolean) : [];
}

export function isPermsCustom(m: M): boolean {
  return parseJson<{ permsCustom?: boolean }>(m.extra, {}).permsCustom === true;
}

// 이 회원이 속한 그룹 키 목록
export function groupKeysOf(m: M): string[] {
  const keys: string[] = [];
  const pos = (m.position ?? "").trim();
  if (pos) keys.push(posKey(pos));
  for (const c of memberClubs(m)) if (c.role) keys.push(clubKey(c.role));
  return [...new Set(keys)];
}

export function groupPermsOf(m: M, groups: PermGroups): string[] {
  return [...new Set(groupKeysOf(m).flatMap((k) => groups[k] ?? []))];
}

// 최종 권한(정렬, "all" 이 있으면 ["all"] 만)
export function effectivePerms(m: M, groups: PermGroups): string[] {
  const set = new Set(isPermsCustom(m) ? ownPerms(m) : [...groupPermsOf(m, groups), ...ownPerms(m)]);
  if (set.has("all")) return ["all"];
  return [...set].sort();
}

// 소모임 직책자(소모임에서 role 이 있는 회원) — 게시글 작성만 할 수 있다.
export function isClubOfficer(m: M): boolean {
  return memberClubs(m).some((c) => c.role);
}

// 게시글을 쓸 수 있는지(관리자 2차 비밀번호와 상관없이 회원 화면에서 쓴다)
export function canWritePosts(m: M, groups: PermGroups): boolean {
  const p = effectivePerms(m, groups);
  return p.includes("all") || p.includes("board") || isClubOfficer(m);
}

// ---- 권한 변경 검사(서버) ----

// 지금 DB 기준으로 이 회원이 "모든 권한"인지(세션은 로그인 때 값이라 다시 계산한다)
export async function isAllNow(mid: string): Promise<boolean> {
  const me = (await (await getStore()).list("Members")).find((m) => m.id === mid);
  return !!me && effectivePerms(me, await getPermGroups()).includes("all");
}

type MI = M & { id?: string };

// 바뀌기 전/후 회원과 그룹 권한을 비교한다.
//  - 누군가의 최종 권한이 바뀌면 "모든 권한" 관리자만 할 수 있다.
//  - 바뀐 뒤에도 "모든 권한" 회원이 한 명 이상 있어야 한다.
// 문제가 있으면 [메시지, 상태코드], 없으면 null.
export function checkPermChange(
  before: MI[], gBefore: PermGroups, after: MI[], gAfter: PermGroups, actorIsAll: boolean,
): [string, number] | null {
  const prev = new Map(before.map((m) => [m.id ?? "", effectivePerms(m, gBefore).join("|")]));
  const next = new Map(after.map((m) => [m.id ?? "", effectivePerms(m, gAfter).join("|")]));
  const ids = new Set([...prev.keys(), ...next.keys()]);
  const changed = [...ids].some((id) => (prev.get(id) ?? "") !== (next.get(id) ?? ""));
  if (!changed) return null;
  if (!actorIsAll) return ["권한이 바뀌는 변경은 “모든 권한” 관리자만 할 수 있어요.", 403];
  if (![...next.values()].some((p) => p === "all")) return ["“모든 권한”을 가진 회원이 한 명 이상 있어야 해요. 다른 회원에게 먼저 모든 권한을 주세요.", 400];
  return null;
}
