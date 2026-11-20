import { activityKind, activityMode, newTemplateId, readConfig } from "./activities";
import type { Row, Store } from "./store/types";
import type { TemplateConfig } from "./template-schema";

// 활동 템플릿 버전 관리
//  - 처음 만든 템플릿(기본 템플릿 또는 직접/AI로 만든 템플릿)이 v1 이다. origin: default | custom
//  - 저장 방법은 고치는 사람이 고른다(템플릿 화면·일정 활동 모두, 설정과 AI 지침 모두) — saveTemplate
//    fix     : 지금 버전 행을 제자리에서 고친다(오류 수정·빠진 조건 추가). 이 버전을 쓰는 일정 활동의 설정 사본도 함께 바꾼다.
//    version : 새 행을 v2, v3…으로 만든다. origin "version", config.derivedFrom: v1 id, config.sourceEvent: 일정에서 고쳤으면 그 일정
//    new     : 정체성이 바뀐 활동 — 새 템플릿(v1, origin custom)으로 따로 만든다(이름이 달라야 한다).
//  - 일정 활동은 넣을 때 고른 버전(templateId)을 쓴다. 일정에서 새 버전/새 활동으로 저장하면 그 활동만 새 것으로 바꾼다.
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

export type SaveMode = "fix" | "version" | "new";
export const SAVE_MODES = ["fix", "version", "new"] as const;

// 이 버전을 쓰는 일정 활동 중 지금 진행 중인 단계가 새 설정에 없으면 막는다(진행 상태가 가리킬 곳이 없어진다).
async function liveConflict(s: Store, templateId: string, input: Editable, onlyAct?: string): Promise<string | null> {
  const [acts, lives] = await Promise.all([s.list("EventActivities"), s.list("LiveState")]);
  const ids = new Set(acts.filter((a) => (onlyAct ? a.id === onlyAct : a.templateId === templateId)).map((a) => a.id));
  const keys = new Set(input.onsite.steps.map((x) => x.key));
  const hit = lives.find((l) => ids.has(l.eventActivityId) && l.step && !keys.has(l.step));
  return hit ? "지금 진행 중인 단계는 지울 수 없어요. 현장 진행을 먼저 되돌려 주세요." : null;
}

// 수정: 이 버전 행을 제자리에서 고친다. id·버전 번호·출처는 그대로. 이 버전을 쓰는 일정 활동의 설정 사본도 바꾼다
// (활동 일시·진행자 같은 일정별 값은 따로 저장돼 있어서 그대로다).
export async function fixVersion(s: Store, base: Row, input: Editable): Promise<{ config: TemplateConfig; propagated: number }> {
  const cur = readConfig(base.config);
  const version = cur?.version ?? versionOf(base);
  const config: TemplateConfig = {
    ...editable(input), id: base.id, version,
    ...(cur?.derivedFrom ? { derivedFrom: cur.derivedFrom } : {}),
    ...(cur?.sourceEvent ? { sourceEvent: cur.sourceEvent } : {}),
  };
  const json = JSON.stringify(config);
  await s.update("ActivityTemplates", base.id, { name: config.name, config: json });
  let propagated = 0;
  for (const a of await s.list("EventActivities")) {
    if (a.templateId !== base.id || a.config === json) continue;
    await s.update("EventActivities", a.id, { config: json, templateVersion: String(version) });
    propagated++;
  }
  return { config, propagated };
}

// 새 활동: 새 템플릿 묶음(v1)을 만든다.
export async function createFamily(s: Store, input: Editable): Promise<{ id: string; version: number; config: TemplateConfig }> {
  const id = newTemplateId();
  const config: TemplateConfig = { ...editable(input), id, version: 1 };
  await s.insert("ActivityTemplates", {
    id, name: config.name, version: "1", config: JSON.stringify(config), origin: "custom", createdAt: new Date().toISOString(),
  });
  return { id, version: 1, config };
}

export type SaveResult =
  | { ok: true; mode: SaveMode; unchanged?: boolean; id: string; version: number; config: TemplateConfig; propagated?: number }
  | { ok: false; error: string; status?: number };

