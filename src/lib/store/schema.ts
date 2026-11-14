// 저장소 탭(테이블 구분)과 열 정의. 첫 열은 항상 id.
// 값은 모두 문자열로 저장하고, 객체/배열은 JSON 문자열로 저장한다.
export const TABS = {
  Settings: ["id", "value"],
  Members: [
    "id", "no", "name", "kind", "position", "gender", "company", "title",
    "birth", "phone", "ageGroup", "perms", "extra",
    // clubs: 소모임 [{name, role}] JSON (lib/lists.ts). 회원이 설정에서 소모임을 고르고, role(소모임 직책)은 관리자가 정한다.
    // prefs: 화면 모드·알림 설정 JSON (lib/prefs.ts)
    "clubs", "prefs",
  ],
  Org: ["id", "dept", "role", "memberId", "clubName", "frequency", "leaderId"],
  // history: 조문 변경 기록 [{at, by, what}] JSON (최근 30개)
  Rules: ["id", "chapter", "article", "body", "version", "confirmed", "history"],
  Minutes: ["id", "heldAt", "place", "attendees", "agenda", "status", "followUp"],
  Events: [
    "id", "type", "name", "startsAt", "endsAt", "place", "booking", "status",
    "published", "fee", "feeDeadline", "account", "accountHolder",
    // feeRules: 조건별 회비 [{days, kind, position, amount}] JSON (lib/fee.ts). fee 는 기본 회비.
    "feeRules",
    // audience: 공개 대상 JSON (lib/audience.ts). 비어 있으면 전체 회원.
    "audience",
    // club: 소모임 행사면 소모임 이름. 이때 대상은 그 소모임 회원(실시간) + observers(참관자 회원 id JSON 배열)
    "club", "observers",
    // pinned: "true"면 회원 행사 목록 맨 위에 고정
    "pinned",
  ],
  // payNotice: 회원이 "입금했어요"를 누른 시각(관리자가 확인하기 전 알림용)
  EventApplies: [
    "id", "eventId", "memberId", "answer", "days", "paid", "paidAt", "memo", "payNotice",
  ],
  EventCosts: ["id", "eventId", "item", "budget", "spent", "status", "owner"],
  EventPrep: ["id", "eventId", "item", "owner", "done"],
  EventSchedule: ["id", "eventId", "at", "title"],
  ActivityTemplates: ["id", "name", "version", "config", "origin"],
  // startsAt/endsAt: 이 활동이 진행되는 날짜와 시간(한국 시간, YYYY-MM-DDTHH:mm). 비어 있으면 시간 제한 없음.
  // hostId: 사회자(회원 id), hostCode: 사회자 접속번호(이 번호로 로그인하면 활동 진행 화면만 보인다)
  EventActivities: ["id", "eventId", "templateId", "templateVersion", "config", "state", "order", "startsAt", "endsAt", "hostId", "hostCode"],
  // 활동별 출석 체크: 자동 명단(날짜 선택 기반)을 관리자가 고칠 때만 행이 생긴다. present: true(출석) / false(결석)
  Attendance: ["id", "eventActivityId", "memberId", "present"],
  Teams: ["id", "eventActivityId", "name", "memberIds"],
  // 행사 조편성(여러 개 가능, 예: 저녁 게임 3개 조). teams 는 [{name, memberIds}] JSON. published 가 true 여야 회원에게 보인다.
  Groupings: ["id", "eventId", "title", "teams", "published", "updatedAt"],
  // 갈 때: from/to 출발·도착 장소, departAt/arriveAt 출발·도착 예상 시간, riders 탑승자(JSON)
  // 올 때: backFrom/backTo/backDepartAt/backArriveAt/backRiders (같은 뜻)
  // goOn/backOn: 갈 때·올 때 운행 여부("true"/"false"). leg(왕복/갈 때/올 때)는 예전 코드 호환용으로 goOn/backOn 에서 만든다.
  Carpools: [
    "id", "eventId", "leg", "driverId", "seats", "from", "departAt", "riders", "to", "arriveAt", "plate", "name",
    "goOn", "backOn", "backFrom", "backDepartAt", "backTo", "backArriveAt", "backRiders",
  ],
  // 숙박 방배정: date(YYYY-MM-DD) 날짜별 방, guests 는 회원 id 배열 JSON
  Rooms: ["id", "eventId", "date", "name", "capacity", "memo", "guests"],
  LiveState: ["id", "eventActivityId", "step", "memberUnlocked", "payload", "updatedAt"],
  // 내가 누굴까요? : 프로필(회원당 1개), 인터뷰 원문(본인만), 2진실 1거짓, 사전 추측
  Profiles: [
    "id", "memberId", "alias", "draftMd", "introMd", "introStatus", "publicFields",
    "readingMd", "readingStatus", "approvedAt", "updatedAt",
    // 명리학: readingMd(생애주기 전체 풀이, 본인만), readingStatus(""=아직 안 고름 / skipped / done),
    // traitsMd(성격·성향, 소개 페이지 끝에 공개), traitsShown("true"면 소개 페이지에 싣는다). 생년월일 원본은 저장하지 않는다.
    "traitsMd", "traitsShown",
    // sajuInfo: 본인이 입력한 정보와 사주 원국(JSON). 생애주기 풀이 첫머리에 본인에게만 보여 준다. 풀이를 지우면 함께 지운다.
    "sajuInfo",
  ],
  Interviews: ["id", "memberId", "eventActivityId", "messages", "status", "updatedAt"],
  TruthLies: ["id", "memberId", "eventActivityId", "statements", "lieIndex", "status", "approvedAt"],
  Guesses: ["id", "eventActivityId", "guesserId", "targetMemberId", "chosenMemberId", "createdAt"],
  // 나의 고민은?
  Worries: [
    "id", "eventActivityId", "memberId", "body", "category", "anonymous", "drawnAt",
    "orderNo", "nameRevealed", "authorShown", "updatedAt",
  ],
  // 타임캡슐: body 는 서버 키로 암호화해서 저장한다. kind: goal(개인 목표, ownerId=회원) / pact(팀 약속, ownerId=팀)
  Capsules: ["id", "eventActivityId", "kind", "ownerId", "body", "lastBy", "updatedAt"],
  // 현장 진행: 한 사람씩 진행하는 라운드, 거짓 투표
  Rounds: ["id", "eventActivityId", "targetMemberId", "state", "orderNo", "nameRevealed", "updatedAt"],
  Votes: ["id", "roundId", "voterId", "chosenIndex", "createdAt"],
  // 게시글. form: org|rules|fee|minutes|general|survey|poll|quiz (lib/board.ts). data: 양식별 내용 JSON.
  // audience: 공개 대상 JSON(lib/audience.ts), files: 첨부 [{id,name,type,size,image}] JSON
  Posts: [
    "id", "form", "title", "body", "data", "audience", "notice", "pinned", "files",
    "authorId", "createdAt", "updatedAt",
  ],
  // 첨부 파일 내용(base64). 게시글 목록을 읽을 때 같이 읽지 않도록 따로 둔다.
  PostFiles: ["id", "postId", "name", "type", "size", "data", "createdAt"],
  // 설문 응답, 투표, 퀴즈 답. answer: JSON
  PostResponses: ["id", "postId", "memberId", "answer", "createdAt"],
  // 휴대폰 알림(Web Push) 구독
  PushSubs: ["id", "memberId", "endpoint", "keys", "createdAt"],
  // 소모임 가입 신청(kind=join) / 소모임 행사 1회 참관 신청(kind=observe, eventId 필수).
  // status: pending | approved | declined. 처리는 그 소모임 직책자(lib/club-requests.ts).
  // resultSeen: 신청한 회원이 결과 알림을 봤으면 "true"
  ClubRequests: [
    "id", "kind", "club", "eventId", "memberId", "message", "status", "createdAt", "handledBy", "handledAt", "resultSeen",
  ],
} as const;

export type TabName = keyof typeof TABS;
