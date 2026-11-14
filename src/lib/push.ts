import webpush from "web-push";
import { eventVisible, inAudience, readAudience } from "./audience";
import { readPrefs, type Prefs } from "./prefs";
import { getSetting, getStore } from "./store";
import { countsFor, stampEvent, type Kind } from "./unread";

// 휴대폰 알림(Web Push).
//  - 내용은 보내지 않는다: "새 게시물 N개가 있어요" 처럼 숫자와 안내만(잠금 화면에 글 내용이 보이지 않게).
//  - 받는 사람: 공개 대상에 포함 + "받을 알림"에서 그 종류를 켬 + 알림 ON + 방해 금지 시간이 아님.
//  - 소리 OFF 면 silent 알림.
//  - VAPID 키가 없으면(로컬 등) 조용히 건너뛴다. 배지 숫자는 그와 상관없이 화면에서 계산된다.

let ready: boolean | null = null;
function setup(): boolean {
  if (ready !== null) return ready;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (ready = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  return (ready = true);
}

// 한국 시간 "HH:mm" 기준으로 방해 금지 시간 안인지(자정을 넘는 구간 포함)
export function inQuiet(p: Prefs, now = new Date()): boolean {
  if (!p.quiet.on) return false;
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const cur = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const a = toMin(p.quiet.from), b = toMin(p.quiet.to);
  if (a === b) return false;
  return a < b ? cur >= a && cur < b : cur >= a || cur < b;
}

const LABEL: Record<Kind, string> = { events: "행사", posts: "게시글", profiles: "프로필 북" };
const URL_OF: Record<Kind, string> = { events: "/events", posts: "/board", profiles: "/profiles" };

// 이 회원들에게 kind 종류 알림을 보낸다(조건에 맞는 사람만).
export async function pushTo(memberIds: string[], kind: Kind, exceptId?: string): Promise<number> {
  if (!setup()) return 0;
  const s = await getStore();
  const [members, subs] = await Promise.all([s.list("Members"), s.list("PushSubs")]);
  const targets = memberIds.filter((mid) => {
    if (mid === exceptId) return false;
    const m = members.find((x) => x.id === mid);
    if (!m || m.kind === "회원대기") return false;
    const p = readPrefs(m.prefs);
    return p.notifyOn && p.notify[kind] && !inQuiet(p) && subs.some((x) => x.memberId === mid);
  });
  if (targets.length === 0) return 0;
  const counts = await countsFor(targets);
  const title = (await getSetting<string>("clubShortName", "")) || (await getSetting<string>("clubName", "")) || "원우회";
  let sent = 0;
  await Promise.all(targets.flatMap((mid) => {
    const c = counts.get(mid);
    const total = c ? c.events + c.posts + c.profiles : 0;
    const p = readPrefs(members.find((x) => x.id === mid)?.prefs);
    const payload = JSON.stringify({
      title,
      body: total > 0 ? `새 게시물 ${total}개가 있어요. 앱에서 확인해 주세요.` : `새 ${LABEL[kind]} 소식이 있어요. 앱에서 확인해 주세요.`,
      count: total,
      silent: !p.sound,
      url: URL_OF[kind],
    });
    return subs.filter((x) => x.memberId === mid).map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: JSON.parse(sub.keys) }, payload, { TTL: 60 * 60 * 24 });
        sent++;
      } catch (e) {
        // 만료·해지된 구독은 지운다
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await s.remove("PushSubs", sub.id);
        else console.error("[push] 보내기 실패", code);
      }
    });
  }));
  return sent;
}

// 행사가 공개되거나 바뀌었을 때: 배지용 시각을 남기고, 공개 대상에게 알린다.
export async function notifyEvent(eventId: string, _kind: "new" | "update"): Promise<void> {
  await stampEvent(eventId);
  try {
    const s = await getStore();
    const [events, members] = await Promise.all([s.list("Events"), s.list("Members")]);
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    await pushTo(members.filter((m) => eventVisible(ev, m.id)).map((m) => m.id), "events");
  } catch (e) {
    console.error("[push] 행사 알림 실패", e);
  }
}

// 게시글이 올라오거나 바뀌었을 때(작성자 본인 제외)
export async function notifyPostPush(postId: string): Promise<void> {
  try {
    const s = await getStore();
    const [posts, members] = await Promise.all([s.list("Posts"), s.list("Members")]);
    const p = posts.find((x) => x.id === postId);
    if (!p) return;
    const a = readAudience(p.audience);
    await pushTo(members.filter((m) => inAudience(a, m.id, p.authorId)).map((m) => m.id), "posts", p.authorId);
  } catch (e) {
    console.error("[push] 게시글 알림 실패", e);
  }
}

// 프로필 북에 소개가 공개되거나 바뀌었을 때(본인 제외)
export async function notifyProfilePush(memberId: string): Promise<void> {
  try {
    const members = await (await getStore()).list("Members");
    await pushTo(members.map((m) => m.id), "profiles", memberId);
  } catch (e) {
    console.error("[push] 프로필 알림 실패", e);
  }
}
