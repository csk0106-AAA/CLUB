import { eventJoinable, inAudience, readAudience } from "./audience";
import { readPrefs } from "./prefs";
import { countIn } from "./club-requests";
import { getPermGroups } from "./perms";
import { getSetting, getStore, setSetting } from "./store";
import type { Row } from "./store/types";

// 새 글 표시(하단 아이콘 숫자)와 휴대폰 알림 숫자.
//  - 회원마다 마지막으로 본 시각: Settings "seen:<회원 id>" = { events, posts, profiles } (ISO)
//  - 일정은 수정 시각 열이 없어서, 공개·수정될 때 Settings "eventStamps" = { 일정 id: ISO } 에 남긴다.
//    처음 공개된 시각은 Settings "eventFirstPublished" = { 일정 id: ISO } (목록의 NEW / UP 구분용).
//  - 프로필은 처음 공개(승인)된 시각을 Profiles.firstApprovedAt 에 남긴다(NEW / UP 구분용).
//  - 목록의 NEW / UP 표시와 숫자는 같은 기준(eventFresh·profileFresh·countedPosts)을 쓴다.
//  - "받을 알림"에서 끈 종류는 0으로 센다.
export type Kind = "events" | "posts" | "profiles";
export const KINDS: Kind[] = ["events", "posts", "profiles"];
// alerts: 소모임 신청 알림(내가 처리할 신청 + 아직 안 본 내 신청 결과) + 내 글에 새로 달린 댓글. "받을 알림" 설정과 상관없이 센다.
export type Counts = Record<Kind, number> & { alerts: number };
type Seen = Record<Kind, string>;

const seenKey = (mid: string) => `seen:${mid}`;

async function getSeen(mid: string): Promise<Seen> {
  const cur = await getSetting<Partial<Seen> | null>(seenKey(mid), null);
  if (cur && cur.events && cur.posts && cur.profiles) return cur as Seen;
  // 처음이면 지금을 기준으로 잡는다(예전 글이 한꺼번에 새 글로 뜨지 않게).
  const now = new Date().toISOString();
  const seen = { events: cur?.events ?? now, posts: cur?.posts ?? now, profiles: cur?.profiles ?? now };
  await setSetting(seenKey(mid), seen);
  return seen;
}

export async function markSeen(mid: string, kind: Kind): Promise<void> {
  const seen = await getSeen(mid);
  await setSetting(seenKey(mid), { ...seen, [kind]: new Date().toISOString() });
}

// 일정이 공개·수정될 때. firstPublish: 이번이 공개하는 순간이면 처음 공개 시각도 남긴다(이미 있으면 그대로).
export async function stampEvent(eventId: string, firstPublish = false): Promise<void> {
  const now = new Date().toISOString();
  const stamps = await getSetting<Stamps>("eventStamps", {});
  await setSetting("eventStamps", { ...stamps, [eventId]: now });
  if (firstPublish) {
    const first = await getSetting<Stamps>("eventFirstPublished", {});
    if (!first[eventId]) await setSetting("eventFirstPublished", { ...first, [eventId]: now });
  }
}

const later = (a: string | undefined, b: string) => !!a && Date.parse(a) > Date.parse(b);

// 목록의 NEW / UP 표시: "new" = 마지막으로 본 뒤 처음 올라옴, "updated" = 예전에 올라온 것이 그 뒤 바뀜
export type Fresh = "new" | "updated";
type Stamps = Record<string, string>;

// 일정: 내가 참석할 수 있는 공개 일정이 마지막으로 본 뒤 공개·수정됐는지.
// 처음 공개 시각이 없는 예전 일정은 NEW 가 아니라 UP 만 될 수 있다.
function eventFresh(e: Row, me: Row, seen: Seen, stamps: Stamps, first: Stamps): Fresh | null {
  if (!eventJoinable(e, me) || !later(stamps[e.id], seen.events)) return null;
  return later(first[e.id], seen.events) ? "new" : "updated";
}

