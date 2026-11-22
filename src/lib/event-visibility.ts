// 일정 정보 공개 범위: 공개 대상 중 아직 참석하지 않은 회원(미응답·불참·승인 대기)에게 어떤 항목을 보여 줄지.
//  참석(확정)한 회원·관리하는 사람(미리보기)은 모두 본다. 개요(제목·일시·장소)와 사진첩은 늘 공개(고정).
//  사진첩은 미응답·불참도 보기·좋아요·댓글·내려받기를 할 수 있고, 사진 올리기만 참석자가 한다.
//  일정의 visibility(JSON, 열린 항목 true)에 저장하고, 비어 있으면 일정 유형 기본값(워크숍만 정해 둠, 나머지는 모두 공개).
//  화면(관리자 체크표·회원 일정 화면)과 서버가 함께 쓰므로 서버 전용 모듈을 가져오지 않는다.
export const VIS_KEYS = ["notice", "schedule", "fee", "activities", "prepCost", "assign", "minutes"] as const;
export type VisKey = (typeof VIS_KEYS)[number];
export type Visibility = Record<VisKey, boolean>;

export const VIS_LABEL: Record<VisKey, string> = {
  notice: "안내",
  schedule: "일정(세부 일정)",
  fee: "내 참가비(참석하면 낼 예상 회비)",
  activities: "주요 활동",
  prepCost: "준비목록·비용",
  assign: "조편성·숙소·차량",
  minutes: "회의록",
};

const ALL_OPEN: Visibility = { notice: true, schedule: true, fee: true, activities: true, prepCost: true, assign: true, minutes: true };
// 일정 유형별 기본값: 워크숍은 참석자에게만 의미 있는 정보(주요 활동·준비·배정)를 닫는다
export function visDefaults(type?: string): Visibility {
  if (type === "워크숍") return { ...ALL_OPEN, activities: false, prepCost: false, assign: false };
  return { ...ALL_OPEN };
}

export function readVisibility(ev: { type?: string; visibility?: string }): Visibility {
  const base = visDefaults(ev.type);
  try {
    const v = ev.visibility ? (JSON.parse(ev.visibility) as Partial<Visibility>) : {};
    return Object.fromEntries(VIS_KEYS.map((k) => [k, typeof v[k] === "boolean" ? v[k] : base[k]])) as Visibility;
  } catch {
    return base;
  }
}

// 이 회원에게 닫힌 항목. full: 참석(확정)했거나 관리하는 사람(미리보기)
export function lockedFor(ev: { type?: string; visibility?: string }, full: boolean): VisKey[] {
  if (full) return [];
  const v = readVisibility(ev);
  return VIS_KEYS.filter((k) => !v[k]);
}
