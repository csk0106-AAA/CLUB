import { z } from "zod";
import { parseJson } from "@/lib/api";
import { ALL, audienceInput, audienceLabel, type Audience } from "@/lib/audience";
import { DATA_SCHEMA, isClosed, isForm, RESPONSE_FORMS, zodMessage, type Form, type PollData, type QuizData, type SurveyData } from "@/lib/board";
import { feeFor } from "@/lib/fee";
import { AGENDA_LABELS_KEY, type AgendaLabels } from "@/lib/club";
import { getSetting, getStore } from "@/lib/store";
import type { Row } from "@/lib/store/types";
import { audienceOf, canEdit, canSeeResults, memberNames, readFiles, type Me } from "./server";

const t = (max: number) => z.string().trim().max(max);

const postInput = z.object({
  form: z.string(),
  title: t(100).min(1, "제목을 적어 주세요."),
  body: t(10000).default(""),
  data: z.unknown().default({}),
  audience: audienceInput.default(ALL),
  notice: z.boolean().default(false),
  pinned: z.boolean().default(false),
});

export type PostFields = { form: Form; title: string; body: string; data: string; audience: string; notice: string; pinned: string };

// 글쓰기·고치기 입력 검증. 양식별 내용(data)과 공개 대상을 함께 확인한다.
export async function parsePost(raw: unknown, me: Me, fixedForm?: string): Promise<{ ok: true; v: PostFields } | { ok: false; error: string; status?: number }> {
  const p = postInput.safeParse(raw);
  if (!p.success) return { ok: false, error: zodMessage(p.error) };
  const form = fixedForm ?? p.data.form;
  if (!isForm(form)) return { ok: false, error: "양식을 골라 주세요." };
  if (form === "rules" && !me.isAll) return { ok: false, error: "회칙 글은 전체 관리자만 쓸 수 있어요.", status: 403 };
  const d = DATA_SCHEMA[form].safeParse(p.data.data ?? {});
  if (!d.success) return { ok: false, error: zodMessage(d.error, "양식 내용을 확인해 주세요.") };
  let audience: Audience = ALL;
  if (p.data.audience.mode !== "all") {
    const ids = new Set((await (await getStore()).list("Members")).map((m) => m.id));
    const memberIds = [...new Set(p.data.audience.memberIds)].filter((id) => ids.has(id));
    if (memberIds.length === 0) return { ok: false, error: "공개 대상 회원을 한 명 이상 골라 주세요." };
    audience = { ...p.data.audience, memberIds };
  }
  return {
    ok: true,
    v: {
      form, title: p.data.title, body: p.data.body, data: JSON.stringify(d.data), audience: JSON.stringify(audience),
      notice: String(p.data.notice), pinned: String(p.data.pinned),
    },
  };
}

// 고정 글 먼저, 그다음 최신 글
export const sortPosts = (a: Row, b: Row) =>
  (b.pinned === "true" ? 1 : 0) - (a.pinned === "true" ? 1 : 0) || (b.createdAt ?? "").localeCompare(a.createdAt ?? "");

async function eventNames(): Promise<Record<string, string>> {
  const ev = await (await getStore()).list("Events");
  return Object.fromEntries(ev.map((e) => [e.id, e.name]));
}

export async function summaries(me: Me, posts: Row[]) {
  const [names, evs, responses] = await Promise.all([memberNames(), eventNames(), (await getStore()).list("PostResponses")]);
  const mine = new Set(responses.filter((r) => r.memberId === me.row.id).map((r) => r.postId));
  return posts.map((p) => {
    const files = readFiles(p);
    const data = parseJson<Record<string, unknown>>(p.data, {});
    return {
      id: p.id,
      form: p.form,
      title: p.title,
      excerpt: (p.body ?? "").replace(/\s+/g, " ").slice(0, 90),
      notice: p.notice === "true",
      pinned: p.pinned === "true",
      authorName: names.get(p.authorId) ?? "",
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      fileCount: files.length,
      thumb: files.find((f) => f.image)?.id ?? "",
      responded: mine.has(p.id),
      closed: typeof data.deadline === "string" ? isClosed(data.deadline) : false,
      audienceText: audienceLabel(audienceOf(p), { events: evs }),
      mine: p.authorId === me.row.id,
    };
  });
}

type SurveyAns = { answers: Record<string, string | number[]> };
type PollAns = { choices: number[] };
type QuizAns = { answers: ("O" | "X")[] };