// 프로필: 다른 회원의 공개(승인)된 소개가 마지막으로 본 뒤 올라오거나 바뀌었는지.
// 처음 승인 시각(firstApprovedAt)이 없는 예전 소개는 UP 만 될 수 있다.
function profileFresh(p: Row, mid: string, seen: Seen): Fresh | null {
  if (p.memberId === mid || p.introStatus !== "approved" || !later(p.updatedAt || p.approvedAt, seen.profiles)) return null;
  return later(p.firstApprovedAt, seen.profiles) ? "new" : "updated";
}

// 일정 목록 표시용: 일정 id → "new" | "updated". "받을 알림"에서 일정을 끄면 없다(숫자와 같게).
export async function eventFreshness(mid: string): Promise<Map<string, Fresh>> {
  const s = await getStore();
  const [events, members, stamps, first, seen] = await Promise.all([
    s.list("Events"), s.list("Members"), getSetting<Stamps>("eventStamps", {}), getSetting<Stamps>("eventFirstPublished", {}), getSeen(mid),
  ]);
  const me = members.find((m) => m.id === mid);
  const out = new Map<string, Fresh>();
  if (!me || !readPrefs(me.prefs).notify.events) return out;
  for (const e of events) {
    const f = eventFresh(e, me, seen, stamps, first);
    if (f) out.set(e.id, f);
  }
  return out;
}

// 프로필 북 표시용: 프로필 id → "new" | "updated". "받을 알림"에서 프로필 북을 끄면 없다(숫자와 같게).
export async function profileFreshness(mid: string): Promise<Map<string, Fresh>> {
  const s = await getStore();
  const [profiles, members, seen] = await Promise.all([s.list("Profiles"), s.list("Members"), getSeen(mid)]);
  const me = members.find((m) => m.id === mid);
  const out = new Map<string, Fresh>();
  if (!me || !readPrefs(me.prefs).notify.profiles) return out;
  for (const p of profiles) {
    const f = profileFresh(p, mid, seen);
    if (f) out.set(p.id, f);
  }
  return out;
}

// 마지막으로 본 뒤 올라오거나 바뀐 글(내가 쓴 글 제외, 나에게 공개된 글만)
function newPostsIn(posts: Row[], mid: string, since: string): Row[] {
  return posts.filter((p) =>
    p.authorId !== mid &&
    inAudience(readAudience(p.audience), mid, p.authorId) &&
    later(p.updatedAt || p.createdAt, since),
  );
}

// 종 아이콘 숫자에 들어가는 글: 마지막으로 본 뒤 올라오거나 바뀐 글. "받을 알림"에서 공지글을 끄면 없다.
// 홈 화면 목록의 "새 글"/"수정됨" 표시와 알림 창 목록이 모두 이 기준을 쓴다(숫자와 표시가 같게).
function countedPosts(posts: Row[], me: Row, seen: Seen): Row[] {
  return readPrefs(me.prefs).notify.posts ? newPostsIn(posts, me.id, seen.posts) : [];
}

// 홈 화면 알림 창의 "새 글" 목록(최근 것 먼저). fresh: 처음 본 뒤 새로 올라온 글이면 "new", 예전 글이 바뀌었으면 "updated"
export async function newPostsOf(mid: string): Promise<(Row & { fresh: Fresh })[]> {
  const s = await getStore();
  const [posts, members, seen] = await Promise.all([s.list("Posts"), s.list("Members"), getSeen(mid)]);
  const me = members.find((m) => m.id === mid);
  if (!me) return [];
  return countedPosts(posts, me, seen)
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
    .map((p) => ({ ...p, fresh: later(p.createdAt, seen.posts) ? "new" : "updated" }));
}

