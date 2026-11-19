// 회원구분 중 회원 신청 프로세스에 쓰는 값(관리자 › 회원관리 › 회원 구분의 이름과 같아야 한다).
//  대기회원: 교육 이수자 중 활동 전이거나 회원 신청 후 승인 전인 분(예전 이름 "회원대기")
//  참관회원: 교육 비이수자 중 일정 참관만 신청한 분(예전 이름 "행사참관")
//  정회원(교육 이수자) / 준회원(비이수자, 추천)은 회원 신청이 승인되면 바뀌는 구분
export const WAITING = "대기회원";
export const OBSERVER = "참관회원";
export const FULL = "정회원";
export const ASSOCIATE = "준회원";

// 탈퇴회원: 회원이 설정에서 직접 탈퇴한 분. 로그인할 수 없고(재가입 신청), 관리자 명단에는 남는다(기록 보존).
export const WITHDRAWN = "탈퇴회원";

export const isWaiting = (kind?: string) => kind === WAITING || kind === "회원대기";
export const isObserverKind = (kind?: string) => kind === OBSERVER || kind === "행사참관";
export const isWithdrawn = (kind?: string) => kind === WITHDRAWN;
// 아직 활동 회원이 아닌 분(대기회원·참관회원)과 탈퇴회원: 회원 명단 기반 목록(프로필 북·회비·공개 대상 고르기 등)에서 빠지고,
// 일정에는 참관 신청이 승인된 일정(그 일정의 참관자)에만 참석할 수 있다.
export const isGuest = (kind?: string) => isWaiting(kind) || isObserverKind(kind) || isWithdrawn(kind);

// 프로필 북에 나오는 회원: 대기회원·참관회원이 아니고, 프로필 북 노출을 끄지 않은 회원
export const bookHidden = (m: { bookHidden?: string }) => m.bookHidden === "true";
export const inBook = (m: { kind?: string; bookHidden?: string }) => !isGuest(m.kind) && !bookHidden(m);

// 회원이 된 시각: 대기·참관에서 승인된 시각(memberSince), 없으면 명단에 들어온 시각(관리자가 직접 넣은 회원, joinedAt)
export const memberSinceOf = (m: { kind?: string; memberSince?: string; joinedAt?: string }): string => m.memberSince || (isGuest(m.kind) ? "" : m.joinedAt ?? "");
// 관리자가 회원 승인한 마지막 시각(설정·회원관리에 보임). 관리자가 직접 넣은 회원은 넣은 시각.
// 승인일을 기록하기 전(2026/11/19)부터 있던 회원은 기록이 없어 2026/11/18 로 본다(대기·참관·탈퇴회원은 빈칸).
// 프로필 북 "신규 회원"(memberSinceOf)에는 쓰지 않는다 — 예전 회원이 한꺼번에 신규로 뜨지 않게.
export const LEGACY_APPROVED_AT = "2026-11-18T00:00:00+09:00";
export const approvedAtOf = (m: { kind?: string; approvedAt?: string; joinedAt?: string }): string =>
  m.approvedAt || m.joinedAt || (isGuest(m.kind) ? "" : LEGACY_APPROVED_AT);
// 신규 회원: 회원이 된 지 30일 안(프로필 북 맨 위)
export const NEW_MEMBER_DAYS = 30;
export const isNewMember = (m: { kind?: string; memberSince?: string; joinedAt?: string }, now = Date.now()): boolean => {
  const at = Date.parse(memberSinceOf(m));
  return !Number.isNaN(at) && now - at < NEW_MEMBER_DAYS * 86_400_000;
};
