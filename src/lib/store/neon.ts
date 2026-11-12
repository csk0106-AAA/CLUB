import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { TABS, type TabName } from "./schema";
import type { Row, Store } from "./types";

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

  async list(tab: TabName): Promise<Row[]> {
    const rows = await this.q(`SELECT data FROM app_rows WHERE tab = $1 ORDER BY seq`, [tab]);
    return rows.map((r) => r.data);
  }

  async insert(tab: TabName, row: Partial<Row>): Promise<Row> {
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
    const keep: Row = {};
    for (const col of TABS[tab]) if (col !== "id" && patch[col] !== undefined) keep[col] = patch[col];
    const rows = await this.q(
      `UPDATE app_rows SET data = data || $3::jsonb WHERE tab = $1 AND id = $2 RETURNING data`,
      [tab, id, JSON.stringify(keep)],
    );
    return rows[0]?.data ?? null;
  }

  async remove(tab: TabName, id: string): Promise<boolean> {
    const rows = await this.q(`DELETE FROM app_rows WHERE tab = $1 AND id = $2 RETURNING id`, [tab, id]);
    return rows.length > 0;
  }
}
