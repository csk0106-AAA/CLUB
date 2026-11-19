import { readEditors } from "./editors";
import { isGuest } from "./member-kind";
import { effectivePerms, getPermGroups } from "./perms";
import { getStore } from "./store";

// 이 일정을 관리하는 사람(알림 받을 관리자): 모든권한·일정 권한, 클럽 일정이면 클럽 권한, 일정 작성자·편집자
export async function managersOf(eventId: string): Promise<string[]> {
  const s = await getStore();
  const [members, ev, groups] = await Promise.all([s.list("Members"), s.get("Events", eventId), getPermGroups()]);
  if (!ev) return [];
  return members.filter((m) => {
    if (isGuest(m.kind)) return false;
    const p = effectivePerms(m, groups);
    return p.includes("all") || p.includes("events") || (p.includes("clubs") && !!(ev.club ?? "").trim()) || ev.createdBy === m.id || readEditors(ev.editors).includes(m.id);
  }).map((m) => m.id);
}
