import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { guard, parseJson } from "@/lib/api";
import { ALL, inAudience, readAudience, type Audience } from "@/lib/audience";
import type { Session } from "@/lib/auth";
import { DEFAULT_TEMPLATES, isForm, type FileMeta, type Form, type Template } from "@/lib/board";
import { readEditors } from "@/lib/editors";
import { effectivePerms, getPermGroups, isClubOfficer } from "@/lib/perms";
import { managedOf } from "@/lib/published";
import { postLive } from "@/lib/post-period";
import { getSetting, getStore, setSetting } from "@/lib/store";
import type { Row } from "@/lib/store/types";

// 게시판 서버 공통: 지금 DB 기준 권한, 공개 대상 확인, 첫 글 넣기, 회의록 옮기기, 첨부 파일 읽기.

export type Me = {
  s: Session;
  row: Row;
  perms: string[];
  isAll: boolean; // 전체 관리자(회칙 글)
  manage: boolean; // 관리자(all/board): 모든 글 수정·삭제
  canWrite: boolean; // 글쓰기: 관리자 + 클럽 직책자
  tplAdmin: boolean; // 양식 템플릿 저장: 관리자 + 2차 비밀번호 통과
};

// 로그인 확인 + 세션이 아니라 지금 회원 정보(직책·클럽·권한 그룹)로 권한을 다시 계산한다.
export async function getMe(): Promise<{ me: Me } | { err: NextResponse }> {
  const g = await guard();
  if ("err" in g) return { err: g.err };
  const s = await getStore();
  const row = (await s.list("Members")).find((m) => m.id === g.s.mid);
  if (!row) return { err: NextResponse.json({ error: "회원 정보를 찾을 수 없어요." }, { status: 401 }) };
  const perms = effectivePerms(row, await getPermGroups());
  const isAll = perms.includes("all");
  const manage = isAll || perms.includes("write");
  return { me: { s: g.s, row, perms, isAll, manage, canWrite: manage || isClubOfficer(row), tplAdmin: manage && g.s.admin } };
}

export const forbid = (msg = "이 작업을 할 권한이 없어요.") => NextResponse.json({ error: msg }, { status: 403 });

export const audienceOf = (p: Row): Audience => readAudience(p.audience);
// 편집자(작성자가 추가한 회원)인지: 지금도 글쓰기 권한이 있어야 한다(권한이 없어지면 편집자여도 못 고친다)
export const isEditorOf = (me: Me, p: Row) => me.canWrite && readEditors(p.editors).includes(me.row.id);
// 보기: 공개 대상 + 작성자 + 편집자
export const canSee = (me: Me, p: Row) => inAudience(audienceOf(p), me.row.id, p.authorId) || isEditorOf(me, p);
// 게시판에서 고치기: 작성자, 작성자가 추가한 편집자, 모든권한.
// 게시글_글쓰기 권한자도 다른 사람이 쓴 글은 편집자로 추가되어야 고칠 수 있다.
// 회칙·회비·클럽 회비 글은 게시판에서 고치지 않는다(관리 화면에서 다시 올린다 — lib/published.ts 의 canManage).
// 게시 기간이 지났거나 아직 안 된 글은 게시글 관리자(manage)도 고칠 수 있다(관리자 › 게시글관리에서 다시 게시)
export const canEdit = (me: Me, p: Row) => !managedOf(p) && (me.isAll || p.authorId === me.row.id || isEditorOf(me, p) || (me.manage && !postLive(p)));
// 지우기·편집자 바꾸기: 작성자와 모든권한만
export const canOwn = (me: Me, p: Row) => !managedOf(p) && (me.isAll || p.authorId === me.row.id);
// 응답 전체(결과)를 볼 수 있는 사람
export const canSeeResults = (me: Me, p: Row) => me.isAll || p.authorId === me.row.id || isEditorOf(me, p);

export const readFiles = (p: Row): FileMeta[] => parseJson<FileMeta[]>(p.files, []).filter((f) => f && f.id);

export async function findPost(id: string): Promise<Row | null> {
  const s = await getStore();
  return (await s.list("Posts")).find((p) => p.id === id) ?? null;
}

/* ───── 양식 템플릿 (Settings "boardTemplates") ───── */
export async function getTemplates(): Promise<Record<Form, Template>> {
  const saved = await getSetting<Record<string, Template>>("boardTemplates", {});
  const out = { ...DEFAULT_TEMPLATES };
  for (const [k, v] of Object.entries(saved ?? {})) if (isForm(k) && v && typeof v === "object") out[k] = { ...DEFAULT_TEMPLATES[k], ...v };
  return out;
}

