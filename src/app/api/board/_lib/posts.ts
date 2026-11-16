import { z } from "zod";
import { parseJson } from "@/lib/api";
import { ALL, audienceInput, audienceLabel, type Audience } from "@/lib/audience";
import { DATA_SCHEMA, isClosed, isForm, isWriteForm, RESPONSE_FORMS, talkable, zodMessage, type Form, type PollData, type QuizData, type SurveyData } from "@/lib/board";
import { duesAccount, duesAmount, readDues, type DuesRule } from "@/lib/dues";
import { AGENDA_LABELS_KEY, type AgendaLabels } from "@/lib/club";
import { memberClubs } from "@/lib/lists";
import { joinView, latestJoin } from "@/lib/club-requests";
import { clubText } from "@/lib/club-label";
import { canManage, cleanAudience, manageHref, managedOf } from "@/lib/published";
import { getSetting, getStore } from "@/lib/store";
import type { Row } from "@/lib/store/types";
import { audienceOf, canEdit, canOwn, canSeeResults, memberNames, readFiles, type Me } from "./server";
import { readEditors } from "@/lib/editors";
import { talkCounts, talkOf } from "./talk";

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
  // 새 글: 글쓰기 양식만. 회칙·회비 글은 관리 화면에서 올린다.
  if (!fixedForm && !isWriteForm(form)) {
    return {
      ok: false,
      error: form === "rules" ? "회칙은 관리자 › 모임설정 › 회칙에서 올려 주세요." : form === "fee" ? "회비 글은 관리자 › 모임설정 › 회비관리(소모임은 소모임 회비)에서 올려 주세요." : "이 양식은 글쓰기에서 쓸 수 없어요.",
    };
  }
  const d = DATA_SCHEMA[form].safeParse(p.data.data ?? {});
  if (!d.success) return { ok: false, error: zodMessage(d.error, "양식 내용을 확인해 주세요.") };
  const aud = await cleanAudience(p.data.audience);
  if (typeof aud === "string") return { ok: false, error: aud };
  const audience: Audience = aud;
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

