import type { TabName } from "./store/schema";
import { getStore } from "./store";

// 일정을 지울 때 그 일정에 딸린 기록도 함께 지운다(참석 신청·세부 일정·준비·비용·조 편성·카풀·방·활동과 활동 기록).
// 회원의 소개 글(Profiles)과 인터뷰 원문(Interviews)은 회원 것이라 남긴다(프로필 북에서 다시 쓴다).
const BY_EVENT: TabName[] = ["EventApplies", "EventCosts", "EventPrep", "EventFiles", "EventSchedule", "Groupings", "Carpools", "Rooms", "PhotoComments"];
const BY_ACTIVITY: TabName[] = ["Attendance", "Teams", "LiveState", "TruthLies", "Guesses", "Worries", "Capsules"];

export async function deleteEventCascade(id: string): Promise<boolean> {
  const s = await getStore();
  const ev = (await s.list("Events")).find((e) => e.id === id);
  if (!ev) return false;
  const drop = async (tab: TabName, keep: (r: Record<string, string>) => boolean) => {
    for (const r of await s.list(tab)) if (!keep(r)) await s.remove(tab, r.id);
  };
  for (const tab of BY_EVENT) await drop(tab, (r) => r.eventId !== id);
  // 사진첩: 내용(EventPhotoData)은 사진 id 로 하나씩 지운다(내용 탭을 통째로 읽지 않는다)
  for (const p of (await s.list("EventPhotos")).filter((r) => r.eventId === id)) {
    await s.remove("EventPhotoData", p.id);
    await s.remove("EventPhotos", p.id);
  }
  // 일정 대표사진
  await s.remove("CoverData", `event:${id}`);
  // 처리 전인 클럽 참관·참석 요청은 일정이 없어지므로 함께 지운다(처리된 요청은 기록으로 둔다)
  await drop("ClubRequests", (r) => r.eventId !== id || (r.status ?? "") !== "pending");

  const acts = new Set((await s.list("EventActivities")).filter((a) => a.eventId === id).map((a) => a.id));
  if (acts.size) {
    for (const tab of BY_ACTIVITY) await drop(tab, (r) => !acts.has(r.eventActivityId));
    const rounds = (await s.list("Rounds")).filter((r) => acts.has(r.eventActivityId));
    const roundIds = new Set(rounds.map((r) => r.id));
    if (roundIds.size) await drop("Votes", (r) => !roundIds.has(r.roundId));
    for (const r of rounds) await s.remove("Rounds", r.id);
    for (const a of acts) await s.remove("EventActivities", a);
  }
  return s.remove("Events", id);
}
