import type { TabName } from "./schema";

export type Row = Record<string, string>;

// 표 읽기 줄이기(DB 전송량): omit 은 빼고 읽을 큰 열(글 본문 등), where 는 이 열 값이 목록 안에 있는 줄만
// fresh: 2초 목록 캐시를 거치지 않고 지금 DB 값을 읽는다(자리 잡기처럼 바로 앞의 저장을 꼭 봐야 할 때)
export type ListOpts = { omit?: string[]; where?: { field: string; in: string[] }; fresh?: boolean };

export interface Store {
  list(tab: TabName, opts?: ListOpts): Promise<Row[]>;
  // 한 행만 읽기(사진처럼 큰 값이 든 탭을 통째로 읽지 않도록)
  get(tab: TabName, id: string): Promise<Row | null>;
  insert(tab: TabName, row: Partial<Row>): Promise<Row>;
  update(tab: TabName, id: string, patch: Partial<Row>): Promise<Row | null>;
  remove(tab: TabName, id: string): Promise<boolean>;
  // 설정 값(JSON) 일부만 한 번에 고친다(읽고-고치고-쓰기 사이에 다른 저장이 끼어도 잃지 않게). 줄이 없으면 {} 에서 시작한다.
  patchSetting(id: string, op: SettingOp): Promise<void>;
}

// 설정(Settings) 한 줄 안의 JSON 값 일부만 고치기(여럿이 거의 동시에 저장해도 서로 덮어쓰지 않게).
//  path: 값(JSON 객체) 안의 키 경로. [] 이면 값 전체(최상위 객체).
//  set: path 에 value 를 넣는다(중간 객체가 없으면 만든다) / del: path 의 키를 지운다
//  merge: path 의 객체에 value 의 키들을 덮어쓴다(값이 undefined 인 키는 지운다 — { ...old, ...value } 를 저장한 것과 같다)
//  add: path 의 배열에 values 중 없는 것을 뒤에 더한다 / remove: path 의 배열에서 values 를 뺀다
export type SettingOp =
  | { op: "set"; path: string[]; value: unknown }
  | { op: "del"; path: string[] }
  | { op: "merge"; path: string[]; value: Record<string, unknown> }
  | { op: "add"; path: string[]; values: unknown[] }
  | { op: "remove"; path: string[]; values: unknown[] };