// 저장 방법(수정/새 버전/새 활동)에 따라 저장한다. base 는 고치는 버전 행.
//  act: 일정 활동에서 저장할 때 그 활동 id(새 버전/새 활동이면 진행 중 단계 검사는 이 활동만)
export async function saveTemplate(
  s: Store, base: Row, input: Editable, mode: SaveMode,
  opts: { name?: string; sourceEvent?: SourceEvent; act?: string } = {},
): Promise<SaveResult> {
  const cur = readConfig(base.config);
  if (!cur) return { ok: false, error: "템플릿을 읽을 수 없어요.", status: 500 };
  if (mode === "new") {
    const name = (opts.name ?? input.name).trim();
    if (!name) return { ok: false, error: "새 활동의 이름을 적어 주세요." };
    const rows = await s.list("ActivityTemplates");
    const famName = readConfig(rows.find((r) => r.id === familyIdOf(base))?.config)?.name ?? cur.name;
    if (name === cur.name.trim() || name === famName.trim()) return { ok: false, error: "새 활동은 원래 활동과 다른 이름으로 저장해 주세요." };
    if (rows.some((r) => !isVersionRow(r) && readConfig(r.config)?.name.trim() === name)) return { ok: false, error: `“${name}” 템플릿이 이미 있어요. 다른 이름을 적어 주세요.` };
    const v = await createFamily(s, { ...input, name });
    return { ok: true, mode, ...v };
  }
  if (sameConfig(cur, input)) return { ok: true, mode, unchanged: true, id: base.id, version: cur.version, config: cur };
  const why = await liveConflict(s, base.id, input, mode === "fix" ? undefined : opts.act);
  if (why) return { ok: false, error: why, status: 409 };
  if (mode === "fix") {
    const v = await fixVersion(s, base, input);
    return { ok: true, mode, id: base.id, version: v.config.version, config: v.config, propagated: v.propagated };
  }
  const v = await createVersion(s, base, input, opts.sourceEvent);
  return { ok: true, mode, id: v.id, version: v.version, config: v.config };
}

// 진행자 화면이 있는 활동(소개·고민·팀 활동)은 진행자가 있어야 한다.
export function needsHostScreen(cfg: TemplateConfig): boolean {
  const k = activityKind(cfg);
  return k === "who" || k === "worry" || activityMode(cfg) === "team";
}

// 한 번만: 진행자 화면이 있는 템플릿(과 그 설정을 복사해 둔 일정 활동)에 host.required 를 넣는다.
// 이미 host 를 정한 템플릿은 건드리지 않는다.
export async function migrateTemplateHost(s: Store): Promise<{ templates: number; acts: number } | null> {
  const flag = "templateHostMigrated";
  if (await s.get("Settings", flag)) return null;
  const out = { templates: 0, acts: 0 };
  const fix = (json: string | undefined): string | null => {
    const cfg = readConfig(json);
    if (!cfg || cfg.host || !needsHostScreen(cfg)) return null;
    return JSON.stringify({ ...cfg, host: { required: true } });
  };
  for (const r of await s.list("ActivityTemplates")) {
    const next = fix(r.config);
    if (next) { await s.update("ActivityTemplates", r.id, { config: next }); out.templates++; }
  }
  for (const a of await s.list("EventActivities")) {
    const next = fix(a.config);
    if (next) { await s.update("EventActivities", a.id, { config: next }); out.acts++; }
  }
  await s.insert("Settings", { id: flag, value: JSON.stringify({ at: new Date().toISOString(), ...out }) });
  return out;
}

// 한 번만: '내가 누굴까요?'의 현장 단계 'reveal'(당사자 휴대폰에 "저예요" 버튼) 이름이 "이름 공개"라서
// 진행자 화면의 [이름 공개] 버튼(진행자가 대신 밝히기)과 헷갈렸다 → 단계 이름 "저예요", 진행자 버튼 이름 "“저예요” 열기".
// 템플릿의 모든 버전과 이미 만든 일정 활동을 같이 고친다(관리자가 다른 이름으로 바꿔 둔 경우는 그대로).
export async function migrateRevealLabel(s: Store): Promise<{ templates: number; acts: number } | null> {
  const flag = "revealLabelMigrated";
  if (await s.get("Settings", flag)) return null;
  const out = { templates: 0, acts: 0 };
  const fix = (json: string | undefined): string | null => {
    const cfg = readConfig(json) as (ReturnType<typeof readConfig> & { onsite?: { steps?: { key: string; label: string; memberScreen: string; hostButton?: string }[] } }) | null;
    const steps = cfg?.onsite?.steps;
    if (!cfg || !steps?.some((st) => st.key === "reveal" && st.memberScreen === "iam_button" && st.label === "이름 공개")) return null;
    const next = steps.map((st) => (st.key === "reveal" && st.memberScreen === "iam_button" && st.label === "이름 공개"
      ? { ...st, label: "저예요", ...(st.hostButton === "이름 공개" || !st.hostButton ? { hostButton: "“저예요” 열기" } : {}) }
      : st));
    return JSON.stringify({ ...cfg, onsite: { ...cfg.onsite, steps: next } });
  };
  for (const r of await s.list("ActivityTemplates")) {
    const next = fix(r.config);
    if (next) { await s.update("ActivityTemplates", r.id, { config: next }); out.templates++; }
  }
  for (const a of await s.list("EventActivities")) {
    const next = fix(a.config);
    if (next) { await s.update("EventActivities", a.id, { config: next }); out.acts++; }
  }
  await s.insert("Settings", { id: flag, value: JSON.stringify({ at: new Date().toISOString(), ...out }) });
  return out;
}

