"use client";

import { useId } from "react";
import { DateField } from "@/components/DateField";
import { DragHandle, useDragSort } from "@/components/DragSort";
import { AGENDA_STATUS, DEFAULT_TEMPLATES, resultsToOf, type Form, type MinutesData, type PollData, type QuizData, type ResultsTo, type SurveyData } from "@/lib/board";
import { won } from "@/lib/client";
import { fs } from "@/lib/fs";

// 양식별 입력칸(글쓰기 화면). data 는 Posts.data 와 같은 모양이다(lib/board.ts).
type Data = Record<string, unknown>;
type P<T> = { data: T; onChange: (d: T) => void };

const col = { display: "flex", flexDirection: "column", gap: 10 } as const;
const sel = { minHeight: 44, padding: "0 8px" } as const;
const addBtn = { width: "auto", alignSelf: "flex-start", minHeight: 44, fontSize: fs(15) } as const;

function withDefaults<T>(form: Form, data: Data): T {
  return { ...(DEFAULT_TEMPLATES[form].data as object), ...data } as T;
}

export function FormFields({ form, data, onChange, kinds, positions, agendaLabels }: {
  form: Form;
  data: Data;
  onChange: (d: Data) => void;
  kinds: string[];
  positions: string[];
  agendaLabels: Record<string, string>;
}) {
  const set = (d: unknown) => onChange(d as Data);
  if (form === "minutes") return <MinutesFields data={withDefaults<MinutesData>(form, data)} onChange={set} labels={agendaLabels} />;
  if (form === "survey") return <SurveyFields data={withDefaults<SurveyData>(form, data)} onChange={set} />;
  if (form === "poll") return <PollFields data={withDefaults<PollData>(form, data)} onChange={set} />;
  if (form === "quiz") return <QuizFields data={withDefaults<QuizData>(form, data)} onChange={set} />;
  return null;
}

/* ───── 조건별 금액(회비관리·클럽 회비) ─────
   기본 금액 + 회원구분·직책 조건 줄. 빈 조건("")은 "전체", 직책 "일반회원"은 직책 없는 회원.
   회원에게 맞는 줄 중 조건이 가장 많은 줄(같으면 위쪽 줄)을 쓰고, 맞는 줄이 없으면 기본 금액을 쓴다(lib/fee.ts). */
