import { deleteEventCascade } from "./event-delete";
import { getSetting, getStore, patchSetting } from "./store";

// 클럽 상태: 활동 중(기본) / 활동 중지. 삭제는 기록까지 모두 지운다(purgeClub).
//  Settings "clubPaused" = { [클럽 이름]: { at: ISO 시각, by: 회원 id } } — 여기 있으면 활동 중지.
//  활동 중지: 기록은 그대로 둔다. 회원 화면에서 클럽 목록·가입 신청·클럽 선택에서 빠지고, 그 클럽 일정은
//   지난 일정 중 참석했던 회원에게만 보인다(사진첩 포함, 새 참석 신청은 안 됨). 새 클럽 일정은 만들 수 없다.
//   관리자(클럽관리)는 그대로 들어가 회원·회비 입금 상태 등을 고칠 수 있다. "다시 활동"으로 되돌린다.
export type PausedClubs = Record<string, { at: string; by: string }>;
const KEY = "clubPaused";

export async function readPausedClubs(): Promise<PausedClubs> {
  const v = await getSetting<PausedClubs>(KEY, {});
  return v && typeof v === "object" ? v : {};
}

export async function isClubPaused(name: string | undefined): Promise<boolean> {
  const n = (name ?? "").trim();
  return !!n && !!(await readPausedClubs())[n];
}

export async function setClubPaused(name: string, paused: boolean, by: string): Promise<void> {
  const all = await readPausedClubs();
  if (paused === !!all[name]) return;
  // 그 클럽 키만 넣고 뺀다(다른 클럽을 동시에 바꿔도 지우지 않게)
  await patchSetting(KEY, [name], paused ? { at: new Date().toISOString(), by } : undefined);
}

// 이름 바꾸기·목록에서 지우기를 따라간다(lists PUT)
export async function syncPausedClubs(renames: Map<string, string>, deleted: string[]): Promise<void> {
  // 바뀐 키만 하나씩 고친다(전체를 다시 쓰면 그사이 다른 클럽의 활동 중지·다시 활동이 사라질 수 있다)
  const all = await readPausedClubs();
  for (const [k, v] of Object.entries(all)) {
    const to = renames.get(k);
    if (deleted.includes(k)) await patchSetting(KEY, [k], undefined);
    else if (to && to !== k) {
      await patchSetting(KEY, [to], v);
      await patchSetting(KEY, [k], undefined);
    }
  }
}

// 활동 중지 클럽의 일정을 회원이 볼 수 있는지: 지난 일정이고 참석했던 회원만
export function pausedEventVisible(ev: { startsAt?: string; endsAt?: string }, attended: boolean, today: string): boolean {
  const end = (ev.endsAt || ev.startsAt || "").slice(0, 10);
  return attended && !!end && end < today;
}

const clubOfData = (data?: string) => {
  try { return String(JSON.parse(data || "{}").club ?? ""); } catch { return ""; }
};

// 삭제 전 백업: 이 클럽의 기록(일정과 하위 내용, 신청 내역, 클럽 게시글, 개요·회비 설정)을 한 번에 모은다(사진 내용은 빼고 목록만)
export async function clubBackup(name: string): Promise<Record<string, unknown>> {
  const s = await getStore();
  const events = (await s.list("Events")).filter((e) => (e.club ?? "") === name);
  const ids = new Set(events.map((e) => e.id));
  const byEvent = async (tab: Parameters<typeof s.list>[0]) => (await s.list(tab)).filter((r) => ids.has(r.eventId));
  const [applies, schedule, prep, costs, photos, acts, requests, posts, info, dues] = await Promise.all([
    byEvent("EventApplies"), byEvent("EventSchedule"), byEvent("EventPrep"), byEvent("EventCosts"), byEvent("EventPhotos"), byEvent("EventActivities"),
    s.list("ClubRequests").then((l) => l.filter((r) => (r.club ?? "") === name || ids.has(r.eventId))),
    s.list("Posts").then((l) => l.filter((p) => clubOfData(p.data) === name)),
    getSetting<Record<string, unknown>>("clubInfo", {}).then((v) => v?.[name] ?? null),
    getSetting<Record<string, unknown>>("clubDues", {}).then((v) => v?.[name] ?? null),
  ]);
  return { club: name, savedAt: new Date().toISOString(), info, dues, events, applies, schedule, prep, costs, photos, activities: acts, requests, posts };
}

// 삭제: 이 클럽의 일정(하위 내용·사진 포함)·신청 내역·클럽 게시글(회비 청구 등)을 지운다.
//  클럽 목록·회원 소속·개요·회비 설정·대표사진은 그다음 목록에서 지우기(lists PUT)가 정리한다.
export async function purgeClub(name: string): Promise<{ events: number; requests: number; posts: number }> {
  const s = await getStore();
  const events = (await s.list("Events")).filter((e) => (e.club ?? "") === name);
  for (const e of events) await deleteEventCascade(e.id);
  const reqs = (await s.list("ClubRequests")).filter((r) => (r.club ?? "") === name);
  for (const r of reqs) await s.remove("ClubRequests", r.id);
  const posts = (await s.list("Posts")).filter((p) => clubOfData(p.data) === name);
  if (posts.length) {
    const pids = new Set(posts.map((p) => p.id));
    for (const tab of ["PostResponses", "PostComments", "PostReactions"] as const) {
      for (const r of await s.list(tab)) if (pids.has(r.postId)) await s.remove(tab, r.id);
    }
    for (const p of posts) {
      // 첨부 파일(PostFiles)
      let files: { id?: string }[] = [];
      try { files = JSON.parse(p.files || "[]"); } catch { files = []; }
      for (const f of Array.isArray(files) ? files : []) if (f?.id) await s.remove("PostFiles", f.id);
      await s.remove("Posts", p.id);
    }
  }
  return { events: events.length, requests: reqs.length, posts: posts.length };
}
