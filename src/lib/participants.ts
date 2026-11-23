import { isWhoAmI } from "./activities";
import { inAudience, inClubOrObserver, readAudience } from "./audience";
import { isGuest } from "./member-kind";
import { getSetting, getStore, setSetting } from "./store";
import type { Row } from "./store/types";
import { actionAllowed, type TemplateConfig } from "./template-schema";
export const NOT_ATTENDEE = "이 활동의 참여 대상이 아니에요(일정 대상 회원 중 관리자가 고른 회원만 참여할 수 있어요).";

// 관리자가 고른 회원만 참여하는 활동인지. 이제 모든 활동은 일정에서 활동참여자선택(예전 출석 체크)으로 참여자를 고른다.
export const isLimited = (_cfg: TemplateConfig): boolean => true;

// 활동 참여 대상
//  all      : 전체 회원
//  selected : 관리자 선택 회원. 관리자가 활동 전에 참여할 사람을 고르고(출석 체크) 완료해야 시작할 수 있다.
// 활동의 날짜와 진행 시간은 안내용 정보일 뿐, 참여 대상 판정과는 연결하지 않는다.

// 관리자가 선택한 회원 번호들(출석 체크 결과)
export async function rosterSet(act: Row): Promise<Set<string>> {
  return new Set((await rosterLevels(act)).keys());
}
// 활동참여자와 참여 방식: full(전체참여, 모든 액션) / partial(선택참여, 템플릿 선별 조건의 액션만)
export type Level = "full" | "partial";
export async function rosterLevels(act: Row): Promise<Map<string, Level>> {
  const rows = await (await getStore()).list("Attendance");
  return new Map(rows.filter((r) => r.eventActivityId === act.id && r.present === "true").map((r) => [r.memberId, r.level === "partial" ? "partial" : "full"] as [string, Level]));
}

export type AttendanceState = { confirmed: boolean; confirmedAt: string; by: string };
const key = (aid: string) => `attendance:${aid}`;
export const attendanceState = (aid: string): Promise<AttendanceState> =>
  getSetting<AttendanceState>(key(aid), { confirmed: false, confirmedAt: "", by: "" });
export const saveAttendanceState = (aid: string, s: AttendanceState): Promise<void> => setSetting(key(aid), s);

// 일정 대상이 정해져 있는지(클럽 일정이거나 공개 대상을 고른 일정)
function eventRestricted(ev: Row): boolean {
  return Boolean((ev.club ?? "").trim()) || readAudience(ev.audience).mode !== "all";
}

// 일정 대상에 포함되는지(공개 여부는 따로 본다): 클럽 일정은 클럽 회원 + 참관자, 그 밖에는 공개 대상
function inEvent(ev: Row, member: Row): boolean {
  const v = { id: member.id ?? "", clubs: member.clubs, kind: member.kind };
  if ((ev.club ?? "").trim()) return inClubOrObserver(ev, v);
  return inAudience(readAudience(ev.audience), v.id);
}

async function eventOf(act: Row, ev?: Row): Promise<Row | undefined> {
  return ev ?? (await (await getStore()).list("Events")).find((e) => e.id === act.eventId);
}

// '내가 누구일까요?' 참여 상태(활동참여자 안에서)
//  none   : 활동참여자가 아님(프로필 북에서 실명으로 소개를 쓴다)
//  optout : 선택참여이고 선별 조건에 "AI 인터뷰로 소개 작성"이 없음 — 소개를 쓰지 않고(맞히기 대상 아님) 선별 조건의 액션만 한다
//  prompt : (예전 상태, 지금은 쓰지 않음)
//  in     : 게임 참여(프로필 북에 별칭으로 보이고, 이 활동에서 소개를 쓴다).
//           북공개 회원(프로필 북에 실명 소개가 공개됨)은 활동참여자선택에서 선택참여로만 넣을 수 있다
//           (전체참여는 회원이 소개를 "승인 취소"로 내린 뒤 — 그러면 활동에서 인터뷰부터 새로 한다).
export type WhoState = "none" | "prompt" | "optout" | "in";
// (profiles 는 예전 호출과 맞추려고 남겨 둔 인자 — 북공개 회원은 활동참여자선택에서 전체참여로 넣을 수 없게 막는다)
export function whoStateOf(aid: string, memberId: string, inRoster: boolean, interviews: Row[], _profiles: Row[], level?: Level, cfg?: TemplateConfig): WhoState {
  if (!inRoster) return "none";
  const iv = interviews.find((i) => i.memberId === memberId && i.eventActivityId === aid);
  if (iv?.status === "optout") return "optout"; // 예전 "일부활동참여"
  if (cfg && !actionAllowed(cfg, level, "pre:ai_interview")) return "optout";
  return "in";
}

