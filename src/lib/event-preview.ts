import { readEditors } from "./editors";
import { effectivePerms, getPermGroups } from "./perms";
import type { Row } from "./store/types";

// 관리하는 사람이 공개 대상 밖·공개전 일정을 "회원 화면 그대로" 볼 수 있는지.
// 일정관리 권한(all/events), 만든 사람·편집자, 클럽 일정이면 클럽관리 권한.
// 이렇게 열면 미리보기(preview)라서 참석 신청 등은 할 수 없다(신청 API 는 공개 대상만 받는다).
export async function canPreviewEvent(e: Row, me: Row | undefined, mid: string): Promise<boolean> {
  if (!me) return false;
  const perms = effectivePerms(me, await getPermGroups());
  if (["all", "events"].some((p) => perms.includes(p))) return true;
  if (e.createdBy === mid || readEditors(e.editors).includes(mid)) return true;
  return perms.includes("clubs") && !!(e.club ?? "").trim();
}
