import type { TabName } from "./schema";

export type Row = Record<string, string>;

// 표 읽기 줄이기(DB 전송량): omit 은 빼고 읽을 큰 열(글 본문 등), where 는 이 열 값이 목록 안에 있는 줄만
export type ListOpts = { omit?: string[]; where?: { field: string; in: string[] } };

export interface Store {
  list(tab: TabName, opts?: ListOpts): Promise<Row[]>;
  // 한 행만 읽기(사진처럼 큰 값이 든 탭을 통째로 읽지 않도록)
  get(tab: TabName, id: string): Promise<Row | null>;
  insert(tab: TabName, row: Partial<Row>): Promise<Row>;
  update(tab: TabName, id: string, patch: Partial<Row>): Promise<Row | null>;
  remove(tab: TabName, id: string): Promise<boolean>;
}
