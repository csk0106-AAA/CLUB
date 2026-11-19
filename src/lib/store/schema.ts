// 저장소 탭(테이블 구분)과 열 정의. 첫 열은 항상 id.
// 값은 모두 문자열로 저장하고, 객체/배열은 JSON 문자열로 저장한다.
export const TABS = {
  Settings: ["id", "value"],
  Members: [
    "id", "no", "name", "kind", "position", "gender", "company", "title",
    "birth", "phone", "ageGroup", "perms", "extra",
    // clubs: 클럽 [{name, role}] JSON (lib/lists.ts). 회원이 설정에서 클럽을 고르고, role(클럽 직책)은 관리자가 정한다.
    // prefs: 화면 모드·알림 설정 JSON (lib/prefs.ts)
    "clubs", "prefs",
    // avatar: 프로필 사진 JSON {type:"character", key} | {type:"photo", fileId} (lib/avatar.ts). 비어 있으면 기본.
    "avatar",
    // joinedAt: 명단에 들어온 시각(ISO). 게시 뒤 새로 가입한 회원을 글 작성자에게 알릴 때 쓴다(예전 회원은 비어 있음).
    "joinedAt",
    // approvedAt: 관리자가 회원 신청을 승인한 마지막 시각(설정·회원관리에 보임). 관리자가 직접 넣은 회원은 joinedAt 이 승인일.
    // memberSince: 대기·참관·탈퇴에서 회원(정회원 등)이 된 시각 — 프로필 북 "신규 회원"(한 달 동안 맨 위) 기준
    "approvedAt", "memberSince",
    // edu: 교육 이수 여부("true"면 이수). 회원 신청 승인 때 정회원(이수) / 준회원(비이수)을 가른다(lib/member-apps.ts).
    // memo: 관리자 메모(예: 명예회원 등록 사유). 관리자에게만 보인다.
    "edu", "memo",
    // bookHidden: "true"면 프로필 북에 나오지 않는다(회원이 설정에서, 관리자가 회원명단·회원 수정에서 정한다)
    "bookHidden",
  ],
  Org: ["id", "dept", "role", "memberId", "clubName", "frequency", "leaderId"],
  // history: 조문 변경 기록 [{at, by, what}] JSON (최근 30개)
  // hidden: "true"면 비공개(회칙 글 업로드·업데이트 때 빠진다). 비어 있으면 공개. confirmed 는 예전 "확정" 표시(더 쓰지 않음)
  Rules: ["id", "chapter", "article", "body", "version", "confirmed", "history", "hidden"],
  Minutes: ["id", "heldAt", "place", "attendees", "agenda", "status", "followUp"],
  Events: [
    "id", "type", "name", "startsAt", "endsAt", "place", "booking", "status",
    "published", "fee", "feeDeadline", "account", "accountHolder",
    // feeRules: 조건별 회비 [{days, kind, position, amount}] JSON (lib/fee.ts). fee 는 기본 회비.
    "feeRules",
    // audience: 공개 대상 JSON (lib/audience.ts). 비어 있으면 전체 회원.
    "audience",
    // club: 클럽 일정이면 클럽 이름. 이때 대상은 그 클럽 회원(실시간) + observers(참관자 회원 id JSON 배열)
    "club", "observers",
    // coverAt: 일정 대표사진을 올린 시각(사진 내용은 CoverData "event:<id>", lib/covers.ts). 비어 있으면 없음.
    "coverAt",
    // audSeenAt: 신규 회원 알림을 관리자가 확인한 시각(lib/new-joiners.ts)
    "audSeenAt",
    // pinned: "true"면 회원 일정 목록 맨 위에 고정
    "pinned",
    // minutes: 회의 일정의 회의록 JSON { heldAt, place, attendees, agenda:[{title, status, note}], followUp } (lib/board.ts minutesData)
    "minutes",
    // dayPlaces: 세부일정 날짜별 기본 위치 JSON { "YYYY-MM-DD": "장소" } (lib/day-places.ts)
    "dayPlaces",
    // createdBy: 일정을 만든 회원 id. 일정 만들기 권한(evMain·evClub)만 있는 회원은 자기가 만든 일정만 고칠 수 있다.
    "createdBy",
    // editors: 편집자 회원 id 배열 JSON(만든 사람이 추가, lib/editors.ts). 편집자도 이 일정을 고칠 수 있다.
    "editors",
    // showPrep/showCosts: "true"면 준비목록·비용을 회원의 일정 화면에도 보여 준다(읽기만)
    "showPrep", "showCosts",
    // supports: 지원금 JSON [{kind: dues(연·월회비에서 지원) | member(회원 지원), name, amount, memo}] (lib/supports.ts). 총 예산에 더한다.
    "supports",
    // photoLimit: 사진첩 최대 장수(비우면 참석 인원 × 10장 × 일정 일수, 참석자 없으면 20장, lib/event-photos.ts photoLimitOf). photoReqs: 장수를 늘려 달라는 회원 요청 [{memberId, at}] JSON
    //  — 관리자가 일정관리에서 장수를 바꿔 저장하면 비운다(처리할 일에서 사라진다)
    "photoLimit", "photoReqs",
    // approval: 참석 확정 방식. "" = 신청하면 바로 참석 / "admin" = 관리자 승인 후 참석(lib/attend-approval.ts)
    //  대기회원·참관회원, 다른 클럽 회원은 어느 쪽이든 참관·가입 신청(ClubRequests) 승인을 거친다.
    "approval",
  ],
  // payNotice: 회원이 "입금했어요"를 누른 시각(관리자가 확인하기 전 알림용)
  EventApplies: [
    "id", "eventId", "memberId", "answer", "days", "paid", "paidAt", "memo", "payNotice",
    // checkedBy/checkedAt: 관리자(일정 작성자·편집자 포함)가 신청현황에서 대신 체크한 경우 그 사람 id·시각. 회원이 직접 답하면 지운다.
    "checkedBy", "checkedAt",
    // 회비 돌려주기(lib/refund.ts): 입금 확인된 회원이 참석에서 빠지면 refund "wait"(송금대기) → 관리자가 송금완료 누르면 "done"
    // refundAmount: 돌려줄 금액, refundSince: 참석 해제 시각, refundRemindAt: 관리자에게 마지막으로 알린 시각(일주일마다), refundDoneAt: 송금완료 시각
    "refund", "refundAmount", "refundSince", "refundRemindAt", "refundDoneAt",
    // 관리자 승인 후 참석(Events.approval "admin"): 회원이 참석을 신청하면 answer 는 그대로 두고 req "참석"(승인 대기), reqDays 고른 날짜, reqAt 신청 시각.
    //  승인하면 answer "참석" + days = reqDays, 반려하면 reqResult "declined" + reqReason(회원에게 보임)
    "req", "reqDays", "reqAt", "reqResult", "reqReason",
  ],
  // memo: 비용 메모(목록에서는 메모 아이콘을 눌러 본다), order: 목록 순서(끌어서 바꾼다)
  // spentBase: 직접 적은 집행. spent = spentBase + 같은 이름으로 연동된 준비목록의 완료된 가격 합계(lib/items.ts syncPrepToCosts)
  EventCosts: ["id", "eventId", "item", "budget", "spent", "status", "owner", "memo", "order", "spentBase"],
  // category: 비용 항목 이름(같은 이름의 비용 항목에 완료된 준비물 가격 합계가 집행으로 들어간다), price: 가격
  EventPrep: ["id", "eventId", "item", "owner", "done", "category", "price"],
  // 모임 회비 입금(관리자 › 모임설정 › 회비입금). period: 연회비 "2026" / 월회비 "2026-11"
  //  amount: 낼 금액(확인할 때의 금액), paid: "true", paidAt, notice: 회원이 "입금했어요"를 누른 시각, memo, checkedBy: 확인한 관리자
  DuesPayments: ["id", "period", "memberId", "amount", "paid", "paidAt", "notice", "memo", "checkedBy"],
  // 모임 회비 장부(관리자 › 모임설정 › 회비내역). kind: in(기타 수입·이월금) | out(지출). date: YYYY-MM-DD
  DuesLedger: ["id", "date", "kind", "item", "amount", "memo", "createdBy", "createdAt"],
  // 준비목록 파일(일정관리 › 준비목록에서 올림). data: base64. 준비목록을 회원에게 보이면 회원도 내려받는다.
  EventFiles: ["id", "eventId", "name", "type", "size", "data", "uploadedBy", "createdAt"],
  // 일정 사진첩(참석한 회원이 올림, lib/event-photos.ts). 목록은 가볍게 읽도록 사진 내용은 EventPhotoData 에 따로 둔다(같은 id).
  //  caption: 한 줄 설명, w/h: 줄인 사진 크기, size: 바이트, likes: 좋아요 누른 회원 id 배열 JSON
  EventPhotos: ["id", "eventId", "memberId", "caption", "w", "h", "size", "likes", "createdAt"],
  // 사진 내용(base64). data: 긴 변 1600px JPEG, thumb: 긴 변 400px JPEG. 화면에서 줄여 올린다(EXIF 위치 정보 없이).
  EventPhotoData: ["id", "type", "data", "thumb"],
  // 사진 댓글(사진첩을 볼 수 있는 회원이 씀). 사진·일정을 지우면 함께 지운다.
  //  likes: 좋아요 회원 id 배열 JSON, parentId: 답글이면 원댓글 id(lib/comments.ts)
  // 차량 배정 신청(lib/car-requests.ts): 구간(dir go|back)별. status pending|approved|confirmed|waiting|rejected|canceled|changed
  //  fromCarId: 변경 요청이면 원래 탄 차, seen: 회원이 결과(확정·반려·취소)를 봤는지
  // 회원 한 명에게 가는 알림(lib/member-alerts.ts): 차량모집·카풀 자동 배정·자동 확정 등
  MemberAlerts: ["id", "memberId", "eventId", "text", "href", "createdAt", "seen"],
  CarRequests: ["id", "eventId", "carId", "memberId", "dir", "status", "createdAt", "handledAt", "fromCarId", "seen", "note"],
  PhotoComments: ["id", "eventId", "photoId", "memberId", "body", "createdAt", "updatedAt", "likes", "parentId"],
  // 대표사진(lib/covers.ts): id "org"(모임) | "club:<클럽 이름>". 회원이 올린 일정 사진이 없을 때 일정 카드에 보인다.
  //  data: 긴 변 1600px JPEG, thumb: 400px JPEG(base64). 등록 여부·바뀐 시각은 Settings "covers" 에 따로 둔다(목록을 가볍게).
  CoverData: ["id", "type", "data", "thumb", "updatedAt"],
  // place: 위치(주소·장소 이름), memo: 메모(준비물·안내). 일정마다 아이콘으로 보이고 누르면 팝업으로 본다.
  EventSchedule: ["id", "eventId", "at", "title", "place", "memo"],
  // 템플릿 버전: 처음 만든 행이 v1(origin default/custom)이고, 고칠 때마다 새 행이 v2, v3…으로 생긴다(origin "version").
  // 새 버전의 config.derivedFrom 은 v1 id, config.sourceEvent 는 일정에서 고쳤을 때 그 일정.
  // 저장 방법(수정=이 버전 고치기 / 새 버전 / 새 활동)은 고치는 사람이 고른다(lib/template-versions.ts saveTemplate).
  ActivityTemplates: ["id", "name", "version", "config", "origin", "createdAt"],
  // startsAt/endsAt: 이 활동이 진행되는 날짜와 시간(한국 시간, YYYY-MM-DDTHH:mm). 비어 있으면 시간 제한 없음.
  // hostId: 진행자(회원 id), hostCode: 진행자 접속번호(이 번호로 로그인하면 활동 진행 화면만 보인다)
  // hosts: 진행자 여러 명 JSON [{memberId, code}] — 사람마다 접속번호가 따로(lib/hosts.ts). hostId/hostCode 는 예전 값(첫 진행자)
  EventActivities: ["id", "eventId", "templateId", "templateVersion", "config", "state", "order", "startsAt", "endsAt", "hostId", "hostCode", "hosts"],
  // 활동별 출석 체크: 자동 명단(날짜 선택 기반)을 관리자가 고칠 때만 행이 생긴다. present: true(출석) / false(결석)
  Attendance: ["id", "eventActivityId", "memberId", "present"],
  Teams: ["id", "eventActivityId", "name", "memberIds"],
  // 일정 조편성(여러 개 가능, 예: 저녁 게임 3개 조). teams 는 [{name, memberIds}] JSON. published 가 true 여야 회원에게 보인다.
  Groupings: ["id", "eventId", "title", "teams", "published", "updatedAt"],
  // 갈 때: from/to 출발·도착 장소, departAt/arriveAt 출발·도착 예상 시간, riders 탑승자(JSON)
  // 올 때: backFrom/backTo/backDepartAt/backArriveAt/backRiders (같은 뜻)
  // goOn/backOn: 갈 때·올 때 운행 여부("true"/"false"). leg(왕복/갈 때/올 때)는 예전 코드 호환용으로 goOn/backOn 에서 만든다.
  Carpools: [
    "id", "eventId", "leg", "driverId", "seats", "from", "departAt", "riders", "to", "arriveAt", "plate", "name",
    "goOn", "backOn", "backFrom", "backDepartAt", "backTo", "backArriveAt", "backRiders",
    "kind", "driverName", // kind: member(회원 차량) | rental(외부 대절, driverName 에 운전자 이름)
    "memo", "ownerId", // memo: 메모(경유지 등), ownerId: 차량모집으로 회원이 직접 등록한 차면 그 회원
    "goSeats", "backSeats", "goMemo", "backMemo", // 구간(갈 때·올 때)별 좌석·메모
  ],
  // 숙박 숙소배정: date(YYYY-MM-DD) 날짜별 방, guests 는 회원 id 배열 JSON
  Rooms: ["id", "eventId", "date", "name", "capacity", "memo", "guests"],
  LiveState: ["id", "eventActivityId", "step", "memberUnlocked", "payload", "updatedAt"],
  // 내가 누굴까요? : 프로필(회원당 1개), 인터뷰 원문(본인만), 2진실 1거짓, 사전 추측
  Profiles: [
    "id", "memberId", "alias", "draftMd", "introMd", "introStatus", "publicFields",
    "readingMd", "readingStatus", "approvedAt", "updatedAt",
    // firstApprovedAt: 소개를 처음 공개(승인)한 시각. 프로필 북 목록의 NEW / UP 구분(lib/unread.ts)
    "firstApprovedAt",
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
  // 게시글. form: rules|fee|general|survey|poll|quiz (lib/board.ts). minutes 는 예전 회의록 글(이제 회의 일정으로 옮김). data: 양식별 내용 JSON.
  // audience: 공개 대상 JSON(lib/audience.ts), files: 첨부 [{id,name,type,size,image}] JSON
  Posts: [
    "id", "form", "title", "body", "data", "audience", "notice", "pinned", "files",
    "authorId", "createdAt", "updatedAt",
    // editors: 편집자 회원 id 배열 JSON(작성자가 추가, lib/editors.ts). 편집자도 이 글을 고칠 수 있다.
    "editors",
    // audSeenAt: 새로 가입한 회원 알림을 작성자가 확인한 시각(이 뒤에 가입한 회원만 다시 알린다)
    "audSeenAt",
    // postFrom·postUntil: 게시 기간(비면 계속 게시). 기간 밖이면 회원 게시판에 안 보임(lib/post-period.ts)
    "postFrom", "postUntil",
  ],
  // 첨부 파일 내용(base64). 게시글 목록을 읽을 때 같이 읽지 않도록 따로 둔다.
  PostFiles: ["id", "postId", "name", "type", "size", "data", "createdAt"],
  // 회원 프로필 사진(base64, 256×256). 게시글 첨부와 섞지 않는다. 회원당 1장(바꾸면 예전 것은 지운다).
  MemberPhotos: ["id", "memberId", "type", "size", "data", "createdAt"],
  // 설문 응답, 투표, 퀴즈 답. answer: JSON
  PostResponses: ["id", "postId", "memberId", "answer", "createdAt"],
  // 게시글 반응(좋아요 등). type: lib/board.ts REACTIONS 의 key. 회원당 글 하나에 종류별로 한 줄(누르면 켜고 끈다).
  // 관리 화면에서 올린 회칙·회비 글에는 받지 않는다(lib/board.ts talkable).
  PostReactions: ["id", "postId", "memberId", "type", "createdAt"],
  // 게시글 댓글(답글 없이 한 줄로). body 최대 1000자. 지우면 행을 지운다. updatedAt 이 있으면 "수정됨".
  // 글쓴이 알림: 내 글에 남이 단 댓글 중 Settings "commentSeen:<회원 id>"(ISO) 뒤의 것(lib/unread.ts)
  PostComments: ["id", "postId", "memberId", "body", "createdAt", "updatedAt", "likes", "parentId"], // likes·parentId: lib/comments.ts
  // 휴대폰 알림(Web Push) 구독
  PushSubs: ["id", "memberId", "endpoint", "keys", "createdAt"],
  // 클럽 가입 신청(kind=join) / 클럽 일정 1회 참관 신청(kind=observe, eventId 필수).
  // status: pending | approved | declined. 처리는 그 클럽 직책자(lib/club-requests.ts).
  // resultSeen: 신청한 회원이 결과 알림을 봤으면 "true"
  // attend: "true"면 클럽 일정 화면에서 보낸 참석 요청(참관 또는 가입 + 그 일정 참석). eventId 필수.
  //   승인되면 그 일정의 EventApplies 를 참석으로 넣는다(lib/club-requests.ts attendApprove).
  ClubRequests: [
    "id", "kind", "club", "eventId", "memberId", "message", "status", "createdAt", "handledBy", "handledAt", "resultSeen", "attend",
    // reason: 반려 사유(반려할 때 처리자가 적는다. 신청한 회원에게 보인다)
    "reason",
  ],
  // 개발 요청: 템플릿 편집기의 "AI에게 요청"에서 지금 기능으로는 안 되는 것(새 코드가 필요한 것)을 개발자에게 남긴다.
  // templateId/eventId: 요청한 곳(비어 있을 수 있음), requestedBy: 요청한 관리자 이름, status: 접수 | 진행 중 | 완료 | 보류
  // 회원 신청(관리자 › 회원관리 › 회원신청관리에서 승인·반려). lib/member-apps.ts
  //  type: member(회원 요청) | observe(참관 요청), source: signup(로그인 화면) | settings(설정의 정회원 신청)
  //  edu: "yes" | "no"(정회원 필수 조건 질문 답), recommenders: 추천인(비이수자), status: pending | approved | rejected
  //  reason: 반려 사유, fromKind/toKind: 승인할 때 바뀐 회원구분 기록, resultSeen: 신청자가 결과 알림을 봤으면 "true"
  MemberApps: [
    "id", "memberId", "name", "phone", "type", "edu", "recommenders", "message", "source", "status", "reason",
    "createdAt", "handledBy", "handledAt", "fromKind", "toKind", "resultSeen",
    // type change(회원 권한 수정: 신청할 때 toKind 를 정해 둔다) | rejoin(탈퇴회원 재가입), status 에 canceled(탈퇴로 취소) 추가
    // note: 관리자에게 보일 안내(예: 탈퇴회원과 이름·전화번호가 같아요)
    "note",
  ],
  DevRequests: ["id", "templateId", "eventId", "title", "detail", "why", "requestedBy", "status", "createdAt", "updatedAt"],
} as const;

export type TabName = keyof typeof TABS;