// fresh: 종 아이콘 숫자에 들어간 글(lib/unread.ts postFreshness)과 같은 기준의 "새 글"/"수정됨" 표시
export async function summaries(me: Me, posts: Row[], fresh: Map<string, "new" | "updated"> = new Map()) {
  const [names, evs, responses, talk] = await Promise.all([memberNames(), eventNames(), (await getStore()).list("PostResponses"), talkCounts()]);
  const mine = new Set(responses.filter((r) => r.memberId === me.row.id).map((r) => r.postId));
  return posts.map((p) => {
    const files = readFiles(p);
    const data = parseJson<Record<string, unknown>>(p.data, {});
    return {
      id: p.id,
      form: p.form,
      title: p.title,
      // 소모임 회비 글은 문장 속 소모임 이름을 "○○ 모임"으로(예전에 올린 글도)
      excerpt: (typeof data.club === "string" ? clubText(p.body ?? "", data.club) : p.body ?? "").replace(/\s+/g, " ").slice(0, 90),
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
      fresh: fresh.get(p.id) ?? "",
      // 반응·댓글 수(회칙·회비 글은 받지 않아서 0)
      reactions: talkable(p.form) ? talk.get(p.id)?.reactions ?? 0 : 0,
      comments: talkable(p.form) ? talk.get(p.id)?.comments ?? 0 : 0,
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
  const managed = managedOf(p);
  const mayManage = managed ? await canManage(me.row, me.perms, managed) : false;
  const full = canSeeResults(me, p) || mayManage;
  const responses = RESPONSE_FORMS.includes(form) ? (await s.list("PostResponses")).filter((r) => r.postId === p.id) : [];
  const mineRow = responses.find((r) => r.memberId === me.row.id);
  const mine = mineRow ? parseJson<unknown>(mineRow.answer, null) : null;
  const extra: Record<string, unknown> = {};
  let results: unknown = null;

  if (form === "rules") {
    if (Array.isArray(data.rules)) {
      // 관리자 › 회칙에서 올린 그때의 조문(스냅숏)
      extra.rules = data.rules;
    } else {
      // 예전 회칙 글: 지금 확정된 조문을 그대로
      const rules = (await s.list("Rules")).filter((r) => r.confirmed === "true");
      extra.rules = rules.map((r) => ({ id: r.id, chapter: r.chapter, article: r.article, body: r.body, version: r.version }));
    }
    delete data.rules;
  }

  if (form === "minutes") extra.agendaLabels = await getSetting<AgendaLabels>(AGENDA_LABELS_KEY, {});

  // 예전 회비 글에 금액을 따로 적지 않았으면 관리자 회비관리 설정을 그대로 보여 준다.
  // 회비관리에서 올린 글(v:2)과 금액을 적은 예전 글은 글에 담긴 값(올린 그때의 내용)으로 보여 준다.
  if (form === "fee" && data.v !== 2 && !String(data.defaultAmount ?? "").trim() && !(Array.isArray(data.rules) && data.rules.length)) {
    const d = await readDues();
    data.defaultAmount = d.amount;
    data.rules = d.rules;
    data.account = duesAccount(d);
    data.accountHolder = d.holder;
    data.period = d.period;
    data.periodStart = d.periodStart;
    data.periodEnd = d.periodEnd;
    data.monthDay = d.monthDay;
    data.note = d.note;
    data.fromDues = true;
  }
  if (form === "fee") {
    const rules = Array.isArray(data.rules) ? (data.rules as DuesRule[]) : [];
    // 소모임 회비 글은 직책 조건을 그 소모임에서 맡은 소모임 직책으로 맞춘다(없으면 일반회원)
    const club = typeof data.club === "string" ? data.club : "";
    const position = club ? memberClubs(me.row).find((c) => c.name === club)?.role ?? "" : me.row.position;
    const amount = duesAmount({ amount: String(data.defaultAmount ?? ""), rules }, { kind: me.row.kind, position });
    // 소모임 회원이 아니면 금액 대신 "○○ 회원이 아닙니다" + 가입 신청 칸(최근 가입 신청 상태)
    const notMember = !!club && !memberClubs(me.row).some((c) => c.name === club);
    extra.myFee = { amount: notMember ? "" : amount, kind: me.row.kind ?? "", position: position ?? "", ...(notMember ? { notMember: true } : {}) };
    if (notMember) extra.clubJoin = joinView(latestJoin(await (await getStore()).list("ClubRequests"), me.row.id, club));
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
      // 소모임 회비 글: 문장 속 소모임 이름을 "○○ 모임"으로(예전에 올린 글도. 다시 올리면 고친 문장으로 저장된다)
      id: p.id, form, title: p.title, body: typeof data.club === "string" ? clubText(p.body ?? "", data.club) : p.body, data, audience: aud, audienceText: audienceLabel(aud, { events: evs }),
      notice: p.notice === "true", pinned: p.pinned === "true", files: readFiles(p),
      authorId: p.authorId, authorName: names.get(p.authorId) ?? "", createdAt: p.createdAt, updatedAt: p.updatedAt,
    },
    canEdit: canEdit(me, p),
    // 회칙·회비 글: 고칠 수 있는 사람에게만 관리 화면 주소(“수정”은 그 화면을 연다)와 삭제
    manageHref: managed && mayManage ? manageHref(managed, me.perms) : "",
    canDelete: managed ? mayManage : canOwn(me, p),
    // 편집자: 이름 목록, 바꿀 수 있는지(작성자·모든권한)
    editors: readEditors(p.editors).map((id) => ({ id, name: names.get(id) ?? "(지운 회원)" })),
    canManageEditors: canOwn(me, p),
    seeResults: full,
    mine,
    results,
    // 반응·댓글(회칙·회비 글은 null)
    talk: talkable(form) ? await talkOf(me, p.id) : null,
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