// 한 번만: 명리학 풀이 지침을 "공개 성격·성향 글"(reading)과 "본인용 생애주기 풀이"(readingFull)로 나눴다.
// 나누기 전 reading 지침은 두 글 모두에 적용됐으므로, 본인용이 비어 있으면 같은 글을 복사해 결과가 바뀌지 않게 한다.
export async function migrateReadingSplit(s: Store): Promise<{ templates: number; acts: number; setting: boolean } | null> {
  const flag = "readingSplitMigrated";
  if (await s.get("Settings", flag)) return null;
  const out = { templates: 0, acts: 0, setting: false };
  const fix = (json: string | undefined): string | null => {
    const cfg = readConfig(json) as (ReturnType<typeof readConfig> & { aiGuides?: Record<string, string> }) | null;
    const g = cfg?.aiGuides;
    if (!cfg || !g?.reading?.trim() || g.readingFull?.trim()) return null;
    return JSON.stringify({ ...cfg, aiGuides: { ...g, readingFull: g.reading } });
  };
  for (const r of await s.list("ActivityTemplates")) {
    const next = fix(r.config);
    if (next) { await s.update("ActivityTemplates", r.id, { config: next }); out.templates++; }
  }
  for (const a of await s.list("EventActivities")) {
    const next = fix(a.config);
    if (next) { await s.update("EventActivities", a.id, { config: next }); out.acts++; }
  }
  // AI 설정 화면의 전체 지점 지침(Settings aiGuide:reading)
  const g = await s.get("Settings", "aiGuide:reading");
  const gf = await s.get("Settings", "aiGuide:readingFull");
  const val = (() => { try { return String(JSON.parse(g?.value ?? '""')); } catch { return ""; } })();
  if (val.trim() && !gf) { await s.insert("Settings", { id: "aiGuide:readingFull", value: JSON.stringify(val) }); out.setting = true; }
  await s.insert("Settings", { id: flag, value: JSON.stringify({ at: new Date().toISOString(), ...out }) });
  return out;
}

// 한 번만: 예전 코드에 박혀 있던 명리학 풀이 규칙을 지침 칸 기본값으로 채운다(AI 지침 화면에서 보고 고칠 수 있게).
//  AI 인터뷰가 있는 템플릿(모든 버전)·일정 활동과 AI 설정 화면의 전체 지침 중 비어 있는 칸만.
export async function migrateReadingDefaults(s: Store): Promise<{ templates: number; acts: number; settings: number } | null> {
  const flag = "readingDefaultsFilled";
  if (await s.get("Settings", flag)) return null;
  const { DEFAULT_READING_PUB, DEFAULT_READING_FULL } = await import("./ai-guides");
  const out = { templates: 0, acts: 0, settings: 0 };
  const fix = (json: string | undefined): string | null => {
    const cfg = readConfig(json) as (ReturnType<typeof readConfig> & { aiGuides?: Record<string, string> }) | null;
    if (!cfg || !cfg.preEvent?.steps?.includes("ai_interview")) return null;
    const g = cfg.aiGuides ?? {};
    if (g.reading?.trim() && g.readingFull?.trim()) return null;
    return JSON.stringify({ ...cfg, aiGuides: { ...g, reading: g.reading?.trim() || DEFAULT_READING_PUB, readingFull: g.readingFull?.trim() || DEFAULT_READING_FULL } });
  };
  for (const r of await s.list("ActivityTemplates")) {
    const next = fix(r.config);
    if (next) { await s.update("ActivityTemplates", r.id, { config: next }); out.templates++; }
  }
  for (const a of await s.list("EventActivities")) {
    const next = fix(a.config);
    if (next) { await s.update("EventActivities", a.id, { config: next }); out.acts++; }
  }
  for (const [id, v] of [["aiGuide:reading", DEFAULT_READING_PUB], ["aiGuide:readingFull", DEFAULT_READING_FULL]] as const) {
    const cur = await s.get("Settings", id);
    const val = (() => { try { return String(JSON.parse(cur?.value ?? '""')); } catch { return ""; } })();
    if (val.trim()) continue;
    if (cur) await s.update("Settings", id, { value: JSON.stringify(v) });
    else await s.insert("Settings", { id, value: JSON.stringify(v) });
    out.settings++;
  }
  await s.insert("Settings", { id: flag, value: JSON.stringify({ at: new Date().toISOString(), ...out }) });
  return out;
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
  if (await s.get("Settings", flag)) return null;
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
