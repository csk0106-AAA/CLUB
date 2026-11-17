import { ASSOCIATE, FULL, isGuest, isObserverKind, isWaiting, OBSERVER, WAITING } from "./member-kind";
import { effectivePerms, getPermGroups } from "./perms";
import { getSetting, getStore } from "./store";
import type { Row } from "./store/types";

// 회원 신청(MemberApps 탭) — 관리자 › 회원관리 › 회원신청관리에서 승인·반려한다.
//
// 1) 관리자가 미리 등록한 교육 이수자: 관리자가 "대기회원"(교육이수 체크)으로 등록
//    → 로그인하면 "정회원 신청 또는 참관을 원하는 일정을 선택하세요" 안내
//    → 설정의 "정회원 신청"(source settings, type member) → 승인되면 정회원
//    → 또는 일정에서 참관 신청(일정 관리자 승인, ClubRequests observe)
// 2) 명단에 없는 분: 로그인 화면 "회원 또는 참관 신청"(source signup)
//    정회원 필수 조건(모임개요)을 갖췄는지 묻고 이름·전화번호(+ 비이수자는 추천인)를 받아 바로 회원으로 등록한다(로그인 가능, "승인 전").
//    - 이수(네)  + 회원요청 → 대기회원 → 승인: 정회원
//    - 이수(네)  + 참관요청 → 대기회원 → 승인: 대기회원 유지("승인 전"만 사라짐)
//    - 비이수(아니요) + 회원요청 → 대기회원 → 승인: 준회원
//    - 비이수(아니요) + 참관요청 → 참관회원 → 승인: 참관회원 유지
//    반려: 회원구분은 그대로, 명단에 "반려" 표시(사유 확인), 신청자는 로그인 후 안내에서 사유를 본다.
//    로그인 자체를 막으려면 관리자가 회원 명단에서 지운다.
// 3) 설정 › 회원 권한 수정(type change, 신청할 때 바뀔 구분 toKind 를 정해 둔다)
//    정회원·준회원 → 대기회원 / 대기회원 → 정회원 / 참관회원 → 준회원. 승인하면 바로 바뀌고 프로필 북 공개도 맞춘다.
// 4) 탈퇴회원 재가입(type rejoin): 로그인 화면 신청에서 탈퇴회원과 전화번호가 같으면 새 회원을 만들지 않고 이 신청을 남긴다.
//    승인하면 탈퇴 해지(탈퇴 전 구분으로).
export type AppType = "member" | "observe" | "change" | "rejoin";
export type AppStatus = "pending" | "approved" | "rejected" | "canceled";
export const TYPE_LABEL: Record<AppType, string> = { member: "회원 요청", observe: "참관 요청", change: "구분 변경 요청", rejoin: "탈퇴회원 재가입" };
export const SOURCE_LABEL: Record<string, string> = { signup: "로그인 화면 신청", settings: "설정에서 정회원 신청", change: "설정 › 회원 권한 수정", rejoin: "로그인 화면 재가입 신청" };

// 설정 › 회원 권한 수정에서 지금 구분으로 요청할 수 있는 변경(없으면 null)
export function changeOption(kind?: string): { to: string; label: string } | null {
  if (kind === FULL || kind === ASSOCIATE) return { to: WAITING, label: "대기회원으로 변경" };
  if (isWaiting(kind)) return { to: FULL, label: "정회원 신청" };
  if (isObserverKind(kind)) return { to: ASSOCIATE, label: "준회원 신청" };
  return null;
}

// 정회원 필수 조건(관리자 › 모임설정 › 모임개요). 로그인 화면 신청에서 "○○ 하셨나요?"로 묻는다.
export const REQ_KEY = "fullMemberRequirement";
export async function getRequirement(): Promise<string> {
  const v = await getSetting<string>(REQ_KEY, "");
  return typeof v === "string" ? v.trim() : "";
}

