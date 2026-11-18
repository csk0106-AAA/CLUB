import type { TabName } from "./schema";

export type Row = Record<string, string>;

export interface Store {
  list(tab: TabName): Promise<Row[]>;
  // 한 행만 읽기(사진처럼 큰 값이 든 탭을 통째로 읽지 않도록)
  get(tab: TabName, id: string): Promise<Row | null>;
  insert(tab: TabName, row: Partial<Row>): Promise<Row>;
  update(tab: TabName, id: string, patch: Partial<Row>): Promise<Row | null>;
  remove(tab: TabName, id: string): Promise<boolean>;
}
