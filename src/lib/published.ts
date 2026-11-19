import { z } from "zod";
import { parseJson } from "./api";
import { ALL, audienceInput, type Audience } from "./audience";
import { clubMembers } from "./clubs";
import { duesAccount, type Dues } from "./dues";
import { getLists, memberClubs } from "./lists";
import { notifyPost } from "./notify";
import { getSetting, getStore, setSetting } from "./store";
import type { Row } from "./store/types";

// 관리 화면에서 만들어 게시판에 "올리는" 글: 모임 회비(관리자 › 회비관리), 회칙(관리자 › 회칙), 클럽 회비(클럽 회비 관리).
//  - 올릴 때 그 순간의 내용을 글(Posts.data)에 그대로 담는다(스냅숏). 그 뒤에 설정을 바꿔도 다시 올리기 전까지 글은 그대로다.
//  - 글 작성자(authorId)·수정 시각(updatedAt)은 마지막으로 올린 사람·시각이다.
//  - 지금 연결된 글: Settings "publishLinks" = { dues: 글 id, rules: 글 id, "club:<이름>": 글 id }
//  - 게시판 글쓰기·수정으로는 이 글을 만들거나 고칠 수 없다(관리 화면에서만).
//
// Posts.data 스냅숏
//  fee(모임)  : { v:2, period, defaultAmount, rules:[{kind,position,amount}], periodStart, periodEnd, monthDay,
//                  account("은행 계좌"), accountHolder, note, deadline:"" }
//  fee(클럽)  : 위와 같고 club: "<클럽 이름>"
//  rules        : { v:2, rules:[{id, chapter, article, body, version}] }
//  예전 글: fee { defaultAmount, rules, deadline, account, accountHolder } / rules {} (공개 조문을 실시간으로 보여 준다)

export type Managed = { kind: "dues" } | { kind: "rules" } | { kind: "club"; club: string };
export type LinkKey = "dues" | "rules" | `club:${string}`;

export function managedOf(p: Row): Managed | null {
  if (p.form === "rules") return { kind: "rules" };
  if (p.form !== "fee") return null;
  const club = parseJson<{ club?: unknown }>(p.data, {}).club;
  return typeof club === "string" && club ? { kind: "club", club } : { kind: "dues" };
}

export const linkKey = (m: Managed): LinkKey => (m.kind === "club" ? `club:${m.club}` : m.kind);

/* ───── 권한(지금 DB 기준 최종 권한으로) ───── */
const has = (perms: string[], ...k: string[]) => perms.includes("all") || k.some((x) => perms.includes(x));

// 이 글을 고치는 화면 주소. 클럽 회비는 클럽관리 화면을 열 수 있는 관리자(회원정보)면 그 화면, 아니면 회원용 클럽 회비 화면.
export function manageHref(m: Managed, perms: string[]): string {
  if (m.kind === "dues") return "/admin/dues";
  if (m.kind === "rules") return "/admin/rules";
  return has(perms, "clubs") ? `/admin/clubs/${encodeURIComponent(m.club)}#club-dues` : `/clubs/${encodeURIComponent(m.club)}/dues`;
}
export const canDues = (perms: string[]) => has(perms, "group");
export const canRules = (perms: string[]) => has(perms, "group");
export const clubAdmin = (perms: string[]) => has(perms, "clubs");

// 클럽 회장(대표): 그 클럽에서 직책이 클럽 직책 목록의 첫 번째(지금 "대표")인 회원
export async function headRole(): Promise<string> {
  return (await getLists()).clubRoles[0] ?? "";
}
export function isClubHead(m: { clubs?: string }, club: string, role: string): boolean {
  return !!role && memberClubs(m).some((c) => c.name === club && c.role === role);
}
export async function canClubDues(m: { clubs?: string }, perms: string[], club: string): Promise<boolean> {
  return clubAdmin(perms) || isClubHead(m, club, await headRole());
}
// 내가 회장(대표)인 클럽 이름
export async function headClubsOf(m: { clubs?: string }): Promise<string[]> {
  const role = await headRole();
  return role ? memberClubs(m).filter((c) => c.role === role).map((c) => c.name) : [];
}

export async function canManage(row: Row, perms: string[], m: Managed): Promise<boolean> {
  if (m.kind === "dues") return canDues(perms);
  if (m.kind === "rules") return canRules(perms);
  return canClubDues(row, perms, m.club);
}

/* ───── 연결 ───── */
export async function getLinks(): Promise<Partial<Record<LinkKey, string>>> {
  return getSetting<Partial<Record<LinkKey, string>>>("publishLinks", {});
}
export async function setLink(key: LinkKey, postId: string): Promise<void> {
  await setSetting("publishLinks", { ...(await getLinks()), [key]: postId });
}

