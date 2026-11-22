import { readDayPlaces } from "@/lib/day-places";
import { getSetting, getStore, setSetting } from "@/lib/store";

// 일정 유형별 템플릿: "일정 만들기"에서 그 유형을 고르면 저장해 둔 일정의 설정·준비 내용으로 새 일정을 채운다.
//  관리자 › 일정 › 개요 아래 "이 일정을 ○○ 템플릿으로 저장"으로 저장(그때의 내용을 복사해 둔다, 원래 일정을 고쳐도 템플릿은 그대로).
//  담는 것: 장소·안내·회비 설정(입금 기한·계좌·지원금)·세부일정·날짜별 기본 위치·준비목록(완료 해제)·비용(집행 0)·활동(설정, 진행 전 상태)
//           ·준비목록/비용 참석자 공개·미응답·불참 공개 범위·참석 확정 방식·사진 최대 장수, 시작 시각과 진행 시간
//  담지 않는 것: 이름·공개 대상·참석 신청·입금·사진첩·조편성·차량·숙소·회의록·편집자
//  날짜: 새 일정의 시작일과 템플릿 원래 시작일의 차이만큼 세부일정·활동 시간·입금 기한·날짜별 위치를 옮긴다.
//  설정 "evTemplates" = { [유형]: EventTemplate }
export type EventTemplate = {
  type: string;
  fromId: string;
  fromName: string;
  savedAt: string;
  startsAt: string; // 원래 시작 일시(날짜 옮기기 기준)
  endsAt: string;
  event: Record<string, string>;
  schedule: { at: string; title: string; place: string; memo: string }[];
  prep: { item: string; owner: string; category: string; price: string }[];
  costs: { item: string; budget: string; owner: string; memo: string; order: string }[];
  activities: { templateId: string; templateVersion: string; config: string; order: string; startsAt: string; endsAt: string }[];
};
type Store = Record<string, EventTemplate>;

const KEY = "evTemplates";
const EV_FIELDS = ["place", "booking", "fee", "feeRules", "feeDeadline", "account", "accountHolder", "supports", "dayPlaces", "showPrep", "showCosts", "photoLimit", "visibility", "approval"] as const;

export async function readTemplates(): Promise<Store> {
  const v = await getSetting<Store>(KEY, {});
  return v && typeof v === "object" ? v : {};
}

// 템플릿 요약(관리 화면·일정 만들기 창에 보여 줄 것)
export function templateSummary(t: EventTemplate) {
  return {
    type: t.type, fromId: t.fromId, fromName: t.fromName, savedAt: t.savedAt, startsAt: t.startsAt, endsAt: t.endsAt,
    counts: { schedule: t.schedule.length, prep: t.prep.length, costs: t.costs.length, activities: t.activities.length },
  };
}

// 이 일정을 그 유형의 템플릿으로 저장(같은 유형 템플릿은 바꿔 쓴다)
export async function saveTemplate(eventId: string): Promise<EventTemplate | null> {
  const s = await getStore();
  const ev = await s.get("Events", eventId);
  if (!ev) return null;
  const [sched, prep, costs, acts] = await Promise.all([s.list("EventSchedule"), s.list("EventPrep"), s.list("EventCosts"), s.list("EventActivities")]);
  const mine = <T extends { eventId?: string }>(rows: T[]) => rows.filter((r) => r.eventId === eventId);
  const t: EventTemplate = {
    type: ev.type, fromId: ev.id, fromName: ev.name, savedAt: new Date().toISOString(),
    startsAt: ev.startsAt ?? "", endsAt: ev.endsAt ?? "",
    event: Object.fromEntries(EV_FIELDS.map((k) => [k, ev[k] ?? ""])),
    schedule: mine(sched).sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "")).map((r) => ({ at: r.at ?? "", title: r.title ?? "", place: r.place ?? "", memo: r.memo ?? "" })),
    prep: mine(prep).map((r) => ({ item: r.item ?? "", owner: r.owner ?? "", category: r.category ?? "", price: r.price ?? "" })),
    costs: mine(costs).map((r) => ({ item: r.item ?? "", budget: r.budget ?? "", owner: r.owner ?? "", memo: r.memo ?? "", order: r.order ?? "" })),
    activities: mine(acts).sort((a, b) => Number(a.order || 0) - Number(b.order || 0)).map((r) => ({
      templateId: r.templateId ?? "", templateVersion: r.templateVersion ?? "", config: r.config ?? "", order: r.order ?? "", startsAt: r.startsAt ?? "", endsAt: r.endsAt ?? "",
    })),
  };
  const all = await readTemplates();
  await setSetting(KEY, { ...all, [ev.type]: t });
  return t;
}

