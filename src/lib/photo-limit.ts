// 사진첩 최대 장수 계산(화면·서버 공용: 서버 전용 모듈을 가져오지 않는다). 서버 쪽은 lib/event-photos.ts photoLimitOf.
// 기본 = 참석 인원 × 10장 × 일정 일수, 참석자가 없으면 20장. 관리자가 일정마다 정한 값(Events.photoLimit)이 있으면 그 값.
export const MAX_PHOTO_LIMIT = 1000; // 관리자가 정할 수 있는 최대
export const PHOTOS_PER_PERSON_DAY = 10; // 기본 최대 장수 = 참석 인원 × 10장 × 일정 일수(관리자가 일정마다 정하면 그 값: Events.photoLimit)
export const PHOTOS_MIN = 20; // 참석자가 없을 때

// 일정 일수: 시작일 ~ 끝나는 날(날짜만, 한국 시간 "YYYY-MM-DD…"). 날짜가 없거나 이상하면 1일
export function eventDayCount(startsAt: string | undefined, endsAt: string | undefined): number {
  const a = Date.parse(`${(startsAt ?? "").slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${(endsAt || startsAt || "").slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a)) return 1;
  const n = Number.isNaN(b) ? 1 : Math.round((b - a) / 86_400_000) + 1;
  return n >= 1 ? Math.min(n, 60) : 1;
}
// 기본 최대 장수: 참석 인원 × 10장 × 일정 일수(참석자가 없으면 20장), MAX_PHOTO_LIMIT 까지
export const defaultPhotoLimit = (going: number, days: number) =>
  Math.min(MAX_PHOTO_LIMIT, going > 0 ? going * PHOTOS_PER_PERSON_DAY * Math.max(1, days) : PHOTOS_MIN);
// 장수가 찼을 때 안내(서버 응답과 화면이 같은 문장)
export const limitMessage = (n: number) => `사진은 ${n}장까지 들어가요. 더 넣고 싶으면 관리자에게 요청하세요.`;
