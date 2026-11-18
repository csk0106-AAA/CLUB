import { readEditors } from "./editors";
import { readPhotoReqs } from "./event-photos";
import { effectivePerms, getPermGroups } from "./perms";
import { getStore } from "./store";
import type { Row } from "./store/types";

// 사진첩 장수 늘리기 요청(회원 → 그 일정을 관리하는 관리자).
//  회원: 사진첩이 가득 차면 "관리자 요청"(Events.photoReqs 에 {memberId, at})
//  관리자: 휴대폰 알림 + 처리할 일(lib/admin-issues.ts) → 일정관리 › 개요에서 "사진 최대 장수"를 바꿔 저장하면 요청을 비운다.
// 관리할 수 있는 사람(lib/api.ts guardEv 와 같은 기준): 일정관리·모든 권한, 클럽 일정이면 클럽관리 권한, 만든 사람·편집자.

export function canManagePhotos(e: Row, memberId: string, perms: string[]): boolean {
  if (perms.includes("all") || perms.includes("events")) return true;
  if (perms.includes("clubs") && (e.club ?? "").trim()) return true;
  return e.createdBy === memberId || readEditors(e.editors).includes(memberId);
}

// 이 일정을 관리하는 회원 id(알림 받을 사람)
export async function photoManagers(e: Row): Promise<string[]> {
  const [members, groups] = await Promise.all([(await getStore()).list("Members"), getPermGroups()]);
  return members.filter((m) => canManagePhotos(e, m.id, effectivePerms(m, groups))).map((m) => m.id);
}

// 요청 남기기(같은 회원은 한 번만). 새로 남겼으면 true
export async function addPhotoRequest(e: Row, memberId: string): Promise<boolean> {
  const reqs = readPhotoReqs(e.photoReqs);
  if (reqs.some((r) => r.memberId === memberId)) return false;
  await (await getStore()).update("Events", e.id, { photoReqs: JSON.stringify([...reqs, { memberId, at: new Date().toISOString() }]) });
  return true;
}