export type AmountRule = { kind: string; position: string; amount: string };
export function FeeRulesFields({ amount, rules, onChange, kinds, positions, unit = "회비", hideHelp, posLabel = "직책" }: {
  amount: string;
  rules: AmountRule[];
  onChange: (amount: string, rules: AmountRule[]) => void;
  kinds: string[];
  positions: string[];
  unit?: string;
  hideHelp?: boolean; // 설명을 묶음 머리에 따로 적었을 때
  posLabel?: string; // 직책 칸 이름(클럽 회비는 "클럽 직책")
}) {
  const id = useId();
  const setRules = (r: AmountRule[]) => onChange(amount, r);
  const keys = rules.map((r) => `${r.kind}|${r.position}`);
  const dup = keys.some((k, i) => keys.indexOf(k) !== i);
  return (
    <div style={col}>
      {!hideHelp && <span className="small">회원구분·직책마다 금액이 다르면 “조건별 금액”을 더해 주세요. 회원에게 맞는 줄 중 <b>조건이 가장 많이 맞는 줄</b>의 금액을 쓰고(같으면 위쪽 줄), 맞는 줄이 없으면 기본 금액을 써요. 직책의 “일반회원”은 직책이 없는 회원이에요.</span>}
      <div>
        <label className="l" htmlFor={`${id}-def`}>기본 금액(원)</label>
        <input id={`${id}-def`} className="field num" style={{ maxWidth: 320 }} inputMode="numeric" placeholder="예) 300000" aria-describedby={`${id}-def-d`} value={amount} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 9), rules)} />
        <span id={`${id}-def-d`} className="hint" style={{ fontSize: fs(12), display: "block", marginTop: 4 }}>
          {amount ? <b className="num" style={{ color: "var(--ink2)" }}>{won(amount)} · </b> : null}조건에 맞는 줄이 없을 때 써요. 비우면 {unit} 없음.
        </span>
      </div>
      <span className="l" style={{ marginBottom: -4 }}>조건별 금액</span>
      {rules.length > 0 && (
        // 넓은 화면은 표처럼 한 줄에 4칸, 좁으면(칸 폭 480px 미만) 줄마다 "n번째 조건 · 삭제" 아래 회원구분|직책, 그 아래 금액으로 쌓는다(옆으로 밀지 않음).
        <ul className="rules" aria-label="조건별 금액">
          <li className="rh" aria-hidden="true"><span>회원구분</span><span>{posLabel}</span><span>금액(원)</span><span style={{ width: 46 }} /></li>
          {rules.map((r, i) => {
            const upd = (patch: Partial<AmountRule>) => setRules(rules.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            const del = () => setRules(rules.filter((_, j) => j !== i));
            return (
              <li key={i}>
                <div className="rn">
                  <span>{i + 1}번째 조건</span>
                  <button className="mini danger del-narrow" type="button" aria-label={`${i + 1}번째 줄 삭제`} onClick={del}>삭제</button>
                </div>
                <label className="cell">
                  <span className="cl">회원구분</span>
                  <select className="field" aria-label={`${i + 1}번째 줄 회원구분`} value={r.kind} onChange={(e) => upd({ kind: e.target.value })}>
                    <option value="">전체</option>
                    {[...new Set([...kinds, ...(r.kind ? [r.kind] : [])])].map((k) => <option key={k}>{k}</option>)}
                  </select>
                </label>
                <label className="cell">
                  <span className="cl">{posLabel}</span>
                  <select className="field" aria-label={`${i + 1}번째 줄 ${posLabel}`} value={r.position} onChange={(e) => upd({ position: e.target.value })}>
                    <option value="">전체</option>
                    {[...new Set([...positions, ...(r.position ? [r.position] : [])])].map((p) => <option key={p}>{p}</option>)}
                  </select>
                </label>
                <label className="cell amt">
                  <span className="cl">금액(원)</span>
                  <input className="field num" inputMode="numeric" placeholder="금액" aria-label={`${i + 1}번째 줄 금액`} value={r.amount} onChange={(e) => upd({ amount: e.target.value.replace(/\D/g, "").slice(0, 9) })} />
                  {r.amount && <span className="hint num">{won(r.amount)}</span>}
                </label>
                <button className="mini danger del-wide" type="button" aria-label={`${i + 1}번째 줄 삭제`} onClick={del}>삭제</button>
              </li>
            );
          })}
        </ul>
      )}
      <button className="btn" type="button" style={{ width: "auto", alignSelf: "flex-end", minHeight: 34, padding: "0 10px", fontSize: fs(12) }} onClick={() => setRules([...rules, { kind: "", position: "", amount: "" }])}>+ 조건별 금액 추가</button>
      {rules.some((r) => !r.amount) && <span className="small" role="alert" style={{ color: "var(--red-t)" }}>금액이 빈 줄이 있어요. 금액을 넣거나 줄을 삭제해 주세요.</span>}
      {dup && <span className="small" role="alert" style={{ color: "var(--red-t)" }}>같은 조건의 줄이 두 번 있어요. 하나를 삭제해 주세요.</span>}
    </div>
  );
}

/* ───── 회의록 ───── */
const statusTone = (s: string) => (s === "논의 전" || s === "보류·삭제" ? "gray" : s === "확정·실행완료" ? "ok" : s === "새로운 안건" ? "blue" : "warn");
export const agendaTone = statusTone;

