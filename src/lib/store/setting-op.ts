import type { SettingOp } from "./types";

// 설정 값 일부 고치기(SettingOp)를 JS 로 적용한다(개발용 local 저장소). neon.ts 의 SQL 과 같은 규칙:
//  값이 JSON 객체가 아니면(없음·깨짐·배열 등) {} 에서 시작, 중간 경로가 객체가 아니면 {} 로 만든다,
//  path 가 [] 이면 set 은 값 전체를 바꾸고 del 은 {} 로 비운다. add/remove 는 path 가 있어야 한다.
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function applySettingOp(raw: string | undefined, op: SettingOp): unknown {
  let root: unknown;
  try { root = JSON.parse(raw ?? ""); } catch { root = {}; }
  // JSON 으로 저장될 모양으로 맞춘다(undefined 키 빠짐 등)
  const base: Obj = isObj(root) ? (JSON.parse(JSON.stringify(root)) as Obj) : {};
  const p = op.path;
  if (p.length === 0) {
    if (op.op === "set") return op.value;
    if (op.op === "del") return {};
    if (op.op === "merge") return mergeInto(base, op.value);
    throw new Error("patchSetting: 배열 고치기에는 경로가 필요해요");
  }
  if (op.op === "del") {
    let cur: unknown = base;
    for (const k of p.slice(0, -1)) cur = isObj(cur) ? cur[k] : undefined;
    if (isObj(cur)) delete cur[p[p.length - 1]];
    return base;
  }
  // 중간 경로를 객체로 만든다
  let parent: Obj = base;
  for (const k of p.slice(0, -1)) {
    if (!isObj(parent[k])) parent[k] = {};
    parent = parent[k] as Obj;
  }
  const last = p[p.length - 1];
  const cur = parent[last];
  if (op.op === "set") parent[last] = JSON.parse(JSON.stringify(op.value ?? null));
  else if (op.op === "merge") parent[last] = mergeInto(isObj(cur) ? cur : {}, op.value);
  else {
    const arr = Array.isArray(cur) ? cur : [];
    const vals = JSON.parse(JSON.stringify(op.values)) as unknown[];
    parent[last] = op.op === "add"
      ? [...arr, ...vals.filter((v) => !arr.some((a) => same(a, v)))]
      : arr.filter((a) => !vals.some((v) => same(a, v)));
  }
  return base;
}

function mergeInto(target: Obj, patch: Record<string, unknown>): Obj {
  const out: Obj = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete out[k];
    else out[k] = JSON.parse(JSON.stringify(v));
  }
  return out;
}
