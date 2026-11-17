// 회원구분 중 회원 신청 프로세스에 쓰는 값(관리자 › 회원관리 › 회원 구분의 이름과 같아야 한다).
//  대기회원: 교육 이수자 중 활동 전이거나 회원 신청 후 승인 전인 분(예전 이름 "회원대기")
//  참관회원: 교육 비이수자 중 일정 참관만 신청한 분(예전 이름 "행사참관")
//  정회원(교육 이수자) / 준회원(비이수자, 추천)은 회원 신청이 승인되면 바뀌는 구분
export const WAITING = "대기회원";
export const OBSERVER = "참관회원";
export const FULL = "정회원";
export const ASSOCIATE = "준회원";

export const isWaiting = (kind?: string) => kind === WAITING || kind === "회원대기";
export const isObserverKind = (kind?: string) => kind === OBSERVER || kind === "행사참관";
// 아직 활동 회원이 아닌 분(대기회원·참관회원): 회원 명단 기반 목록(프로필 북·회비·공개 대상 고르기 등)에서 빠지고,
// 일정에는 참관 신청이 승인된 일정(그 일정의 참관자)에만 참석할 수 있다.
export const isGuest = (kind?: string) => isWaiting(kind) || isObserverKind(kind);

// 프로필 북에 나오는 회원: 대기회원·참관회원이 아니고, 프로필 북 노출을 끄지 않은 회원
export const bookHidden = (m: { bookHidden?: string }) => m.bookHidden === "true";
export const inBook = (m: { kind?: string; bookHidden?: string }) => !isGuest(m.kind) && !bookHidden(m);
