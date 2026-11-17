import { z } from "zod";
import type { TabName } from "./store/schema";
import type { Row } from "./store/types";

// 일정의 일정, 준비 목록, 비용. 한 쌍의 API 파일(items/[kind])로 모두 처리한다.
export type ItemKind = "schedule" | "prep" | "costs";

type Def = {
  tab: TabName;
  perm: string[]; // 읽기·쓰기에 필요한 관리자 권한(하나라도 있으면 된다)
  schema: z.ZodType<Record<string, string>, z.ZodTypeDef, unknown>;
  sort: (a: Row, b: Row) => number;
  view: (r: Row) => Record<string, unknown>;
};

const money = z.number().int().min(0).max(10_000_000_000);
const str = (max: number) => z.string().trim().max(max);

export const ITEMS: Record<ItemKind, Def> = {
  schedule: {
    tab: "EventSchedule",
    perm: ["events"],
    schema: z
      .object({ at: str(40).min(1), title: str(300).min(1), place: str(200).default(""), memo: str(1000).default("") })
      .transform((v) => ({ at: v.at, title: v.title, place: v.place, memo: v.memo })),
    sort: (a, b) => a.at.localeCompare(b.at),
    view: (r) => ({ id: r.id, at: r.at, title: r.title, place: r.place ?? "", memo: r.memo ?? "" }),
  },
  prep: {
    tab: "EventPrep",
    perm: ["events"],
    schema: z
      .object({ item: str(100).min(1), owner: str(40).default(""), done: z.boolean().default(false), category: str(100).default(""), price: money.default(0) })
      .transform((v) => ({ item: v.item, owner: v.owner, done: String(v.done), category: v.category, price: String(v.price) })),
    sort: (a, b) => Number(a.done === "true") - Number(b.done === "true") || a.item.localeCompare(b.item, "ko"),
    view: (r) => ({ id: r.id, item: r.item, owner: r.owner, done: r.done === "true", category: r.category ?? "", price: Number(r.price) || 0 }),
  },
  costs: {
    tab: "EventCosts",
    perm: ["events"],
    schema: z
      .object({ item: str(100).min(1), budget: money.default(0), spent: money.default(0), status: str(20).default("예정"), owner: str(40).default(""), memo: str(1000).default("") })
      .transform((v) => ({ item: v.item, budget: String(v.budget), spent: String(v.spent), status: v.status, owner: v.owner, memo: v.memo })),
    // 관리자가 끌어서 정한 순서(order), 순서가 없는 예전 항목은 뒤에 이름 순
    sort: (a, b) => (Number(a.order) || 1e9) - (Number(b.order) || 1e9) || a.item.localeCompare(b.item, "ko"),
    view: (r) => ({ id: r.id, item: r.item, budget: Number(r.budget) || 0, spent: Number(r.spent) || 0, status: r.status, owner: r.owner, memo: r.memo ?? "" }),
  },
};

export function isKind(k: string): k is ItemKind {
  return k in ITEMS;
}

// 준비목록 → 비용 연동: 준비물의 "비용 항목"과 이름이 같은 비용 항목의 집행 = 완료된 준비물 가격 합계.
// 연동된 준비물이 하나도 없는 비용 항목은 손대지 않는다(직접 적은 집행 금액 그대로).
export async function syncPrepToCosts(eventId: string): Promise<void> {
  const { getStore } = await import("./store");
  const s = await getStore();
  const [prep, costs] = await Promise.all([s.list("EventPrep"), s.list("EventCosts")]);
  const mine = prep.filter((p) => p.eventId === eventId && (p.category ?? "").trim());
  for (const c of costs.filter((x) => x.eventId === eventId)) {
    const linked = mine.filter((p) => p.category.trim() === (c.item ?? "").trim());
    if (!linked.length) continue;
    const spent = String(linked.filter((p) => p.done === "true").reduce((n, p) => n + (Number(p.price) || 0), 0));
    if (spent !== c.spent) await s.update("EventCosts", c.id, { spent });
  }
}

// 비용 항목별 연동된 준비물 수(비용 화면에서 집행 칸을 자동으로 보여 줄 때)
export function prepLinks(prep: Row[], eventId: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of prep) {
    const c = (p.category ?? "").trim();
    if (p.eventId === eventId && c) m.set(c, (m.get(c) ?? 0) + 1);
  }
  return m;
}
