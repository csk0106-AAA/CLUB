// 관리자 권한 범위(화면·서버 공통). 권한설정 화면에 이 순서로 보인다.
//  all       모든권한
//  group     모임설정(모임개요·회비관리·회칙)
//  members   회원관리(회원구분·회원명단·회원신청·조직도·권한)
//  events    일정관리(모든 일정 만들기·관리: 신청현황·회비·세부일정·조편성·카풀·숙박·회의록·활동)
//  clubs     소모임관리(소모임 목록·개요·회원·회비·일정·신청내역)
//  templates 활동템플릿
//  write     게시글_글쓰기
//  evMain    일정_일정만들기(정기모임,워크숍,회의,미팅) — 이 종류 일정을 만들고, 내가 만든 일정만 고칠 수 있다
//  evClub    일정_일정만들기(소모임,회의,미팅)       — 위와 같음(소모임 일정은 소모임을 골라 만든다)
export const PERM_KEYS = ["all", "group", "members", "events", "clubs", "templates", "write", "evMain", "evClub"] as const;
export type PermKey = (typeof PERM_KEYS)[number];

export const PERM_LABELS: Record<string, string> = {
  all: "모든권한",
  group: "모임설정",
  members: "회원관리",
  events: "일정관리",
  clubs: "소모임관리",
  templates: "활동템플릿",
  write: "게시글_글쓰기",
  evMain: "일정_일정만들기(정기모임,워크숍,회의,미팅)",
  evClub: "일정_일정만들기(소모임,회의,미팅)",
};

export const PERM_DESC: Record<string, string> = {
  group: "모임개요, 회비관리, 회칙",
  members: "회원구분, 회원명단, 회원신청, 조직도, 권한",
  events: "모든 일정 만들기와 관리(신청현황·회비·세부일정·조편성·카풀·숙박·회의록·활동)",
  clubs: "소모임 목록, 소모임 개요·회원·회비·일정·신청내역",
  templates: "활동 템플릿 만들기·고치기",
  write: "게시글 쓰기, 게시글 양식",
  evMain: "정기모임·워크숍·회의·미팅 일정을 만들고, 내가 만든 일정만 고칠 수 있어요",
  evClub: "소모임·회의·미팅 일정을 만들고, 내가 만든 일정만 고칠 수 있어요",
};

// 예전 권한 이름 → 지금 권한(저장된 값은 그대로 두고 읽을 때 바꾼다)
const LEGACY: Record<string, string> = { fees: "group", minutes: "group", activities: "templates", board: "write" };

// 권한 목록 정리: 예전 이름을 바꾸고, 모르는 값은 빼고, 중복을 없앤다. "all" 이 있으면 ["all"].
export function normPerms(list: readonly string[]): string[] {
  const out = new Set<string>();
  for (const p of list) {
    const k = LEGACY[p] ?? p;
    if ((PERM_KEYS as readonly string[]).includes(k)) out.add(k);
  }
  if (out.has("all")) return ["all"];
  return PERM_KEYS.filter((k) => out.has(k));
}

// 일정 만들기 권한별로 만들 수 있는 일정 종류
export const EVENT_TYPES_BY_PERM: Record<"evMain" | "evClub", string[]> = {
  evMain: ["정기모임", "워크숍", "회의", "미팅"],
  evClub: ["소모임", "회의", "미팅"],
};

// 이 권한으로 만들 수 있는 일정 종류(null: 모든 종류 — 모든권한·일정관리)
export function creatableTypes(perms: readonly string[]): string[] | null {
  if (perms.includes("all") || perms.includes("events")) return null;
  const out = new Set<string>();
  // 소모임관리: 소모임 일정(소모임관리 › 소모임 › 일정관리)
  if (perms.includes("clubs")) out.add("소모임");
  if (perms.includes("evMain")) EVENT_TYPES_BY_PERM.evMain.forEach((t) => out.add(t));
  if (perms.includes("evClub")) EVENT_TYPES_BY_PERM.evClub.forEach((t) => out.add(t));
  return [...out];
}

// 일정 만들기만 할 수 있는지(일정관리 권한 없이 evMain/evClub 만)
export const isEventCreator = (perms: readonly string[]) =>
  !perms.includes("all") && !perms.includes("events") && (perms.includes("evMain") || perms.includes("evClub"));
