import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { guard, parseJson } from "@/lib/api";
import { ALL, inAudience, readAudience, type Audience } from "@/lib/audience";
import type { Session } from "@/lib/auth";
import { DEFAULT_TEMPLATES, isForm, type FileMeta, type Form, type Template } from "@/lib/board";
import { effectivePerms, getPermGroups, isClubOfficer } from "@/lib/perms";
import { getSetting, getStore, setSetting } from "@/lib/store";
import type { Row } from "@/lib/store/types";

// 게시판 서버 공통: 지금 DB 기준 권한, 공개 대상 확인, 첫 글 넣기, 회의록 옮기기, 첨부 파일 읽기.

export type Me = {
  s: Session;
  row: Row;
  perms: string[];
  isAll: boolean; // 전체 관리자(회칙 글)
  manage: boolean; // 관리자(all/board): 모든 글 수정·삭제
  canWrite: boolean; // 글쓰기: 관리자 + 소모임 직책자
  tplAdmin: boolean; // 양식 템플릿 저장: 관리자 + 2차 비밀번호 통과
};

// 로그인 확인 + 세션이 아니라 지금 회원 정보(직책·소모임·권한 그룹)로 권한을 다시 계산한다.
export async function getMe(): Promise<{ me: Me } | { err: NextResponse }> {
  const g = await guard();
  if ("err" in g) return { err: g.err };
  const s = await getStore();
  const row = (await s.list("Members")).find((m) => m.id === g.s.mid);
  if (!row) return { err: NextResponse.json({ error: "회원 정보를 찾을 수 없어요." }, { status: 401 }) };
  const perms = effectivePerms(row, await getPermGroups());
  const isAll = perms.includes("all");
  const manage = isAll || perms.includes("board");
  return { me: { s: g.s, row, perms, isAll, manage, canWrite: manage || isClubOfficer(row), tplAdmin: manage && g.s.admin } };
}

export const forbid = (msg = "이 작업을 할 권한이 없어요.") => NextResponse.json({ error: msg }, { status: 403 });

export const audienceOf = (p: Row): Audience => readAudience(p.audience);
export const canSee = (me: Me, p: Row) => inAudience(audienceOf(p), me.row.id, p.authorId);
// 회칙 글은 전체 관리자만, 그 밖에는 작성자나 관리자
export const canEdit = (me: Me, p: Row) => (p.form === "rules" ? me.isAll : me.manage || p.authorId === me.row.id);
// 응답 전체(결과)를 볼 수 있는 사람
export const canSeeResults = (me: Me, p: Row) => me.manage || p.authorId === me.row.id;

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
  const settings = await s.list("Settings");
  const has = (id: string) => settings.some((r) => r.id === id);
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
