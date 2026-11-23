// 일정 정보 공개 범위: 공개 대상 중 아직 참석하지 않은 회원(미응답·불참·승인 대기)에게 어떤 항목을 보여 줄지.
//  관리자 › 일정의 각 탭(세부일정·회비·비용·준비목록·활동·조편성·차량·숙소·사진첩, 개요의 안내, 회의록)에 있는
//  "미응답·불참에게 보이기" 스위치로 항목마다 정한다(components/VisSwitch.tsx).
//  참석(확정)한 회원·관리하는 사람(미리보기)은 모두 본다. 개요(제목·일시·장소)는 늘 공개.
//  사진첩이 열려 있으면 미응답·불참도 보기·좋아요·댓글·내려받기를 할 수 있고, 사진 올리기만 참석자가 한다.
//  일정의 visibility(JSON, 열린 항목 true)에 저장하고, 없는 항목은 일정 유형 기본값(워크숍만 정해 둠, 나머지는 모두 공개).
//  화면(관리자 스위치·회원 일정 화면)과 서버가 함께 쓰므로 서버 전용 모듈을 가져오지 않는다.
export const VIS_KEYS = ["notice", "schedule", "fee", "costs", "prep", "activities", "groups", "cars", "rooms", "photos", "minutes"] as const;
export type VisKey = (typeof VIS_KEYS)[number];
export type Visibility = Record<VisKey, boolean>;

export const VIS_LABEL: Record<VisKey, string> = {
  notice: "안내",
  schedule: "세부 일정",
  fee: "회비",
  costs: "비용",
  prep: "준비목록",
  activities: "활동",
  groups: "조편성",
  cars: "차량 배정",
  rooms: "숙소 배정",
  photos: "사진첩",
  minutes: "회의록",
};

const ALL_OPEN = Object.fromEntries(VIS_KEYS.map((k) => [k, true])) as Visibility;
// 일정 유형별 기본값: 워크숍은 참석자에게만 의미 있는 정보(활동·준비목록·비용·배정)를 닫는다
export function visDefaults(type?: string): Visibility {
  if (type === "워크숍") return { ...ALL_OPEN, activities: false, prep: false, costs: false, groups: false, cars: false, rooms: false };
  return { ...ALL_OPEN };
}

export function readVisibility(ev: { type?: string; visibility?: string }): Visibility {
  const base = visDefaults(ev.type);
  let v: Record<string, unknown> = {};
  try {
    v = ev.visibility ? (JSON.parse(ev.visibility) as Record<string, unknown>) : {};
  } catch {
    v = {};
  }
  // 예전 묶음 항목(준비목록·비용 = prepCost, 조편성·숙소·차량 = assign)도 읽는다
  const old: Partial<Record<VisKey, string>> = { prep: "prepCost", costs: "prepCost", groups: "assign", cars: "assign", rooms: "assign" };
  const pick = (k: VisKey) => (typeof v[k] === "boolean" ? (v[k] as boolean) : old[k] && typeof v[old[k]!] === "boolean" ? (v[old[k]!] as boolean) : base[k]);
  return Object.fromEntries(VIS_KEYS.map((k) => [k, pick(k)])) as Visibility;
}

// 이 회원에게 닫힌 항목. full: 참석(확정)했거나 관리하는 사람(미리보기)
export function lockedFor(ev: { type?: string; visibility?: string }, full: boolean): VisKey[] {
  if (full) return [];
  const v = readVisibility(ev);
  return VIS_KEYS.filter((k) => !v[k]);
}
