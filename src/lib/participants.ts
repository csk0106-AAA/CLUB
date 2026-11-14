import { inAudience, inClubOrObserver, readAudience } from "./audience";
import { getSetting, getStore, setSetting } from "./store";
import type { Row } from "./store/types";
import type { TemplateConfig } from "./template-schema";
export const NOT_ATTENDEE = "이 활동의 참여 대상이 아니에요(행사 대상 회원 중 관리자가 고른 회원만 참여할 수 있어요).";

// 관리자가 고른 회원만 참여하는 활동인지
export const isLimited = (cfg: TemplateConfig): boolean => cfg.participants === "selected";

// 활동 참여 대상
//  all      : 전체 회원
//  selected : 관리자 선택 회원. 관리자가 활동 전에 참여할 사람을 고르고(출석 체크) 완료해야 시작할 수 있다.
// 활동의 날짜와 진행 시간은 안내용 정보일 뿐, 참여 대상 판정과는 연결하지 않는다.

// 관리자가 선택한 회원 번호들(출석 체크 결과)
export async function rosterSet(act: Row): Promise<Set<string>> {
  const rows = await (await getStore()).list("Attendance");
  return new Set(rows.filter((r) => r.eventActivityId === act.id && r.present === "true").map((r) => r.memberId));
}

export type AttendanceState = { confirmed: boolean; confirmedAt: string; by: string };
const key = (aid: string) => `attendance:${aid}`;
export const attendanceState = (aid: string): Promise<AttendanceState> =>
  getSetting<AttendanceState>(key(aid), { confirmed: false, confirmedAt: "", by: "" });
export const saveAttendanceState = (aid: string, s: AttendanceState): Promise<void> => setSetting(key(aid), s);

// 행사 대상이 정해져 있는지(소모임 행사이거나 공개 대상을 고른 행사)
function eventRestricted(ev: Row): boolean {
  return Boolean((ev.club ?? "").trim()) || readAudience(ev.audience).mode !== "all";
}

// 행사 대상에 포함되는지(공개 여부는 따로 본다): 소모임 행사는 소모임 회원 + 참관자, 그 밖에는 공개 대상
function inEvent(ev: Row, member: Row): boolean {
  const v = { id: member.id ?? "", clubs: member.clubs };
  if ((ev.club ?? "").trim()) return inClubOrObserver(ev, v);
  return inAudience(readAudience(ev.audience), v.id);
}

async function eventOf(act: Row, ev?: Row): Promise<Row | undefined> {
  return ev ?? (await (await getStore()).list("Events")).find((e) => e.id === act.eventId);
}

// 이 회원이 활동에 참여할 수 있는지.
//  - 행사 대상(소모임 회원·참관자 또는 공개 대상)에 들어 있어야 한다.
//  - selected 이면 관리자가 선택한 회원(출석 체크)만 가능하다.
export async function canJoin(cfg: TemplateConfig, act: Row, ev: Row, memberId: string): Promise<boolean> {
  const e = await eventOf(act, ev);
  if (e && eventRestricted(e)) {
    const me = (await (await getStore()).list("Members")).find((m) => m.id === memberId);
    if (!me || !inEvent(e, me)) return false;
  }
  if (!isLimited(cfg)) return true;
  return (await rosterSet(act)).has(memberId);
}

// 참여 대상 회원 번호 집합. 제한이 없으면 null(전체 회원).
//  selected: 출석 체크한 회원(행사 대상 안에서), 그 밖에는 행사 대상이 정해진 경우 그 회원들.
export async function joinSet(cfg: TemplateConfig, act: Row, ev?: Row): Promise<Set<string> | null> {
  const e = await eventOf(act, ev);
  const roster = isLimited(cfg) ? await rosterSet(act) : null;
  if (!e || !eventRestricted(e)) return roster;
  const members = await (await getStore()).list("Members");
  const allowed = new Set(members.filter((m) => inEvent(e, m)).map((m) => m.id));
  return roster ? new Set([...roster].filter((id) => allowed.has(id))) : allowed;
}

// 사회자가 현장 진행(소개 열기, 고민 뽑기, 작성 열기)을 시작하기 전에 출석 체크가 끝났는지.
// 끝나지 않았다면 안내 문구를, 괜찮다면 null 을 돌려준다.
export async function onsiteGate(cfg: TemplateConfig, act: Row): Promise<string | null> {
  if (!isLimited(cfg)) return null;
  const st = await attendanceState(act.id);
  if (!st.confirmed) return "활동 전에 출석 체크를 완료해 주세요. 활동 탭의 “출석 체크”에서 참여할 사람을 고르고 완료를 눌러 주세요.";
  return null;
}

// 팀 구성 등에서 쓰는 참여자 명단.
//  selected: 관리자가 선택한 회원
//  all     : 행사에 참석을 신청한 회원(없으면 전체 회원)
export async function participantPool(cfg: TemplateConfig, act: Row, ev: Row): Promise<{ members: Row[]; kind: "selected" | "attending" | "all" }> {
  const s = await getStore();
  // 소모임 행사·공개 대상이 정해진 행사는 그 대상 회원 안에서만 고른다.
  const members = (await s.list("Members")).filter((m) => m.kind !== "회원대기" && (!eventRestricted(ev) || inEvent(ev, m)));
  if (isLimited(cfg)) {
    const set = await rosterSet(act);
    return { members: members.filter((m) => set.has(m.id)), kind: "selected" };
  }
  const applies = await s.list("EventApplies");
  const att = new Set(applies.filter((a) => a.eventId === ev.id && a.answer === "참석").map((a) => a.memberId));
  const attending = members.filter((m) => att.has(m.id));
  return attending.length > 0 ? { members: attending, kind: "attending" } : { members, kind: "all" };
}
