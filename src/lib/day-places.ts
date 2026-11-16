// 세부일정 날짜별 기본 위치(Events.dayPlaces JSON: { "YYYY-MM-DD": "장소" }).
// 그날 일정 대부분이 열리는 곳을 한 번 적고, 장소가 다른 일정만 일정 줄의 위치에 따로 적는다.
export type DayPlaces = Record<string, string>;

export function readDayPlaces(text: string | undefined): DayPlaces {
  if (!text) return {};
  try {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).filter(([k, p]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && typeof p === "string" && p.trim()).map(([k, p]) => [k, String(p).trim()]),
    );
  } catch {
    return {};
  }
}