export async function removeTemplate(type: string): Promise<void> {
  const all = await readTemplates();
  if (!all[type]) return;
  const next = { ...all };
  delete next[type];
  await setSetting(KEY, next);
}

const DAY = 86_400_000;
const dayMs = (v: string) => Date.parse(`${v.slice(0, 10)}T00:00:00Z`);
// "YYYY-MM-DD…" 의 날짜 부분만 days 만큼 옮긴다(시각은 그대로)
export function shiftDate(v: string | undefined, days: number): string {
  if (!v || !days || !/^\d{4}-\d{2}-\d{2}/.test(v)) return v ?? "";
  return new Date(dayMs(v) + days * DAY).toISOString().slice(0, 10) + v.slice(10);
}

// 새 일정의 시작·끝 일시: 날짜만 골랐으면 템플릿의 시작 시각, 끝을 비웠으면 템플릿의 진행 시간만큼
export function templateTimes(t: EventTemplate, startsAt: string, endsAt: string): { startsAt: string; endsAt: string; days: number } {
  if (!startsAt || !/^\d{4}-\d{2}-\d{2}/.test(t.startsAt)) return { startsAt, endsAt, days: 0 };
  const days = Math.round((dayMs(startsAt) - dayMs(t.startsAt)) / DAY);
  const start = startsAt.length === 10 && t.startsAt.length > 10 ? startsAt + t.startsAt.slice(10) : startsAt;
  const end = endsAt || (t.endsAt ? shiftDate(t.endsAt, days) : "");
  return { startsAt: start, endsAt: end, days };
}

// 새 일정(이미 만든 행)의 칸과 하위 내용을 템플릿으로 채운다. club 일정이면 계좌는 클럽 것을 그대로 둔다.
export function templateEventFields(t: EventTemplate, days: number, keepAccount: boolean): Record<string, string> {
  const e = { ...t.event };
  const places = readDayPlaces(e.dayPlaces);
  const moved = Object.fromEntries(Object.entries(places).map(([k, v]) => [shiftDate(k, days), v]));
  const out: Record<string, string> = { ...e, feeDeadline: shiftDate(e.feeDeadline, days), dayPlaces: Object.keys(moved).length ? JSON.stringify(moved) : "" };
  if (keepAccount) {
    delete out.account;
    delete out.accountHolder;
  }
  return out;
}

export async function fillFromTemplate(eventId: string, t: EventTemplate, days: number): Promise<void> {
  const s = await getStore();
  for (const r of t.schedule) await s.insert("EventSchedule", { eventId, at: shiftDate(r.at, days), title: r.title, place: r.place, memo: r.memo });
  for (const r of t.prep) await s.insert("EventPrep", { eventId, item: r.item, owner: r.owner, done: "", category: r.category, price: r.price });
  for (const r of t.costs) await s.insert("EventCosts", { eventId, item: r.item, budget: r.budget, spent: "0", spentBase: "0", status: "", owner: r.owner, memo: r.memo, order: r.order });
  for (const r of t.activities) {
    await s.insert("EventActivities", {
      eventId, templateId: r.templateId, templateVersion: r.templateVersion, config: r.config, state: "ready", order: r.order,
      startsAt: shiftDate(r.startsAt, days), endsAt: shiftDate(r.endsAt, days),
    });
  }
}
