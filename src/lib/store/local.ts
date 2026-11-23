import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { TABS, type TabName } from "./schema";
import type { Row, Store, ListOpts, SettingOp } from "./types";
import { applySettingOp } from "./setting-op";

// 개발용 저장소: .data/db.json 한 파일. DATABASE_URL 이 없을 때 사용한다.
const FILE = path.join(process.cwd(), ".data", "db.json");

type Db = Partial<Record<TabName, Row[]>>;

let queue: Promise<unknown> = Promise.resolve();
// 동시에 들어온 쓰기가 서로 덮어쓰지 않도록 한 줄로 세운다.
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

async function read(): Promise<Db> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Db;
  } catch {
    return {};
  }
}

async function write(db: Db): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(db, null, 2), "utf8");
}

function normalize(tab: TabName, row: Partial<Row>): Row {
  const out: Row = {};
  for (const col of TABS[tab]) out[col] = row[col] ?? "";
  return out;
}

export class LocalStore implements Store {
  async list(tab: TabName, opts?: ListOpts): Promise<Row[]> {
    const db = await read();
    let rows = db[tab] ?? [];
    if (opts?.where) { const w = opts.where; rows = rows.filter((r) => w.in.includes(r[w.field] ?? "")); }
    if (opts?.omit?.length) { const o = opts.omit; rows = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !o.includes(k)))); }
    return rows;
  }

  async get(tab: TabName, id: string): Promise<Row | null> {
    return (await this.list(tab)).find((r) => r.id === id) ?? null;
  }

  insert(tab: TabName, row: Partial<Row>): Promise<Row> {
    return serial(async () => {
      const db = await read();
      const full = normalize(tab, { ...row, id: row.id || randomUUID() });
      db[tab] = [...(db[tab] ?? []), full];
      await write(db);
      return full;
    });
  }

  update(tab: TabName, id: string, patch: Partial<Row>): Promise<Row | null> {
    return serial(async () => {
      const db = await read();
      const rows = db[tab] ?? [];
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) return null;
      rows[i] = normalize(tab, { ...rows[i], ...patch, id });
      db[tab] = rows;
      await write(db);
      return rows[i];
    });
  }

  remove(tab: TabName, id: string): Promise<boolean> {
    return serial(async () => {
      const db = await read();
      const rows = db[tab] ?? [];
      const next = rows.filter((r) => r.id !== id);
      if (next.length === rows.length) return false;
      db[tab] = next;
      await write(db);
      return true;
    });
  }

  // 설정 값 일부 고치기: 쓰기 줄(serial) 안에서 읽고-고치고-쓰기라 동시에 들어와도 잃지 않는다
  patchSetting(id: string, op: SettingOp): Promise<void> {
    return serial(async () => {
      const db = await read();
      const rows = db.Settings ?? [];
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0 && (op.op === "del" || op.op === "remove")) return;
      const value = JSON.stringify(applySettingOp(i < 0 ? undefined : rows[i].value, op));
      if (i < 0) rows.push(normalize("Settings", { id, value }));
      else rows[i] = normalize("Settings", { ...rows[i], value, id });
      db.Settings = rows;
      await write(db);
    });
  }
}
