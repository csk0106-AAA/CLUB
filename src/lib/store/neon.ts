import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { TABS, type TabName } from "./schema";
import type { Row, Store, ListOpts, SettingOp } from "./types";

// Postgres(Neon) 저장소. 서버에서만 사용한다.
// 탭마다 테이블을 만들지 않고 app_rows 한 테이블에 (tab, id, data) 로 저장한다.
// seq 는 입력 순서를 지키기 위한 번호다(시트의 행 순서와 같은 역할).

type Sql = ReturnType<typeof neon>;
type DbRow = { data: Row };

function normalize(tab: TabName, row: Partial<Row>): Row {
  const out: Row = {};
  for (const col of TABS[tab]) out[col] = row[col] ?? "";
  return out;
}

export class NeonStore implements Store {
  private sql: Sql;
  private ready: Promise<void> | null = null;

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl);
  }

  // 처음 한 번, 테이블이 없으면 만든다.
  private init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        await this.sql.query(
          `CREATE TABLE IF NOT EXISTS app_rows (
             tab  text   NOT NULL,
             id   text   NOT NULL,
             seq  bigserial,
             data jsonb  NOT NULL,
             PRIMARY KEY (tab, id)
           )`,
        );
        await this.sql.query(`CREATE INDEX IF NOT EXISTS app_rows_tab_seq ON app_rows (tab, seq)`);
      })().catch((e) => {
        this.ready = null; // 다음 호출에서 다시 시도
        throw e;
      });
    }
    return this.ready;
  }

  private async q(text: string, params: unknown[]): Promise<DbRow[]> {
    await this.init();
    return (await this.sql.query(text, params)) as DbRow[];
  }

  // 같은 표를 짧은 시간에 여러 번 읽으면(한 요청 안에서 여러 함수가 같은 표를 읽는 등) 한 번만 DB 에서 가져온다.
  //  2초 동안만 기억하고, 이 서버에서 그 표를 고치면 바로 잊는다. 돌려줄 때는 복사본(받은 쪽이 고쳐도 안전).
  private cache = new Map<string, { at: number; p: Promise<Row[]> }>();
  private forget(tab: string) {
    for (const k of this.cache.keys()) if (k === tab || k.startsWith(tab + "|")) this.cache.delete(k);
  }

  async list(tab: TabName, opts?: ListOpts): Promise<Row[]> {
    const omit = opts?.omit ?? [];
    const w = opts?.where;
    const key = `${tab}|${omit.join(",")}|${w ? w.field + "=" + w.in.join(",") : ""}`;
    const now = Date.now();
    let hit = this.cache.get(key);
    if (!hit || now - hit.at > 2000 || opts?.fresh) {
      const cols = omit.length ? `data - $2::text[] AS data` : "data";
      const params: unknown[] = [tab];
      if (omit.length) params.push(omit);
      let where = "tab = $1";
      if (w) { params.push(w.field, w.in); where += ` AND data->>$${params.length - 1} = ANY($${params.length}::text[])`; }
      const p = this.q(`SELECT ${cols} FROM app_rows WHERE ${where} ORDER BY seq`, params).then((rows) => rows.map((r) => r.data));
      p.catch(() => this.cache.delete(key));
      hit = { at: now, p };
      this.cache.set(key, hit);
    }
    return (await hit.p).map((r) => ({ ...r }));
  }

  async get(tab: TabName, id: string): Promise<Row | null> {
    const rows = await this.q(`SELECT data FROM app_rows WHERE tab = $1 AND id = $2`, [tab, id]);
    return rows[0]?.data ?? null;
  }

  async insert(tab: TabName, row: Partial<Row>): Promise<Row> {
    this.forget(tab);
    const full = normalize(tab, { ...row, id: row.id || randomUUID() });
    await this.q(`INSERT INTO app_rows (tab, id, data) VALUES ($1, $2, $3::jsonb)`, [
      tab,
      full.id,
      JSON.stringify(full),
    ]);
    return full;
  }

  async update(tab: TabName, id: string, patch: Partial<Row>): Promise<Row | null> {
    // 기존 값 위에 바뀐 열만 덮어쓴다(jsonb 병합). 열 목록 밖의 키는 걸러낸다.
    this.forget(tab);
    const keep: Row = {};
    for (const col of TABS[tab]) if (col !== "id" && patch[col] !== undefined) keep[col] = patch[col];
    const rows = await this.q(
      `UPDATE app_rows SET data = data || $3::jsonb WHERE tab = $1 AND id = $2 RETURNING data`,
      [tab, id, JSON.stringify(keep)],
    );
    return rows[0]?.data ?? null;
  }

  async remove(tab: TabName, id: string): Promise<boolean> {
    this.forget(tab);
    const rows = await this.q(`DELETE FROM app_rows WHERE tab = $1 AND id = $2 RETURNING id`, [tab, id]);
    return rows.length > 0;
  }

  // 설정 값 일부 고치기: SQL 한 문장(INSERT … ON CONFLICT DO UPDATE)으로 그 줄을 잠근 채 지금 값 위에 고친다.
  //  줄이 없으면 {} 에서 시작해 새로 만든다(지우기·배열에서 빼기는 줄이 없으면 아무것도 안 한다).
  async patchSetting(id: string, op: SettingOp): Promise<void> {
    this.forget("Settings");
    const { expr, params } = settingPatchSql(op);
    const cur = expr(SETTING_BASE);
    if (op.op === "del" || op.op === "remove") {
      await this.q(
        `UPDATE app_rows SET data = data || jsonb_build_object('value', (${cur})::text) WHERE tab = 'Settings' AND id = $1`,
        [id, ...params],
      );
      return;
    }
    await this.q(
      `INSERT INTO app_rows (tab, id, data)
       VALUES ('Settings', $1, jsonb_build_object('id', $1::text, 'value', (${expr("'{}'::jsonb")})::text))
       ON CONFLICT (tab, id) DO UPDATE SET data = app_rows.data || jsonb_build_object('value', (${cur})::text)`,
      [id, ...params],
    );
  }
}