// 소개 작성 활동이면 게임에 들어가는 회원(상태 in)만 남긴다
async function whoFilter(cfg: TemplateConfig, aid: string, ids: Iterable<string>): Promise<Set<string>> {
  const list = [...ids];
  if (!isWhoAmI(cfg)) return new Set(list);
  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid);
  const [interviews, profiles, levels] = await Promise.all([s.list("Interviews"), s.list("Profiles"), act ? rosterLevels(act) : Promise.resolve(new Map<string, Level>())]);
  return new Set(list.filter((id) => whoStateOf(aid, id, true, interviews, profiles, levels.get(id), cfg) === "in"));
}

// 참여 대상(출석 체크·일정 대상)에 들어 있는지 — 소개 작성 활동의 참여 상태는 보지 않는다
export async function inRoster(cfg: TemplateConfig, act: Row, ev: Row, memberId: string): Promise<boolean> {
  const e = await eventOf(act, ev);
  if (e && eventRestricted(e)) {
    const me = (await (await getStore()).list("Members")).find((m) => m.id === memberId);
    if (!me || !inEvent(e, me)) return false;
  }
  if (!isLimited(cfg)) return true;
  return (await rosterSet(act)).has(memberId);
}

// 이 회원이 이 액션(lib/template-schema.ts activityActions 의 키)을 할 수 있는지: 활동참여자이고, 선택참여면 선별 조건에 있는 액션만
export async function canAct(cfg: TemplateConfig, act: Row, ev: Row, memberId: string, key: string): Promise<boolean> {
  if (!(await inRoster(cfg, act, ev, memberId))) return false;
  if (!key) return true;
  return actionAllowed(cfg, (await rosterLevels(act)).get(memberId), key);
}
export const NOT_ACTION = "이번 단계는 전체참여 회원만 해요. 선택참여로 정해져 있어 이 단계는 하지 않아도 돼요.";
// 선택참여 회원에게 허용되지 않은 단계가 열렸을 때 회원 화면에 보이는 안내
export const PARTIAL_WAIT = "이번 단계는 전체참여 회원만 해요. 잠시 기다려 주세요.";

// 이 액션을 할 수 있는 회원 번호들: 활동참여자(출석 체크, 일정 대상 안)이고, 선택참여면 선별 조건에 그 액션이 있는 회원.
// 진행자 화면의 "투표 n / m명" 같은 분모와 아직 안 한 사람 목록에 쓴다(서버 판정 canAct 와 같은 규칙).
export async function actionSet(cfg: TemplateConfig, act: Row, ev: Row | undefined, key: string): Promise<Set<string>> {
  const base = await rosterIds(cfg, act, ev);
  const ids = base ? [...base] : (await (await getStore()).list("Members")).filter((m) => !isGuest(m.kind)).map((m) => m.id);
  if (!key) return new Set(ids);
  const levels = await rosterLevels(act);
  return new Set(ids.filter((id) => actionAllowed(cfg, levels.get(id), key)));
}

// 회원 한 명이 지금 열린 현장 단계(stepKey)를 할 수 있는지. 회원이 직접 하는 단계(작성·투표·저예요·고르기)가 아니면 늘 true.
//  level: 이 회원의 참여 방식(rosterLevels), 참여자가 아니면 undefined(참여 대상 판정은 따로 한다)
export function stepAllowed(cfg: TemplateConfig, level: Level | undefined, stepKey: string): boolean {
  const st = cfg.onsite.steps.find((x) => x.key === stepKey);
  if (!st || !["write", "vote", "iam_button", "pick_person"].includes(st.memberScreen)) return true;
  return actionAllowed(cfg, level, `onsite:${st.key}`);
}

