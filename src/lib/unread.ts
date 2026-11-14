import { eventJoinable, inAudience, readAudience } from "./audience";
import { readPrefs } from "./prefs";
import { countIn } from "./club-requests";
import { getPermGroups } from "./perms";
import { getSetting, getStore, setSetting } from "./store";
import type { Row } from "./store/types";

// 새 글 표시(하단 아이콘 숫자)와 휴대폰 알림 숫자.
//  - 회원마다 마지막으로 본 시각: Settings "seen:<회원 id>" = { events, posts, profiles } (ISO)
//  - 일정은 수정 시각 열이 없어서, 공개·수정될 때 Settings "eventStamps" = { 일정 id: ISO } 에 남긴다.
//  - "받을 알림"에서 끈 종류는 0으로 센다.
export type Kind = "events" | "posts" | "profiles";
export const KINDS: Kind[] = ["events", "posts", "profiles"];
// alerts: 소모임 신청 알림(내가 처리할 신청 + 아직 안 본 내 신청 결과). "받을 알림" 설정과 상관없이 센다.
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

export async function stampEvent(eventId: string): Promise<void> {
  const stamps = await getSetting<Record<string, string>>("eventStamps", {});
  await setSetting("eventStamps", { ...stamps, [eventId]: new Date().toISOString() });
}

const later = (a: string | undefined, b: string) => !!a && Date.parse(a) > Date.parse(b);

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
export async function newPostsOf(mid: string): Promise<(Row & { fresh: "new" | "updated" })[]> {
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

// 여러 회원의 숫자를 한 번에 센다(알림 보낼 때 표를 한 번만 읽도록).
export async function countsFor(mids: string[]): Promise<Map<string, Counts>> {
  const s = await getStore();
  const [members, events, posts, profiles, stamps, requests, groups] = await Promise.all([
    s.list("Members"), s.list("Events"), s.list("Posts"), s.list("Profiles"),
    getSetting<Record<string, string>>("eventStamps", {}), s.list("ClubRequests"), getPermGroups(),
  ]);
  const out = new Map<string, Counts>();
  for (const mid of mids) {
    const me = members.find((m) => m.id === mid);
    if (!me) continue;
    const prefs = readPrefs(me.prefs);
    const seen = await getSeen(mid);
    const ev = events.filter((e) => eventJoinable(e, me) && later(stamps[e.id], seen.events)).length;
    const po = countedPosts(posts, me, seen).length;
    const pr = profiles.filter((p) =>
      p.memberId !== mid && p.introStatus === "approved" && later(p.updatedAt || p.approvedAt, seen.profiles),
    ).length;
    out.set(mid, {
      events: prefs.notify.events ? ev : 0,
      posts: po,
      profiles: prefs.notify.profiles ? pr : 0,
      alerts: (({ toHandle, results }) => toHandle + results)(countIn(requests, members, mid, groups)),
    });
  }
  return out;
}

export async function countsOf(mid: string): Promise<Counts> {
  return (await countsFor([mid])).get(mid) ?? { events: 0, posts: 0, profiles: 0, alerts: 0 };
}