// 지금 저장된 설정 값(data->>'value' 안의 JSON 문자열)을 jsonb 로. 깨졌거나 객체가 아니면 {}.
//  (CASE 안에서 먼저 pg_input_is_valid 로 걸러야 ::jsonb 변환 오류가 나지 않는다)
export const SETTING_BASE = `(CASE WHEN NOT pg_input_is_valid(app_rows.data->>'value', 'jsonb') THEN '{}'::jsonb
  WHEN jsonb_typeof((app_rows.data->>'value')::jsonb) = 'object' THEN (app_rows.data->>'value')::jsonb ELSE '{}'::jsonb END)`;

// SettingOp → SQL 식. expr(base) 는 base(jsonb 식) 에 고치기를 적용한 jsonb 식이고, 매개변수는 $2 부터(params 순서).
//  $2 = 경로(text[]), $3 = 값(jsonb, set/merge/add/remove), $4 = 지울 키(text[], merge).
//  단계마다 (SELECT … FROM (SELECT <앞 단계> AS x) s) 로 감싸 같은 식을 여러 번 되풀이하지 않는다.
//  규칙은 setting-op.ts(local) 와 같다.
export function settingPatchSql(op: SettingOp): { expr: (base: string) => string; params: unknown[] } {
  const n = op.path.length;
  const P = `$2::text[]`;
  const step = (inner: string, f: (x: string) => string) => `(SELECT ${f("s.x")} FROM (SELECT ${inner} AS x) s)`;
  // 경로 중간(1..n-1)이 객체가 아니면 {} 로 만든다
  const ensure = (base: string) => {
    let e = base;
    for (let i = 1; i < n; i++) {
      const sub = `(${P})[1:${i}]`;
      e = step(e, (x) => `jsonb_set(${x}, ${sub}, CASE WHEN jsonb_typeof(${x} #> ${sub}) = 'object' THEN ${x} #> ${sub} ELSE '{}'::jsonb END, true)`);
    }
    return e;
  };
  const arr = (x: string) => `(CASE WHEN jsonb_typeof(${x} #> ${P}) = 'array' THEN ${x} #> ${P} ELSE '[]'::jsonb END)`;
  const obj = (x: string) => `(CASE WHEN jsonb_typeof(${x} #> ${P}) = 'object' THEN ${x} #> ${P} ELSE '{}'::jsonb END)`;
  const json = (v: unknown) => JSON.stringify(v ?? null);

  if ((op.op === "add" || op.op === "remove") && n === 0) throw new Error("patchSetting: 배열 고치기에는 경로가 필요해요");
  switch (op.op) {
    case "set":
      // 경로 [] 이면 값 전체를 바꾼다($2 는 형식을 정하려고 식에 넣어 둔다)
      return { params: [op.path, json(op.value)], expr: (b) => (n === 0 ? `(CASE WHEN cardinality(${P}) = 0 THEN $3::jsonb END)` : step(ensure(b), (x) => `jsonb_set(${x}, ${P}, $3::jsonb, true)`)) };
    case "del":
      return { params: [op.path], expr: (b) => (n === 0 ? `(CASE WHEN cardinality(${P}) = 0 THEN '{}'::jsonb END)` : `(${b} #- ${P})`) };
    case "merge": {
      const drop = Object.entries(op.value).filter(([, v]) => v === undefined).map(([k]) => k);
      const keep = Object.fromEntries(Object.entries(op.value).filter(([, v]) => v !== undefined));
      return {
        params: [op.path, json(keep), drop],
        expr: (b) => step(ensure(b), (x) => (n === 0 ? `((${x} #> ${P}) - $4::text[]) || $3::jsonb` : `jsonb_set(${x}, ${P}, (${obj(x)} - $4::text[]) || $3::jsonb, true)`)),
      };
    }
    case "add":
      return {
        params: [op.path, json(op.values)],
        expr: (b) => step(ensure(b), (x) => `jsonb_set(${x}, ${P}, ${arr(x)} || COALESCE((SELECT jsonb_agg(e.v ORDER BY e.o) FROM jsonb_array_elements($3::jsonb) WITH ORDINALITY e(v, o)
            WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(${arr(x)}) a(v) WHERE a.v = e.v)), '[]'::jsonb), true)`),
      };
    case "remove":
      return {
        params: [op.path, json(op.values)],
        expr: (b) => step(ensure(b), (x) => `jsonb_set(${x}, ${P}, COALESCE((SELECT jsonb_agg(a.v ORDER BY a.o) FROM jsonb_array_elements(${arr(x)}) WITH ORDINALITY a(v, o)
            WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements($3::jsonb) r(v) WHERE r.v = a.v)), '[]'::jsonb), true)`),
      };
  }
}