export const isEdu = (m: { edu?: string } | undefined) => m?.edu === "true";

// 신청할 때 처음 넣는 회원구분
export function startKind(edu: boolean, type: AppType): string {
  return !edu && type === "observe" ? OBSERVER : WAITING;
}

// 승인하면 바뀔 회원구분(""이면 그대로 둔다)
export function targetKind(app: { type?: string; edu?: string; toKind?: string }): string {
  if (app.type === "change") return app.toKind ?? "";
  if (app.type !== "member") return "";
  return app.edu === "yes" ? FULL : ASSOCIATE;
}

const recent = (a: Row, b: Row) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "");

// 이 회원의 가장 최근 신청
export function latestApp(apps: Row[], memberId: string): Row | undefined {
  return apps.filter((a) => a.memberId === memberId).sort(recent)[0];
}

// 회원 명단 라벨: 최근 신청이 대기 중이면 "승인 전", 반려면 "반려"(사유)
export type AppMark = { id: string; status: "pending" | "rejected"; type: string; reason: string; at: string } | null;
export function appMark(apps: Row[], memberId: string): AppMark {
  const a = latestApp(apps, memberId);
  if (!a || (a.status !== "pending" && a.status !== "rejected")) return null;
  return { id: a.id, status: a.status, type: a.type, reason: a.reason ?? "", at: a.status === "pending" ? a.createdAt : a.handledAt };
}

// 회원 신청을 처리할 관리자: 회원정보(members) 또는 모든 권한
export async function appHandlers(members: Row[]): Promise<string[]> {
  const groups = await getPermGroups();
  return members.filter((m) => !isGuest(m.kind) && effectivePerms(m, groups).some((p) => p === "all" || p === "members")).map((m) => m.id);
}

export async function pendingAppCount(): Promise<number> {
  return (await (await getStore()).list("MemberApps")).filter((a) => a.status === "pending").length;
}

// 로그인 뒤 안내(설정·홈 첫 화면 팝업)에 쓸 내 상태
export type MyApply = {
  kind: string;
  waiting: boolean; // 대기회원
  observer: boolean; // 참관회원
  edu: boolean;
  // 최근 신청: 대기 중·반려·승인(안 본 결과)
  app: { id: string; type: string; status: string; reason: string; toKind: string; createdAt: string; handledAt: string; unseen: boolean } | null;
  canApply: boolean; // 설정에서 정회원(준회원) 신청을 보낼 수 있는지
  change: { to: string; label: string } | null; // 설정 › 회원 권한 수정에서 요청할 수 있는 변경
  needProfile: boolean; // 로그인 화면으로 신청한 회원이 아직 성별·회사명·직책을 안 적었는지
};
export function myApply(me: Row, apps: Row[]): MyApply {
  const a = latestApp(apps, me.id);
  const waiting = isWaiting(me.kind);
  const pending = a?.status === "pending";
  const fromSignup = apps.some((x) => x.memberId === me.id && x.source === "signup");
  return {
    kind: me.kind ?? "",
    waiting,
    observer: isObserverKind(me.kind),
    edu: isEdu(me),
    app: a ? {
      id: a.id, type: a.type, status: a.status, reason: a.reason ?? "", toKind: a.toKind ?? "", createdAt: a.createdAt ?? "", handledAt: a.handledAt ?? "",
      unseen: a.status !== "pending" && a.resultSeen !== "true",
    } : null,
    // 대기회원이고 처리 중인 신청이 없을 때(반려 뒤 다시 신청 가능). 참관회원(비이수자)도 회원(준회원) 신청을 할 수 있다.
    canApply: (waiting || isObserverKind(me.kind)) && !pending,
    change: pending ? null : changeOption(me.kind),
    // 승인 전·반려 때는 띄우지 않는다(승인되어 회원구분이 확정된 뒤 안내)
    needProfile: fromSignup && a?.status === "approved" && (!me.gender || !me.company || !me.title),
  };
}