// 이 회원이 활동에 참여할 수 있는지.
//  - 일정 대상(클럽 회원·참관자 또는 공개 대상)에 들어 있어야 한다.
//  - selected 이면 관리자가 선택한 회원(출석 체크)만 가능하다.
//  - 소개 작성 활동('내가 누구일까요?')은 맞히기·투표·저예요 등 참여는 참여 대상이면 되고(일부활동참여·미정 포함),
//    소개를 쓰고 맞히기 대상이 되는 건 참여 상태 in 인 회원만이다(joinSet, lib/who.ts writeGate).
export async function canJoin(cfg: TemplateConfig, act: Row, ev: Row, memberId: string): Promise<boolean> {
  return inRoster(cfg, act, ev, memberId);
}

// 참여 대상 회원 번호 집합. 제한이 없으면 null(전체 회원).
//  selected: 출석 체크한 회원(일정 대상 안에서), 그 밖에는 일정 대상이 정해진 경우 그 회원들.
//  소개 작성 활동은 늘 집합으로 돌려준다(참여 상태 in 인 회원만).
export async function joinSet(cfg: TemplateConfig, act: Row, ev?: Row): Promise<Set<string> | null> {
  const base = await rosterIds(cfg, act, ev);
  if (!isWhoAmI(cfg)) return base;
  const ids = base ?? (await (await getStore()).list("Members")).filter((m) => !isGuest(m.kind)).map((m) => m.id);
  return whoFilter(cfg, act.id, ids);
}

async function rosterIds(cfg: TemplateConfig, act: Row, ev?: Row): Promise<Set<string> | null> {
  const e = await eventOf(act, ev);
  const roster = isLimited(cfg) ? await rosterSet(act) : null;
  if (!e || !eventRestricted(e)) return roster;
  const members = await (await getStore()).list("Members");
  const allowed = new Set(members.filter((m) => inEvent(e, m)).map((m) => m.id));
  return roster ? new Set([...roster].filter((id) => allowed.has(id))) : allowed;
}

// 진행자가 현장 진행(소개 열기, 고민 뽑기, 작성 열기)을 시작하기 전에 출석 체크가 끝났는지.
// 끝나지 않았다면 안내 문구를, 괜찮다면 null 을 돌려준다.
export async function onsiteGate(cfg: TemplateConfig, act: Row): Promise<string | null> {
  if (!isLimited(cfg)) return null;
  const st = await attendanceState(act.id);
  if (!st.confirmed) return "활동 전에 활동참여자선택을 완료해 주세요. 활동 탭의 “활동참여자선택”에서 참여할 사람을 고르고 “선택 저장”을 눌러 주세요.";
  return null;
}

// 팀 구성 등에서 쓰는 참여자 명단.
//  selected: 관리자가 선택한 회원
//  all     : 일정에 참석을 신청한 회원(없으면 전체 회원)
export async function participantPool(cfg: TemplateConfig, act: Row, ev: Row): Promise<{ members: Row[]; kind: "selected" | "attending" | "all" }> {
  const s = await getStore();
  // 클럽 일정·공개 대상이 정해진 일정은 그 대상 회원 안에서만 고른다.
  const members = (await s.list("Members")).filter((m) => (isGuest(m.kind) ? inEvent(ev, m) : !eventRestricted(ev) || inEvent(ev, m)));
  if (isLimited(cfg)) {
    const set = await whoFilter(cfg, act.id, await rosterSet(act));
    return { members: members.filter((m) => set.has(m.id)), kind: "selected" };
  }
  const applies = await s.list("EventApplies");
  const att = new Set(applies.filter((a) => a.eventId === ev.id && a.answer === "참석").map((a) => a.memberId));
  const attending = members.filter((m) => att.has(m.id));
  return attending.length > 0 ? { members: attending, kind: "attending" } : { members, kind: "all" };
}