export function MinutesFields({ data, onChange, labels }: P<MinutesData> & { labels: Record<string, string> }) {
  const id = useId();
  const agenda = data.agenda ?? [];
  const setA = (i: number, patch: Partial<MinutesData["agenda"][number]>) => onChange({ ...data, agenda: agenda.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  return (
    <section className="card" aria-label="회의록" style={col}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>회의 정보</b>
      <div className="grid2">
        <div><label className="l" htmlFor={`${id}-at`}>일시</label><DateField id={`${id}-at`} mode="datetime" value={data.heldAt} onChange={(v) => onChange({ ...data, heldAt: v })} /></div>
        <div><label className="l" htmlFor={`${id}-pl`}>장소</label><input id={`${id}-pl`} className="field" maxLength={100} value={data.place} onChange={(e) => onChange({ ...data, place: e.target.value })} /></div>
      </div>
      <div><label className="l" htmlFor={`${id}-who`}>참석자</label><textarea id={`${id}-who`} className="field" rows={2} maxLength={1000} style={{ padding: 10 }} value={data.attendees} onChange={(e) => onChange({ ...data, attendees: e.target.value })} /></div>
      <b>안건과 내용</b>
      {agenda.map((a, i) => (
        <div key={i} className="card" style={{ ...col, gap: 8, background: "var(--soft)" }}>
          <div className="row">
            <input aria-label={`${i + 1}번째 안건`} className="field" placeholder="안건" maxLength={200} value={a.title} onChange={(e) => setA(i, { title: e.target.value })} />
            <button className="mini danger" type="button" style={{ minHeight: 46 }} aria-label={`${i + 1}번째 안건 지우기`} onClick={() => onChange({ ...data, agenda: agenda.filter((_, j) => j !== i) })}>지우기</button>
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <label className="l" style={{ margin: 0 }} htmlFor={`${id}-st-${i}`}>상태</label>
            <select id={`${id}-st-${i}`} className="field" style={{ ...sel, width: 180 }} value={a.status} onChange={(e) => setA(i, { status: e.target.value as MinutesData["agenda"][number]["status"] })}>
              {AGENDA_STATUS.map((s) => <option key={s} value={s}>{labels[s] || s}</option>)}
            </select>
            <span className={`pill ${statusTone(a.status)}`}>{labels[a.status] || a.status}</span>
          </div>
          <textarea aria-label={`${i + 1}번째 안건 내용`} className="field" rows={3} maxLength={4000} style={{ padding: 10 }} placeholder="논의한 내용" value={a.note} onChange={(e) => setA(i, { note: e.target.value })} />
        </div>
      ))}
      <button className="btn white" type="button" style={addBtn} onClick={() => onChange({ ...data, agenda: [...agenda, { title: "", status: "논의 전", note: "" }] })}>+ 안건 추가</button>
      <div><label className="l" htmlFor={`${id}-fu`}>후속 조치</label><textarea id={`${id}-fu`} className="field" rows={3} maxLength={2000} style={{ padding: 10 }} value={data.followUp} onChange={(e) => onChange({ ...data, followUp: e.target.value })} /></div>
    </section>
  );
}

/* ───── 마감 ───── */
function Deadline({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const id = useId();
  return (
    <div>
      <label className="l" htmlFor={id}>{label} (선택)</label>
      <div className="row">
        <div className="grow"><DateField id={id} mode="datetime" value={value} onChange={onChange} /></div>
        {value && <button className="mini" type="button" onClick={() => onChange("")}>마감 없애기</button>}
      </div>
    </div>
  );
}

/* ───── 보기 목록 ───── */
function Options({ list, onChange, label }: { list: string[]; onChange: (l: string[]) => void; label: string }) {
  return (
    <div style={{ ...col, gap: 6 }}>
      {list.map((o, i) => (
        <div key={i} className="row">
          <input className="field" style={{ minHeight: 44 }} aria-label={`${label} ${i + 1}`} placeholder={`보기 ${i + 1}`} maxLength={100} value={o} onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))} />
          <button className="mini danger" type="button" aria-label={`${label} ${i + 1} 지우기`} disabled={list.length <= 2} onClick={() => onChange(list.filter((_, j) => j !== i))}>지우기</button>
        </div>
      ))}
      {list.length < 20 && <button className="mini" type="button" style={{ alignSelf: "flex-start" }} onClick={() => onChange([...list, ""])}>+ 보기 추가</button>}
    </div>
  );
}

