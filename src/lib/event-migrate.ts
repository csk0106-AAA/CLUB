import { parseJson } from "./api";
import { minutesData } from "./board";
import { LEGACY_TYPES } from "./event-types";
import { getSetting, getStore, setSetting } from "./store";
import type { Row } from "./store/types";

// 일정 데이터 옮기기(여러 번 불러도 결과가 같다).
//  1) 예전 유형 이름 → 지금 이름 (전체정기모임 → 정기모임): 일정을 읽을 때마다 확인해 고쳐 저장한다.
//  2) 게시판 회의록 글 → "회의" 일정의 회의록 (Settings "minutesToEvents" 로 한 번만)

// 읽어 온 일정 목록에서 예전 유형을 고쳐 저장하고, 목록도 바로 고친다.
export async function fixLegacyTypes(events: Row[]): Promise<number> {
  const old = events.filter((e) => LEGACY_TYPES[e.type]);
  if (old.length === 0) return 0;
  const s = await getStore();
  for (const e of old) {
    e.type = LEGACY_TYPES[e.type];
    await s.update("Events", e.id, { type: e.type });
  }
  return old.length;
}

// 한국 시간 "YYYY-MM-DDTHH:mm" (ISO 시각을 한국 시간으로)
function kstLocal(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 16);
}

let running: Promise<number> | null = null;
// 게시판 회의록 글을 회의 일정으로 옮긴다. 옮긴 글 수를 돌려준다.
// 첨부 파일이 있는 글은 파일을 잃지 않도록 옮기지 않고 게시판에 그대로 둔다(게시판에서 계속 읽을 수 있다).
export function migrateMinutesPosts(): Promise<number> {
  if (!running) running = run().finally(() => { running = null; });
  return running;
}

async function run(): Promise<number> {
  if (await getSetting<boolean>("minutesToEvents", false)) return 0;
  const s = await getStore();
  await setSetting("minutesToEvents", true); // 먼저 표시해서 동시에 들어온 요청이 두 번 옮기지 않게
  let n = 0;
  for (const p of (await s.list("Posts")).filter((x) => x.form === "minutes")) {
    if (parseJson<unknown[]>(p.files, []).length > 0) continue;
    const parsed = minutesData.safeParse(parseJson<unknown>(p.data, {}));
    const m = parsed.success ? parsed.data : minutesData.parse({});
    const startsAt = /^\d{4}-\d{2}-\d{2}/.test(m.heldAt) ? m.heldAt.slice(0, 16) : kstLocal(p.createdAt);
    const notes = (p.body ?? "").trim();
    await s.insert("Events", {
      type: "회의",
      name: (p.title || "회의").slice(0, 80),
      startsAt,
      place: m.place,
      booking: notes.slice(0, 2000),
      status: "",
      published: "true",
      audience: p.audience && !/"mode"\s*:\s*"all"/.test(p.audience) ? p.audience : "",
      minutes: JSON.stringify({ ...m, heldAt: m.heldAt || startsAt }),
    });
    for (const r of (await s.list("PostResponses")).filter((r) => r.postId === p.id)) await s.remove("PostResponses", r.id);
    await s.remove("Posts", p.id);
    n++;
  }
  return n;
}
