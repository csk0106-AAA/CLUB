import { newTemplateId, readConfig } from "./activities";
import type { Row, Store } from "./store/types";
import type { TemplateConfig } from "./template-schema";

// 활동 템플릿 버전 관리
//  - 처음 만든 템플릿(기본 템플릿 또는 직접/AI로 만든 템플릿)이 v1 이다. origin: default | custom
//  - 템플릿을 고치면(템플릿 화면의 수정·AI 지침, 일정 활동의 수정·AI 지침) 기존 행은 그대로 두고
//    새 행을 v2, v3…으로 만든다. origin: "version", config.derivedFrom: v1 id, config.sourceEvent: 일정에서 고쳤으면 그 일정
//  - 한 번 만든 버전은 고치지 않는다. 일정 활동은 넣을 때 고른 버전(templateId)을 계속 쓴다.
//  - 복제는 버전이 아니라 새 템플릿(v1)을 만든다.

export type SourceEvent = { id: string; name: string; date: string };
export type Editable = Omit<TemplateConfig, "id" | "version">;

export const isVersionRow = (r: Row) => r.origin === "version";

// 이 행이 속한 템플릿 묶음의 v1 id
export function familyIdOf(r: Row): string {
  if (!isVersionRow(r)) return r.id;
  return readConfig(r.config)?.derivedFrom || r.id;
}

export const versionOf = (r: Row) => Number(r.version) || 1;

// 같은 묶음의 행(v1 먼저, 버전 순)
export function familyRows(rows: Row[], familyId: string): Row[] {
  return rows.filter((r) => familyIdOf(r) === familyId).sort((a, b) => versionOf(a) - versionOf(b));
}

export function nextVersion(rows: Row[], familyId: string): number {
  return familyRows(rows, familyId).reduce((n, r) => Math.max(n, versionOf(r)), 0) + 1;
}

// 일정 → 버전 출처 표시("일정명_2026/12/11")
export function eventSource(ev: Row): SourceEvent {
  const date = ev.startsAt ? ev.startsAt.slice(0, 10).replace(/-/g, "/") : "날짜 미정";
  return { id: ev.id, name: ev.name, date };
}

// 버전마다 서버가 정하는 값(id, version, 출처)을 뺀 설정
export function editable(c: Editable & Partial<Pick<TemplateConfig, "id" | "version">>): Editable {
  const { id: _i, version: _v, derivedFrom: _d, sourceEvent: _s, ...rest } = c;
  void _i; void _v; void _d; void _s;
  return rest;
}

// 출처를 빼고 설정이 같은지(스키마 순서로 다시 읽어서 비교)
export function sameConfig(a: Editable, b: Editable): boolean {
  const norm = (c: Editable) => {
    const e: Editable = { ...editable(c) };
    if (e.aiGuides && !Object.keys(e.aiGuides).length) delete e.aiGuides; // 빈 지침 = 지침 없음
    const r = readConfig(JSON.stringify({ ...e, id: "x", version: 1 }));
    return r ? JSON.stringify(r) : JSON.stringify(c);
  };
  return norm(a) === norm(b);
}

// base 가 속한 묶음에 새 버전을 만든다.
export async function createVersion(s: Store, base: Row, input: Editable, sourceEvent?: SourceEvent): Promise<{ id: string; version: number; config: TemplateConfig; row: Row }> {
  const rows = await s.list("ActivityTemplates");
  const familyId = familyIdOf(base);
  const version = nextVersion(rows, familyId);
  const id = newTemplateId();
  const config: TemplateConfig = { ...editable(input), id, version, derivedFrom: familyId, ...(sourceEvent ? { sourceEvent } : {}) };
  const row = await s.insert("ActivityTemplates", {
    id, name: config.name, version: String(version), config: JSON.stringify(config), origin: "version", createdAt: new Date().toISOString(),
  });
  return { id, version, config, row };
}