// 홈 화면 게시글 목록 표시용: 글 id → "new" | "updated"
export async function postFreshness(mid: string): Promise<Map<string, "new" | "updated">> {
  return new Map((await newPostsOf(mid)).map((p) => [p.id, p.fresh]));
}

/* ───── 내 글에 달린 댓글 알림 ─────
   Settings "commentSeen:<회원 id>" = 종 알림 창을 마지막으로 연 시각(ISO). 없으면 지금까지 달린 댓글이 모두 새 알림.
   내 글(작성자 = 나)에 다른 회원이 그 뒤에 단 댓글. 글을 지우면 댓글도 지워져서 알림도 사라진다. */
const commentSeenKey = (mid: string) => `commentSeen:${mid}`;

function commentAlertsIn(posts: Row[], comments: Row[], mid: string, since: string): Row[] {
  const minePosts = new Set(posts.filter((p) => p.authorId === mid).map((p) => p.id));
  return comments.filter((c) => minePosts.has(c.postId) && c.memberId !== mid && (!since || later(c.createdAt, since)));
}

// 종 알림 창의 "내 글에 달린 댓글"(최근 것 먼저)
export async function commentAlertsOf(mid: string): Promise<{ id: string; postId: string; title: string; name: string; at: string }[]> {
  const s = await getStore();
  const [posts, comments, members, since] = await Promise.all([s.list("Posts"), s.list("PostComments"), s.list("Members"), getSetting<string>(commentSeenKey(mid), "")]);
  return commentAlertsIn(posts, comments, mid, since)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .map((c) => ({
      id: c.id, postId: c.postId, title: posts.find((p) => p.id === c.postId)?.title ?? "",
      name: members.find((m) => m.id === c.memberId)?.name ?? "(지운 회원)", at: c.createdAt,
    }));
}

export async function markCommentsSeen(mid: string): Promise<void> {
  await setSetting(commentSeenKey(mid), new Date().toISOString());
}

// 여러 회원의 숫자를 한 번에 센다(알림 보낼 때 표를 한 번만 읽도록).
export async function countsFor(mids: string[]): Promise<Map<string, Counts>> {
  const s = await getStore();
  const [members, events, posts, profiles, stamps, first, requests, groups, comments] = await Promise.all([
    s.list("Members"), s.list("Events"), s.list("Posts"), s.list("Profiles"),
    getSetting<Stamps>("eventStamps", {}), getSetting<Stamps>("eventFirstPublished", {}), s.list("ClubRequests"), getPermGroups(),
    s.list("PostComments"),
  ]);
  const out = new Map<string, Counts>();
  for (const mid of mids) {
    const me = members.find((m) => m.id === mid);
    if (!me) continue;
    const prefs = readPrefs(me.prefs);
    const seen = await getSeen(mid);
    const ev = events.filter((e) => eventFresh(e, me, seen, stamps, first)).length;
    const po = countedPosts(posts, me, seen).length;
    // 프로필 북 목록에 나오는 회원(회원대기 제외)의 소개만 센다(목록의 NEW·UP 표시와 같게)
    const listed = new Set(members.filter((m) => m.kind !== "회원대기").map((m) => m.id));
    const pr = profiles.filter((p) => listed.has(p.memberId) && profileFresh(p, mid, seen)).length;
    const co = commentAlertsIn(posts, comments, mid, await getSetting<string>(commentSeenKey(mid), "")).length;
    out.set(mid, {
      events: prefs.notify.events ? ev : 0,
      posts: po,
      profiles: prefs.notify.profiles ? pr : 0,
      // 소모임 신청(처리할 것 + 안 본 결과) + 내 글에 새로 달린 댓글
      alerts: (({ toHandle, results }) => toHandle + results)(countIn(requests, members, mid, groups)) + co,
    });
  }
  return out;
}

export async function countsOf(mid: string): Promise<Counts> {
  return (await countsFor([mid])).get(mid) ?? { events: 0, posts: 0, profiles: 0, alerts: 0 };
}
