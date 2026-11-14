import { eventJoinable, inAudience, readAudience } from "./audience";
import { readPrefs } from "./prefs";
import { countIn } from "./club-requests";
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

// 홈 화면 알림 창의 "새 글" 목록(최근 것 먼저)
export async function newPostsOf(mid: string): Promise<Row[]> {
  const [posts, seen] = await Promise.all([(await getStore()).list("Posts"), getSeen(mid)]);
  return newPostsIn(posts, mid, seen.posts).sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
}

// 여러 회원의 숫자를 한 번에 센다(알림 보낼 때 표를 한 번만 읽도록).
export async function countsFor(mids: string[]): Promise<Map<string, Counts>> {
  const s = await getStore();
  const [members, events, posts, profiles, stamps, requests] = await Promise.all([
    s.list("Members"), s.list("Events"), s.list("Posts"), s.list("Profiles"),
    getSetting<Record<string, string>>("eventStamps", {}), s.list("ClubRequests"),
  ]);
  const out = new Map<string, Counts>();
  for (const mid of mids) {
    const me = members.find((m) => m.id === mid);
    if (!me) continue;
    const prefs = readPrefs(me.prefs);
    const seen = await getSeen(mid);
    const ev = events.filter((e) => eventJoinable(e, me) && later(stamps[e.id], seen.events)).length;
    const po = newPostsIn(posts, mid, seen.posts).length;
    const pr = profiles.filter((p) =>
      p.memberId !== mid && p.introStatus === "approved" && later(p.updatedAt || p.approvedAt, seen.profiles),
    ).length;
    out.set(mid, {
      events: prefs.notify.events ? ev : 0,
      posts: prefs.notify.posts ? po : 0,
      profiles: prefs.notify.profiles ? pr : 0,
      alerts: (({ toHandle, results }) => toHandle + results)(countIn(requests, members, mid)),
    });
  }
  return out;
}

export async function countsOf(mid: string): Promise<Counts> {
  return (await countsFor([mid])).get(mid) ?? { events: 0, posts: 0, profiles: 0, alerts: 0 };
}