// 지울 수 있는지: 일정 활동이 쓰는 버전은 지울 수 없고, v1 은 다른 버전이 없는 직접 만든 템플릿만 지운다.
export function deleteBlock(rows: Row[], acts: Row[], r: Row): string | null {
  if (r.origin === "default") return "기본 템플릿은 지울 수 없어요. 복제해서 쓰세요.";
  const uses = acts.filter((a) => a.templateId === r.id).length;
  if (uses) return `이 버전을 쓰는 일정 활동이 ${uses}개 있어서 지울 수 없어요.`;
  if (!isVersionRow(r) && familyRows(rows, r.id).length > 1) return "다른 버전이 있어서 v1은 지울 수 없어요. 다른 버전을 먼저 지워 주세요.";
  return null;
}

// 예전 데이터 정리(한 번만): v1 은 version 1 로, 예전 "일정 템플릿"(origin event)은 원래 템플릿의 새 버전으로 바꾼다.
export async function migrateTemplateVersions(s: Store): Promise<{ roots: number; converted: number; orphans: number; acts: number } | null> {
  const flag = "templateVersionsMigrated";
  if ((await s.list("Settings")).some((r) => r.id === flag)) return null;
  const rows = await s.list("ActivityTemplates");
  const byId = new Map(rows.map((r) => [r.id, r]));
  const isOld = (r: Row) => r.origin === "event" || r.origin === "version";
  // 출처를 따라가 v1(일정 템플릿이 아닌 행)을 찾는다
  const rootOf = (r: Row): Row | null => {
    const seen = new Set<string>();
    let cur: Row | undefined = r;
    while (cur && isOld(cur) && !seen.has(cur.id)) {
      seen.add(cur.id);
      const d: string | undefined = readConfig(cur.config)?.derivedFrom;
      cur = d ? byId.get(d) : undefined;
    }
    return cur && !isOld(cur) ? cur : null;
  };

  const out = { roots: 0, converted: 0, orphans: 0, acts: 0 };
  const newVersion = new Map<string, string>();
  const nextNo = new Map<string, number>();
  for (const r of rows) {
    const cfg = readConfig(r.config);
    if (!cfg) continue;
    if (!isOld(r)) {
      // v1: 제자리에서 고쳐 오던 버전 번호를 1로 맞춘다
      out.roots++;
      if (r.version !== "1" || cfg.version !== 1 || cfg.derivedFrom || cfg.sourceEvent) {
        const { derivedFrom: _d, sourceEvent: _s, ...rest } = cfg;
        void _d; void _s;
        await s.update("ActivityTemplates", r.id, { version: "1", config: JSON.stringify({ ...rest, version: 1 }) });
        newVersion.set(r.id, "1");
      }
      if (!nextNo.has(r.id)) nextNo.set(r.id, 2);
    }
  }
  for (const r of rows) {
    const cfg = readConfig(r.config);
    if (!cfg || !isOld(r)) continue;
    const root = rootOf(r);
    if (!root) {
      // 원래 템플릿이 없어진 일정 템플릿: 따로 선 템플릿(v1)으로 둔다
      const { derivedFrom: _d, ...rest } = cfg;
      void _d;
      await s.update("ActivityTemplates", r.id, { origin: "custom", version: "1", config: JSON.stringify({ ...rest, version: 1 }) });
      newVersion.set(r.id, "1");
      out.orphans++;
      continue;
    }
    const n = nextNo.get(root.id) ?? 2;
    nextNo.set(root.id, n + 1);
    await s.update("ActivityTemplates", r.id, {
      origin: "version", version: String(n), config: JSON.stringify({ ...cfg, version: n, derivedFrom: root.id }),
    });
    newVersion.set(r.id, String(n));
    out.converted++;
  }
  // 일정 활동이 기억하는 버전 번호를 맞춘다(가리키는 템플릿 id 는 그대로)
  for (const a of await s.list("EventActivities")) {
    const v = newVersion.get(a.templateId);
    if (v && a.templateVersion !== v) {
      await s.update("EventActivities", a.id, { templateVersion: v });
      out.acts++;
    }
  }
  await s.insert("Settings", { id: flag, value: JSON.stringify({ at: new Date().toISOString(), ...out }) });
  return out;
}