// 글 하나: 양식별로 실시간 자료(회칙 조문, 내 연회비)와 응답 결과를 붙인다.
export async function detail(me: Me, p: Row) {
  const s = await getStore();
  const form = p.form as Form;
  const names = await memberNames();
  const data = parseJson<Record<string, unknown>>(p.data, {});
  const full = canSeeResults(me, p);
  const responses = RESPONSE_FORMS.includes(form) ? (await s.list("PostResponses")).filter((r) => r.postId === p.id) : [];
  const mineRow = responses.find((r) => r.memberId === me.row.id);
  const mine = mineRow ? parseJson<unknown>(mineRow.answer, null) : null;
  const extra: Record<string, unknown> = {};
  let results: unknown = null;

  if (form === "rules") {
    const rules = (await s.list("Rules")).filter((r) => r.confirmed === "true");
    extra.rules = rules.map((r) => ({ id: r.id, chapter: r.chapter, article: r.article, body: r.body, version: r.version }));
  }

  if (form === "minutes") extra.agendaLabels = await getSetting<AgendaLabels>(AGENDA_LABELS_KEY, {});

  if (form === "fee") {
    const rules = Array.isArray(data.rules) ? (data.rules as { kind: string; position: string; amount: string }[]) : [];
    const amount = feeFor(
      { fee: String(data.defaultAmount ?? ""), feeRules: JSON.stringify(rules.map((r) => ({ days: "", kind: r.kind, position: r.position, amount: r.amount }))) },
      { kind: me.row.kind, position: me.row.position },
      null,
    );
    extra.myFee = { amount, kind: me.row.kind ?? "", position: me.row.position ?? "" };
    // 다른 회원의 금액 표는 작성자·관리자에게만
    if (!full) data.rules = [];
  }

  if (form === "poll") {
    const d = data as unknown as PollData;
    const closed = isClosed(d.deadline ?? "");
    if (full || mine || closed) {
      const counts = (d.options ?? []).map(() => 0);
      const voters: { name: string; choices: number[] }[] = [];
      for (const r of responses) {
        const a = parseJson<PollAns>(r.answer, { choices: [] });
        a.choices.forEach((c) => { if (c >= 0 && c < counts.length) counts[c]++; });
        if (full && !d.anonymous) voters.push({ name: names.get(r.memberId) ?? "", choices: a.choices });
      }
      results = { counts, total: responses.length, voters: full && !d.anonymous ? voters : null };
    }
  }

  if (form === "survey" && full) {
    const d = data as unknown as SurveyData;
    const people = responses.map((r) => ({ name: names.get(r.memberId) ?? "", at: r.createdAt, answers: parseJson<SurveyAns>(r.answer, { answers: {} }).answers }));
    results = {
      total: responses.length,
      questions: (d.questions ?? []).map((q) => ({
        id: q.id,
        counts: q.type === "text" ? null : q.options.map((_, i) => people.filter((x) => Array.isArray(x.answers[q.id]) && (x.answers[q.id] as number[]).includes(i)).length),
        texts: q.type === "text" ? people.map((x) => ({ name: x.name, text: String(x.answers[q.id] ?? "") })).filter((x) => x.text) : null,
      })),
      people,
    };
  }

  if (form === "quiz") {
    const d = data as unknown as QuizData;
    const items = d.items ?? [];
    const score = (a: QuizAns) => items.filter((it, i) => a.answers[i] === it.answer).length;
    if (full) {
      const people = responses.map((r) => {
        const a = parseJson<QuizAns>(r.answer, { answers: [] });
        return { name: names.get(r.memberId) ?? "", score: score(a), at: r.createdAt };
      });
      results = {
        total: responses.length,
        items: items.length,
        avg: people.length ? Math.round((people.reduce((n, x) => n + x.score, 0) / people.length) * 10) / 10 : 0,
        perItem: items.map((it, i) => responses.filter((r) => parseJson<QuizAns>(r.answer, { answers: [] }).answers[i] === it.answer).length),
        people: people.sort((a, b) => b.score - a.score),
      };
    }
    // 아직 풀지 않은 회원에게는 정답과 해설을 보내지 않는다.
    if (!mine && !full) data.items = items.map((it) => ({ q: it.q, answer: "", explain: "" }));
  }

  const evs = await eventNames();
  const aud = audienceOf(p);
  return {
    post: {
      id: p.id, form, title: p.title, body: p.body, data, audience: aud, audienceText: audienceLabel(aud, { events: evs }),
      notice: p.notice === "true", pinned: p.pinned === "true", files: readFiles(p),
      authorId: p.authorId, authorName: names.get(p.authorId) ?? "", createdAt: p.createdAt, updatedAt: p.updatedAt,
    },
    canEdit: canEdit(me, p),
    seeResults: full,
    mine,
    results,
    ...extra,
  };
}

/* ───── 응답 검증 ───── */
const ints = z.array(z.number().int().min(0).max(99)).max(20);
export function parseResponse(form: Form, data: Record<string, unknown>, raw: unknown): { ok: true; answer: unknown } | { ok: false; error: string } {
  if (form === "poll") {
    const d = data as unknown as PollData;
    const p = z.object({ choices: ints }).safeParse(raw);
    if (!p.success) return { ok: false, error: "보기를 골라 주세요." };
    const ch = [...new Set(p.data.choices)].filter((c) => c < d.options.length).sort((a, b) => a - b);
    if (ch.length === 0) return { ok: false, error: "보기를 골라 주세요." };
    if (!d.multi && ch.length > 1) return { ok: false, error: "하나만 고를 수 있어요." };
    return { ok: true, answer: { choices: ch } };
  }
  if (form === "survey") {
    const d = data as unknown as SurveyData;
    const p = z.object({ answers: z.record(z.union([z.string().max(2000), ints])) }).safeParse(raw);
    if (!p.success) return { ok: false, error: "답을 확인해 주세요." };
    const out: Record<string, string | number[]> = {};
    for (const q of d.questions) {
      const a = p.data.answers[q.id];
      if (q.type === "text") {
        out[q.id] = typeof a === "string" ? a.trim().slice(0, 1000) : "";
        continue;
      }
      const ch = Array.isArray(a) ? [...new Set(a)].filter((c) => c < q.options.length).sort((x, y) => x - y) : [];
      if (ch.length === 0) return { ok: false, error: `“${q.q}”에 답을 골라 주세요.` };
      if (q.type === "single" && ch.length > 1) return { ok: false, error: `“${q.q}”은 하나만 고를 수 있어요.` };
      out[q.id] = ch;
    }
    return { ok: true, answer: { answers: out } };
  }
  if (form === "quiz") {
    const d = data as unknown as QuizData;
    const p = z.object({ answers: z.array(z.enum(["O", "X"])) }).safeParse(raw);
    if (!p.success || p.data.answers.length !== d.items.length) return { ok: false, error: "모든 문제에 O 또는 X 를 골라 주세요." };
    return { ok: true, answer: { answers: p.data.answers } };
  }
  return { ok: false, error: "응답을 받지 않는 글이에요." };
}