/* ───── 첫 글(회칙·연회비 안내) + 예전 회의록 옮기기 ───── */
let seeding: Promise<void> | null = null;
export function ensureBoard(): Promise<void> {
  if (!seeding) seeding = seedBoard().catch((e) => { seeding = null; throw e; });
  return seeding;
}

// 한국 시간 "YYYY-MM-DDTHH:mm" → ISO
function kstIso(v: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(v ?? "");
  if (!m) return "";
  const ms = Date.parse(`${m[1]}T${m[2] ?? "09:00"}:00+09:00`);
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
}

async function seedBoard(): Promise<void> {
  const s = await getStore();
  const flags = { boardSeeded: !!(await s.get("Settings", "boardSeeded")), minutesMigrated: !!(await s.get("Settings", "minutesMigrated")) };
  const has = (id: "boardSeeded" | "minutesMigrated") => flags[id];
  if (has("boardSeeded") && has("minutesMigrated")) return;
  const members = await s.list("Members");
  const groups = await getPermGroups();
  const sorted = [...members].sort((a, b) => Number(a.no || 9999) - Number(b.no || 9999));
  const author = sorted.find((m) => effectivePerms(m, groups).includes("all"))?.id ?? "";
  const aud = JSON.stringify(ALL);

  if (!has("boardSeeded")) {
    await setSetting("boardSeeded", true); // 먼저 표시해서 동시에 들어온 요청이 두 번 넣지 않게
    const tpl = await getTemplates();
    const now = Date.now();
    const forms: Form[] = ["rules", "fee"];
    for (const [i, f] of forms.entries()) {
      const at = new Date(now - i * 1000).toISOString();
      await s.insert("Posts", {
        form: f, title: tpl[f].title, body: tpl[f].body, data: JSON.stringify(tpl[f].data), audience: aud,
        notice: "true", pinned: "true", files: "[]", authorId: author, createdAt: at, updatedAt: at,
      });
    }
  }

  if (!has("minutesMigrated")) {
    await setSetting("minutesMigrated", true);
    for (const m of await s.list("Minutes")) {
      const at = kstIso(m.heldAt) || new Date().toISOString();
      const date = m.heldAt ? m.heldAt.slice(0, 10).replace(/-/g, "/") : "";
      const agenda = parseJson<{ title?: string; status?: string; note?: string }[]>(m.agenda, []).map((a) => ({ title: a.title ?? "", status: a.status ?? "논의 전", note: a.note ?? "" }));
      await s.insert("Posts", {
        form: "minutes",
        title: `회의록${date ? ` ${date}` : ""}${m.place ? ` · ${m.place}` : ""}`.slice(0, 100),
        body: "",
        data: JSON.stringify({ heldAt: m.heldAt, place: m.place, attendees: m.attendees, agenda, followUp: m.followUp }),
        audience: aud, notice: "false", pinned: "false", files: "[]", authorId: author, createdAt: at, updatedAt: at,
      });
      // 새로 생긴 회의록 글도 회의 일정으로 옮기도록 다시 표시(lib/event-migrate.ts)
      await setSetting("minutesToEvents", false);
    }
  }
}

/* ───── 첨부 파일 내용 ─────
   Store 에는 id 로 한 줄만 읽는 기능이 없어서, Postgres(Neon)를 쓸 때는 이 파일 한 줄만 직접 읽는다
   (PostFiles 전체를 읽으면 모든 파일 내용을 함께 내려받게 된다). */
let sql: ReturnType<typeof neon> | null = null;
export async function getFileRow(fid: string): Promise<Row | null> {
  await getStore();
  const url = process.env.DATABASE_URL;
  if (url) {
    sql ??= neon(url);
    const rows = (await sql.query(`SELECT data FROM app_rows WHERE tab = 'PostFiles' AND id = $1`, [fid])) as { data: Row }[];
    return rows[0]?.data ?? null;
  }
  return (await (await getStore()).list("PostFiles")).find((r) => r.id === fid) ?? null;
}

export async function memberNames(): Promise<Map<string, string>> {
  const s = await getStore();
  return new Map((await s.list("Members")).map((m) => [m.id, m.name]));
}