/* ───── 결과 보기 범위(투표·설문) ───── */
function ResultsTo({ form, value, onChange }: { form: "poll" | "survey"; value: ResultsTo; onChange: (v: ResultsTo) => void }) {
  const what = form === "poll" ? "투표" : "답";
  const opts: { k: ResultsTo; l: string; d: string }[] = [
    { k: "audience", l: "공개 대상 전체", d: `공개 대상 회원은 ${what}한 뒤(또는 마감 뒤)에 집계를 볼 수 있어요.${form === "survey" ? " 주관식 답은 이름 없이 보여요." : ""}` },
    { k: "author", l: "작성자만", d: "작성자(와 편집자)만 결과를 볼 수 있어요." },
  ];
  return (
    <div className="card" style={{ ...col, gap: 6, background: "var(--soft)" }}>
      <b>결과 보기</b>
      <div className="checks" role="radiogroup" aria-label="결과 보기">
        {opts.map((o) => (
          <label key={o.k}><input type="radio" name={`results-to-${form}`} checked={value === o.k} onChange={() => onChange(o.k)} />{o.l}</label>
        ))}
      </div>
      <span className="small">{opts.find((o) => o.k === value)?.d} 전체권한자는 언제나 결과를 볼 수 있어요. 누가 무엇을 골랐는지(사람별 답)는 작성자·전체권한자만 봐요.</span>
    </div>
  );
}

/* ───── 설문 ───── */
const Q_TYPES = [{ k: "single", l: "하나 고르기" }, { k: "multi", l: "여러 개 고르기" }, { k: "text", l: "주관식" }] as const;