// 같은 종류의 글 목록(최근 것 먼저)과 지금 연결된 글 id(없거나 지워졌으면 가장 최근 글)
export async function postsOf(m: Managed): Promise<{ posts: { id: string; title: string; updatedAt: string; createdAt: string }[]; linked: string }> {
  const all = await (await getStore()).list("Posts");
  const key = linkKey(m);
  const mine = all
    .filter((p) => { const x = managedOf(p); return x && linkKey(x) === key; })
    .sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""));
  const link = (await getLinks())[key] ?? "";
  return {
    posts: mine.map((p) => ({ id: p.id, title: p.title, updatedAt: p.updatedAt || p.createdAt, createdAt: p.createdAt })),
    linked: mine.some((p) => p.id === link) ? link : mine[0]?.id ?? "",
  };
}

/* ───── 스냅숏 ───── */
export function feeSnapshot(d: Dues, club?: string): Record<string, unknown> {
  return {
    v: 2,
    ...(club ? { club } : {}),
    period: d.period,
    defaultAmount: d.amount,
    rules: d.rules,
    periodStart: d.period === "annual" ? d.periodStart : "",
    periodEnd: d.period === "annual" ? d.periodEnd : "",
    monthDay: d.period === "monthly" ? d.monthDay : "",
    deadline: "",
    account: duesAccount(d),
    accountHolder: d.holder,
    note: d.note,
  };
}

export async function rulesSnapshot(): Promise<Record<string, unknown>> {
  // 공개로 둔 회칙 조문(비공개로 바꾼 조문은 빠진다)
  const rules = (await (await getStore()).list("Rules")).filter((r) => r.hidden !== "true");
  return { v: 2, rules: rules.map((r) => ({ id: r.id, chapter: r.chapter, article: r.article, body: r.body, version: r.version })) };
}

/* ───── 올리기 ───── */
const t = (max: number) => z.string().trim().max(max);
export const publishInput = z.object({
  mode: z.enum(["new", "update"]),
  postId: z.string().max(64).default(""),
  title: t(100).min(1, "제목을 적어 주세요."),
  body: t(10000).default(""),
  audience: audienceInput.default(ALL),
  notice: z.boolean().default(false),
  pinned: z.boolean().default(false),
  postFrom: z.string().max(40).default(""), // 게시 기간(비면 계속 게시, lib/post-period.ts)
  postUntil: z.string().max(40).default(""),
});
export type PublishInput = z.infer<typeof publishInput>;

// 공개 대상 확인: 없는 회원은 빼고, 한 명도 없으면 오류
export async function cleanAudience(a: Audience): Promise<Audience | string> {
  if (a.mode === "all") return ALL;
  const ids = new Set((await (await getStore()).list("Members")).map((m) => m.id));
  const memberIds = [...new Set(a.memberIds)].filter((id) => ids.has(id));
  if (memberIds.length === 0) return "공개 대상 회원을 한 명 이상 골라 주세요.";
  return { ...a, memberIds };
}

// 새 글로 올리거나 고른 글을 고친다. 성공하면 글 id.
export async function publish(m: Managed, input: PublishInput, data: Record<string, unknown>, authorId: string): Promise<{ id: string } | { error: string; status?: number }> {
  const aud = await cleanAudience(input.audience);
  if (typeof aud === "string") return { error: aud };
  const { postFrom, postUntil } = input;
  if ((postFrom && Number.isNaN(Date.parse(postFrom))) || (postUntil && Number.isNaN(Date.parse(postUntil)))) return { error: "게시 기간을 확인해 주세요." };
  if (postFrom && postUntil && postFrom >= postUntil) return { error: "게시 기간의 시작이 끝보다 앞이어야 해요." };
  const s = await getStore();
  let title = input.title;
  if (m.kind === "club" && !title.includes(`[${m.club}]`)) title = `[${m.club}] ${title}`.slice(0, 100);
  const now = new Date().toISOString();
  const fields = {
    form: m.kind === "rules" ? "rules" : "fee",
    title, body: input.body, data: JSON.stringify(data), audience: JSON.stringify(aud),
    notice: String(input.notice), pinned: String(input.pinned), authorId, updatedAt: now,
    postFrom, postUntil,
  };
  let id: string;
  if (input.mode === "update") {
    const p = (await s.list("Posts")).find((x) => x.id === input.postId);
    const pm = p ? managedOf(p) : null;
    if (!p || !pm || linkKey(pm) !== linkKey(m)) return { error: "고칠 글을 찾을 수 없어요. 목록에서 다시 골라 주세요.", status: 404 };
    await s.update("Posts", p.id, fields);
    id = p.id;
  } else {
    id = (await s.insert("Posts", { ...fields, files: "[]", createdAt: now })).id;
  }
  await setLink(linkKey(m), id);
  await notifyPost(id, input.mode === "new" ? "new" : "update").catch(() => undefined);
  return { id };
}

// 클럽 회원 id(기본 공개 대상)
export async function clubMemberIds(club: string): Promise<string[]> {
  return clubMembers(await (await getStore()).list("Members"), club).map((m) => m.id);
}
