// 일정 유형. 화면과 서버가 함께 쓰므로 다른 모듈을 가져오지 않는다.
export const EVENT_TYPES = ["정기모임", "워크숍", "소모임", "회의", "미팅"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// 예전 유형 이름 → 지금 이름 (Events.type 을 읽을 때 한 번 고쳐 저장한다: lib/event-migrate.ts)
export const LEGACY_TYPES: Record<string, EventType> = { 전체정기모임: "정기모임" };
export const normType = (t: string | undefined): string => (t && LEGACY_TYPES[t]) || t || "";

// 회비·카풀·숙박·조편성·활동이 필요 없는 가벼운 일정
export const LIGHT_TYPES: readonly string[] = ["회의", "미팅"];
export const isLight = (t: string | undefined) => LIGHT_TYPES.includes(normType(t));

// 유형별 칩 색(globals.css 의 .pill.* — 모두 토큰 색)
export const TYPE_TONE: Record<string, string> = { 정기모임: "red", 워크숍: "violet", 소모임: "warn", 회의: "ink", 미팅: "gray" };