function SurveyFields({ data, onChange }: P<SurveyData>) {
  const qs = data.questions ?? [];
  const setQ = (i: number, patch: Partial<SurveyData["questions"][number]>) => onChange({ ...data, questions: qs.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const ds = useDragSort(qs, (next) => onChange({ ...data, questions: next }));
  return (
    <section className="card" aria-label="설문 질문" style={col}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>설문 질문</b>
      {qs.length > 1 && <span className="small">⠿ 손잡이를 끌어서 질문 순서를 바꿔요.</span>}
      {qs.map((q, i) => {
        const row = ds.item(i);
        return (
        <div key={q.id} ref={row.ref} className="card" style={{ ...col, gap: 8, background: "var(--soft)", ...row.style }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <DragHandle {...ds.handle(i, `질문 ${i + 1}`)} />
            <b>질문 {i + 1}</b>
            <span className="grow" />
            <button className="mini danger" type="button" disabled={qs.length <= 1} onClick={() => onChange({ ...data, questions: qs.filter((_, j) => j !== i) })}>질문 지우기</button>
          </div>
          <input className="field" aria-label={`질문 ${i + 1} 내용`} placeholder="질문" maxLength={300} value={q.q} onChange={(e) => setQ(i, { q: e.target.value })} />
          <div className="checks" role="radiogroup" aria-label={`질문 ${i + 1} 답 방식`}>
            {Q_TYPES.map((t) => (
              <label key={t.k}>
                <input type="radio" name={`qt-${q.id}`} checked={q.type === t.k} onChange={() => setQ(i, { type: t.k, options: t.k === "text" ? [] : q.options.length >= 2 ? q.options : ["", ""] })} />
                {t.l}
              </label>
            ))}
          </div>
          {q.type !== "text" && <Options label={`질문 ${i + 1} 보기`} list={q.options} onChange={(o) => setQ(i, { options: o })} />}
        </div>
        );
      })}
      {qs.length < 30 && (
        <button className="btn white" type="button" style={addBtn} onClick={() => onChange({ ...data, questions: [...qs, { id: `q${Date.now().toString(36)}`, type: "single", q: "", options: ["", ""] }] })}>+ 질문 추가</button>
      )}
      <Deadline label="마감 일시" value={data.deadline} onChange={(v) => onChange({ ...data, deadline: v })} />
      <ResultsTo form="survey" value={resultsToOf("survey", data)} onChange={(v) => onChange({ ...data, resultsTo: v })} />
      <span className="hint">마감 전까지는 회원이 답을 고칠 수 있어요.</span>
    </section>
  );
}

/* ───── 투표 ───── */
function PollFields({ data, onChange }: P<PollData>) {
  return (
    <section className="card" aria-label="투표" style={col}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>투표 보기</b>
      <Options label="투표 보기" list={data.options ?? []} onChange={(o) => onChange({ ...data, options: o })} />
      <div className="checks">
        <label><input type="radio" name="poll-multi" checked={!data.multi} onChange={() => onChange({ ...data, multi: false })} />하나만 고르기</label>
        <label><input type="radio" name="poll-multi" checked={data.multi} onChange={() => onChange({ ...data, multi: true })} />여러 개 고르기</label>
      </div>
      <div className="checks"><label><input type="checkbox" checked={data.anonymous} onChange={(e) => onChange({ ...data, anonymous: e.target.checked })} />익명 투표 (누가 골랐는지 아무도 볼 수 없어요)</label></div>
      <Deadline label="마감 일시" value={data.deadline} onChange={(v) => onChange({ ...data, deadline: v })} />
      <ResultsTo form="poll" value={resultsToOf("poll", data)} onChange={(v) => onChange({ ...data, resultsTo: v })} />
      <span className="hint">마감 전까지는 다시 고를 수 있어요.</span>
    </section>
  );
}

/* ───── 퀴즈 (OX) ───── */
function QuizFields({ data, onChange }: P<QuizData>) {
  const items = data.items ?? [];
  const setI = (i: number, patch: Partial<QuizData["items"][number]>) => onChange({ ...data, items: items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <section className="card" aria-label="OX 퀴즈 문제" style={col}>
      <b style={{ font: `700 ${fs(17)} var(--display)` }}>OX 문제</b>
      {items.map((it, i) => (
        <div key={i} className="card" style={{ ...col, gap: 8, background: "var(--soft)" }}>
          <div className="row">
            <b>문제 {i + 1}</b>
            <span className="grow" />
            <button className="mini danger" type="button" disabled={items.length <= 1} onClick={() => onChange({ ...data, items: items.filter((_, j) => j !== i) })}>문제 지우기</button>
          </div>
          <input className="field" aria-label={`문제 ${i + 1}`} placeholder="문장 (예: 우리 모임은 2020년에 만들어졌다)" maxLength={300} value={it.q} onChange={(e) => setI(i, { q: e.target.value })} />
          <div className="checks" role="radiogroup" aria-label={`문제 ${i + 1} 정답`}>
            <span className="l" style={{ margin: 0, alignSelf: "center" }}>정답</span>
            {(["O", "X"] as const).map((v) => (
              <label key={v}><input type="radio" name={`qa-${i}`} checked={it.answer === v} onChange={() => setI(i, { answer: v })} />{v}</label>
            ))}
          </div>
          <textarea className="field" rows={2} aria-label={`문제 ${i + 1} 해설`} placeholder="해설 (선택)" maxLength={1000} style={{ padding: 10 }} value={it.explain} onChange={(e) => setI(i, { explain: e.target.value })} />
        </div>
      ))}
      {items.length < 30 && <button className="btn white" type="button" style={addBtn} onClick={() => onChange({ ...data, items: [...items, { q: "", answer: "O", explain: "" }] })}>+ 문제 추가</button>}
      <span className="hint">회원은 한 번 풀 수 있고, 다 풀면 정답과 해설이 보여요.</span>
    </section>
  );
}
