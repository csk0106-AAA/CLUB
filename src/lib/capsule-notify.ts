import { activityKind, readConfig } from "./activities";
import { capsuleCfg, capsuleRows, teams } from "./capsule";
import { managersOf } from "./event-managers";
import { kstTime } from "./kst-time";
import { addAlerts } from "./member-alerts";
import { pushTo } from "./push";
import { getSetting, getStore, patchSetting } from "./store";

// 타임캡슐 열림 알림(따로 도는 예약 작업이 없어서, 알림 숫자를 읽을 때(runCarpoolDue) 함께 확인한다)
//  열림 7일 전: 그 일정을 관리하는 사람에게 "열림 예정"(필요하면 열림 일시를 고치라고)
//  열림 1일 전: 참여 회원에게 예고
//  열림 일시: 참여 회원에게 "열렸어요"(누르면 그 타임캡슐 화면)
// 보낸 기록은 Settings "capsuleNotes:<활동 id>" = { admin, preview, open: 보낼 때의 열림 일시 } — 관리자가 열림 일시를 바꾸면 다시 보낸다.
type Notes = { admin?: string; preview?: string; open?: string };
const NOTE = (aid: string) => `capsuleNotes:${aid}`;
const DAY = 24 * 60 * 60 * 1000;
let last = 0;

export async function remindCapsules(): Promise<void> {
  // 알림 숫자는 자주 읽히므로 5분에 한 번만 확인한다
  if (Date.now() - last < 5 * 60_000) return;
  last = Date.now();
  const s = await getStore();
  const [acts, members] = await Promise.all([s.list("EventActivities"), s.list("Members")]);
  const alive = new Set(members.map((m) => m.id));
  for (const a of acts) {
    const cfg0 = readConfig(a.config);
    if (!cfg0 || activityKind(cfg0) !== "capsule") continue;
    const cfg = await capsuleCfg(a.id);
    if (!cfg.openAt) continue;
    const t = kstTime(cfg.openAt);
    if (Number.isNaN(t)) continue;
    const now = Date.now();
    const notes = await getSetting<Notes>(NOTE(a.id), {});
    const ev = await s.get("Events", a.eventId);
    if (!ev) continue;
    const when = cfg.openAt.replace("T", " ").replace(/-/g, "/");
    const href = `/events/${a.eventId}/capsule/${a.id}`;
    // 참여 회원: 팀 조원 + 목표를 쓴 회원(지금 명단에 있는 사람만)
    const people = async () => {
      const [ts, rows] = await Promise.all([teams(a.id), capsuleRows(a.id)]);
      return [...new Set([...ts.flatMap((x) => x.memberIds), ...rows.filter((r) => r.kind === "goal").map((r) => r.ownerId)])].filter((m) => alive.has(m));
    };
    const tell = async (ids: string[], text: string, link: string) => {
      if (!ids.length) return;
      await addAlerts(ids, { eventId: a.eventId, text, href: link });
      await pushTo(ids, "alerts").catch(() => undefined);
    };
    if (now >= t - 7 * DAY && now < t && notes.admin !== cfg.openAt) {
      await patchSetting(NOTE(a.id), ["admin"], cfg.openAt);
      await tell(await managersOf(a.eventId), `${ev.name} 타임캡슐이 ${when}에 열릴 예정이에요. 열림 일시를 바꾸려면 일정관리 › 활동 › 타임캡슐에서 고쳐 주세요.`, `/admin/events/${a.eventId}?tab=act`);
    }
    if (now >= t - DAY && now < t && notes.preview !== cfg.openAt) {
      await patchSetting(NOTE(a.id), ["preview"], cfg.openAt);
      await tell(await people(), `${ev.name} 타임캡슐이 ${when}에 열려요. 1년 전에 쓴 나의 목표와 팀 약속을 곧 확인할 수 있어요.`, href);
    }
    if (now >= t && notes.open !== cfg.openAt) {
      await patchSetting(NOTE(a.id), ["open"], cfg.openAt);
      await tell(await people(), `${ev.name} 타임캡슐이 열렸어요! 1년 전의 나의 목표와 팀 약속을 확인해 보세요.`, href);
    }
  }
}
